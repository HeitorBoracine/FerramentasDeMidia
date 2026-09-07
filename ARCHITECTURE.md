# Arquitetura

## Visão geral

```
┌─────────────────────────┐        invoke()         ┌──────────────────────────┐
│  React (src/)            │ ───────────────────────▶ │  Rust (src-tauri/src/)   │
│                           │                          │                          │
│  App.tsx (useReducer)     │ ◀─────────────────────── │  commands/*.rs           │
│  componentes controlados  │   Channel<ProgressEvent> │  ffmpeg/mod.rs::run_job  │
└─────────────────────────┘   (progress/done/error/    └──────────────────────────┘
                                cancelled, em tempo real)            │
                                                                      ▼
                                                          std::process::Command
                                                          (ffmpeg.exe / ffprobe.exe
                                                           extraídos em disco)
```

O frontend nunca fala com o FFmpeg diretamente — sempre via `invoke()` num comando Rust
(`src-tauri/src/commands/`). Operações longas (comprimir/converter) recebem um
[`Channel`](https://v2.tauri.app/develop/calling-frontend/) que o Rust usa pra empurrar
eventos de progresso pro frontend *enquanto* o comando ainda está rodando — é assim que a
barra de progresso atualiza em tempo real sem polling.

## Fluxo de um job (comprimir ou converter)

1. Frontend chama `compressVideo()`/`convertFile()` (`src/lib/tauri.ts`), que cria um
   `Channel<ProgressEvent>` e invoca o comando Rust correspondente passando o canal.
2. O comando (`commands/compress.rs` ou `commands/convert.rs`) monta os argumentos de
   codec e delega pra `ffmpeg::run_job()` (`src-tauri/src/ffmpeg/mod.rs`) — a mesma
   função roda os dois casos, só muda a lista de argumentos e se rastreia progresso.
3. `run_job` roda o `ffprobe` (se for vídeo) pra saber a duração total, dispara o
   `ffmpeg` com `-progress pipe:1`, guarda o `Child` num `JobState` compartilhado
   (`src-tauri/src/state.rs`) e lê o stdout linha a linha, parseando `out_time_ms=` pra
   calcular a porcentagem.
4. Cada evento (`Progress`, `Done`, `Error`, `Cancelled`) é serializado e enviado pelo
   `Channel` — o formato exato (nomes de campos em camelCase) é fixado por testes em
   `ffmpeg/mod.rs` e `commands/settings.rs`, então uma mudança acidental no Rust que
   quebre o contrato com `src/types/index.ts` falha o `cargo test`.
5. `cancel_job` (chamado pelo botão Cancelar) mata o `Child` guardado no `JobState` e
   marca uma flag `cancelled`; é o próprio `run_job` — não o `cancel_job` — quem detecta
   essa flag depois que o processo morre, apaga o arquivo de saída parcial e emite
   `Cancelled`.

## Binários do FFmpeg: embutidos e extraídos uma vez só

`ffmpeg.exe`/`ffprobe.exe` (~97MB cada, brutos) são versionados comprimidos com
`xz -6` como `src-tauri/assets/ffmpeg.exe.xz`/`ffprobe.exe.xz` (~26MB cada, via
Git LFS) — reduz o executável final embutido em ~140MB. São embutidos em tempo
de compilação via `include_bytes!` (`src-tauri/src/ffmpeg/binaries.rs`), e
descomprimidos (`lzma_rs::xz_decompress`, decoder XZ 100% Rust, sem depender de
`liblzma`) pra:

```
%LOCALAPPDATA%\com.heitor.ferramentasdemidia\bin\ffmpeg.exe
%LOCALAPPDATA%\com.heitor.ferramentasdemidia\bin\ffprobe.exe
```

...só se o arquivo ainda não existir lá ou se um hash (FNV-1a) do `.xz` embutido
for diferente do sidecar `ffmpeg.exe.hash`/`ffprobe.exe.hash` gravado na última
extração — então a extração de verdade (que inclui descomprimir os ~26MB) só
roda uma vez, no primeiro uso ou depois de uma atualização do app.

**A extração roda numa thread separada, não no `setup()` do app.** O decoder
XZ em Rust puro é rápido o bastante em release (~2s pros dois arquivos), mas em
build de *debug* sem otimizações do compilador (o que `dev.bat`/`cargo tauri
dev` usam) ele chega a levar **~10s por arquivo** — medido empiricamente. Se
essa extração rodasse de forma síncrona no `setup()` (como antes), o app inteiro
ficaria travado esse tempo todo antes da janela virar interativa. Em vez disso,
`spawn_binaries_extraction()` dispara uma thread e devolve um `Arc<BinariesCell>`
gerenciável (`app.manage()`) na hora — a janela abre e fica interativa
imediatamente. Os comandos que precisam do ffmpeg (`compress_video`,
`convert_file`, etc.) chamam `BinariesCell::wait()`, que só bloqueia de verdade
se o usuário conseguir clicar num botão ANTES da extração terminar em segundo
plano — na prática, quase nunca (escolher um arquivo e clicar já leva mais
tempo que isso).

## Tabela de codecs por formato de destino

Ambos os "modos" (comprimir e converter) usam a mesma função `run_job`, só com argumentos
de codec diferentes. Essa tabela é a lógica de negócio mais fácil de "desviar" do
original em edições futuras — qualquer alteração aqui deve manter os dois lados
(`src-tauri/src/commands/convert.rs` e `src-tauri/src/commands/compress.rs`) coerentes.

| Operação | Formato de saída | Codec de vídeo | Codec de áudio |
|---|---|---|---|
| Comprimir | mesmo formato de entrada — exceto `webm`/`mpeg`/`mpg`, que caem pra `mp4` (h264/aac não é aceito nesses containers, ver `extensaoCompressao` em `src/lib/formats.ts`) | `libx264 -crf {23\|28\|35}` (Alta/Média/Baixa) | `aac -b:a 128k` |
| Converter | mp4/mkv/mov/outros | `libx264 -crf 23` | `aac -b:a 128k` |
| Converter | webm | `libvpx-vp9 -crf 32` | `libopus` |
| Converter | avi | `mpeg4 -vtag xvid -q:v 3` | `libmp3lame -b:a 192k` |
| Converter | wmv | `wmv2` | `wmav2 -b:a 192k` |
| Converter | flv | `flv` | `aac -b:a 128k` |
| Converter | jpg/jpeg | — (`-q:v 2`) | — |
| Converter | png/bmp/webp/tiff/gif | — (sem args extras) | — |

Conversão de imagem não passa `-progress pipe:1` nem consulta o `ffprobe` (é
praticamente instantânea) — ver o campo `track_progress` em `FfmpegJob`.

## Configurações persistidas

Últimas pastas de abrir/salvar, em:

```
%APPDATA%\com.heitor.ferramentasdemidia\config.json
```

```json
{ "lastOpenDir": "C:\\Users\\...\\Videos", "lastSaveDir": "C:\\Users\\...\\Downloads" }
```

Lido/escrito pelos comandos `get_settings`/`save_settings`
(`src-tauri/src/commands/settings.rs`), chamados pelo frontend depois de cada interação
bem-sucedida com os diálogos nativos de abrir/salvar arquivo.
