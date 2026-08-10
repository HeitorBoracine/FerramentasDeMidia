interface Props {
  onOpenFile: () => void;
  onRevealInFolder: () => void;
}

export function FileActions({ onOpenFile, onRevealInFolder }: Props) {
  return (
    <div className="file-actions">
      <button className="file-action-btn" onClick={onOpenFile}>
        📂 Abrir arquivo
      </button>
      <button className="file-action-btn" onClick={onRevealInFolder}>
        🗂️ Mostrar na pasta
      </button>
    </div>
  );
}
