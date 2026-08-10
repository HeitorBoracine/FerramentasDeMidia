import { useEffect, useReducer, useRef } from "react";
import "./App.css";
import { TitleBar } from "./components/TitleBar";
import { DropZone } from "./components/DropZone";
import { QualitySelect } from "./components/QualitySelect";
import { ActionButtons } from "./components/ActionButtons";
import { FormatDialog } from "./components/FormatDialog";
import { ProgressBar } from "./components/ProgressBar";
import { StatusLine } from "./components/StatusLine";
import {
  cancelJob,
  compressVideo,
  convertFile,
  getSettings,
  pickInputFile,
  pickSavePath,
  saveSettings,
  showError,
  showSuccess,
} from "./lib/tauri";
import {
  extensaoAtual,
  formatosDestino,
  nomeArquivo,
  nomeBase,
  pastaDe,
  tipoArquivo,
} from "./lib/formats";
import type { FileInfo, JobKind, JobStatus, ProgressEvent, Quality, Settings } from "./types";

interface State {
  file: FileInfo | null;
  quality: Quality;
  job: JobStatus;
  dialogOpen: boolean;
}

type Action =
  | { type: "FILE_SELECTED"; file: FileInfo }
  | { type: "RESET" }
  | { type: "QUALITY_CHANGED"; quality: Quality }
  | { type: "DIALOG_OPEN" }
  | { type: "DIALOG_CLOSE" }
  | { type: "JOB_STARTED"; kind: JobKind }
  | { type: "PROGRESS"; percent: number }
  | { type: "JOB_DONE"; message: string }
  | { type: "JOB_ERROR"; message: string }
  | { type: "JOB_CANCELLED"; message: string };

function createInitialState(): State {
  return {
    file: null,
    quality: "alta",
    job: {
      state: "idle",
      kind: null,
      percent: 0,
      message: "Selecione um vídeo ou imagem para começar",
    },
    dialogOpen: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FILE_SELECTED":
      return {
        ...state,
        file: action.file,
        dialogOpen: false,
        job: {
          state: "idle",
          kind: null,
          percent: 0,
          message:
            action.file.kind === "imagem"
              ? "Imagem pronta. Clique em CONVERTER."
              : "Arquivo pronto. Clique em COMPRIMIR ou CONVERTER.",
        },
      };
    case "RESET":
      return createInitialState();
    case "QUALITY_CHANGED":
      return { ...state, quality: action.quality };
    case "DIALOG_OPEN":
      return { ...state, dialogOpen: true };
    case "DIALOG_CLOSE":
      return { ...state, dialogOpen: false };
    case "JOB_STARTED":
      return {
        ...state,
        dialogOpen: false,
        job: {
          state: "running",
          kind: action.kind,
          percent: 0,
          message:
            action.kind === "compress" ? "⏳ Comprimindo vídeo..." : "🔄 Convertendo...",
        },
      };
    case "PROGRESS":
      return { ...state, job: { ...state.job, percent: action.percent } };
    case "JOB_DONE":
      return {
        ...state,
        job: { ...state.job, state: "success", percent: 100, message: action.message },
      };
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
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const settingsRef = useRef<Settings>({ lastOpenDir: null, lastSaveDir: null });

  useEffect(() => {
    getSettings().then((s) => {
      settingsRef.current = s;
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
      await showError(
        "Formato não suportado",
        "Selecione um vídeo ou imagem em um formato compatível.",
      );
      return;
    }
    dispatch({ type: "FILE_SELECTED", file: { path, name: nomeArquivo(path), kind } });
    if (fromDialog) {
      await persistSetting({ lastOpenDir: pastaDe(path) });
    }
  }

  async function handlePickFile() {
    const path = await pickInputFile(settingsRef.current.lastOpenDir);
    if (typeof path === "string") {
      await selectFile(path, true);
    }
  }

  function handleReset() {
    dispatch({ type: "RESET" });
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
            message: `✅ Concluído! ${beforeMb.toFixed(1)} MB → ${afterMb.toFixed(1)} MB  (${reducao.toFixed(0)}% menor)`,
          });
          void showSuccess(
            "Sucesso!",
            `Vídeo comprimido com sucesso!\n\n` +
              `📁 Salvo em:\n${event.destPath}\n\n` +
              `📦 Tamanho original: ${beforeMb.toFixed(1)} MB\n` +
              `📦 Tamanho final:    ${afterMb.toFixed(1)} MB\n` +
              `📉 Redução:          ${reducao.toFixed(0)}%`,
          );
        } else {
          const ext = event.destPath.split(".").pop()?.toUpperCase() ?? "";
          dispatch({ type: "JOB_DONE", message: `✅ Convertido com sucesso para ${ext}` });
          void showSuccess(
            "Sucesso!",
            `Arquivo convertido com sucesso!\n\n📁 Salvo em:\n${event.destPath}`,
          );
        }
        break;
      }
      case "error":
        dispatch({ type: "JOB_ERROR", message: `❌ ${event.message}` });
        void showError("Erro", event.message);
        break;
      case "cancelled":
        dispatch({
          type: "JOB_CANCELLED",
          message:
            kind === "compress"
              ? "🚫 Compressão cancelada pelo usuário."
              : "🚫 Conversão cancelada pelo usuário.",
        });
        break;
    }
  }

  async function handleCompress() {
    if (!state.file) return;
    const ext = extensaoAtual(state.file.path);
    const extSaida = ext === "mp4" || ext === "mkv" ? ext : "mp4";
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
      await compressVideo(state.file.path, output, state.quality, (e) =>
        handleProgressEvent(e, "compress"),
      );
    } catch (e) {
      dispatch({ type: "JOB_ERROR", message: `❌ ${String(e)}` });
    }
  }

  function handleOpenConvertDialog() {
    dispatch({ type: "DIALOG_OPEN" });
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

  async function handleCancel() {
    await cancelJob();
  }

  const formatOptions = state.file ? formatosDestino(state.file.path, state.file.kind) : [];

  return (
    <div className="app">
      <TitleBar onReset={handleReset} resetDisabled={isRunning} />

      <DropZone
        file={state.file}
        disabled={isRunning}
        onFileSelected={(path) => void selectFile(path, false)}
        onClick={handlePickFile}
      />
      <div className="filename">{state.file?.path ?? ""}</div>

      <QualitySelect
        value={state.quality}
        disabled={isRunning}
        onChange={(q) => dispatch({ type: "QUALITY_CHANGED", quality: q })}
      />

      <div className="separator" />

      <ActionButtons
        canCompress={!!state.file && state.file.kind === "video" && !isRunning}
        canConvert={!!state.file && !isRunning}
        isRunning={isRunning}
        onCompress={() => void handleCompress()}
        onConvert={handleOpenConvertDialog}
        onCancel={() => void handleCancel()}
      />

      <ProgressBar percent={state.job.percent} />
      <StatusLine message={state.job.message} />

      {state.dialogOpen && state.file && (
        <FormatDialog
          kind={state.file.kind}
          options={formatOptions}
          onConfirm={(f) => void handleConvertConfirm(f)}
          onCancel={() => dispatch({ type: "DIALOG_CLOSE" })}
        />
      )}
    </div>
  );
}
