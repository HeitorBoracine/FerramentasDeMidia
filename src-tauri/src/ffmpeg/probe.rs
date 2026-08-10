use std::path::Path;
use std::process::Stdio;

use super::process::hide_console;

/// Consulta a duração total (em segundos) de um vídeo via ffprobe.
/// Retorna `None` se o ffprobe falhar ou a saída não for um número válido.
pub fn probe_duration_secs(ffprobe: &Path, input: &Path) -> Option<f64> {
    let mut cmd = std::process::Command::new(ffprobe);
    hide_console(&mut cmd);
    let output = cmd
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(input)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;

    String::from_utf8_lossy(&output.stdout).trim().parse::<f64>().ok()
}
