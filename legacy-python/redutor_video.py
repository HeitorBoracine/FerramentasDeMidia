import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import subprocess
import threading
import os
import sys
import shutil
import queue
import json

# Tenta carregar tkinterdnd2 para suporte a drag-and-drop
# Só importa o módulo - a inicialização do tkdnd é feita em _setup_drop,
# dentro de um try/except, para não travar o app se o .dll não for encontrado.
try:
    import tkinterdnd2 as _dnd
    _DND_AVAILABLE = True
except Exception:
    _DND_AVAILABLE = False


# --- Verificar FFmpeg -------------------------------------------------------

def obter_caminho_binario(nome: str) -> str:
    """Retorna o caminho absoluto do binário solicitado, suportando PyInstaller bundle,
    diretório local ou PATH global do sistema."""
    # 1. Se estiver rodando em um bundle do PyInstaller (.exe standalone)
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        caminho_bundle = os.path.join(sys._MEIPASS, nome + ".exe" if sys.platform == "win32" else nome)
        if os.path.exists(caminho_bundle):
            return caminho_bundle

    # 2. Se estiver na mesma pasta do script .py
    caminho_local = os.path.join(os.path.dirname(os.path.abspath(__file__)), nome + ".exe" if sys.platform == "win32" else nome)
    if os.path.exists(caminho_local):
        return caminho_local

    # 3. Se estiver no PATH global do sistema
    caminho_path = shutil.which(nome)
    if caminho_path:
        return caminho_path

    return None


def obter_caminho_recurso(nome: str) -> str:
    """Retorna o caminho absoluto de um recurso, funcionando no .py e no .exe do PyInstaller."""
    # 1. Se estiver rodando em um bundle do PyInstaller (.exe standalone)
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        caminho_bundle = os.path.join(sys._MEIPASS, nome)
        if os.path.exists(caminho_bundle):
            return caminho_bundle

    # 2. Se estiver na mesma pasta do script .py
    caminho_local = os.path.join(os.path.dirname(os.path.abspath(__file__)), nome)
    if os.path.exists(caminho_local):
        return caminho_local

    return None


def verificar_ffmpeg():
    ffmpeg_caminho = obter_caminho_binario("ffmpeg")
    ffprobe_caminho = obter_caminho_binario("ffprobe")

    if ffmpeg_caminho is None or ffprobe_caminho is None:
        messagebox.showerror(
            "FFmpeg / FFprobe Não Encontrado",
            "O FFmpeg e o FFprobe são necessários para comprimir e converter vídeos e imagens.\n\n"
            "Como você deseja um aplicativo standalone, você pode simplesmente colocar os arquivos:\n"
            "  -> 'ffmpeg.exe'\n"
            "  -> 'ffprobe.exe'\n\n"
            "na mesma pasta que este script Python (redutor_video.py) e o app funcionará instantaneamente!\n\n"
            "Se preferir, você pode instalá-los globalmente no Windows via terminal:\n"
            "  winget install ffmpeg"
        )
        return False
    return True


# --- Configuração persistente -----------------------------------------------
# O config é salvo em %APPDATA%\RedutorDeVideo\config.json.
# Funciona tanto rodando o .py quanto o executável gerado pelo PyInstaller.

_CONFIG_DIR  = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "RedutorDeVideo")
_CONFIG_FILE = os.path.join(_CONFIG_DIR, "config.json")

def _carregar_config() -> dict:
    """Lê o arquivo de configuração. Retorna dict vazio se não existir ou for inválido."""
    try:
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _salvar_config(cfg: dict):
    """Grava o dicionário de configuração em disco."""
    try:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


# --- Formatos suportados ------------------------------------------------------

VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".mpeg", ".mpg", ".m4v", ".3gp"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".tif", ".webp"}

VIDEO_FORMATOS = ["MP4", "MKV", "AVI", "MOV", "WEBM", "WMV", "FLV"]
IMAGE_FORMATOS = ["PNG", "JPG", "BMP", "WEBP", "TIFF", "GIF"]


def _codec_args_video(ext_saida: str) -> list:
    """Retorna os argumentos de codec do FFmpeg adequados ao formato de vídeo de destino."""
    ext = ext_saida.lower()
    if ext == ".webm":
        return ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-c:a", "libopus"]
    if ext == ".avi":
        return ["-c:v", "mpeg4", "-vtag", "xvid", "-q:v", "3", "-c:a", "libmp3lame", "-b:a", "192k"]
    if ext == ".wmv":
        return ["-c:v", "wmv2", "-c:a", "wmav2", "-b:a", "192k"]
    if ext == ".flv":
        return ["-c:v", "flv", "-c:a", "aac", "-b:a", "128k"]
    # mp4, mkv, mov e demais formatos compatíveis com H.264
    return ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "128k"]


# --- Interface gráfica -------------------------------------------------------

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.withdraw()

        try:
            self.attributes("-alpha", 0.0)
        except Exception:
            pass

        self.title("Prisma Mídia")
        self.resizable(False, False)
        self.configure(bg="#0f0f13")

        self._aplicar_icone()

        self.arquivo_video = tk.StringVar()
        self.progresso_var = tk.DoubleVar()
        self.status_var    = tk.StringVar(value="Selecione um vídeo ou imagem para começar")
        self._tipo_atual    = None

        # Pastas persistentes
        _cfg  = _carregar_config()
        _home = os.path.expanduser("~")
        self._ultima_pasta_abertura   = _cfg.get("ultima_pasta_abertura",   _home)
        self._ultima_pasta_salvamento = _cfg.get("ultima_pasta_salvamento", _home)
        self._config = _cfg

        # Texto padrão da zona de drop — atualizado por _setup_drop
        self._drop_texto_padrao = "Solte o vídeo ou imagem aqui  ou  clique para selecionar"
        self._dnd_ativo = False
        self._drag_leave_timer = None

        # Processo FFmpeg em andamento
        self._process   = None
        self._cancelado = False

        # Fila para comunicação segura entre threads e o loop Tk
        self._ui_queue = queue.Queue()

        self._build_ui()
        self._setup_drop()

        # Centralizar janela no monitor (deve vir APÓS build_ui e setup_drop)
        self.update_idletasks()
        largura = 620
        altura  = 480
        x = (self.winfo_screenwidth()  - largura) // 2
        y = (self.winfo_screenheight() - altura)  // 2
        self.geometry(f"{largura}x{altura}+{x}+{y}")
        self.after(80, self._mostrar_janela_pronta)

        # Processa mensagens da fila a cada 100 ms
        self._processar_fila()

    # -------------------------------------------------------------------------

    def _aplicar_icone(self):
        """Aplica o ícone na janela do Tkinter e ajuda o Windows a exibir o ícone correto na barra de tarefas."""
        caminho_icone = obter_caminho_recurso("icone.ico")

        if not caminho_icone:
            return

        try:
            if sys.platform == "win32":
                import ctypes
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Heitor.PrismaMidia.1")
        except Exception:
            pass

        try:
            self.iconbitmap(caminho_icone)
        except Exception:
            pass

    def _mostrar_janela_pronta(self):
        """Mostra a janela somente depois que a interface já foi montada e processada."""
        self.update_idletasks()
        self.deiconify()
        self.lift()

        try:
            self.after(50, lambda: self.attributes("-alpha", 1.0))
        except Exception:
            pass

    # -------------------------------------------------------------------------

    def _processar_fila(self):
        """Executa callbacks enfileirados pela thread de compressão no loop principal."""
        try:
            while True:
                fn = self._ui_queue.get_nowait()
                fn()
        except queue.Empty:
            pass
        self.after(100, self._processar_fila)

    def _ui(self, fn):
        """Enfileira uma função para rodar na thread principal do Tkinter."""
        self._ui_queue.put(fn)

    # -------------------------------------------------------------------------

    def _build_ui(self):
        # --- Barra de título com botão Reset à direita ---
        titulo_frame = tk.Frame(self, bg="#0f0f13")
        titulo_frame.pack(fill="x", padx=30, pady=(14, 4))

        tk.Label(
            titulo_frame, text="\U0001f52e  PRISMA MÍDIA",
            bg="#0f0f13", fg="#e0e0ff",
            font=("Courier New", 16, "bold")
        ).pack(side="left", expand=True)

        self.btn_reset = tk.Button(
            titulo_frame, text="\u21ba",
            command=self.resetar,
            bg="#1e1e3a", fg="#8888cc",
            activebackground="#2a2a55", activeforeground="#ffffff",
            font=("Courier New", 12), relief="flat",
            padx=8, pady=4, cursor="hand2", bd=0
        )
        self.btn_reset.pack(side="right")

        # --- Área de drop ---
        self.drop_frame = tk.Frame(
            self, bg="#1a1a2e", width=560, height=160,
            highlightbackground="#3a3a6e", highlightthickness=2,
            cursor="hand2"
        )
        self.drop_frame.pack(padx=30, pady=(0, 0))
        self.drop_frame.pack_propagate(False)

        self.drop_icon = tk.Label(
            self.drop_frame, text="\u2b07", font=("Segoe UI Emoji", 36),
            bg="#1a1a2e", fg="#5555cc"
        )
        self.drop_icon.pack(pady=(18, 4))

        self.drop_label = tk.Label(
            self.drop_frame,
            text="Solte o vídeo ou imagem aqui  ou  clique para selecionar",
            bg="#1a1a2e", fg="#8888cc",
            font=("Courier New", 12)
        )
        self.drop_label.pack()

        self.drop_sub = tk.Label(
            self.drop_frame,
            text="Vídeos e imagens — MP4 MKV AVI MOV PNG JPG e outros formatos",
            bg="#1a1a2e", fg="#444477",
            font=("Courier New", 8)
        )
        self.drop_sub.pack(pady=(3, 0))

        for w in (self.drop_frame, self.drop_icon, self.drop_label, self.drop_sub):
            w.bind("<Button-1>", lambda e: self.procurar_arquivo())

        # --- Nome do arquivo selecionado ---
        self.nome_arquivo_label = tk.Label(
            self, textvariable=self.arquivo_video,
            bg="#0f0f13", fg="#aaaaee",
            font=("Courier New", 9),
            wraplength=560, justify="center"
        )
        self.nome_arquivo_label.pack(pady=(3, 0))

        # --- Qualidade (agrupada visualmente com a zona de drop) ---
        qualidade_frame = tk.Frame(self, bg="#0f0f13")
        qualidade_frame.pack(pady=(10, 8))

        tk.Label(
            qualidade_frame, text="Qualidade:",
            bg="#0f0f13", fg="#8888cc",
            font=("Courier New", 10)
        ).pack(side="left", padx=(0, 10))

        self.qualidade_var = tk.StringVar(value="Alta (menos compressão)")
        style = ttk.Style()
        style.theme_use("clam")

        style.configure(
            "Dark.TCombobox",
            fieldbackground="#1a1a2e",
            background="#1a1a2e",
            foreground="#e0e0ff",
            selectbackground="#1a1a2e",
            selectforeground="#e0e0ff",
            bordercolor="#3a3a6e",
            lightcolor="#1a1a2e",
            darkcolor="#1a1a2e",
            arrowcolor="#ffffff",
            arrowsize=12
        )
        style.map(
            "Dark.TCombobox",
            fieldbackground=[("readonly", "#1a1a2e"), ("disabled", "#0f0f13")],
            background=[("readonly", "#1a1a2e"), ("disabled", "#0f0f13")],
            foreground=[("readonly", "#e0e0ff"), ("disabled", "#6666cc")],
            selectbackground=[("readonly", "#1a1a2e")],
            selectforeground=[("readonly", "#e0e0ff")],
            arrowcolor=[("readonly", "#ffffff"), ("disabled", "#6666cc")],
            bordercolor=[("readonly", "#3a3a6e")],
            lightcolor=[("readonly", "#1a1a2e")],
            darkcolor=[("readonly", "#1a1a2e")]
        )

        self.option_add("*TCombobox*Listbox*background",      "#1a1a2e")
        self.option_add("*TCombobox*Listbox*foreground",      "#e0e0ff")
        self.option_add("*TCombobox*Listbox*selectBackground","#2a2a55")
        self.option_add("*TCombobox*Listbox*selectForeground","#ffffff")
        self.option_add("*TCombobox*Listbox*font",            ("Courier New", 10))

        self.combo_qualidade = ttk.Combobox(
            qualidade_frame,
            textvariable=self.qualidade_var,
            values=["Alta (menos compressão)", "Média", "Baixa (mais compressão)"],
            state="readonly", width=26,
            style="Dark.TCombobox",
            font=("Courier New", 10)
        )
        self.combo_qualidade.pack(side="left")
        self.combo_qualidade.current(0)
        self.combo_qualidade.bind("<FocusIn>", lambda e: self.combo_qualidade.selection_clear())

        # --- Separador visual ---
        sep = tk.Frame(self, bg="#2a2a4a", height=1)
        sep.pack(fill="x", padx=40, pady=(10, 0))

        # --- Botões de ação ---
        acoes_frame = tk.Frame(self, bg="#0f0f13")
        acoes_frame.pack(pady=(16, 12))

        self.btn_reduzir = tk.Button(
            acoes_frame, text="\u26a1  COMPRIMIR VÍDEO",
            command=self.reduzir,
            bg="#3333aa", fg="#ffffff",
            activebackground="#5555cc", activeforeground="#ffffff",
            font=("Courier New", 13, "bold"),
            relief="flat", padx=20, pady=10,
            cursor="hand2", bd=0
        )
        self.btn_reduzir.pack(side="left", padx=5)

        self.btn_converter = tk.Button(
            acoes_frame, text="\U0001f504  CONVERTER",
            command=self.converter,
            bg="#1a7a5a", fg="#ffffff",
            activebackground="#22aa77", activeforeground="#ffffff",
            font=("Courier New", 13, "bold"),
            relief="flat", padx=20, pady=10,
            cursor="hand2", bd=0
        )
        self.btn_converter.pack(side="left", padx=5)

        self.btn_cancelar = tk.Button(
            acoes_frame, text="\u2716  CANCELAR",
            command=self.cancelar,
            bg="#7a1a1a", fg="#ffaaaa",
            activebackground="#aa2222", activeforeground="#ffffff",
            font=("Courier New", 13, "bold"),
            relief="flat", padx=20, pady=10,
            cursor="hand2", bd=0
        )
        # Não faz pack ainda — será mostrado apenas durante a compressão

        # --- Barra de progresso ---
        style.configure(
            "Neon.Horizontal.TProgressbar",
            troughcolor="#1a1a2e", background="#5555ff", thickness=12
        )
        ttk.Progressbar(
            self, variable=self.progresso_var,
            maximum=100, length=560,
            style="Neon.Horizontal.TProgressbar"
        ).pack(padx=30, pady=(6, 10))

        # --- Status ---
        tk.Label(
            self, textvariable=self.status_var,
            bg="#0f0f13", fg="#6666cc",
            font=("Courier New", 9),
            pady=10, wraplength=560
        ).pack()

    # -------------------------------------------------------------------------

    def _setup_drop(self):
        """Ativa drag-and-drop inicializando o tkdnd na janela atual."""
        if not _DND_AVAILABLE:
            self.drop_label.config(text="Clique aqui para selecionar o vídeo ou imagem")
            self.drop_sub.config(text="")
            return
        try:
            # _require espera a instância tk.Tk completa (self), não self.tk
            _dnd.TkinterDnD._require(self)
            for widget in (self.drop_frame, self.drop_icon, self.drop_label, self.drop_sub):
                widget.drop_target_register("DND_Files")
                widget.dnd_bind("<<Drop>>",      self._on_drop)
                widget.dnd_bind("<<DropEnter>>", self._on_drag_enter)
                widget.dnd_bind("<<DropLeave>>", self._on_drag_leave)
            self._dnd_ativo = True
        except Exception:
            self.drop_label.config(text="Clique aqui para selecionar o vídeo ou imagem")
            self.drop_sub.config(text="")

    def _on_drag_enter(self, event):
        """Feedback visual ao arrastar arquivo sobre a zona."""
        if self._drag_leave_timer is not None:
            self.after_cancel(self._drag_leave_timer)
            self._drag_leave_timer = None

        self.drop_frame.config(highlightbackground="#7777ff", bg="#1f1f3a")
        self.drop_icon.config(text="\U0001f4e5", fg="#aaaaff", bg="#1f1f3a")
        self.drop_label.config(text="Solte o arquivo aqui!", fg="#aaaaff", bg="#1f1f3a")
        self.drop_sub.config(text="", bg="#1f1f3a")

    def _on_drag_leave(self, event):
        """Agenda o restauro da zona ao estado normal."""
        if self._drag_leave_timer is not None:
            self.after_cancel(self._drag_leave_timer)
        self._drag_leave_timer = self.after(50, self._realmente_deixar)

    def _realmente_deixar(self):
        """Restaura a zona ao estado normal após confirmar que o mouse realmente saiu."""
        self._drag_leave_timer = None
        caminho = self.arquivo_video.get()
        if caminho:
            nome = os.path.basename(caminho)
            icone = "\U0001f5bc" if self._tipo_atual == "imagem" else "\U0001f3a5"
            self.drop_frame.config(highlightbackground="#3a3a6e", bg="#1a1a2e")
            self.drop_icon.config(text=icone, fg="#88eebb", bg="#1a1a2e")
            self.drop_label.config(text=f"\u2705  {nome}", fg="#88eebb", bg="#1a1a2e")
            self.drop_sub.config(text="", bg="#1a1a2e")
        else:
            self.drop_frame.config(highlightbackground="#3a3a6e", bg="#1a1a2e")
            self.drop_icon.config(text="\u2b07", fg="#5555cc", bg="#1a1a2e")
            self.drop_label.config(text=self._drop_texto_padrao, fg="#8888cc", bg="#1a1a2e")
            self.drop_sub.config(text="V\u00eddeos e imagens \u2014 MP4 MKV AVI MOV PNG JPG e outros formatos", bg="#1a1a2e")

    def _on_drop(self, event):
        """Processa o arquivo solto e restaura o visual da borda."""
        if self._drag_leave_timer is not None:
            self.after_cancel(self._drag_leave_timer)
            self._drag_leave_timer = None

        self.drop_frame.config(highlightbackground="#3a3a6e", bg="#1a1a2e")
        self.drop_icon.config(bg="#1a1a2e")
        self.drop_label.config(bg="#1a1a2e")
        self.drop_sub.config(bg="#1a1a2e")
        caminho = event.data.strip().strip("{}")
        if caminho:
            self._definir_arquivo(caminho)

    # -------------------------------------------------------------------------

    def procurar_arquivo(self):
        tipos = [
            ("Vídeos e imagens", "*.mp4 *.mkv *.avi *.mov *.wmv *.flv *.webm *.mpeg *.mpg *.m4v *.3gp "
                                  "*.png *.jpg *.jpeg *.bmp *.gif *.tiff *.tif *.webp"),
            ("Vídeos", "*.mp4 *.mkv *.avi *.mov *.wmv *.flv *.webm *.mpeg *.mpg *.m4v *.3gp"),
            ("Imagens", "*.png *.jpg *.jpeg *.bmp *.gif *.tiff *.tif *.webp"),
            ("Todos os arquivos", "*.*")
        ]
        caminho = filedialog.askopenfilename(
            title="Selecionar vídeo ou imagem",
            filetypes=tipos,
            initialdir=self._ultima_pasta_abertura
        )
        if caminho:
            self._ultima_pasta_abertura = os.path.dirname(caminho)
            self._config["ultima_pasta_abertura"] = self._ultima_pasta_abertura
            _salvar_config(self._config)
            self._definir_arquivo(caminho)

    def _tipo_arquivo(self, caminho: str):
        """Classifica o arquivo como 'video', 'imagem' ou None (formato não reconhecido)."""
        ext = os.path.splitext(caminho)[1].lower()
        if ext in VIDEO_EXTS:
            return "video"
        if ext in IMAGE_EXTS:
            return "imagem"
        return None

    def _definir_arquivo(self, caminho):
        self.arquivo_video.set(caminho)
        nome = os.path.basename(caminho)
        self._tipo_atual = self._tipo_arquivo(caminho)
        icone = "\U0001f5bc" if self._tipo_atual == "imagem" else "\U0001f3a5"
        self.drop_label.config(text=f"\u2705  {nome}", fg="#88eebb")
        self.drop_icon.config(text=icone, fg="#88eebb")
        self.drop_sub.config(text="")

        if self._tipo_atual == "imagem":
            self.btn_reduzir.config(state="disabled")
            self.status_var.set("Imagem pronta. Clique em CONVERTER.")
        else:
            self.btn_reduzir.config(state="normal")
            self.status_var.set("Arquivo pronto. Clique em COMPRIMIR ou CONVERTER.")

    def resetar(self):
        """Devolve a interface ao estado inicial: sem arquivo, qualidade padrão."""
        self.arquivo_video.set("")
        self._tipo_atual = None
        self.qualidade_var.set("Alta (menos compressão)")
        self.combo_qualidade.current(0)
        self.progresso_var.set(0)
        self.status_var.set("Selecione um vídeo ou imagem para começar")
        self.btn_reduzir.config(state="normal")
        self.drop_icon.config(text="\u2b07",  fg="#5555cc", bg="#1a1a2e")
        self.drop_frame.config(highlightbackground="#3a3a6e", bg="#1a1a2e")
        self.drop_sub.config(text="Vídeos e imagens — MP4 MKV AVI MOV PNG JPG e outros formatos",
                             bg="#1a1a2e", fg="#444477")
        if self._dnd_ativo:
            self.drop_label.config(text=self._drop_texto_padrao, fg="#8888cc", bg="#1a1a2e")
        else:
            self.drop_label.config(text="Clique aqui para selecionar o vídeo ou imagem",
                                   fg="#8888cc", bg="#1a1a2e")

    # -------------------------------------------------------------------------

    def cancelar(self):
        """Envia sinal de cancelamento ao processo FFmpeg em andamento."""
        if self._process and self._process.poll() is None:
            self._cancelado = True
            self._process.terminate()

    def _mostrar_btn_cancelar(self, mostrar: bool):
        """Mostra ou oculta o botão Cancelar."""
        if mostrar:
            self.btn_cancelar.pack(side="left", padx=5)
        else:
            self.btn_cancelar.pack_forget()

    def reduzir(self):
        entrada = self.arquivo_video.get()
        if not entrada or not os.path.isfile(entrada):
            messagebox.showwarning(
                "Vídeo Não Selecionado",
                "Por favor, selecione um arquivo de vídeo antes de iniciar o processo de compressão."
            )
            return

        if not verificar_ffmpeg():
            return

        base, ext = os.path.splitext(os.path.basename(entrada))
        ext_saida = ext if ext.lower() in (".mp4", ".mkv") else ".mp4"
        nome_sugerido = f"{base}_reduzido{ext_saida}"

        saida = filedialog.asksaveasfilename(
            title="Salvar vídeo reduzido como...",
            initialfile=nome_sugerido,
            initialdir=self._ultima_pasta_salvamento,
            defaultextension=ext_saida,
            filetypes=[("MP4", "*.mp4"), ("MKV", "*.mkv"), ("Todos", "*.*")]
        )
        if not saida:
            return

        self._ultima_pasta_salvamento = os.path.dirname(saida)
        self._config["ultima_pasta_salvamento"] = self._ultima_pasta_salvamento
        _salvar_config(self._config)

        self.btn_reduzir.config(state="disabled")
        self.btn_converter.config(state="disabled")
        self._mostrar_btn_cancelar(True)
        self.progresso_var.set(0)
        self._cancelado = False

        threading.Thread(
            target=self._comprimir_worker,
            args=(entrada, saida, self.qualidade_var.get()),
            daemon=True
        ).start()

    def _comprimir_worker(self, entrada, saida, qualidade):
        """Roda em thread secundária — só se comunica com Tk via self._ui()."""
        crf_map = {
            "Alta (menos compressão)": "23",
            "Média": "28",
            "Baixa (mais compressão)": "35"
        }
        crf = crf_map.get(qualidade, "23")

        duracao_total = None
        try:
            ffprobe_c = obter_caminho_binario("ffprobe") or "ffprobe"
            result = subprocess.run(
                [ffprobe_c, "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", entrada],
                capture_output=True, text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            duracao_total = float(result.stdout.strip())
        except Exception:
            pass

        ffmpeg_c = obter_caminho_binario("ffmpeg") or "ffmpeg"
        cmd = [
            ffmpeg_c, "-y", "-i", entrada,
            "-vcodec", "libx264", "-crf", crf,
            "-preset", "medium",
            "-acodec", "aac", "-b:a", "128k",
            "-progress", "pipe:1", "-nostats",
            saida
        ]

        def _restaurar_ui():
            self.btn_reduzir.config(state="normal")
            self.btn_converter.config(state="normal")
            self._mostrar_btn_cancelar(False)

        try:
            self._ui(lambda: self.status_var.set("\u23f3 Comprimindo vídeo..."))

            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )

            for linha in self._process.stdout:
                if self._cancelado:
                    break
                linha = linha.strip()
                if linha.startswith("out_time_ms="):
                    try:
                        ms  = int(linha.split("=")[1])
                        seg = ms / 1_000_000
                        if duracao_total and duracao_total > 0:
                            pct = min(100.0, (seg / duracao_total) * 100)
                            self._ui(lambda p=pct: self.progresso_var.set(p))
                    except Exception:
                        pass

            self._process.wait()

            if self._cancelado:
                try:
                    if os.path.exists(saida):
                        os.remove(saida)
                except Exception:
                    pass

                def _cancelado_ui():
                    self.progresso_var.set(0)
                    self.status_var.set("\U0001f6ab Compressão cancelada pelo usuário.")
                    _restaurar_ui()

                self._ui(_cancelado_ui)
                return

            ok = (self._process.returncode == 0)

        except Exception as e:
            err_msg = str(e)
            self._ui(lambda: self.status_var.set("\u274c Erro inesperado."))
            self._ui(lambda m=err_msg: messagebox.showerror("Erro", m))
            self._ui(_restaurar_ui)
            self._ui(lambda: self.progresso_var.set(0))
            return
        finally:
            self._process = None

        if ok:
            tamanho_antes  = os.path.getsize(entrada) / (1024 * 1024)
            tamanho_depois = os.path.getsize(saida)   / (1024 * 1024)
            reducao = (1 - tamanho_depois / tamanho_antes) * 100

            def _sucesso():
                self.progresso_var.set(100)
                self.status_var.set(
                    f"\u2705 Concluído! {tamanho_antes:.1f} MB \u2192 {tamanho_depois:.1f} MB  ({reducao:.0f}% menor)"
                )
                messagebox.showinfo(
                    "Sucesso!",
                    f"Vídeo comprimido com sucesso!\n\n"
                    f"\U0001f4c1 Salvo em:\n{saida}\n\n"
                    f"\U0001f4e6 Tamanho original: {tamanho_antes:.1f} MB\n"
                    f"\U0001f4e6 Tamanho final:    {tamanho_depois:.1f} MB\n"
                    f"\U0001f4c9 Redução:          {reducao:.0f}%"
                )
                _restaurar_ui()

            self._ui(_sucesso)
        else:
            def _erro():
                self.progresso_var.set(0)
                self.status_var.set("\u274c Erro durante a compressão.")
                messagebox.showerror("Erro", "Ocorreu um erro ao comprimir o vídeo.\nVerifique se o arquivo é válido.")
                _restaurar_ui()

            self._ui(_erro)


    def converter(self):
        entrada = self.arquivo_video.get()
        if not entrada or not os.path.isfile(entrada):
            messagebox.showwarning(
                "Arquivo Não Selecionado",
                "Por favor, selecione um vídeo ou imagem antes de converter."
            )
            return

        if not verificar_ffmpeg():
            return

        tipo = self._tipo_arquivo(entrada)
        if tipo is None:
            messagebox.showwarning(
                "Formato Não Suportado",
                "Não foi possível identificar se o arquivo é um vídeo ou uma imagem."
            )
            return

        ext_atual = os.path.splitext(entrada)[1].lower()
        formatos = VIDEO_FORMATOS if tipo == "video" else IMAGE_FORMATOS
        opcoes = [f for f in formatos if f".{f.lower()}" != ext_atual]
        if not opcoes:
            opcoes = formatos

        formato_escolhido = self._escolher_formato(opcoes, tipo)
        if not formato_escolhido:
            return

        ext_saida = f".{formato_escolhido.lower()}"
        base = os.path.splitext(os.path.basename(entrada))[0]
        nome_sugerido = f"{base}_convertido{ext_saida}"

        saida = filedialog.asksaveasfilename(
            title="Salvar arquivo convertido como...",
            initialfile=nome_sugerido,
            initialdir=self._ultima_pasta_salvamento,
            defaultextension=ext_saida,
            filetypes=[(formato_escolhido, f"*{ext_saida}"), ("Todos", "*.*")]
        )
        if not saida:
            return

        self._ultima_pasta_salvamento = os.path.dirname(saida)
        self._config["ultima_pasta_salvamento"] = self._ultima_pasta_salvamento
        _salvar_config(self._config)

        self.btn_reduzir.config(state="disabled")
        self.btn_converter.config(state="disabled")
        self._mostrar_btn_cancelar(True)
        self.progresso_var.set(0)
        self._cancelado = False

        threading.Thread(
            target=self._converter_worker,
            args=(entrada, saida, tipo),
            daemon=True
        ).start()

    def _escolher_formato(self, opcoes, tipo):
        """Abre um diálogo modal para escolher o formato de destino. Retorna a string escolhida ou None."""
        resultado = {"valor": None}

        dialog = tk.Toplevel(self)
        dialog.title("Escolher formato")
        dialog.configure(bg="#0f0f13")
        dialog.resizable(False, False)
        dialog.transient(self)
        dialog.grab_set()

        titulo = "vídeo" if tipo == "video" else "imagem"
        tk.Label(
            dialog, text=f"Converter {titulo} para:",
            bg="#0f0f13", fg="#e0e0ff", font=("Courier New", 11, "bold")
        ).pack(padx=24, pady=(20, 10))

        formato_var = tk.StringVar(value=opcoes[0])
        combo = ttk.Combobox(
            dialog, textvariable=formato_var, values=opcoes,
            state="readonly", width=20, style="Dark.TCombobox",
            font=("Courier New", 10)
        )
        combo.pack(padx=24, pady=(0, 16))
        combo.current(0)

        botoes = tk.Frame(dialog, bg="#0f0f13")
        botoes.pack(pady=(0, 20))

        def confirmar():
            resultado["valor"] = formato_var.get()
            dialog.destroy()

        def fechar_dialog():
            dialog.destroy()

        tk.Button(
            botoes, text="Converter", command=confirmar,
            bg="#1a7a5a", fg="#ffffff", activebackground="#22aa77",
            activeforeground="#ffffff", font=("Courier New", 10, "bold"),
            relief="flat", padx=16, pady=6, cursor="hand2", bd=0
        ).pack(side="left", padx=6)

        tk.Button(
            botoes, text="Cancelar", command=fechar_dialog,
            bg="#2a2a4a", fg="#aaaaee", activebackground="#3a3a6e",
            activeforeground="#ffffff", font=("Courier New", 10),
            relief="flat", padx=16, pady=6, cursor="hand2", bd=0
        ).pack(side="left", padx=6)

        dialog.protocol("WM_DELETE_WINDOW", fechar_dialog)

        dialog.update_idletasks()
        largura, altura = 260, 150
        x = self.winfo_x() + (self.winfo_width() - largura) // 2
        y = self.winfo_y() + (self.winfo_height() - altura) // 2
        dialog.geometry(f"{largura}x{altura}+{x}+{y}")

        self.wait_window(dialog)
        return resultado["valor"]

    def _converter_worker(self, entrada, saida, tipo):
        """Roda em thread secundária — só se comunica com Tk via self._ui()."""
        ext_saida = os.path.splitext(saida)[1].lower()
        ffmpeg_c = obter_caminho_binario("ffmpeg") or "ffmpeg"

        def _restaurar_ui():
            self.btn_reduzir.config(state="normal" if self._tipo_atual == "video" else "disabled")
            self.btn_converter.config(state="normal")
            self._mostrar_btn_cancelar(False)

        if tipo == "video":
            duracao_total = None
            try:
                ffprobe_c = obter_caminho_binario("ffprobe") or "ffprobe"
                result = subprocess.run(
                    [ffprobe_c, "-v", "error", "-show_entries", "format=duration",
                     "-of", "default=noprint_wrappers=1:nokey=1", entrada],
                    capture_output=True, text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )
                duracao_total = float(result.stdout.strip())
            except Exception:
                pass

            cmd = [ffmpeg_c, "-y", "-i", entrada] + _codec_args_video(ext_saida) + [
                "-progress", "pipe:1", "-nostats", saida
            ]

            try:
                self._ui(lambda: self.status_var.set("\U0001f504 Convertendo vídeo..."))

                self._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )

                for linha in self._process.stdout:
                    if self._cancelado:
                        break
                    linha = linha.strip()
                    if linha.startswith("out_time_ms="):
                        try:
                            ms  = int(linha.split("=")[1])
                            seg = ms / 1_000_000
                            if duracao_total and duracao_total > 0:
                                pct = min(100.0, (seg / duracao_total) * 100)
                                self._ui(lambda p=pct: self.progresso_var.set(p))
                        except Exception:
                            pass

                self._process.wait()

            except Exception as e:
                err_msg = str(e)
                self._ui(lambda: self.status_var.set("\u274c Erro inesperado."))
                self._ui(lambda m=err_msg: messagebox.showerror("Erro", m))
                self._ui(_restaurar_ui)
                self._ui(lambda: self.progresso_var.set(0))
                self._process = None
                return
        else:
            # Imagem — conversão é praticamente instantânea, sem barra de progresso incremental
            cmd = [ffmpeg_c, "-y", "-i", entrada]
            if ext_saida in (".jpg", ".jpeg"):
                cmd += ["-q:v", "2"]
            cmd.append(saida)

            try:
                self._ui(lambda: self.status_var.set("\U0001f504 Convertendo imagem..."))

                self._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )
                self._process.wait()

            except Exception as e:
                err_msg = str(e)
                self._ui(lambda: self.status_var.set("\u274c Erro inesperado."))
                self._ui(lambda m=err_msg: messagebox.showerror("Erro", m))
                self._ui(_restaurar_ui)
                self._ui(lambda: self.progresso_var.set(0))
                self._process = None
                return

        if self._cancelado:
            try:
                if os.path.exists(saida):
                    os.remove(saida)
            except Exception:
                pass

            def _cancelado_ui():
                self.progresso_var.set(0)
                self.status_var.set("\U0001f6ab Conversão cancelada pelo usuário.")
                _restaurar_ui()

            self._ui(_cancelado_ui)
            self._process = None
            return

        ok = (self._process.returncode == 0)
        self._process = None

        if ok:
            def _sucesso():
                self.progresso_var.set(100)
                self.status_var.set(f"\u2705 Convertido com sucesso para {ext_saida.upper().lstrip('.')}")
                messagebox.showinfo(
                    "Sucesso!",
                    f"Arquivo convertido com sucesso!\n\n\U0001f4c1 Salvo em:\n{saida}"
                )
                _restaurar_ui()

            self._ui(_sucesso)
        else:
            def _erro():
                self.progresso_var.set(0)
                self.status_var.set("\u274c Erro durante a conversão.")
                messagebox.showerror(
                    "Erro",
                    "Ocorreu um erro ao converter o arquivo.\nVerifique se o formato de destino é suportado."
                )
                _restaurar_ui()

            self._ui(_erro)


# --- Main -------------------------------------------------------------------

if __name__ == "__main__":
    app = App()
    app.mainloop()