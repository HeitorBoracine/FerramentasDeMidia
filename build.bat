@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Ferramentas de Midia - build de producao
echo ============================================
echo.

REM --- Mata uma instancia anterior que tenha ficado presa (janela fechada errado, etc) ---
echo [1/7] Encerrando instancias antigas, se houver...
taskkill /IM ferramentas-de-midia.exe /F >nul 2>nul

REM --- Verifica Node.js ---
echo [2/7] Verificando pre-requisitos...
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERRO] Node.js nao encontrado no PATH.
    echo Instale em https://nodejs.org/ e rode este script de novo.
    pause
    exit /b 1
)

REM --- Verifica Rust/Cargo ---
where cargo >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERRO] Rust/Cargo nao encontrado no PATH.
    echo Instale em https://rustup.rs/ e rode este script de novo.
    pause
    exit /b 1
)

REM --- Verifica se ffmpeg.exe/ffprobe.exe existem e nao sao so um "ponteiro" do Git LFS nao baixado ---
if not exist "src-tauri\assets\ffmpeg.exe" (
    echo.
    echo [ERRO] src-tauri\assets\ffmpeg.exe nao encontrado.
    pause
    exit /b 1
)
if not exist "src-tauri\assets\ffprobe.exe" (
    echo.
    echo [ERRO] src-tauri\assets\ffprobe.exe nao encontrado.
    pause
    exit /b 1
)

for %%F in ("src-tauri\assets\ffmpeg.exe") do set FFSIZE=%%~zF
if !FFSIZE! LSS 1000000 (
    echo   Binarios do FFmpeg parecem ser so ponteiros do Git LFS. Baixando...
    where git-lfs >nul 2>nul
    if errorlevel 1 (
        echo.
        echo [ERRO] Git LFS nao esta instalado. Instale em https://git-lfs.com/
        pause
        exit /b 1
    )
    call git lfs pull
    if errorlevel 1 (
        echo [ERRO] git lfs pull falhou.
        pause
        exit /b 1
    )
)

REM --- Verifica se o icone multi-resolucao existe (gerado a partir de icone.ico via `tauri icon`) ---
if not exist "src-tauri\icons\icon.ico" (
    echo.
    echo [ERRO] src-tauri\icons\icon.ico nao encontrado.
    echo Rode: npx tauri icon src-tauri\assets\icone.ico
    pause
    exit /b 1
)
for %%F in ("src-tauri\icons\icon.ico") do set ICOSIZE=%%~zF
if !ICOSIZE! LSS 10000 (
    echo.
    echo [AVISO] src-tauri\icons\icon.ico parece pequeno demais pra ser um
    echo icone com varios tamanhos embutidos. Se voce trocou o icone.ico
    echo recentemente, rode: npx tauri icon src-tauri\assets\icone.ico
)

REM --- Limpa build antigo do frontend e da release anterior, se sobrou algum ---
echo [3/7] Limpando builds antigos...
if exist "dist" rmdir /s /q "dist"
if exist "release" rmdir /s /q "release"

REM --- Instala/atualiza dependencias npm ---
echo [4/7] Instalando/atualizando dependencias (npm install)...
call npm install
if errorlevel 1 (
    echo.
    echo [ERRO] npm install falhou.
    pause
    exit /b 1
)

REM --- Roda os testes do backend Rust antes de gerar o executavel final ---
echo [5/7] Rodando testes do backend (cargo test)...
call cargo test --manifest-path src-tauri\Cargo.toml
if errorlevel 1 (
    echo.
    echo [ERRO] Os testes do Rust falharam. Build cancelado.
    pause
    exit /b 1
)

REM --- Gera o executavel final, sem instalador (bundle.active ja e false no tauri.conf.json) ---
echo [6/7] Gerando o executavel final (release, pode demorar alguns minutos)...
call npm run tauri build -- --no-bundle
if errorlevel 1 (
    echo.
    echo [ERRO] O build falhou.
    pause
    exit /b 1
)

REM --- Copia o .exe pronto pra uma pasta previsivel na raiz do projeto ---
echo [7/7] Preparando o arquivo portatil final...
set "EXE_ORIGEM=src-tauri\target\release\ferramentas-de-midia.exe"
if not exist "%EXE_ORIGEM%" (
    echo.
    echo [ERRO] O executavel nao foi encontrado em %EXE_ORIGEM%
    pause
    exit /b 1
)

mkdir "release" >nul 2>nul
set "EXE_FINAL=release\Ferramentas de Midia.exe"
copy /Y "%EXE_ORIGEM%" "%EXE_FINAL%" >nul

for %%F in ("%EXE_FINAL%") do set /a EXE_MB=%%~zF / 1048576

echo.
echo ============================================
echo   Build concluido!
echo ============================================
echo.
echo Executavel portatil: %cd%\%EXE_FINAL%
echo Tamanho: ~!EXE_MB! MB
echo.
echo E um arquivo unico - pode copiar pra qualquer lugar (pendrive,
echo outro PC, etc) e abrir direto com um clique duplo, sem instalar
echo nada. O icone ja vem embutido com varios tamanhos de resolucao
echo (16x16 ate 256x256), igual qualquer .exe nativo do Windows.
echo.
echo Na primeira abertura em cada PC ele extrai o ffmpeg/ffprobe pra
echo %%LOCALAPPDATA%%\com.heitor.ferramentasdemidia\bin\ (leva menos de
echo 1 segundo); nas aberturas seguintes pula direto pra tela.
echo.

explorer.exe /select,"%EXE_FINAL%"

pause
