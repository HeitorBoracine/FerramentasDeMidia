use std::process::Command;

/// Evita o flash de uma janela de console preta ao rodar o ffmpeg/ffprobe
/// (executáveis de console) a partir de um app sem console próprio.
#[cfg(windows)]
pub fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut Command) {}
