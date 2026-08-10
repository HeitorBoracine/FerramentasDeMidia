mod commands;
mod ffmpeg;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state::JobState::default())
        .setup(|app| {
            let binaries = ffmpeg::binaries::ensure_binaries(app.handle())?;
            app.manage(binaries);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::compress::compress_video,
            commands::convert::convert_file,
            commands::job::cancel_job,
            commands::settings::get_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
