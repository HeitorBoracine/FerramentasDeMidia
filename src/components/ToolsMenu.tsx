import { useEffect, useRef, useState } from "react";

interface Props {
  disabled: boolean;
  onTrim: () => void;
  onExtractAudio: () => void;
  onRotate: () => void;
  onExtractFrame: () => void;
  onCreateGif: () => void;
}

/** Ferramentas secundárias escondidas atrás de um menu suspenso — só
 * Comprimir/Converter ficam sempre em destaque na tela. Fecha sozinho ao
 * escolher uma opção ou ao clicar fora. */
export function ToolsMenu({
  disabled,
  onTrim,
  onExtractAudio,
  onRotate,
  onExtractFrame,
  onCreateGif,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const items: { label: string; onClick: () => void }[] = [
    { label: "✂️ Cortar", onClick: onTrim },
    { label: "🎵 Extrair áudio", onClick: onExtractAudio },
    { label: "🔃 Girar/Espelhar", onClick: onRotate },
    { label: "🖼 Extrair frame", onClick: onExtractFrame },
    { label: "🎞 Criar GIF", onClick: onCreateGif },
  ];

  return (
    <div className="tools-menu" ref={rootRef}>
      <button
        className="tools-menu-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        🛠 Mais ferramentas {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="tools-menu-dropdown">
          {items.map((item) => (
            <button
              key={item.label}
              className="tools-menu-item"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
