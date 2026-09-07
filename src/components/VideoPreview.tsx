import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export interface VideoPreviewHandle {
  /** Instante atual (segundos) de onde o player está parado/tocando. */
  getCurrentTime: () => number;
}

interface Props {
  path: string;
}

/** Player nativo (controles do próprio navegador — play/pause/arrastar a
 * barra/volume) do arquivo de vídeo selecionado, pra marcar início/fim
 * olhando o vídeo de verdade em vez de "adivinhar" um horário. Nem todo
 * container é reproduzível num `<video>` do navegador (mp4/webm/mov com
 * h264 costumam funcionar; avi/wmv/flv/mpg geralmente não) — se falhar,
 * cai num aviso e os campos de horário continuam funcionando manualmente. */
export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(function VideoPreview(
  { path },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
  }));

  if (failed) {
    return (
      <p className="video-preview-fallback">
        ⚠ Pré-visualização não disponível pra esse formato — use os campos de
        horário abaixo manualmente.
      </p>
    );
  }

  return (
    <video
      ref={videoRef}
      className="video-preview"
      src={convertFileSrc(path)}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
    />
  );
});
