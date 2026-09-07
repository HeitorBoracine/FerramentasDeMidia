use std::path::PathBuf;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::ffmpeg::binaries::BinariesCell;
use crate::ffmpeg::{self, ProgressEvent};
use crate::state::JobState;

/// Args de codec de áudio por formato de destino. `-vn` descarta o vídeo.
fn audio_codec_args(target_ext: &str) -> Vec<String> {
    let s = |v: &[&str]| v.iter().map(|s| s.to_string()).collect();
    match target_ext {
        "wav" => s(&["-vn", "-c:a", "pcm_s16le"]),
        "flac" => s(&["-vn", "-c:a", "flac"]),
        "aac" | "m4a" => s(&["-vn", "-c:a", "aac", "-b:a", "192k"]),
        // mp3 e qualquer outro caso
        _ => s(&["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]),
    }
}

/// Extrai a trilha de áudio de um vídeo pro formato indicado pela extensão
/// de `output` (mp3/aac/m4a/wav/flac).
#[tauri::command]
pub fn extract_audio(
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

    let args = audio_codec_args(&target_ext);

    ffmpeg::run_job(
        ffmpeg::FfmpegJob {
            ffmpeg: &binaries.ffmpeg,
            ffprobe: &binaries.ffprobe,
            input: &input_path,
            output: output_path,
            args,
            track_progress: true,
            before_bytes: None,
        },
        &job_state,
        &on_progress,
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::audio_codec_args;

    #[test]
    fn maps_known_extensions() {
        assert_eq!(audio_codec_args("wav"), vec!["-vn", "-c:a", "pcm_s16le"]);
        assert_eq!(audio_codec_args("flac"), vec!["-vn", "-c:a", "flac"]);
        assert_eq!(audio_codec_args("aac"), vec!["-vn", "-c:a", "aac", "-b:a", "192k"]);
        assert_eq!(audio_codec_args("m4a"), vec!["-vn", "-c:a", "aac", "-b:a", "192k"]);
        assert_eq!(audio_codec_args("mp3"), vec!["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]);
    }
}
