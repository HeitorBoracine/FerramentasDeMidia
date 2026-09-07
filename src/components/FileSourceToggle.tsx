import type { FileInfo } from "../types";

interface Props {
  originalFile: FileInfo;
  resultFile: FileInfo;
  active: "original" | "result";
  disabled: boolean;
  onSelect: (source: "original" | "result") => void;
}

export function FileSourceToggle({ originalFile, resultFile, active, disabled, onSelect }: Props) {
  return (
    <div className="source-toggle">
      <button
        className={`source-toggle-btn${active === "original" ? " active" : ""}`}
        disabled={disabled}
        title={originalFile.path}
        onClick={() => onSelect("original")}
      >
        🎬 Original: {originalFile.name}
      </button>
      <button
        className={`source-toggle-btn${active === "result" ? " active" : ""}`}
        disabled={disabled}
        title={resultFile.path}
        onClick={() => onSelect("result")}
      >
        ✅ Resultado: {resultFile.name}
      </button>
    </div>
  );
}
