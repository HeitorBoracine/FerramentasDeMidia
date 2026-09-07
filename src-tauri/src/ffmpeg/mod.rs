pub mod binaries;
pub mod probe;
pub mod process;

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
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

/// Um passo de uma operação ffmpeg multi-etapa (ver [`run_steps`]). Quem monta
/// o `Step` é responsável por incluir `-progress pipe:1 -nostats` em `args` se
/// `track_progress` for `true` — os dois precisam estar em acordo, senão o
/// parser de progresso não vê nada pra ler.
pub struct Step {
    /// Args completos depois do executável do ffmpeg (`-y -i entrada ... saída`).
    pub args: Vec<String>,
    pub track_progress: bool,
    /// Duração (segundos) que esse passo cobre — usada pra calcular a % lida
    /// do `out_time_ms=`. Só relevante se `track_progress` for `true`.
    pub duration_secs: Option<f64>,
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

enum ProcessOutcome {
    Success,
    Cancelled,
    Failed(String),
}

/// Roda um único processo ffmpeg até o fim: guarda o `Child` em `job_state`
/// (pra `cancel_job` conseguir matá-lo), lê o stderr numa thread separada (pra
/// não travar o ffmpeg esperando alguém esvaziar esse pipe), e opcionalmente
/// interpreta o stdout como `-progress pipe:1` pra emitir eventos `Progress`.
/// Compartilhado por [`run_job`] (uma etapa) e [`run_steps`] (várias etapas).
fn run_one_process(
    mut cmd: Command,
    track_progress: bool,
    duration_secs: Option<f64>,
    job_state: &State<JobState>,
    channel: &Channel<ProgressEvent>,
) -> ProcessOutcome {
    process::hide_console(&mut cmd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return ProcessOutcome::Failed(e.to_string()),
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *job_state.child.lock().unwrap() = Some(child);

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
            if !track_progress {
                continue;
            }
            if let Some(ms) = parse_out_time_ms(&line) {
                if let Some(total) = duration_secs {
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

    let Some(mut child) = job_state.child.lock().unwrap().take() else {
        // Não deveria acontecer (só este processo guarda/retira o `Child` de
        // `job_state`; `cancel_job` só mata, nunca retira) — tratado como
        // cancelamento por segurança, pra nunca deixar o frontend preso em
        // "rodando" pra sempre.
        return ProcessOutcome::Cancelled;
    };
    let status = child.wait();

    if job_state.cancelled.load(Ordering::SeqCst) {
        return ProcessOutcome::Cancelled;
    }

    match status {
        Ok(s) if s.success() => ProcessOutcome::Success,
        _ => {
            let detalhe = tail_lines(&stderr_text, 6);
            let message = if detalhe.is_empty() {
                "O FFmpeg encerrou com erro. Verifique se o arquivo é válido.".to_string()
            } else {
                format!("O FFmpeg encerrou com erro:\n{detalhe}")
            };
            ProcessOutcome::Failed(message)
        }
    }
}

/// Roda um job de FFmpeg de uma etapa só até o fim, transmitindo progresso
/// pelo `channel`. Usado por compressão/conversão simples (mesmo formato de
/// entrada/saída de sempre).
pub fn run_job(job: FfmpegJob, job_state: &State<JobState>, channel: &Channel<ProgressEvent>) {
    let duration = if job.track_progress {
        probe::probe_duration_secs(job.ffprobe, job.input)
    } else {
        None
    };

    let mut cmd = Command::new(job.ffmpeg);
    cmd.arg("-y").arg("-i").arg(job.input);
    for a in &job.args {
        cmd.arg(a);
    }
    if job.track_progress {
        cmd.arg("-progress").arg("pipe:1").arg("-nostats");
    }
    cmd.arg(&job.output);

    job_state.cancelled.store(false, Ordering::SeqCst);
    let outcome = run_one_process(cmd, job.track_progress, duration, job_state, channel);

    match outcome {
        ProcessOutcome::Success => {
            let after_bytes = job
                .before_bytes
                .and_then(|_| std::fs::metadata(&job.output).map(|m| m.len()).ok());
            let _ = channel.send(ProgressEvent::Done {
                dest_path: job.output.to_string_lossy().to_string(),
                before_bytes: job.before_bytes,
                after_bytes,
            });
        }
        ProcessOutcome::Cancelled => {
            let _ = std::fs::remove_file(&job.output);
            let _ = channel.send(ProgressEvent::Cancelled);
        }
        ProcessOutcome::Failed(message) => {
            let _ = std::fs::remove_file(&job.output);
            let _ = channel.send(ProgressEvent::Error { message });
        }
    }
}

/// Roda uma sequência de passos ffmpeg (ex: gerar paleta + aplicar paleta pro
/// GIF; 2 passes de bitrate pra compressão por tamanho-alvo). Só o último
/// passo bem-sucedido dispara `Done`; falha ou cancelamento em qualquer passo
/// aborta a sequência inteira e apaga todos os arquivos em `cleanup_paths`
/// (intermediários + saída final parcial).
pub fn run_steps(
    ffmpeg: &Path,
    steps: Vec<Step>,
    cleanup_paths: &[PathBuf],
    final_output: &Path,
    before_bytes: Option<u64>,
    job_state: &State<JobState>,
    channel: &Channel<ProgressEvent>,
) {
    job_state.cancelled.store(false, Ordering::SeqCst);

    for step in steps {
        let mut cmd = Command::new(ffmpeg);
        for a in &step.args {
            cmd.arg(a);
        }

        let outcome = run_one_process(
            cmd,
            step.track_progress,
            step.duration_secs,
            job_state,
            channel,
        );

        match outcome {
            ProcessOutcome::Success => continue,
            ProcessOutcome::Cancelled => {
                for p in cleanup_paths {
                    let _ = std::fs::remove_file(p);
                }
                let _ = channel.send(ProgressEvent::Cancelled);
                return;
            }
            ProcessOutcome::Failed(message) => {
                for p in cleanup_paths {
                    let _ = std::fs::remove_file(p);
                }
                let _ = channel.send(ProgressEvent::Error { message });
                return;
            }
        }
    }

    // Todos os passos terminaram bem — limpa só os intermediários (tudo em
    // `cleanup_paths` exceto a saída final, que é o resultado de verdade).
    for p in cleanup_paths {
        if p != final_output {
            let _ = std::fs::remove_file(p);
        }
    }

    let after_bytes = before_bytes.and_then(|_| std::fs::metadata(final_output).map(|m| m.len()).ok());
    let _ = channel.send(ProgressEvent::Done {
        dest_path: final_output.to_string_lossy().to_string(),
        before_bytes,
        after_bytes,
    });
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
