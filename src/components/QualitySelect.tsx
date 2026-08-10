import { QUALITY_LABELS, type Quality } from "../types";

interface Props {
  value: Quality;
  disabled: boolean;
  onChange: (q: Quality) => void;
}

const OPTIONS: Quality[] = ["alta", "media", "baixa"];

export function QualitySelect({ value, disabled, onChange }: Props) {
  return (
    <div className="quality-row">
      <label htmlFor="quality-select">Qualidade:</label>
      <select
        id="quality-select"
        className="quality-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Quality)}
      >
        {OPTIONS.map((q) => (
          <option key={q} value={q}>
            {QUALITY_LABELS[q]}
          </option>
        ))}
      </select>
    </div>
  );
}
