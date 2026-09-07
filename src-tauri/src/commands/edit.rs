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
pub enum Rotation {
    None,
    Cw90,
    Ccw90,
    Deg180,
}

/// Filtro `-vf` combinando rotação + espelhamento, ou `None` se nada foi
/// pedido (a chamada deveria ter sido bloqueada antes de chegar aqui).
fn rotation_filter(rotation: &Rotation, flip_horizontal: bool, flip_vertical: bool) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    match rotation {
        Rotation::None => {}
        Rotation::Cw90 => parts.push("transpose=1"),
        Rotation::Ccw90 => parts.push("transpose=2"),
        Rotation::Deg180 => {
            parts.push("transpose=1");
            parts.push("transpose=1");
        }
    }
    if flip_horizontal {
        parts.push("hflip");
    }
    if flip_vertical {
        parts.push("vflip");
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(","))
    }
}

/// Gira e/ou espelha um vídeo. Recodifica (transpose/flip são operações de
/// pixel, não dá pra fazer com stream copy).
#[tauri::command]
pub fn transform_video(
    input: String,
    output: String,
    rotation: Rotation,
    flip_horizontal: bool,
    flip_vertical: bool,
    binaries: State<Arc<BinariesCell>>,
    job_state: State<JobState>,
    on_progress: Channel<ProgressEvent>,
) -> Result<(), String> {
    if job_state.child.lock().unwrap().is_some() {
        return Err("Já existe uma operação em andamento.".into());
    }
    let binaries = binaries.wait()?;

    let filter = rotation_filter(&rotation, flip_horizontal, flip_vertical)
        .ok_or_else(|| "Selecione uma rotação ou espelhamento.".to_string())?;

    let args = vec![
        "-vf".into(),
        filter,
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "medium".into(),
        "-crf".into(),
        "23".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
    ];

    ffmpeg::run_job(
        ffmpeg::FfmpegJob {
            ffmpeg: &binaries.ffmpeg,
            ffprobe: &binaries.ffprobe,
            input: &PathBuf::from(&input),
            output: PathBuf::from(&output),
            args,
            track_progress: true,
            before_bytes: None,
        },
        &job_state,
        &on_progress,
    );

    Ok(())
}

/// Corta um trecho do vídeo. `-ss` antes do `-i` faz o ffmpeg buscar
/// diretamente o ponto de início (rápido); `-t` (duração) como opção de saída
/// evita a ambiguidade conhecida do `-to` quando `-ss` vem antes do `-i`.
/// Como isso muda a ordem dos argumentos em relação ao `-i`, não dá pra
/// reaproveitar `FfmpegJob`/`run_job` (que fixam `-i` logo após `-y`) — usa
/// `run_steps` com um passo só, que aceita os args completos.
#[tauri::command]
pub fn trim_video(
    input: String,
    output: String,
    start: f64,
    end: f64,
    precise: bool,
    binaries: State<Arc<BinariesCell>>,
    job_state: State<JobState>,
    on_progress: Channel<ProgressEvent>,
) -> Result<(), String> {
    if job_state.child.lock().unwrap().is_some() {
        return Err("Já existe uma operação em andamento.".into());
    }
    let binaries = binaries.wait()?;
    if end <= start {
        return Err("O fim do corte precisa ser depois do início.".into());
    }

    let duration = end - start;
    let output_path = PathBuf::from(&output);

    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        start.to_string(),
        "-i".to_string(),
        input.clone(),
        "-t".to_string(),
        duration.to_string(),
    ];
    if precise {
        args.extend([
            "-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-crf".into(),
            "23".into(), "-c:a".into(), "aac".into(), "-b:a".into(), "128k".into(),
        ]);
    } else {
        args.extend(["-c".into(), "copy".into()]);
    }
    args.extend(["-progress".into(), "pipe:1".into(), "-nostats".into()]);
    args.push(output.clone());

    ffmpeg::run_steps(
        &binaries.ffmpeg,
        vec![Step {
            args,
            track_progress: true,
            duration_secs: Some(duration),
        }],
        &[output_path.clone()],
        &output_path,
        None,
        &job_state,
        &on_progress,
    );

    Ok(())
}

/// Extrai um único frame como imagem no instante `timestamp` (segundos).
/// Mesmo motivo do `trim_video` pra usar `run_steps` em vez de `FfmpegJob`
/// (precisa de `-ss` antes do `-i` pra buscar rápido o instante pedido).
#[tauri::command]
pub fn extract_frame(
    input: String,
    output: String,
    timestamp: f64,
    binaries: State<Arc<BinariesCell>>,
    job_state: State<JobState>,
    on_progress: Channel<ProgressEvent>,
) -> Result<(), String> {
    if job_state.child.lock().unwrap().is_some() {
        return Err("Já existe uma operação em andamento.".into());
    }
    let binaries = binaries.wait()?;

    let output_path = PathBuf::from(&output);
    let target_ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        timestamp.to_string(),
        "-i".to_string(),
        input.clone(),
        "-frames:v".to_string(),
        "1".to_string(),
    ];
    if target_ext == "jpg" || target_ext == "jpeg" {
        args.extend(["-q:v".into(), "2".into()]);
    }
    args.push(output.clone());

    ffmpeg::run_steps(
        &binaries.ffmpeg,
        vec![Step {
            args,
            track_progress: false,
            duration_secs: None,
        }],
        &[output_path.clone()],
        &output_path,
        None,
        &job_state,
        &on_progress,
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{rotation_filter, Rotation};

    #[test]
    fn rotation_filter_combines_rotation_and_flips() {
        assert_eq!(rotation_filter(&Rotation::None, false, false), None);
        assert_eq!(rotation_filter(&Rotation::Cw90, false, false), Some("transpose=1".into()));
        assert_eq!(rotation_filter(&Rotation::Ccw90, false, false), Some("transpose=2".into()));
        assert_eq!(
            rotation_filter(&Rotation::Deg180, false, false),
            Some("transpose=1,transpose=1".into())
        );
        assert_eq!(rotation_filter(&Rotation::None, true, false), Some("hflip".into()));
        assert_eq!(rotation_filter(&Rotation::None, false, true), Some("vflip".into()));
        assert_eq!(
            rotation_filter(&Rotation::Cw90, true, true),
            Some("transpose=1,hflip,vflip".into())
        );
    }
}
