import { useEffect, useReducer, useRef, useState } from "react";
import "./App.css";
import { TitleBar } from "./components/TitleBar";
import { DropZone } from "./components/DropZone";
import { QualitySelect } from "./components/QualitySelect";
import { ActionButtons } from "./components/ActionButtons";
import { FormatDialog } from "./components/FormatDialog";
import { ProgressBar } from "./components/ProgressBar";
import { StatusLine } from "./components/StatusLine";
import { FileActions } from "./components/FileActions";
import { ErrorDialog } from "./components/ErrorDialog";
import { FileSourceToggle } from "./components/FileSourceToggle";
import { ToolsMenu } from "./components/ToolsMenu";
import { TrimDialog } from "./components/TrimDialog";
import { RotateDialog } from "./components/RotateDialog";
import { ExtractFrameDialog } from "./components/ExtractFrameDialog";
import { GifDialog } from "./components/GifDialog";
import { CompressSettings, type CompressMode } from "./components/CompressSettings";
import { BatchQueue } from "./components/BatchQueue";
import {
  cancelJob,
  compressImage,
  compressVideo,
  compressVideoToSize,
  convertFile,
  createGif,
  extractAudio,
  extractFrame,
  getDragIconPath,
  getMediaDuration,
  getSettings,
  openFile,
  pickInputFile,
  pickSavePath,
  revealInFolder,
  saveSettings,
  startFileDrag,
  transformVideo,
  trimVideo,
} from "./lib/tauri";
import {
  extensaoAtual,
  extensaoCompressao,
  formatosDestino,
  nomeArquivo,
  nomeBase,
  pastaDe,
  tipoArquivo,
} from "./lib/formats";
import type {
  FileInfo,
  JobKind,
  JobStatus,
  ProgressEvent,
  Quality,
  Rotation,
  Settings,
} from "./types";
import { AUDIO_FORMATOS } from "./types";

interface ErrorInfo {
  title: string;
  message: string;
}

type DialogKind = "convert" | "extractAudio" | "trim" | "rotate" | "extractFrame" | "gif";

interface State {
  file: FileInfo | null;
  /** O arquivo originalmente solto/selecionado nesta sessão — fica fixo até um novo arquivo ser escolhido. */
  originalFile: FileInfo | null;
  /** Saída do último job concluído com sucesso, se houver. */
  resultFile: FileInfo | null;
  quality: Quality;
  job: JobStatus;
  activeDialog: DialogKind | null;
  lastOutputPath: string | null;
  error: ErrorInfo | null;
}

type Action =
  | { type: "FILE_SELECTED"; file: FileInfo }
  | { type: "RESET" }
  | { type: "QUALITY_CHANGED"; quality: Quality }
  | { type: "DIALOG_OPEN"; dialog: DialogKind }
  | { type: "DIALOG_CLOSE" }
  | { type: "JOB_STARTED"; kind: JobKind }
  | { type: "PROGRESS"; percent: number }
  | { type: "JOB_DONE"; message: string; destPath: string }
  | { type: "JOB_ERROR"; message: string }
  | { type: "JOB_CANCELLED"; message: string }
  | { type: "ERROR_SHOW"; title: string; message: string }
  | { type: "ERROR_DISMISS" }
  | { type: "SELECT_SOURCE"; source: "original" | "result" };

const JOB_STARTED_MESSAGES: Record<JobKind, string> = {
  compress: "⏳ Comprimindo...",
  convert: "🔄 Convertendo...",
  trim: "✂️ Cortando vídeo...",
  extractAudio: "🎵 Extraindo áudio...",
  transform: "🔃 Girando/espelhando...",
  extractFrame: "🖼 Extraindo frame...",
  gif: "🎞 Criando GIF...",
};

const JOB_DONE_MESSAGES: Record<JobKind, (ext: string) => string> = {
  compress: (ext) => `✅ Concluído! Arquivo comprimido (${ext})`,
  convert: (ext) => `✅ Convertido com sucesso para ${ext}`,
  trim: (ext) => `✅ Corte concluído (${ext})`,
  extractAudio: (ext) => `✅ Áudio extraído para ${ext}`,
  transform: () => "✅ Vídeo girado/espelhado com sucesso",
  extractFrame: (ext) => `✅ Frame extraído (${ext})`,
  gif: () => "✅ GIF criado com sucesso",
};

const JOB_CANCELLED_MESSAGES: Record<JobKind, string> = {
  compress: "🚫 Compressão cancelada pelo usuário.",
  convert: "🚫 Conversão cancelada pelo usuário.",
  trim: "🚫 Corte cancelado pelo usuário.",
  extractAudio: "🚫 Extração de áudio cancelada pelo usuário.",
  transform: "🚫 Operação cancelada pelo usuário.",
  extractFrame: "🚫 Extração de frame cancelada pelo usuário.",
  gif: "🚫 Criação do GIF cancelada pelo usuário.",
};

function createInitialState(): State {
  return {
    file: null,
    originalFile: null,
    resultFile: null,
    quality: "alta",
    job: {
      state: "idle",
      kind: null,
      percent: 0,
      message: "Selecione um vídeo ou imagem para começar",
    },
    activeDialog: null,
    lastOutputPath: null,
    error: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FILE_SELECTED":
      return {
        ...state,
        file: action.file,
        originalFile: action.file,
        resultFile: null,
        activeDialog: null,
        lastOutputPath: null,
        job: {
          state: "idle",
          kind: null,
          percent: 0,
          message:
            action.file.kind === "imagem"
              ? "Imagem pronta. Clique em COMPRIMIR ou CONVERTER."
              : "Arquivo pronto. Clique em COMPRIMIR, CONVERTER ou use uma ferramenta abaixo.",
        },
      };
    case "RESET":
      return createInitialState();
    case "QUALITY_CHANGED":
      return { ...state, quality: action.quality };
    case "DIALOG_OPEN":
      return { ...state, activeDialog: action.dialog };
    case "DIALOG_CLOSE":
      return { ...state, activeDialog: null };
    case "JOB_STARTED":
      return {
        ...state,
        activeDialog: null,
        lastOutputPath: null,
        job: {
          state: "running",
          kind: action.kind,
          percent: 0,
          message: JOB_STARTED_MESSAGES[action.kind],
        },
      };
    case "PROGRESS":
      return { ...state, job: { ...state.job, percent: action.percent } };
    case "JOB_DONE": {
      const resultFile: FileInfo = {
        path: action.destPath,
        name: nomeArquivo(action.destPath),
        kind: state.file?.kind ?? "video",
      };
      return {
        ...state,
        file: resultFile,
        resultFile,
        lastOutputPath: action.destPath,
        job: { ...state.job, state: "success", percent: 100, message: action.message },
      };
    }
    case "JOB_ERROR":
      return {
        ...state,
        job: { ...state.job, state: "error", percent: 0, message: action.message },
      };
    case "JOB_CANCELLED":
      return {
        ...state,
        job: { ...state.job, state: "cancelled", percent: 0, message: action.message },
      };
    case "ERROR_SHOW":
      return { ...state, error: { title: action.title, message: action.message } };
    case "ERROR_DISMISS":
      return { ...state, error: null };
    case "SELECT_SOURCE": {
      const target = action.source === "original" ? state.originalFile : state.resultFile;
      return target ? { ...state, file: target } : state;
    }
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const settingsRef = useRef<Settings>({ lastOpenDir: null, lastSaveDir: null });
  const dragIconRef = useRef<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [compressMode, setCompressMode] = useState<CompressMode>("quality");
  const [targetSizeMb, setTargetSizeMb] = useState(25);
  /** Não-nulo = modo lote ativo, substitui a tela de arquivo único inteira. */
  const [batch, setBatch] = useState<{ files: string[]; kind: FileInfo["kind"] } | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      settingsRef.current = s;
    });
    getDragIconPath().then((p) => {
      dragIconRef.current = p;
    });
  }, []);

  const isRunning = state.job.state === "running";

  async function persistSetting(patch: Partial<Settings>) {
    settingsRef.current = { ...settingsRef.current, ...patch };
    await saveSettings(settingsRef.current);
  }

  async function selectFile(path: string, fromDialog: boolean) {
    const kind = tipoArquivo(path);
    if (!kind) {
      dispatch({
        type: "ERROR_SHOW",
        title: "Formato não suportado",
        message: "Selecione um vídeo ou imagem em um formato compatível.",
      });
      return;
    }
    dispatch({ type: "FILE_SELECTED", file: { path, name: nomeArquivo(path), kind } });
    if (fromDialog) {
      await persistSetting({ lastOpenDir: pastaDe(path) });
    }
  }

  /** Um arquivo -> fluxo normal de sempre. Vários -> modo lote, mas só se
   * todos forem do mesmo tipo (vídeo OU imagem). */
  async function trySelectFiles(paths: string[], fromDialog: boolean) {
    if (paths.length === 0) return;
    if (paths.length === 1) {
      await selectFile(paths[0], fromDialog);
      return;
    }

    const kinds = paths.map(tipoArquivo);
    if (kinds.some((k) => k === null)) {
      dispatch({
        type: "ERROR_SHOW",
        title: "Formato não suportado",
        message: "Um ou mais arquivos não são vídeo/imagem em um formato compatível.",
      });
      return;
    }
    if (new Set(kinds).size > 1) {
      dispatch({
        type: "ERROR_SHOW",
        title: "Tipos diferentes no lote",
        message: "Selecione só vídeos OU só imagens de uma vez pra processar em lote.",
      });
      return;
    }

    if (fromDialog) {
      await persistSetting({ lastOpenDir: pastaDe(paths[0]) });
    }
    setBatch({ files: paths, kind: kinds[0] as FileInfo["kind"] });
  }

  async function handlePickFile() {
    const paths = await pickInputFile(settingsRef.current.lastOpenDir);
    if (!paths) return;
    await trySelectFiles(Array.isArray(paths) ? paths : [paths], true);
  }

  function handleReset() {
    dispatch({ type: "RESET" });
    setCompressMode("quality");
    setTargetSizeMb(25);
    setMediaDuration(null);
    setBatch(null);
  }

  function handleProgressEvent(event: ProgressEvent, kind: JobKind) {
    switch (event.type) {
      case "progress":
        dispatch({ type: "PROGRESS", percent: event.percent });
        break;
      case "done": {
        if (kind === "compress" && event.beforeBytes && event.afterBytes) {
          const beforeMb = event.beforeBytes / (1024 * 1024);
          const afterMb = event.afterBytes / (1024 * 1024);
          const reducao = (1 - afterMb / beforeMb) * 100;
          dispatch({
            type: "JOB_DONE",
            destPath: event.destPath,
            message: `✅ Concluído! ${beforeMb.toFixed(1)} MB → ${afterMb.toFixed(1)} MB  (${reducao.toFixed(0)}% menor)`,
          });
        } else {
          const ext = event.destPath.split(".").pop()?.toUpperCase() ?? "";
          dispatch({ type: "JOB_DONE", destPath: event.destPath, message: JOB_DONE_MESSAGES[kind](ext) });
        }
        break;
      }
      case "error":
        dispatch({ type: "JOB_ERROR", message: `❌ ${event.message}` });
        dispatch({ type: "ERROR_SHOW", title: "Erro", message: event.message });
        break;
      case "cancelled":
        dispatch({ type: "JOB_CANCELLED", message: JOB_CANCELLED_MESSAGES[kind] });
        break;
    }
  }

  async function handleCompress() {
    if (!state.file) return;

    if (state.file.kind === "imagem") {
      const ext = extensaoAtual(state.file.path);
      const suggested = `${nomeBase(state.file.path)}_reduzido.${ext}`;
      const output = await pickSavePath({
        suggestedName: suggested,
        extension: ext,
        defaultPath: settingsRef.current.lastSaveDir,
      });
      if (!output) return;

      await persistSetting({ lastSaveDir: pastaDe(output) });
      dispatch({ type: "JOB_STARTED", kind: "compress" });
      try {
        await compressImage(state.file.path, output, state.quality, (e) =>
          handleProgressEvent(e, "compress"),
        );
      } catch (e) {
        dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
      }
      return;
    }

    const ext = extensaoAtual(state.file.path);
    const extSaida = extensaoCompressao(ext);
    const suggested = `${nomeBase(state.file.path)}_reduzido.${extSaida}`;

    const output = await pickSavePath({
      suggestedName: suggested,
      extension: extSaida,
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "compress" });

    try {
      if (compressMode === "size") {
        await compressVideoToSize(state.file.path, output, targetSizeMb, (e) =>
          handleProgressEvent(e, "compress"),
        );
      } else {
        await compressVideo(state.file.path, output, state.quality, (e) =>
          handleProgressEvent(e, "compress"),
        );
      }
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  function handleOpenConvertDialog() {
    dispatch({ type: "DIALOG_OPEN", dialog: "convert" });
  }

  function handleOpenExtractAudioDialog() {
    dispatch({ type: "DIALOG_OPEN", dialog: "extractAudio" });
  }

  function handleOpenRotateDialog() {
    dispatch({ type: "DIALOG_OPEN", dialog: "rotate" });
  }

  /** Cortar/Extrair frame/Criar GIF precisam da duração do vídeo pra validar
   * os campos de horário — busca antes de abrir o diálogo. */
  async function openDialogWithDuration(dialog: DialogKind) {
    if (!state.file) return;
    const duration = await getMediaDuration(state.file.path);
    setMediaDuration(duration);
    dispatch({ type: "DIALOG_OPEN", dialog });
  }

  function handleOpenTrimDialog() {
    void openDialogWithDuration("trim");
  }

  function handleOpenExtractFrameDialog() {
    void openDialogWithDuration("extractFrame");
  }

  function handleOpenGifDialog() {
    void openDialogWithDuration("gif");
  }

  async function handleConvertConfirm(format: string) {
    dispatch({ type: "DIALOG_CLOSE" });
    if (!state.file) return;

    const extSaida = format.toLowerCase();
    const suggested = `${nomeBase(state.file.path)}_convertido.${extSaida}`;

    const output = await pickSavePath({
      suggestedName: suggested,
      extension: extSaida,
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "convert" });

    try {
      await convertFile(state.file.path, output, (e) => handleProgressEvent(e, "convert"));
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  async function handleExtractAudioConfirm(format: string) {
    dispatch({ type: "DIALOG_CLOSE" });
    if (!state.file) return;

    const extSaida = format.toLowerCase();
    const suggested = `${nomeBase(state.file.path)}.${extSaida}`;

    const output = await pickSavePath({
      suggestedName: suggested,
      extension: extSaida,
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "extractAudio" });

    try {
      await extractAudio(state.file.path, output, (e) => handleProgressEvent(e, "extractAudio"));
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  async function handleRotateConfirm(rotation: Rotation, flipHorizontal: boolean, flipVertical: boolean) {
    dispatch({ type: "DIALOG_CLOSE" });
    if (!state.file) return;

    const ext = extensaoAtual(state.file.path);
    const extSaida = extensaoCompressao(ext);
    const suggested = `${nomeBase(state.file.path)}_girado.${extSaida}`;

    const output = await pickSavePath({
      suggestedName: suggested,
      extension: extSaida,
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "transform" });

    try {
      await transformVideo(state.file.path, output, rotation, flipHorizontal, flipVertical, (e) =>
        handleProgressEvent(e, "transform"),
      );
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  async function handleTrimConfirm(start: number, end: number, precise: boolean) {
    dispatch({ type: "DIALOG_CLOSE" });
    if (!state.file) return;

    const ext = extensaoAtual(state.file.path);
    // Corte rápido faz stream copy (nenhum codec muda), então qualquer
    // container de entrada continua válido. Corte preciso recodifica pra
    // libx264/aac (igual à compressão), então precisa da mesma regra de
    // compatibilidade de container.
    const extSaida = precise ? extensaoCompressao(ext) : ext;
    const suggested = `${nomeBase(state.file.path)}_cortado.${extSaida}`;

    const output = await pickSavePath({
      suggestedName: suggested,
      extension: extSaida,
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "trim" });

    try {
      await trimVideo(state.file.path, output, start, end, precise, (e) =>
        handleProgressEvent(e, "trim"),
      );
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  async function handleExtractFrameConfirm(timestamp: number, format: "png" | "jpg") {
    dispatch({ type: "DIALOG_CLOSE" });
    if (!state.file) return;

    const suggested = `${nomeBase(state.file.path)}_frame.${format}`;
    const output = await pickSavePath({
      suggestedName: suggested,
      extension: format,
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "extractFrame" });

    try {
      await extractFrame(state.file.path, output, timestamp, (e) =>
        handleProgressEvent(e, "extractFrame"),
      );
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  async function handleGifConfirm(start: number, end: number, fps: number, width: number) {
    dispatch({ type: "DIALOG_CLOSE" });
    if (!state.file) return;

    const suggested = `${nomeBase(state.file.path)}.gif`;
    const output = await pickSavePath({
      suggestedName: suggested,
      extension: "gif",
      defaultPath: settingsRef.current.lastSaveDir,
    });
    if (!output) return;

    await persistSetting({ lastSaveDir: pastaDe(output) });
    dispatch({ type: "JOB_STARTED", kind: "gif" });

    try {
      await createGif(state.file.path, output, start, end, fps, width, (e) =>
        handleProgressEvent(e, "gif"),
      );
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  async function handleCancel() {
    await cancelJob();
  }

  // As 3 ações abaixo seguem o arquivo ATIVO (state.file) — ou seja, respeitam
  // a aba Original/Resultado selecionada no FileSourceToggle, não fixam no
  // último job concluído.
  async function handleOpenFile() {
    if (!state.file) return;
    try {
      await openFile(state.file.path);
    } catch (e) {
      dispatch({ type: "ERROR_SHOW", title: "Não foi possível abrir o arquivo", message: String(e) });
    }
  }

  async function handleRevealInFolder() {
    if (!state.file) return;
    try {
      await revealInFolder(state.file.path);
    } catch (e) {
      dispatch({ type: "ERROR_SHOW", title: "Não foi possível abrir a pasta", message: String(e) });
    }
  }

  async function handleStartDrag() {
    if (!state.file || !dragIconRef.current) return;
    try {
      await startFileDrag(state.file.path, dragIconRef.current);
    } catch (e) {
      dispatch({ type: "ERROR_SHOW", title: "Não foi possível iniciar o arraste", message: String(e) });
    }
  }

  const formatOptions = state.file ? formatosDestino(state.file.path, state.file.kind) : [];
  const isVideo = state.file?.kind === "video";
  const isImage = state.file?.kind === "imagem";

  if (batch) {
    return (
      <div className="app">
        <TitleBar onReset={handleReset} resetDisabled={false} />
        <BatchQueue files={batch.files} kind={batch.kind} onClose={() => setBatch(null)} />
      </div>
    );
  }

  return (
    <div className="app">
      <TitleBar onReset={handleReset} resetDisabled={isRunning} />

      <DropZone
        file={state.file}
        disabled={isRunning}
        onFilesSelected={(paths) => void trySelectFiles(paths, false)}
        onClick={handlePickFile}
      />
      <div className="filename">{state.file?.path ?? ""}</div>

      {state.resultFile && state.originalFile && (
        <FileSourceToggle
          originalFile={state.originalFile}
          resultFile={state.resultFile}
          active={state.file === state.resultFile ? "result" : "original"}
          disabled={isRunning}
          onSelect={(source) => dispatch({ type: "SELECT_SOURCE", source })}
        />
      )}

      {isImage ? (
        <QualitySelect
          value={state.quality}
          disabled={isRunning}
          onChange={(q) => dispatch({ type: "QUALITY_CHANGED", quality: q })}
        />
      ) : (
        // Sem arquivo ainda (ou vídeo selecionado) mostra as duas opções —
        // sem saber o tipo, dá pra já deixar o modo escolhido de antemão.
        <CompressSettings
          quality={state.quality}
          onQualityChange={(q) => dispatch({ type: "QUALITY_CHANGED", quality: q })}
          mode={compressMode}
          onModeChange={setCompressMode}
          targetMb={targetSizeMb}
          onTargetMbChange={setTargetSizeMb}
          disabled={isRunning}
        />
      )}

      <div className="separator" />

      <ActionButtons
        canCompress={!!state.file && !isRunning}
        canConvert={!!state.file && !isRunning}
        isRunning={isRunning}
        onCompress={() => void handleCompress()}
        onConvert={handleOpenConvertDialog}
        onCancel={() => void handleCancel()}
      />

      {isVideo && (
        <ToolsMenu
          disabled={isRunning}
          onTrim={handleOpenTrimDialog}
          onExtractAudio={handleOpenExtractAudioDialog}
          onRotate={handleOpenRotateDialog}
          onExtractFrame={handleOpenExtractFrameDialog}
          onCreateGif={handleOpenGifDialog}
        />
      )}

      <ProgressBar percent={state.job.percent} />
      <StatusLine message={state.job.message} />

      {state.job.state === "success" && state.lastOutputPath && (
        <FileActions
          onOpenFile={() => void handleOpenFile()}
          onRevealInFolder={() => void handleRevealInFolder()}
          onStartDrag={() => void handleStartDrag()}
        />
      )}

      {state.activeDialog === "convert" && state.file && (
        <FormatDialog
          title={`Converter ${state.file.kind === "video" ? "vídeo" : "imagem"} para:`}
          options={formatOptions}
          onConfirm={(f) => void handleConvertConfirm(f)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}

      {state.activeDialog === "extractAudio" && (
        <FormatDialog
          title="Extrair áudio para:"
          options={AUDIO_FORMATOS}
          confirmLabel="Extrair"
          onConfirm={(f) => void handleExtractAudioConfirm(f)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}

      {state.activeDialog === "trim" && state.file && (
        <TrimDialog
          filePath={state.file.path}
          duration={mediaDuration}
          onConfirm={(s, e, p) => void handleTrimConfirm(s, e, p)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}

      {state.activeDialog === "rotate" && (
        <RotateDialog
          onConfirm={(r, fh, fv) => void handleRotateConfirm(r, fh, fv)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}

      {state.activeDialog === "extractFrame" && state.file && (
        <ExtractFrameDialog
          filePath={state.file.path}
          duration={mediaDuration}
          onConfirm={(t, f) => void handleExtractFrameConfirm(t, f)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}

      {state.activeDialog === "gif" && state.file && (
        <GifDialog
          filePath={state.file.path}
          duration={mediaDuration}
          onConfirm={(s, e, f, w) => void handleGifConfirm(s, e, f, w)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}

      {state.error && (
        <ErrorDialog
          title={state.error.title}
          message={state.error.message}
          onClose={() => dispatch({ type: "ERROR_DISMISS" })}
        />
      )}
    </div>
  );
}
