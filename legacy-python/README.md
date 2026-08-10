# Implementação legada (Python/Tkinter)

Esta é a versão original do app "Ferramentas de Mídia" (antes chamado "Compressor de Vídeo", depois "Prisma Mídia"), escrita em Python + Tkinter e empacotada com PyInstaller.

Foi substituída por uma reescrita em Tauri v2 (Rust + React + TypeScript) — veja o [README.md](../README.md) na raiz do repositório para a versão atual.

Mantida aqui apenas como referência histórica, principalmente para conferir o comportamento exato e os argumentos de FFmpeg usados na compressão/conversão durante a migração.

- `redutor_video.py` — código-fonte principal.
- `Compressor de Vídeo.spec` — spec do PyInstaller usado para gerar o `.exe` (build atual, com suporte a vídeo + imagem).
- `Compressor de Video.spec` — spec antigo (sem acento no nome), de uma versão anterior do build.

Os binários `ffmpeg.exe`/`ffprobe.exe`/`icone.ico` que este script usava agora vivem em `src-tauri/assets/`, compartilhados com a nova implementação.
