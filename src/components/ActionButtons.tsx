interface Props {
  canCompress: boolean;
  canConvert: boolean;
  isRunning: boolean;
  onCompress: () => void;
  onConvert: () => void;
  onCancel: () => void;
}

export function ActionButtons({
  canCompress,
  canConvert,
  isRunning,
  onCompress,
  onConvert,
  onCancel,
}: Props) {
  return (
    <div className="actions-row">
      <button className="btn btn-compress" disabled={!canCompress} onClick={onCompress}>
        ⚡ COMPRIMIR VÍDEO
      </button>
      <button className="btn btn-convert" disabled={!canConvert} onClick={onConvert}>
        🔄 CONVERTER
      </button>
      {isRunning && (
        <button className="btn btn-cancel" onClick={onCancel}>
          ✖ CANCELAR
        </button>
      )}
    </div>
  );
}
