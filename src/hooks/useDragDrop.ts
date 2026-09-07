import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Drag-and-drop nativo do SO. O `ondrop` do HTML5 não dispara pra drops de
 * fora da webview no Tauri — é preciso escutar o evento nativo da janela
 * inteira e depois filtrar manualmente pela posição, comparando com o
 * retângulo do elemento passado via `zoneRef`. Sem isso, soltar um arquivo
 * em QUALQUER lugar da janela seleciona o arquivo, o que é perigoso (solta
 * sem querer perto da borda e perde a seleção/resultado atual).
 */
export function useDragDrop<T extends HTMLElement>(onDrop: (paths: string[]) => void) {
  const [dragOver, setDragOver] = useState(false);
  const zoneRef = useRef<T>(null);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "leave") {
        setDragOver(false);
        return;
      }

      const zone = zoneRef.current;
      if (!zone) {
        setDragOver(false);
        return;
      }

      const scale = window.devicePixelRatio || 1;
      const { x, y } = event.payload.position.toLogical(scale);
      const rect = zone.getBoundingClientRect();
      const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

      if (event.payload.type === "drop") {
        setDragOver(false);
        if (inside && event.payload.paths.length > 0) {
          onDrop(event.payload.paths);
        }
      } else {
        // 'enter' | 'over'
        setDragOver(inside);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { dragOver, zoneRef };
}
