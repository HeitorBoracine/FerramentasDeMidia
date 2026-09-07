import { invoke, Channel } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { ProgressEvent, Quality, Rotation, Settings } from "../types";
import { IMAGE_EXTS, VIDEO_EXTS } from "./formats";

/** `multiple: true` permite selecionar vários arquivos de uma vez pro modo
 * lote — um só selecionado continua funcionando exatamente como antes. */
export async function pickInputFile(defaultPath?: string | null) {
  return open({
    multiple: true,
    defaultPath: defaultPath ?? undefined,
    filters: [
      { name: "Vídeos e imagens", extensions: [...VIDEO_EXTS, ...IMAGE_EXTS] },
      { name: "Vídeos", extensions: VIDEO_EXTS },
      { name: "Imagens", extensions: IMAGE_EXTS },
    ],
  });
}

/** Diálogo de escolher pasta (não arquivo) — usado pra pasta de destino do
 * modo lote, onde cada item vira um arquivo dentro dela. */
export async function pickOutputFolder(defaultPath?: string | null): Promise<string | null> {
  const result = await open({ directory: true, defaultPath: defaultPath ?? undefined });
  return typeof result === "string" ? result : null;
}

export async function pickSavePath(opts: {
  suggestedName: string;
  extension: string;
  defaultPath?: string | null;
}) {
  return save({
    defaultPath: opts.defaultPath
      ? `${opts.defaultPath}\\${opts.suggestedName}`
      : opts.suggestedName,
    filters: [{ name: opts.extension.toUpperCase(), extensions: [opts.extension] }],
  });
}

export function createProgressChannel(onEvent: (e: ProgressEvent) => void) {
  const channel = new Channel<ProgressEvent>();
  channel.onmessage = onEvent;
  return channel;
}

export async function compressVideo(
  input: string,
  output: string,
  quality: Quality,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("compress_video", { input, output, quality, onProgress: channel });
}

export async function convertFile(
  input: string,
  output: string,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("convert_file", { input, output, onProgress: channel });
}

export async function cancelJob() {
  return invoke("cancel_job");
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function saveSettings(settings: Settings) {
  return invoke("save_settings", { settings });
}

export async function openFile(path: string) {
  return invoke("open_output_file", { path });
}

export async function revealInFolder(path: string) {
  return revealItemInDir(path);
}

export async function getDragIconPath(): Promise<string> {
  return invoke<string>("get_drag_icon_path");
}

/** Inicia um drag nativo do SO a partir de `mousedown` — o arquivo pode ser
 * solto em qualquer outro app (Explorer, WhatsApp, etc), não só dentro da janela. */
export async function startFileDrag(path: string, iconPath: string) {
  return startDrag({ item: [path], icon: iconPath });
}

export async function getMediaDuration(path: string): Promise<number | null> {
  return invoke<number | null>("get_media_duration", { path });
}

export async function compressImage(
  input: string,
  output: string,
  quality: Quality,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("compress_image", { input, output, quality, onProgress: channel });
}

export async function compressVideoToSize(
  input: string,
  output: string,
  targetMb: number,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("compress_video_to_size", { input, output, targetMb, onProgress: channel });
}

export async function extractAudio(
  input: string,
  output: string,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("extract_audio", { input, output, onProgress: channel });
}

export async function transformVideo(
  input: string,
  output: string,
  rotation: Rotation,
  flipHorizontal: boolean,
  flipVertical: boolean,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("transform_video", {
    input,
    output,
    rotation,
    flipHorizontal,
    flipVertical,
    onProgress: channel,
  });
}

export async function trimVideo(
  input: string,
  output: string,
  start: number,
  end: number,
  precise: boolean,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("trim_video", { input, output, start, end, precise, onProgress: channel });
}

export async function extractFrame(
  input: string,
  output: string,
  timestamp: number,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("extract_frame", { input, output, timestamp, onProgress: channel });
}

export async function createGif(
  input: string,
  output: string,
  start: number,
  end: number,
  fps: number,
  width: number,
  onProgress: (e: ProgressEvent) => void,
) {
  const channel = createProgressChannel(onProgress);
  return invoke("create_gif", { input, output, start, end, fps, width, onProgress: channel });
}
