import { useState } from "react";
import type { Rotation } from "../types";

export const ROTATION_LABELS: Record<Rotation, string> = {
  none: "Nenhuma",
  cw90: "90° horário",
  ccw90: "90° anti-horário",
  deg180: "180°",
};

export const ROTATIONS = Object.keys(ROTATION_LABELS) as Rotation[];

interface Props {
  onConfirm: (rotation: Rotation, flipHorizontal: boolean, flipVertical: boolean) => void;
  onCancel: () => void;
}

export function RotateDialog({ onConfirm, onCancel }: Props) {
  const [rotation, setRotation] = useState<Rotation>("cw90");
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (rotation === "none" && !flipH && !flipV) {
      setError("Escolha uma rotação ou espelhamento.");
      return;
    }
    onConfirm(rotation, flipH, flipV);
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h2>Girar / espelhar vídeo</h2>
        <select
          className="dialog-select"
          value={rotation}
          onChange={(e) => setRotation(e.target.value as Rotation)}
        >
          {ROTATIONS.map((r) => (
            <option key={r} value={r}>
              {ROTATION_LABELS[r]}
            </option>
          ))}
        </select>
        <label className="dialog-checkbox-row">
          <input type="checkbox" checked={flipH} onChange={(e) => setFlipH(e.target.checked)} />
          Espelhar horizontalmente
        </label>
        <label className="dialog-checkbox-row">
          <input type="checkbox" checked={flipV} onChange={(e) => setFlipV(e.target.checked)} />
          Espelhar verticalmente
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-confirm" onClick={handleConfirm}>
            Aplicar
          </button>
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
