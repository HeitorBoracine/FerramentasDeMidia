use std::path::PathBuf;
use std::sync::Arc;

use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::ffmpeg::binaries::BinariesCell;
use crate::ffmpeg::{self, ProgressEvent, Step};
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

/// Fator de redimensionamento por nível de qualidade — só usado nos formatos
/// sem noção de "qualidade" ajustável (png/bmp/gif/tiff), onde reduzir a
/// resolução é a única forma real de diminuir o tamanho do arquivo.
fn quality_scale_filter(quality: &Quality) -> Option<String> {
    match quality {
        Quality::Alta => None,
        Quality::Media => Some("scale=iw*0.75:ih*0.75".into()),
        Quality::Baixa => Some("scale=iw*0.5:ih*0.5".into()),
    }
}

/// Args de compressão de imagem por formato de destino — sempre mantém a
/// mesma extensão de entrada (quem monta `output` garante isso).
fn image_quality_args(target_ext: &str, quality: &Quality) -> Vec<String> {
    match target_ext {
        "jpg" | "jpeg" => {
            let q = match quality {
                Quality::Alta => "2",
                Quality::Media => "6",
                Quality::Baixa => "12",
            };
            vec!["-q:v".into(), q.into()]
        }
        "webp" => {
            let q = match quality {
                Quality::Alta => "90",
                Quality::Media => "75",
                Quality::Baixa => "50",
            };
            vec!["-quality".into(), q.into()]
        }
        "png" => {
            let mut args = vec!["-compression_level".into(), "9".into()];
            if let Some(scale) = quality_scale_filter(quality) {
                args.push("-vf".into());
                args.push(scale);
            }
            args
        }
        // bmp, gif, tiff/tif e demais formatos sem "qualidade" ajustável
        _ => match quality_scale_filter(quality) {
            Some(scale) => vec!["-vf".into(), scale],
            None => vec![],
        },
    }
}

/// Comprime uma imagem mantendo o mesmo formato — jpg/webp usam um parâmetro
/// de qualidade de verdade; png/bmp/gif/tiff (sem essa noção) reduzem
/// redimensionando por nível.
#[tauri::command]
pub fn compress_image(
    input: String,
    output: String,
    quality: Quality,
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
    let before_bytes = std::fs::metadata(&input_path).map(|m| m.len()).ok();

    let args = image_quality_args(&target_ext, &quality);

    ffmpeg::run_job(
        ffmpeg::FfmpegJob {
            ffmpeg: &binaries.ffmpeg,
            ffprobe: &binaries.ffprobe,
            input: &input_path,
            output: output_path,
            args,
            track_progress: false,
            before_bytes,
        },
        &job_state,
        &on_progress,
    );

    Ok(())
}

const TARGET_SIZE_AUDIO_KBPS: f64 = 128.0;
const TARGET_SIZE_MIN_VIDEO_KBPS: f64 = 100.0;

/// Bitrate de vídeo (kbps) necessário pra caber `target_mb` num vídeo de
/// `duration_secs`, descontando o áudio — ou `Err` com uma mensagem pro
/// usuário se o alvo for pequeno demais pra ser viável.
fn target_size_video_kbps(target_mb: f64, duration_secs: f64) -> Result<i64, String> {
    let total_kbps = (target_mb * 8192.0) / duration_secs;
    let video_kbps = total_kbps - TARGET_SIZE_AUDIO_KBPS;
    if video_kbps < TARGET_SIZE_MIN_VIDEO_KBPS {
        return Err(format!(
            "Tamanho-alvo de {target_mb:.0}MB é pequeno demais pra {duration_secs:.0}s de vídeo \
             — o resultado ficaria com qualidade inviável. Tente um valor maior."
        ));
    }
    Ok(video_kbps.floor() as i64)
}

/// Comprime um vídeo mirando um tamanho de arquivo final (MB) em vez de um
/// nível de qualidade fixo. Usa libx264 em 2 passes (mais preciso que 1
/// passe só) — o passo 1 só analisa (sem áudio, saída descartada em `NUL`),
/// o passo 2 codifica de verdade usando as estatísticas do passo 1.
#[tauri::command]
pub fn compress_video_to_size(
    input: String,
    output: String,
    target_mb: f64,
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

    let duration = crate::ffmpeg::probe::probe_duration_secs(&binaries.ffprobe, &input_path)
        .ok_or_else(|| "Não foi possível determinar a duração do vídeo.".to_string())?;
    if duration <= 0.0 {
        return Err("Duração do vídeo inválida.".into());
    }

    let video_kbps = target_size_video_kbps(target_mb, duration)?;
    let before_bytes = std::fs::metadata(&input_path).map(|m| m.len()).ok();

    let passlog_prefix = output_path.with_extension("ffmpeg2pass").to_string_lossy().to_string();

    let pass1_args = vec![
        "-y".into(), "-i".into(), input.clone(),
        "-c:v".into(), "libx264".into(), "-b:v".into(), format!("{video_kbps}k"),
        "-preset".into(), "medium".into(),
        "-pass".into(), "1".into(), "-passlogfile".into(), passlog_prefix.clone(),
        "-an".into(), "-f".into(), "null".into(), "NUL".into(),
    ];
    let pass2_args = vec![
        "-y".into(), "-i".into(), input.clone(),
        "-c:v".into(), "libx264".into(), "-b:v".into(), format!("{video_kbps}k"),
        "-preset".into(), "medium".into(),
        "-pass".into(), "2".into(), "-passlogfile".into(), passlog_prefix.clone(),
        "-c:a".into(), "aac".into(), "-b:a".into(), "128k".into(),
        "-progress".into(), "pipe:1".into(), "-nostats".into(),
        output.clone(),
    ];

    ffmpeg::run_steps(
        &binaries.ffmpeg,
        vec![
            Step { args: pass1_args, track_progress: false, duration_secs: None },
            Step { args: pass2_args, track_progress: true, duration_secs: Some(duration) },
        ],
        &[
            output_path.clone(),
            PathBuf::from(format!("{passlog_prefix}-0.log")),
            PathBuf::from(format!("{passlog_prefix}-0.log.mbtree")),
        ],
        &output_path,
        before_bytes,
        &job_state,
        &on_progress,
    );

    Ok(())
}

#[cfg(test)]
mod compress_extra_tests {
    use super::{image_quality_args, target_size_video_kbps, Quality};

    #[test]
    fn image_quality_args_jpeg_uses_qscale() {
        assert_eq!(image_quality_args("jpg", &Quality::Alta), vec!["-q:v", "2"]);
        assert_eq!(image_quality_args("jpeg", &Quality::Media), vec!["-q:v", "6"]);
        assert_eq!(image_quality_args("jpg", &Quality::Baixa), vec!["-q:v", "12"]);
    }

    #[test]
    fn image_quality_args_webp_uses_quality_percent() {
        assert_eq!(image_quality_args("webp", &Quality::Alta), vec!["-quality", "90"]);
        assert_eq!(image_quality_args("webp", &Quality::Baixa), vec!["-quality", "50"]);
    }

    #[test]
    fn image_quality_args_png_always_max_compression_and_scales_when_not_alta() {
        assert_eq!(image_quality_args("png", &Quality::Alta), vec!["-compression_level", "9"]);
        assert_eq!(
            image_quality_args("png", &Quality::Media),
            vec!["-compression_level", "9", "-vf", "scale=iw*0.75:ih*0.75"]
        );
    }

    #[test]
    fn image_quality_args_bmp_gif_tiff_scale_only() {
        assert_eq!(image_quality_args("bmp", &Quality::Alta), Vec::<String>::new());
        assert_eq!(image_quality_args("gif", &Quality::Baixa), vec!["-vf", "scale=iw*0.5:ih*0.5"]);
        assert_eq!(image_quality_args("tiff", &Quality::Media), vec!["-vf", "scale=iw*0.75:ih*0.75"]);
    }

    #[test]
    fn target_size_video_kbps_computes_expected_bitrate() {
        // 10MB em 60s -> 10*8192/60 = 1365.33 kbps totais - 128 audio = ~1237 kbps video
        assert_eq!(target_size_video_kbps(10.0, 60.0), Ok(1237));
    }

    #[test]
    fn target_size_video_kbps_rejects_unfeasible_target() {
        // 1MB em 300s -> totalmente inviável
        assert!(target_size_video_kbps(1.0, 300.0).is_err());
    }
}
