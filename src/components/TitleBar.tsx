interface Props {
  onReset: () => void;
  resetDisabled: boolean;
}

export function TitleBar({ onReset, resetDisabled }: Props) {
  return (
    <div className="title-bar">
      <h1>🛠️ FERRAMENTAS DE MÍDIA</h1>
      <button
        className="reset-btn"
        onClick={onReset}
        disabled={resetDisabled}
        title="Recomeçar"
      >
        ↺
      </button>
    </div>
  );
}
