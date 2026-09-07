import { useRef, useState } from "react";
import { formatTimecode, parseTimecode } from "../lib/time";
import { VideoPreview, type VideoPreviewHandle } from "./VideoPreview";

interface Props {
  filePath: string;
  duration: number | null;
  onConfirm: (timestamp: number, format: "png" | "jpg") => void;
  onCancel: () => void;
}

export function ExtractFrameDialog({ filePath, duration, onConfirm, onCancel }: Props) {
  const [text, setText] = useState("0:00");
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<VideoPreviewHandle>(null);

  function markInstant() {
    setText(formatTimecode(videoRef.current?.getCurrentTime() ?? 0));
  }

  function handleConfirm() {
    const timestamp = parseTimecode(text);
    if (timestamp === null) {
      setError("Horário inválido. Use o formato mm:ss.");
      return;
    }
    if (duration !== null && timestamp > duration) {
      setError(`O vídeo tem só ${formatTimecode(duration)}.`);
      return;
    }
    onConfirm(timestamp, format);
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h2>Extrair frame</h2>

        <VideoPreview ref={videoRef} path={filePath} />
        <div className="video-mark-row">
          <button className="mark-btn" onClick={markInstant}>
            🎯 Marcar este instante
          </button>
        </div>

        {duration !== null && (
          <p className="dialog-hint">Duração total: {formatTimecode(duration)}</p>
        )}
        <div className="dialog-field-row">
          <label>Instante</label>
          <input
            className="dialog-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="0:00"
          />
        </div>
        <select
          className="dialog-select"
          value={format}
          onChange={(e) => setFormat(e.target.value as "png" | "jpg")}
        >
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-confirm" onClick={handleConfirm}>
            Extrair
          </button>
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
