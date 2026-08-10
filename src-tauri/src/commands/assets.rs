use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::ffmpeg::binaries::FfmpegBinaries;

/// Caminho do ícone extraído usado como preview ao arrastar um arquivo pra
/// fora do app (ver `tauri-plugin-drag`).
#[tauri::command]
pub fn get_drag_icon_path(binaries: State<FfmpegBinaries>) -> String {
    binaries.drag_icon.to_string_lossy().to_string()
}

/// Abre um arquivo com o app padrão do sistema.
///
/// Não usa o comando `open_path` do próprio plugin-opener porque ele exige
/// uma scope de caminhos pré-configurada na capability (só libera pastas
/// específicas), e aqui o arquivo pode estar em qualquer lugar que o usuário
/// escolheu no diálogo de salvar. Chama a mesma implementação por baixo
/// (`OpenerExt::opener().open_path`), só que via um comando nosso — comandos
/// próprios não passam pela checagem de scope dos plugins.
#[tauri::command]
pub fn open_output_file(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| e.to_string())
}
