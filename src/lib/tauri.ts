import { invoke, Channel } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { ProgressEvent, Quality, Settings } from "../types";
import { IMAGE_EXTS, VIDEO_EXTS } from "./formats";

export async function pickInputFile(defaultPath?: string | null) {
  return open({
    multiple: false,
    defaultPath: defaultPath ?? undefined,
    filters: [
      { name: "Vídeos e imagens", extensions: [...VIDEO_EXTS, ...IMAGE_EXTS] },
      { name: "Vídeos", extensions: VIDEO_EXTS },
      { name: "Imagens", extensions: IMAGE_EXTS },
    ],
  });
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

export async function showSuccess(title: string, text: string) {
  return message(text, { title, kind: "info" });
}

export async function showError(title: string, text: string) {
  return message(text, { title, kind: "error" });
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
