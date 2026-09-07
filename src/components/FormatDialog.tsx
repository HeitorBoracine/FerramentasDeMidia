import { useState } from "react";

interface Props {
  title: string;
  options: string[];
  confirmLabel?: string;
  onConfirm: (format: string) => void;
  onCancel: () => void;
}

export function FormatDialog({ title, options, confirmLabel = "Converter", onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState(options[0]);

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <select
          className="dialog-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {options.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-confirm" onClick={() => onConfirm(selected)}>
            {confirmLabel}
          </button>
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
