import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Drag-and-drop nativo do SO. O `ondrop` do HTML5 não dispara pra drops de
 * fora da webview no Tauri — é preciso escutar o evento nativo da janela.
 */
export function useDragDrop(onDrop: (path: string) => void) {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        const [path] = event.payload.paths;
        if (path) onDrop(path);
      } else {
        setDragOver(false);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return dragOver;
}
