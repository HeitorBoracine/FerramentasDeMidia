import type { FileKind } from "../types";

export const VIDEO_EXTS = [
  "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "mpeg", "mpg", "m4v", "3gp",
];

export const IMAGE_EXTS = [
  "png", "jpg", "jpeg", "bmp", "gif", "tiff", "tif", "webp",
];

export const VIDEO_FORMATOS = ["MP4", "MKV", "AVI", "MOV", "WEBM", "WMV", "FLV"];
export const IMAGE_FORMATOS = ["PNG", "JPG", "BMP", "WEBP", "TIFF", "GIF"];

export function tipoArquivo(path: string): FileKind | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (IMAGE_EXTS.includes(ext)) return "imagem";
  return null;
}

export function extensaoAtual(path: string): string {
  return (path.split(".").pop() ?? "").toLowerCase();
}

/** Formatos de destino disponíveis pra um arquivo, excluindo a extensão atual. */
export function formatosDestino(path: string, kind: FileKind): string[] {
  const atual = extensaoAtual(path);
  const lista = kind === "video" ? VIDEO_FORMATOS : IMAGE_FORMATOS;
  const opcoes = lista.filter((f) => f.toLowerCase() !== atual);
  return opcoes.length > 0 ? opcoes : lista;
}

export function nomeBase(path: string): string {
  const nome = path.split(/[\\/]/).pop() ?? path;
  const idx = nome.lastIndexOf(".");
  return idx > 0 ? nome.slice(0, idx) : nome;
}

export function nomeArquivo(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function pastaDe(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx > 0 ? path.slice(0, idx) : path;
}
