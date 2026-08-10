@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Prisma Midia - ambiente de desenvolvimento
echo ============================================
echo.

REM --- Mata uma instancia anterior que tenha ficado presa (janela fechada errado, etc) ---
echo [1/5] Encerrando instancias antigas, se houver...
taskkill /IM prisma-midia.exe /F >nul 2>nul

REM --- Verifica Node.js ---
echo [2/5] Verificando pre-requisitos...
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

REM --- Limpa build antigo do frontend, se sobrou algum ---
echo [3/5] Limpando build antigo do frontend...
if exist "dist" rmdir /s /q "dist"

REM --- Instala/atualiza dependencias npm ---
echo [4/5] Instalando/atualizando dependencias (npm install)...
call npm install
if errorlevel 1 (
    echo.
    echo [ERRO] npm install falhou.
    pause
    exit /b 1
)

REM --- Inicia o app em modo desenvolvimento ---
echo [5/5] Iniciando Prisma Midia...
echo.
call npm run tauri dev

echo.
echo O app foi fechado.
pause
