mod ffmpeg;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let binaries = ffmpeg::binaries::ensure_binaries(app.handle())?;
            app.manage(binaries);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
