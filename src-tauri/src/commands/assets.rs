use tauri::State;

use crate::ffmpeg::binaries::FfmpegBinaries;

/// Caminho do ícone extraído usado como preview ao arrastar um arquivo pra
/// fora do app (ver `tauri-plugin-drag`).
#[tauri::command]
pub fn get_drag_icon_path(binaries: State<FfmpegBinaries>) -> String {
    binaries.drag_icon.to_string_lossy().to_string()
}
