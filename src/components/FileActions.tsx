interface Props {
  onOpenFile: () => void;
  onRevealInFolder: () => void;
  onStartDrag: () => void;
}

export function FileActions({ onOpenFile, onRevealInFolder, onStartDrag }: Props) {
  return (
    <div className="file-actions">
      <button className="file-action-btn" onClick={onOpenFile}>
        📂 Abrir arquivo
      </button>
      <button className="file-action-btn" onClick={onRevealInFolder}>
        🗂️ Mostrar na pasta
      </button>
      <button
        className="file-action-btn drag-handle"
        onMouseDown={onStartDrag}
        title="Segure e arraste pra outro programa (WhatsApp, Explorer, etc.)"
      >
        ✥ Arrastar arquivo
      </button>
    </div>
  );
}
