mod commands;
mod ffmpeg;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .manage(state::JobState::default())
        .setup(|app| {
            // Roda em segundo plano (não trava a janela) — comandos que
            // precisam do ffmpeg bloqueiam em `BinariesCell::wait()` só se
            // forem chamados antes da extração terminar, o que na prática
            // quase nunca acontece.
            let binaries_cell = ffmpeg::binaries::spawn_binaries_extraction(app.handle());
            app.manage(binaries_cell);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::compress::compress_video,
            commands::compress::compress_image,
            commands::compress::compress_video_to_size,
            commands::convert::convert_file,
            commands::job::cancel_job,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::assets::get_drag_icon_path,
            commands::assets::open_output_file,
            commands::media_info::get_media_duration,
            commands::audio::extract_audio,
            commands::edit::transform_video,
            commands::edit::trim_video,
            commands::edit::extract_frame,
            commands::gif::create_gif,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
