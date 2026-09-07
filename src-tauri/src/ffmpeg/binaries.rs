use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};

/// `ffmpeg.exe`/`ffprobe.exe` embutidos comprimidos com `xz -6` (~97MB → ~26MB
/// cada) — descomprimidos em runtime na extração. Sem isso o executável final
/// ficaria com uns 194MB só desses dois arquivos brutos.
const FFMPEG_XZ: &[u8] = include_bytes!("../../assets/ffmpeg.exe.xz");
const FFPROBE_XZ: &[u8] = include_bytes!("../../assets/ffprobe.exe.xz");
const DRAG_ICON_BYTES: &[u8] = include_bytes!("../../icons/128x128.png");

/// Caminhos, no disco, dos arquivos embutidos já extraídos e prontos pra uso.
#[derive(Clone, Debug)]
pub struct FfmpegBinaries {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    /// Ícone usado como preview ao arrastar um arquivo pra fora do app
    /// (`tauri-plugin-drag` precisa de um caminho de imagem real em disco).
    pub drag_icon: PathBuf,
}

/// Guarda o resultado da extração (`Ok`/`Err`) assim que a thread de
/// [`spawn_binaries_extraction`] termina, liberando quem estiver bloqueado em
/// [`BinariesCell::wait`]. Existe pra `setup()` do app poder devolver o
/// controle IMEDIATAMENTE (janela abre e fica interativa na hora) em vez de
/// travar o app inteiro enquanto o `.xz` descomprime — em debug (sem
/// otimizações do compilador) o decoder XZ em Rust puro chega a levar ~10s
/// por arquivo; em release fica em ~2s. Comandos só bloqueiam em `wait()` se
/// alguém clicar num botão ANTES da extração terminar em segundo plano, o
/// que na prática quase nunca acontece (selecionar um arquivo e clicar já
/// leva mais tempo que isso).
#[derive(Default)]
pub struct BinariesCell {
    inner: Mutex<Option<Result<FfmpegBinaries, String>>>,
    ready: Condvar,
}

impl BinariesCell {
    fn set(&self, result: Result<FfmpegBinaries, String>) {
        let mut guard = self.inner.lock().unwrap();
        *guard = Some(result);
        self.ready.notify_all();
    }

    /// Bloqueia até a extração terminar (timeout generoso de 60s, cobrindo
    /// até o pior caso de debug sem otimizações).
    pub fn wait(&self) -> Result<FfmpegBinaries, String> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| "Estado interno do FFmpeg corrompido.".to_string())?;
        let (guard, timeout) = self
            .ready
            .wait_timeout_while(guard, Duration::from_secs(60), |r| r.is_none())
            .map_err(|_| "Estado interno do FFmpeg corrompido.".to_string())?;

        match &*guard {
            Some(Ok(binaries)) => Ok(binaries.clone()),
            Some(Err(e)) => Err(e.clone()),
            None => {
                debug_assert!(timeout.timed_out());
                Err("O FFmpeg ainda está sendo preparado. Tente de novo em alguns segundos.".into())
            }
        }
    }
}

/// Dispara a extração numa thread separada e devolve um `BinariesCell` que já
/// pode ser gerenciado (`app.manage()`) antes dela terminar.
pub fn spawn_binaries_extraction(app: &AppHandle) -> Arc<BinariesCell> {
    let cell = Arc::new(BinariesCell::default());
    let cell_for_thread = cell.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        cell_for_thread.set(ensure_binaries(&app_handle));
    });
    cell
}

/// Garante que ffmpeg.exe/ffprobe.exe/ícone existam em `%LOCALAPPDATA%\<identifier>\bin\`,
/// descomprimindo os arquivos `.xz` embutidos apenas se ainda não tiverem sido
/// extraídos ou se o binário embutido no `.exe` atual for diferente do que já
/// está em disco. Isso roda uma vez no primeiro uso (ou após uma atualização
/// do app); nas aberturas seguintes é só uma checagem de um arquivo de hash
/// pequeno, sem precisar descomprimir de novo.
fn ensure_binaries(app: &AppHandle) -> Result<FfmpegBinaries, String> {
    let bin_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("bin");

    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let ffmpeg_path = bin_dir.join("ffmpeg.exe");
    let ffprobe_path = bin_dir.join("ffprobe.exe");
    let drag_icon_path = bin_dir.join("drag-icon.png");

    extract_compressed_if_needed(&ffmpeg_path, FFMPEG_XZ)?;
    extract_compressed_if_needed(&ffprobe_path, FFPROBE_XZ)?;
    extract_if_needed(&drag_icon_path, DRAG_ICON_BYTES)?;

    Ok(FfmpegBinaries {
        ffmpeg: ffmpeg_path,
        ffprobe: ffprobe_path,
        drag_icon: drag_icon_path,
    })
}

/// Hash não-criptográfico (FNV-1a) só pra detectar se o blob `.xz` embutido
/// mudou entre versões do app — os bytes já estão em memória (`include_bytes!`),
/// então calcular isso a cada abertura é praticamente grátis (sem I/O extra).
fn fnv1a(bytes: &[u8]) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0100_0000_01b3;
    let mut hash = FNV_OFFSET;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

fn hash_sidecar_path(exe_path: &Path) -> PathBuf {
    let mut name = exe_path.file_name().unwrap_or_default().to_os_string();
    name.push(".hash");
    exe_path.with_file_name(name)
}

/// Descomprime `compressed` (formato `.xz`) pra `path`, só se o hash do blob
/// embutido for diferente do que está registrado no sidecar `.hash` ao lado
/// do `.exe` extraído (ou se o `.exe` tiver sumido). Preserva a propriedade
/// de "segunda abertura em diante é instantânea" documentada em ARCHITECTURE.md.
fn extract_compressed_if_needed(path: &Path, compressed: &[u8]) -> Result<(), String> {
    let current_hash = fnv1a(compressed).to_string();
    let hash_path = hash_sidecar_path(path);

    let up_to_date = path.exists()
        && fs::read_to_string(&hash_path)
            .map(|s| s.trim() == current_hash)
            .unwrap_or(false);

    if up_to_date {
        return Ok(());
    }

    let mut decompressed = Vec::new();
    lzma_rs::xz_decompress(&mut Cursor::new(compressed), &mut decompressed)
        .map_err(|e| format!("falha ao descomprimir {}: {e}", path.display()))?;

    // Escreve num arquivo temporário e renomeia, pra nunca deixar um arquivo
    // parcialmente escrito no caminho final (ex: se o app for fechado no meio).
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, &decompressed).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    fs::write(&hash_path, &current_hash).map_err(|e| e.to_string())?;

    Ok(())
}

/// Extração direta sem compressão — usada só pro ícone de drag, que já é pequeno
/// (não vale a pena comprimir/descomprimir um PNG de poucos KB).
fn extract_if_needed(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let needs_write = match fs::metadata(path) {
        Ok(meta) => meta.len() != bytes.len() as u64,
        Err(_) => true,
    };

    if needs_write {
        let tmp_path = path.with_extension("tmp");
        fs::write(&tmp_path, bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{fnv1a, BinariesCell, FfmpegBinaries};
    use std::io::Cursor;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::Duration;

    const FIXTURE_XZ: &[u8] = include_bytes!("testdata/hello.txt.xz");
    const FIXTURE_ORIGINAL: &[u8] =
        b"Ferramentas de Midia - fixture de teste para o decoder xz.";

    #[test]
    fn binaries_cell_wait_blocks_until_set_then_returns_it() {
        let cell = Arc::new(BinariesCell::default());
        let cell_for_thread = cell.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            cell_for_thread.set(Ok(FfmpegBinaries {
                ffmpeg: PathBuf::from("ffmpeg.exe"),
                ffprobe: PathBuf::from("ffprobe.exe"),
                drag_icon: PathBuf::from("icon.png"),
            }));
        });

        let result = cell.wait();
        handle.join().unwrap();

        assert_eq!(result.unwrap().ffmpeg, PathBuf::from("ffmpeg.exe"));
    }

    #[test]
    fn binaries_cell_wait_propagates_error() {
        let cell = BinariesCell::default();
        cell.set(Err("falhou ao extrair".into()));
        assert_eq!(cell.wait().unwrap_err(), "falhou ao extrair");
    }

    #[test]
    fn binaries_cell_wait_returns_already_set_value_immediately() {
        let cell = BinariesCell::default();
        cell.set(Ok(FfmpegBinaries {
            ffmpeg: PathBuf::from("a"),
            ffprobe: PathBuf::from("b"),
            drag_icon: PathBuf::from("c"),
        }));
        assert!(cell.wait().is_ok());
        // Chamar de novo não deveria bloquear nem mudar o resultado.
        assert!(cell.wait().is_ok());
    }

    /// Confirma que `lzma_rs::xz_decompress` lê corretamente um `.xz` gerado
    /// pela CLI real do xz (mesma ferramenta usada pra comprimir os assets) —
    /// sem precisar dos binários de ~26MB do ffmpeg no teste.
    #[test]
    fn xz_decompress_matches_real_xz_output() {
        let mut out = Vec::new();
        lzma_rs::xz_decompress(&mut Cursor::new(FIXTURE_XZ), &mut out).unwrap();
        assert_eq!(out, FIXTURE_ORIGINAL);
    }

    #[test]
    fn fnv1a_is_deterministic_and_sensitive_to_changes() {
        let a = fnv1a(b"versao 1");
        let b = fnv1a(b"versao 1");
        let c = fnv1a(b"versao 2");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    /// Ignorado no `cargo test` normal (descomprimiria ~54MB toda vez). Roda
    /// manualmente com `cargo test -- --ignored` pra confirmar que os `.xz`
    /// reais embutidos descomprimem pro ffmpeg/ffprobe de verdade e executam.
    #[test]
    #[ignore]
    fn real_ffmpeg_ffprobe_decompress_and_run() {
        use super::FFMPEG_XZ;
        use super::FFPROBE_XZ;
        use std::io::Write;

        let dir = std::env::temp_dir().join("ferramentas-de-midia-test-bin");
        std::fs::create_dir_all(&dir).unwrap();

        for (name, xz) in [("ffmpeg.exe", FFMPEG_XZ), ("ffprobe.exe", FFPROBE_XZ)] {
            let mut decompressed = Vec::new();
            lzma_rs::xz_decompress(&mut Cursor::new(xz), &mut decompressed).unwrap();
            assert!(decompressed.len() > 50_000_000, "{name} descomprimido parece pequeno demais");

            let path = dir.join(name);
            let mut f = std::fs::File::create(&path).unwrap();
            f.write_all(&decompressed).unwrap();
            drop(f);

            let output = std::process::Command::new(&path)
                .arg("-version")
                .output()
                .unwrap_or_else(|e| panic!("falha ao rodar {name}: {e}"));
            assert!(output.status.success(), "{name} -version falhou: {output:?}");
            let stdout = String::from_utf8_lossy(&output.stdout);
            assert!(stdout.contains("version"), "{name} -version output inesperado: {stdout}");
        }
    }
}
