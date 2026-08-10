use std::path::PathBuf;

use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::ffmpeg::binaries::FfmpegBinaries;
use crate::ffmpeg::{self, ProgressEvent};
use crate::state::JobState;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    Alta,
    Media,
    Baixa,
}

impl Quality {
    fn crf(&self) -> &'static str {
        match self {
            Quality::Alta => "23",
            Quality::Media => "28",
            Quality::Baixa => "35",
        }
    }
}

/// Comprime um vídeo com libx264/aac, no mesmo CRF por nível de qualidade
/// usado pelo app Python original (23/28/35).
#[tauri::command]
pub fn compress_video(
    input: String,
    output: String,
    quality: Quality,
    binaries: State<FfmpegBinaries>,
    job_state: State<JobState>,
    on_progress: Channel<ProgressEvent>,
) -> Result<(), String> {
    if job_state.child.lock().unwrap().is_some() {
        return Err("Já existe uma operação em andamento.".into());
    }

    let input_path = PathBuf::from(&input);
    let output_path = PathBuf::from(&output);
    let before_bytes = std::fs::metadata(&input_path).map(|m| m.len()).ok();

    let args = vec![
        "-vcodec".into(),
        "libx264".into(),
        "-crf".into(),
        quality.crf().into(),
        "-preset".into(),
        "medium".into(),
        "-acodec".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
    ];

    ffmpeg::run_job(
        ffmpeg::FfmpegJob {
            ffmpeg: &binaries.ffmpeg,
            ffprobe: &binaries.ffprobe,
            input: &input_path,
            output: output_path,
            args,
            track_progress: true,
            before_bytes,
        },
        &job_state,
        &on_progress,
    );

    Ok(())
}
