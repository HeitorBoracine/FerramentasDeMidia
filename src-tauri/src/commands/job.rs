use std::sync::atomic::Ordering;

use tauri::State;

use crate::state::JobState;

/// Cancela o job de FFmpeg em andamento, se houver. A limpeza do arquivo
/// parcial e o aviso ao frontend acontecem no próprio `run_job`, que detecta
/// a flag `cancelled` assim que o processo morto termina de sair.
#[tauri::command]
pub fn cancel_job(job_state: State<JobState>) {
    job_state.cancelled.store(true, Ordering::SeqCst);
    if let Some(child) = job_state.child.lock().unwrap().as_mut() {
        let _ = child.kill();
    }
}
