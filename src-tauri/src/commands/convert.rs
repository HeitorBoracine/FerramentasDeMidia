use std::path::PathBuf;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::ffmpeg::binaries::BinariesCell;
use crate::ffmpeg::{self, ProgressEvent};
use crate::state::JobState;

const VIDEO_EXTS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "mpeg", "mpg", "m4v", "3gp",
];
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "bmp", "gif", "tiff", "tif", "webp"];

/// Tabela de codecs por formato de vídeo de destino — mesma lógica do app
/// Python original (`_codec_args_video`).
fn video_codec_args(target_ext: &str) -> Vec<String> {
    let s = |v: &[&str]| v.iter().map(|s| s.to_string()).collect();
    match target_ext {
        "webm" => s(&["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-c:a", "libopus"]),
        "avi" => s(&[
            "-c:v", "mpeg4", "-vtag", "xvid", "-q:v", "3", "-c:a", "libmp3lame", "-b:a", "192k",
        ]),
        "wmv" => s(&["-c:v", "wmv2", "-c:a", "wmav2", "-b:a", "192k"]),
        "flv" => s(&["-c:v", "flv", "-c:a", "aac", "-b:a", "128k"]),
        // mp4, mkv, mov e demais formatos compatíveis com H.264
        _ => s(&[
            "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "128k",
        ]),
    }
}

/// Converte um vídeo ou imagem pro formato indicado pela extensão de `output`.
#[tauri::command]
pub fn convert_file(
    input: String,
    output: String,
    binaries: State<Arc<BinariesCell>>,
    job_state: State<JobState>,
    on_progress: Channel<ProgressEvent>,
) -> Result<(), String> {
    if job_state.child.lock().unwrap().is_some() {
        return Err("Já existe uma operação em andamento.".into());
    }
    let binaries = binaries.wait()?;

    let input_path = PathBuf::from(&input);
    let output_path = PathBuf::from(&output);
    let target_ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_video = VIDEO_EXTS.contains(&target_ext.as_str());
    let is_image = IMAGE_EXTS.contains(&target_ext.as_str());

    if !is_video && !is_image {
        return Err(format!("Formato de destino não suportado: .{target_ext}"));
    }

    let args = if is_video {
        video_codec_args(&target_ext)
    } else if target_ext == "jpg" || target_ext == "jpeg" {
        vec!["-q:v".into(), "2".into()]
    } else {
        vec![]
    };

    ffmpeg::run_job(
        ffmpeg::FfmpegJob {
            ffmpeg: &binaries.ffmpeg,
            ffprobe: &binaries.ffprobe,
            input: &input_path,
            output: output_path,
            args,
            track_progress: is_video,
            before_bytes: None,
        },
        &job_state,
        &on_progress,
    );

    Ok(())
}
