use std::path::PathBuf;
use std::sync::Arc;

use tauri::State;

use crate::ffmpeg::binaries::BinariesCell;
use crate::ffmpeg::probe;

/// Duração (em segundos) de um vídeo, usada pelo frontend pra limitar os
/// campos de horário nos diálogos de Cortar/Extrair frame/Criar GIF.
/// `None` se o ffprobe não conseguir ler (arquivo inválido, etc) ou se os
/// binários ainda não estiverem prontos — não vale a pena bloquear/errar por
/// causa disso, os diálogos já lidam bem com duração desconhecida.
#[tauri::command]
pub fn get_media_duration(path: String, binaries: State<Arc<BinariesCell>>) -> Option<f64> {
    let binaries = binaries.wait().ok()?;
    probe::probe_duration_secs(&binaries.ffprobe, &PathBuf::from(path))
}
