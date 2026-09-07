use std::path::PathBuf;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::ffmpeg::binaries::BinariesCell;
use crate::ffmpeg::{self, ProgressEvent, Step};
use crate::state::JobState;

/// Cria um GIF a partir de um trecho `[start, end)` do vídeo, em 2 passes:
/// 1) gera uma paleta de cores ótima pro trecho (`palettegen`) — sem isso o
///    GIF sai com banding/dithering ruim usando a paleta genérica de 256 cores;
/// 2) aplica essa paleta (`paletteuse`) gerando o GIF final.
/// Como `-ss`/`-t` precisam ficar antes/logo após o `-i` de vídeo (fora da
/// ordem fixa de `FfmpegJob`), e são 2 processos ffmpeg em sequência, usa
/// `run_steps` em vez de `run_job`.
#[tauri::command]
pub fn create_gif(
    input: String,
    output: String,
    start: f64,
    end: f64,
    fps: u32,
    width: u32,
    binaries: State<Arc<BinariesCell>>,
    job_state: State<JobState>,
    on_progress: Channel<ProgressEvent>,
) -> Result<(), String> {
    if job_state.child.lock().unwrap().is_some() {
        return Err("Já existe uma operação em andamento.".into());
    }
    let binaries = binaries.wait()?;
    if end <= start {
        return Err("O fim do trecho precisa ser depois do início.".into());
    }

    let duration = end - start;
    let output_path = PathBuf::from(&output);
    let palette_path = output_path.with_extension("palette.png");
    let palette_path_str = palette_path.to_string_lossy().to_string();

    let scale_fps = format!("fps={fps},scale={width}:-1:flags=lanczos");

    // `-ss`/`-t` ficam ANTES do `-i` do vídeo — crucial no passo 2, que tem um
    // segundo `-i` (a paleta): qualquer opção colocada DEPOIS do primeiro `-i`
    // e ANTES do segundo é lida pelo ffmpeg como opção do segundo input, não
    // do primeiro (testado empiricamente: sem isso o trecho saía com a
    // duração inteira do vídeo, ignorando o corte pedido).
    let palette_args = vec![
        "-y".into(), "-ss".into(), start.to_string(), "-t".into(), duration.to_string(),
        "-i".into(), input.clone(),
        "-vf".into(), format!("{scale_fps},palettegen"),
        palette_path_str.clone(),
    ];

    let gif_args = vec![
        "-y".into(), "-ss".into(), start.to_string(), "-t".into(), duration.to_string(),
        "-i".into(), input.clone(),
        "-i".into(), palette_path_str.clone(),
        "-filter_complex".into(), format!("{scale_fps}[x];[x][1:v]paletteuse"),
        "-progress".into(), "pipe:1".into(), "-nostats".into(),
        output.clone(),
    ];

    ffmpeg::run_steps(
        &binaries.ffmpeg,
        vec![
            Step { args: palette_args, track_progress: false, duration_secs: None },
            Step { args: gif_args, track_progress: true, duration_secs: Some(duration) },
        ],
        &[palette_path, output_path.clone()],
        &output_path,
        None,
        &job_state,
        &on_progress,
    );

    Ok(())
}
