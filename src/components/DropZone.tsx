import { useDragDrop } from "../hooks/useDragDrop";
import type { FileInfo } from "../types";

interface Props {
  file: FileInfo | null;
  disabled: boolean;
  onFileSelected: (path: string) => void;
  onClick: () => void;
}

export function DropZone({ file, disabled, onFileSelected, onClick }: Props) {
  const dragOver = useDragDrop((path) => {
    if (!disabled) onFileSelected(path);
  });

  const icon = dragOver ? "📥" : file ? (file.kind === "imagem" ? "🖼" : "🎥") : "⬇";
  const label = dragOver
    ? "Solte o arquivo aqui!"
    : file
      ? `✅  ${file.name}`
      : "Solte o vídeo ou imagem aqui  ou  clique para selecionar";

  return (
    <div
      className={`drop-zone${dragOver ? " drag-over" : ""}`}
      onClick={disabled ? undefined : onClick}
      style={disabled ? { cursor: "default" } : undefined}
    >
      <span className="drop-icon">{icon}</span>
      <span className={`drop-label${file ? " selected" : ""}`}>{label}</span>
      {!dragOver && !file && (
        <span className="drop-sub">
          Vídeos e imagens — MP4 MKV AVI MOV PNG JPG e outros formatos
        </span>
      )}
    </div>
  );
}
