import { useReducer, useState } from "react";
import type { FileKind, ProgressEvent, Quality, Rotation } from "../types";
import { AUDIO_FORMATOS, QUALITY_LABELS } from "../types";
import {
  IMAGE_FORMATOS,
  VIDEO_FORMATOS,
  extensaoAtual,
  extensaoCompressao,
  nomeArquivo,
  nomeBase,
} from "../lib/formats";
import {
  cancelJob,
  compressImage,
  compressVideo,
  convertFile,
  extractAudio,
  pickOutputFolder,
  revealInFolder,
  transformVideo,
} from "../lib/tauri";
import { ROTATIONS, ROTATION_LABELS } from "./RotateDialog";

type BatchOperation = "compress" | "convert" | "extractAudio" | "rotate";

interface QueueItem {
  path: string;
  name: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  percent: number;
  message: string;
}

type ItemAction =
  | { type: "RUNNING"; index: number }
  | { type: "PROGRESS"; index: number; percent: number }
  | { type: "DONE"; index: number }
  | { type: "ERROR"; index: number; message: string }
  | { type: "CANCELLED"; index: number };

function itemsReducer(items: QueueItem[], action: ItemAction): QueueItem[] {
  return items.map((item, i) => {
    if (i !== action.index) return item;
    switch (action.type) {
      case "RUNNING":
        return { ...item, status: "running", percent: 0, message: "" };
      case "PROGRESS":
        return { ...item, percent: action.percent };
      case "DONE":
        return { ...item, status: "done", percent: 100 };
      case "ERROR":
        return { ...item, status: "error", message: action.message };
      case "CANCELLED":
        return { ...item, status: "cancelled" };
      default:
        return item;
    }
  });
}

const STATUS_ICON: Record<QueueItem["status"], string> = {
  pending: "⏳",
  running: "🔄",
  done: "✅",
  error: "❌",
  cancelled: "🚫",
};

interface Props {
  files: string[];
  kind: FileKind;
  onClose: () => void;
}

/** Só entram no lote operações que fazem sentido aplicar com os MESMOS
 * parâmetros pra vários arquivos de uma vez. Cortar/Extrair frame/Criar GIF
 * pedem um instante específico por vídeo, então continuam só no modo de um
 * arquivo por vez. */
export function BatchQueue({ files, kind, onClose }: Props) {
  const [items, dispatchItem] = useReducer(
    itemsReducer,
    files.map((path) => ({
      path,
      name: nomeArquivo(path),
      status: "pending" as const,
      percent: 0,
      message: "",
    })),
  );
  const [operation, setOperation] = useState<BatchOperation>("compress");
  const [quality, setQuality] = useState<Quality>("alta");
  const [targetFormat, setTargetFormat] = useState((kind === "video" ? VIDEO_FORMATOS : IMAGE_FORMATOS)[0]);
  const [audioFormat, setAudioFormat] = useState(AUDIO_FORMATOS[0]);
  const [rotation, setRotation] = useState<Rotation>("cw90");
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const doneCount = items.filter((i) => i.status === "done").length;
  const finished = items.every((i) => i.status !== "pending" && i.status !== "running");

  async function handlePickFolder() {
    const dir = await pickOutputFolder(outputDir);
    if (dir) setOutputDir(dir);
  }

  function outputPathFor(item: QueueItem): string {
    const ext = extensaoAtual(item.path);
    const base = nomeBase(item.path);
    let filename: string;
    switch (operation) {
      case "compress":
        filename = `${base}_reduzido.${kind === "video" ? extensaoCompressao(ext) : ext}`;
        break;
      case "convert":
        filename = `${base}_convertido.${targetFormat.toLowerCase()}`;
        break;
      case "extractAudio":
        filename = `${base}.${audioFormat.toLowerCase()}`;
        break;
      case "rotate":
        filename = `${base}_girado.${extensaoCompressao(ext)}`;
        break;
    }
    return `${outputDir}\\${filename}`;
  }

  function runItem(item: QueueItem, index: number): Promise<boolean> {
    const output = outputPathFor(item);
    dispatchItem({ type: "RUNNING", index });

    return new Promise((resolve) => {
      const onProgress = (e: ProgressEvent) => {
        if (e.type === "progress") {
          dispatchItem({ type: "PROGRESS", index, percent: e.percent });
        } else if (e.type === "done") {
          dispatchItem({ type: "DONE", index });
          resolve(true);
        } else if (e.type === "error") {
          dispatchItem({ type: "ERROR", index, message: e.message });
          resolve(false);
        } else if (e.type === "cancelled") {
          dispatchItem({ type: "CANCELLED", index });
          resolve(false);
        }
      };

      const run = async () => {
        try {
          if (operation === "compress") {
            if (kind === "video") await compressVideo(item.path, output, quality, onProgress);
            else await compressImage(item.path, output, quality, onProgress);
          } else if (operation === "convert") {
            await convertFile(item.path, output, onProgress);
          } else if (operation === "extractAudio") {
            await extractAudio(item.path, output, onProgress);
          } else {
            await transformVideo(item.path, output, rotation, flipH, flipV, onProgress);
          }
        } catch (e) {
          dispatchItem({ type: "ERROR", index, message: String(e) });
          resolve(false);
        }
      };
      void run();
    });
  }

  async function handleStart() {
    if (!outputDir) return;
    setIsRunning(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "done") continue;
      const ok = await runItem(items[i], i);
      if (!ok) break; // erro/cancelamento pára a fila — o resto fica pendente, dá pra retomar
    }
    setIsRunning(false);
  }

  async function handleCancel() {
    await cancelJob();
  }

  async function handleOpenOutputFolder() {
    if (outputDir) await revealInFolder(outputDir);
  }

  const operationOptions: { value: BatchOperation; label: string }[] =
    kind === "video"
      ? [
          { value: "compress", label: "⚡ Comprimir" },
          { value: "convert", label: "🔄 Converter" },
          { value: "extractAudio", label: "🎵 Extrair áudio" },
          { value: "rotate", label: "🔃 Girar/Espelhar" },
        ]
      : [
          { value: "compress", label: "⚡ Comprimir" },
          { value: "convert", label: "🔄 Converter" },
        ];

  return (
    <div className="batch-view">
      <h2 className="batch-title">
        Lote — {items.length} {kind === "video" ? "vídeos" : "imagens"}
      </h2>

      <div className="batch-config">
        <select
          className="dialog-select"
          value={operation}
          disabled={isRunning}
          onChange={(e) => setOperation(e.target.value as BatchOperation)}
        >
          {operationOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {operation === "compress" && (
          <select
            className="dialog-select"
            value={quality}
            disabled={isRunning}
            onChange={(e) => setQuality(e.target.value as Quality)}
          >
            {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        )}

        {operation === "convert" && (
          <select
            className="dialog-select"
            value={targetFormat}
            disabled={isRunning}
            onChange={(e) => setTargetFormat(e.target.value)}
          >
            {(kind === "video" ? VIDEO_FORMATOS : IMAGE_FORMATOS).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}

        {operation === "extractAudio" && (
          <select
            className="dialog-select"
            value={audioFormat}
            disabled={isRunning}
            onChange={(e) => setAudioFormat(e.target.value)}
          >
            {AUDIO_FORMATOS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}

        {operation === "rotate" && (
          <>
            <select
              className="dialog-select"
              value={rotation}
              disabled={isRunning}
              onChange={(e) => setRotation(e.target.value as Rotation)}
            >
              {ROTATIONS.map((r) => (
                <option key={r} value={r}>
                  {ROTATION_LABELS[r]}
                </option>
              ))}
            </select>
            <label className="dialog-checkbox-row">
              <input
                type="checkbox"
                checked={flipH}
                disabled={isRunning}
                onChange={(e) => setFlipH(e.target.checked)}
              />
              Espelhar horizontalmente
            </label>
            <label className="dialog-checkbox-row">
              <input
                type="checkbox"
                checked={flipV}
                disabled={isRunning}
                onChange={(e) => setFlipV(e.target.checked)}
              />
              Espelhar verticalmente
            </label>
          </>
        )}
      </div>

      <button className="tool-btn" disabled={isRunning} onClick={() => void handlePickFolder()}>
        📁 {outputDir ? `Pasta: ${outputDir}` : "Escolher pasta de destino"}
      </button>

      <div className="batch-list">
        {items.map((item) => (
          <div className="batch-row" key={item.path}>
            <span className="batch-row-icon">{STATUS_ICON[item.status]}</span>
            <span className="batch-row-name" title={item.path}>
              {item.name}
            </span>
            <div className="batch-row-progress">
              <div className="batch-row-progress-fill" style={{ width: `${item.percent}%` }} />
            </div>
            {item.status === "error" && (
              <span className="batch-row-error" title={item.message}>
                erro
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="actions-row">
        {!isRunning && !finished && (
          <button className="btn btn-compress" disabled={!outputDir} onClick={() => void handleStart()}>
            ▶ Iniciar ({doneCount}/{items.length})
          </button>
        )}
        {isRunning && (
          <button className="btn btn-cancel" onClick={() => void handleCancel()}>
            ✖ Cancelar
          </button>
        )}
        <button className="btn btn-convert" disabled={isRunning} onClick={onClose}>
          Novo lote
        </button>
      </div>

      {finished && outputDir && (
        <button className="file-action-btn" onClick={() => void handleOpenOutputFolder()}>
          📂 Abrir pasta de destino
        </button>
      )}
    </div>
  );
}
