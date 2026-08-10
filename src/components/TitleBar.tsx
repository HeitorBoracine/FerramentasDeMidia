import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  onReset: () => void;
  resetDisabled: boolean;
}

const appWindow = getCurrentWindow();

export function TitleBar({ onReset, resetDisabled }: Props) {
  return (
    <div className="title-bar">
      <div className="title-bar-drag" data-tauri-drag-region>
        <h1 data-tauri-drag-region>FERRAMENTAS DE MÍDIA</h1>
      </div>
      <div className="title-bar-controls">
        <button
          className="reset-btn"
          onClick={onReset}
          disabled={resetDisabled}
          title="Recomeçar"
        >
          ↺
        </button>
        <button
          className="win-btn win-btn-minimize"
          onClick={() => void appWindow.minimize()}
          title="Minimizar"
        >
          ─
        </button>
        <button
          className="win-btn win-btn-close"
          onClick={() => void appWindow.close()}
          title="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
