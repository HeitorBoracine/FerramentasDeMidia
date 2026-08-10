use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

/// Estado compartilhado do job de FFmpeg em andamento (compressão ou conversão).
/// Só existe um job por vez — o frontend desabilita os botões durante uma
/// operação, e os comandos também recusam iniciar um segundo job em paralelo.
#[derive(Default)]
pub struct JobState {
    pub child: Mutex<Option<Child>>,
    pub cancelled: AtomicBool,
}
