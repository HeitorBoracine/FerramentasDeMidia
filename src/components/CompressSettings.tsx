import { QUALITY_LABELS, type Quality } from "../types";

export type CompressMode = "quality" | "size";

interface Props {
  quality: Quality;
  onQualityChange: (q: Quality) => void;
  mode: CompressMode;
  onModeChange: (mode: CompressMode) => void;
  targetMb: number;
  onTargetMbChange: (mb: number) => void;
  disabled: boolean;
}

const QUALITY_OPTIONS: Quality[] = ["alta", "media", "baixa"];

/** Uma linha só: alternância Por qualidade/Por tamanho + o único controle
 * relevante pro modo ativo (nunca os dois ao mesmo tempo). Botões e slot do
 * controle têm largura fixa — trocar de modo só muda o texto/conteúdo, nunca
 * a posição de nada na tela. */
export function CompressSettings({
  quality,
  onQualityChange,
  mode,
  onModeChange,
  targetMb,
  onTargetMbChange,
  disabled,
}: Props) {
  return (
    <div className="compress-settings-row">
      <div className="compress-mode-toggle">
        <button
          className={`compress-mode-btn${mode === "quality" ? " active" : ""}`}
          disabled={disabled}
          onClick={() => onModeChange("quality")}
        >
          Por qualidade
        </button>
        <button
          className={`compress-mode-btn${mode === "size" ? " active" : ""}`}
          disabled={disabled}
          onClick={() => onModeChange("size")}
        >
          Por tamanho
        </button>
      </div>

      <div className="compress-value-slot">
        {mode === "quality" ? (
          <select
            className="quality-select"
            value={quality}
            disabled={disabled}
            onChange={(e) => onQualityChange(e.target.value as Quality)}
          >
            {QUALITY_OPTIONS.map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        ) : (
          <div className="target-size-field">
            <input
              type="text"
              inputMode="numeric"
              className="target-size-input"
              value={targetMb}
              disabled={disabled}
              onChange={(e) => onTargetMbChange(Number(e.target.value.replace(/[^\d]/g, "")))}
            />
            <span className="target-size-suffix">MB</span>
          </div>
        )}
      </div>
    </div>
  );
}
