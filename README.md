# Ferramentas de Mídia

Compressor e conversor de vídeo/imagem 100% local e offline. Comprime vídeos e converte
vídeos e imagens entre os principais formatos do mercado, tudo processado na sua máquina
via [FFmpeg](https://ffmpeg.org/) — nenhum arquivo sai do seu computador.

Reescrita em [Tauri v2](https://v2.tauri.app/) (Rust) + React + TypeScript da versão original
em Python/Tkinter, que está preservada em [`legacy-python/`](legacy-python/) como referência.

## Funcionalidades

- **Comprimir vídeo** — três níveis de qualidade (Alta/Média/Baixa), usando libx264/AAC.
- **Converter vídeo** — MP4, MKV, AVI, MOV, WEBM, WMV, FLV.
- **Converter imagem** — PNG, JPG, BMP, WEBP, TIFF, GIF.
- Arrastar-e-soltar ou clicar pra selecionar o arquivo.
- Progresso em tempo real e cancelamento a qualquer momento.
- Lembra as últimas pastas de abrir/salvar usadas.
- **Um único `.exe` portátil** — nada de instalação. O FFmpeg e o FFprobe vêm embutidos
  no próprio executável e são extraídos uma vez só (na primeira abertura) para
  `%LOCALAPPDATA%\<identifier>\bin\`; as aberturas seguintes pulam a extração.

## Rodando em desenvolvimento

Pré-requisitos: [Rust](https://www.rust-lang.org/tools/install) + [Node.js](https://nodejs.org/)
(18+). Windows é a única plataforma suportada por enquanto.

> **Antes de rodar pela primeira vez**: `src-tauri/assets/ffmpeg.exe` e `ffprobe.exe`
> precisam existir (são versionados via [Git LFS](https://git-lfs.com/) — rode
> `git lfs install` uma vez e depois `git lfs pull` se eles não vierem no clone).
> Sem eles, a compilação falha porque são embutidos no binário via `include_bytes!`.

```sh
npm install
npm run tauri dev
```

Ou, no Windows, clique duas vezes em [`dev.bat`](dev.bat) — ele mata qualquer instância
travada de uma execução anterior, checa Node/Rust/Git LFS, baixa os binários do FFmpeg via
LFS se ainda forem só o ponteiro, limpa um build antigo do frontend, atualiza as
dependências e abre o app.

## Gerando o executável final

No Windows, clique duas vezes em [`build.bat`](build.bat) — ele faz os mesmos checks do
`dev.bat` (Node/Rust/Git LFS), roda os testes do Rust, gera o build de release e copia o
`.exe` pronto pra `release/Ferramentas de Mídia.exe`, já abrindo o Explorer nele no final.

Ou manualmente:

```sh
npm run tauri build -- --no-bundle
```

O `.exe` portátil final fica em `src-tauri/target/release/ferramentas-de-midia.exe` — é
só copiar esse arquivo pra qualquer lugar e abrir, não precisa de mais nada ao lado.
(`--no-bundle` porque `bundle.active` já está `false` no `tauri.conf.json` — não geramos
instalador NSIS/MSI de propósito, só o binário puro.)

Detalhes de arquitetura, o fluxo Rust↔React e a tabela de codecs usada em cada formato
estão documentados em [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Aviso sobre SmartScreen / antivírus

Como é um `.exe` não assinado digitalmente que extrai binários embutidos na primeira
execução, é esperado que o Windows SmartScreen ou algum antivírus mostre um aviso na
primeira vez que ele rodar numa máquina nova (comportamento comum a qualquer app não
assinado que faz isso — o app Python original também tinha o mesmo risco via
PyInstaller). Não há correção "no código" pra isso; só um certificado de assinatura
de código resolveria de vez.
