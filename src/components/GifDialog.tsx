import { useRef, useState } from "react";
import { formatTimecode, parseTimecode } from "../lib/time";
import { VideoPreview, type VideoPreviewHandle } from "./VideoPreview";

interface Props {
  filePath: string;
  duration: number | null;
  onConfirm: (start: number, end: number, fps: number, width: number) => void;
  onCancel: () => void;
}

const FPS_OPTIONS = [8, 10, 15];
const WIDTH_OPTIONS = [320, 480, 640];

export function GifDialog({ filePath, duration, onConfirm, onCancel }: Props) {
  const [startText, setStartText] = useState("0:00");
  const [endText, setEndText] = useState(duration ? formatTimecode(Math.min(duration, 5)) : "0:05");
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(480);
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
    onConfirm(start, end, fps, width);
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h2>Criar GIF</h2>

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
            placeholder="0:05"
          />
        </div>
        <div className="dialog-field-row">
          <label>Quadros/s</label>
          <select className="dialog-select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </div>
        <div className="dialog-field-row">
          <label>Largura</label>
          <select className="dialog-select" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
            {WIDTH_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </div>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-confirm" onClick={handleConfirm}>
            Criar GIF
          </button>
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
