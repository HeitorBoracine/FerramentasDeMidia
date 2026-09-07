interface Props {
  title: string;
  message: string;
  onClose: () => void;
}

export function ErrorDialog({ title, message, onClose }: Props) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box dialog-box-error" onClick={(e) => e.stopPropagation()}>
        <h2>⚠ {title}</h2>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-error" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
