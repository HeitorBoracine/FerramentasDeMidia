import { useRef, useState } from "react";
import { formatTimecode, parseTimecode } from "../lib/time";
import { VideoPreview, type VideoPreviewHandle } from "./VideoPreview";

interface Props {
  filePath: string;
  duration: number | null;
  onConfirm: (start: number, end: number, precise: boolean) => void;
  onCancel: () => void;
}

export function TrimDialog({ filePath, duration, onConfirm, onCancel }: Props) {
  const [startText, setStartText] = useState("0:00");
  const [endText, setEndText] = useState(duration ? formatTimecode(duration) : "0:10");
  const [precise, setPrecise] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<VideoPreviewHandle>(null);

  function markStart() {
    setStartText(formatTimecode(videoRef.current?.getCurrentTime() ?? 0));
  }

  function markEnd() {
    setEndText(formatTimecode(videoRef.current?.getCurrentTime() ?? 0));
  }

  function handleConfirm() {
    const start = parseTimecode(startText);
    const end = parseTimecode(endText);
    if (start === null || end === null) {
      setError("Horário inválido. Use o formato mm:ss.");
      return;
    }
    if (end <= start) {
      setError("O fim precisa ser depois do início.");
      return;
    }
    if (duration !== null && end > duration) {
      setError(`O vídeo tem só ${formatTimecode(duration)}.`);
      return;
    }
    onConfirm(start, end, precise);
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h2>Cortar vídeo</h2>

        <VideoPreview ref={videoRef} path={filePath} />
        <div className="video-mark-row">
          <button className="mark-btn" onClick={markStart}>
            🎯 Marcar início
          </button>
          <button className="mark-btn" onClick={markEnd}>
            🎯 Marcar fim
          </button>
        </div>

        {duration !== null && (
          <p className="dialog-hint">Duração total: {formatTimecode(duration)}</p>
        )}
        <div className="dialog-field-row">
          <label>Início</label>
          <input
            className="dialog-text-input"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            placeholder="0:00"
          />
        </div>
        <div className="dialog-field-row">
          <label>Fim</label>
          <input
            className="dialog-text-input"
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            placeholder="0:10"
          />
        </div>
        <label className="dialog-checkbox-row">
          <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} />
          Corte preciso (recodifica, mais lento, exato no segundo)
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-confirm" onClick={handleConfirm}>
            Cortar
          </button>
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
