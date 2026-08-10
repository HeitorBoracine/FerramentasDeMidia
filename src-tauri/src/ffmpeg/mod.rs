pub mod binaries;
pub mod probe;
pub mod process;

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::state::JobState;

/// Eventos enviados do Rust pro frontend enquanto um job de FFmpeg roda.
/// `beforeBytes`/`afterBytes` só vêm preenchidos numa compressão (pra mostrar
/// a redução de tamanho); numa conversão ficam `null`.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ProgressEvent {
    Progress {
        percent: f32,
    },
    Done {
        dest_path: String,
        before_bytes: Option<u64>,
        after_bytes: Option<u64>,
    },
    Error {
        message: String,
    },
    Cancelled,
}

pub struct FfmpegJob<'a> {
    pub ffmpeg: &'a Path,
    pub ffprobe: &'a Path,
    pub input: &'a Path,
    pub output: PathBuf,
    /// Args de codec entre o `-i input` e o output (ex: `-vcodec libx264 -crf 23`).
    pub args: Vec<String>,
    /// Vídeo usa `-progress pipe:1` + duração via ffprobe; imagem não (é ~instantâneo).
    pub track_progress: bool,
    /// `Some(tamanho)` só quando é uma compressão, pra reportar a redução no `Done`.
    pub before_bytes: Option<u64>,
}

fn parse_out_time_ms(line: &str) -> Option<u64> {
    line.strip_prefix("out_time_ms=")?.trim().parse::<u64>().ok()
}

/// Últimas `n` linhas não vazias de `text` — o que o ffmpeg escreve de mais
/// relevante num erro costuma estar nas últimas linhas do stderr.
fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

/// Roda um job de FFmpeg até o fim, transmitindo progresso pelo `channel`.
/// Mantém o `Child` em `job_state` durante a execução pra que `cancel_job`
/// consiga matá-lo a qualquer momento.
pub fn run_job(job: FfmpegJob, job_state: &State<JobState>, channel: &Channel<ProgressEvent>) {
    let duration = if job.track_progress {
        probe::probe_duration_secs(job.ffprobe, job.input)
    } else {
        None
    };

    let mut cmd = std::process::Command::new(job.ffmpeg);
    process::hide_console(&mut cmd);
    cmd.arg("-y").arg("-i").arg(job.input);
    for a in &job.args {
        cmd.arg(a);
    }
    if job.track_progress {
        cmd.arg("-progress").arg("pipe:1").arg("-nostats");
    }
    cmd.arg(&job.output);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    job_state.cancelled.store(false, Ordering::SeqCst);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = channel.send(ProgressEvent::Error {
                message: e.to_string(),
            });
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *job_state.child.lock().unwrap() = Some(child);

    // Lê o stderr numa thread separada e concorrente — se só líssemos o stdout,
    // o ffmpeg pode travar esperando alguém esvaziar o pipe de stderr assim que
    // ele enche (ffmpeg escreve bastante log ali mesmo sem `-nostats`).
    let stderr_thread = stderr.map(|stderr| {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut acc = String::new();
            for line in reader.lines().map_while(Result::ok) {
                acc.push_str(&line);
                acc.push('\n');
            }
            acc
        })
    });

    if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(ms) = parse_out_time_ms(&line) {
                if let Some(total) = duration {
                    if total > 0.0 {
                        let percent =
                            (((ms as f64 / 1_000_000.0) / total) * 100.0).min(100.0) as f32;
                        let _ = channel.send(ProgressEvent::Progress { percent });
                    }
                }
            }
        }
    }

    let stderr_text = stderr_thread.and_then(|t| t.join().ok()).unwrap_or_default();

    // O processo já encerrou (pipe fechado) — recupera o Child pra dar `wait()`
    // e pegar o código de saída. Se `cancel_job` já tiver limpado isso, não faz nada.
    let Some(mut child) = job_state.child.lock().unwrap().take() else {
        return;
    };
    let status = child.wait();

    if job_state.cancelled.swap(false, Ordering::SeqCst) {
        let _ = std::fs::remove_file(&job.output);
        let _ = channel.send(ProgressEvent::Cancelled);
        return;
    }

    match status {
        Ok(s) if s.success() => {
            let after_bytes = job
                .before_bytes
                .and_then(|_| std::fs::metadata(&job.output).map(|m| m.len()).ok());
            let _ = channel.send(ProgressEvent::Done {
                dest_path: job.output.to_string_lossy().to_string(),
                before_bytes: job.before_bytes,
                after_bytes,
            });
        }
        _ => {
            let _ = std::fs::remove_file(&job.output);
            let detalhe = tail_lines(&stderr_text, 6);
            let message = if detalhe.is_empty() {
                "O FFmpeg encerrou com erro. Verifique se o arquivo é válido.".to_string()
            } else {
                format!("O FFmpeg encerrou com erro:\n{detalhe}")
            };
            let _ = channel.send(ProgressEvent::Error { message });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{tail_lines, ProgressEvent};

    #[test]
    fn tail_lines_keeps_only_last_n_non_empty() {
        let text = "a\nb\n\nc\nd\ne\n";
        assert_eq!(tail_lines(text, 2), "d\ne");
        assert_eq!(tail_lines(text, 100), "a\nb\nc\nd\ne");
        assert_eq!(tail_lines("", 5), "");
    }

    /// Garante que o formato serializado bate com o tipo `ProgressEvent` em
    /// src/types/index.ts — `type` em camelCase e campos também em camelCase.
    #[test]
    fn progress_event_wire_format() {
        let progress = ProgressEvent::Progress { percent: 42.5 };
        assert_eq!(
            serde_json::to_string(&progress).unwrap(),
            r#"{"type":"progress","percent":42.5}"#
        );

        let done = ProgressEvent::Done {
            dest_path: "C:\\out.mp4".into(),
            before_bytes: Some(100),
            after_bytes: Some(50),
        };
        assert_eq!(
            serde_json::to_string(&done).unwrap(),
            r#"{"type":"done","destPath":"C:\\out.mp4","beforeBytes":100,"afterBytes":50}"#
        );

        let error = ProgressEvent::Error {
            message: "falhou".into(),
        };
        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            r#"{"type":"error","message":"falhou"}"#
        );

        let cancelled = ProgressEvent::Cancelled;
        assert_eq!(
            serde_json::to_string(&cancelled).unwrap(),
            r#"{"type":"cancelled"}"#
        );
    }
}
