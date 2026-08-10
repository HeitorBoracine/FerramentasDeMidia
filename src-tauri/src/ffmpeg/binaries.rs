use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const FFMPEG_BYTES: &[u8] = include_bytes!("../../assets/ffmpeg.exe");
const FFPROBE_BYTES: &[u8] = include_bytes!("../../assets/ffprobe.exe");
const DRAG_ICON_BYTES: &[u8] = include_bytes!("../../icons/128x128.png");

/// Caminhos, no disco, dos arquivos embutidos já extraídos e prontos pra uso.
#[derive(Clone)]
pub struct FfmpegBinaries {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    /// Ícone usado como preview ao arrastar um arquivo pra fora do app
    /// (`tauri-plugin-drag` precisa de um caminho de imagem real em disco).
    pub drag_icon: PathBuf,
}

/// Garante que ffmpeg.exe/ffprobe.exe/ícone existam em `%LOCALAPPDATA%\<identifier>\bin\`,
/// extraindo os arquivos embutidos apenas se ainda não estiverem lá (ou se o
/// tamanho não bater com o que está embutido no executável atual). Isso roda
/// uma vez no primeiro uso; nas aberturas seguintes é só uma checagem de metadata.
pub fn ensure_binaries(app: &AppHandle) -> Result<FfmpegBinaries, String> {
    let bin_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("bin");

    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let ffmpeg_path = bin_dir.join("ffmpeg.exe");
    let ffprobe_path = bin_dir.join("ffprobe.exe");
    let drag_icon_path = bin_dir.join("drag-icon.png");

    extract_if_needed(&ffmpeg_path, FFMPEG_BYTES)?;
    extract_if_needed(&ffprobe_path, FFPROBE_BYTES)?;
    extract_if_needed(&drag_icon_path, DRAG_ICON_BYTES)?;

    Ok(FfmpegBinaries {
        ffmpeg: ffmpeg_path,
        ffprobe: ffprobe_path,
        drag_icon: drag_icon_path,
    })
}

fn extract_if_needed(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let needs_write = match fs::metadata(path) {
        Ok(meta) => meta.len() != bytes.len() as u64,
        Err(_) => true,
    };

    if needs_write {
        // Escreve num arquivo temporário e renomeia, pra nunca deixar um arquivo
        // parcialmente escrito no caminho final (ex: se o app for fechado no meio).
        let tmp_path = path.with_extension("tmp");
        fs::write(&tmp_path, bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
