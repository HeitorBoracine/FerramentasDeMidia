export type FileKind = "video" | "imagem";

export interface FileInfo {
  path: string;
  name: string;
  kind: FileKind;
}

export type Quality = "alta" | "media" | "baixa";

export const QUALITY_LABELS: Record<Quality, string> = {
  alta: "Alta (menos compressão)",
  media: "Média",
  baixa: "Baixa (mais compressão)",
};

/** Espelha o enum `ProgressEvent` em src-tauri/src/ffmpeg/mod.rs. */
export type ProgressEvent =
  | { type: "progress"; percent: number }
  | {
      type: "done";
      destPath: string;
      beforeBytes: number | null;
      afterBytes: number | null;
    }
  | { type: "error"; message: string }
  | { type: "cancelled" };

export type JobKind = "compress" | "convert";

export interface JobStatus {
  state: "idle" | "running" | "success" | "error" | "cancelled";
  kind: JobKind | null;
  percent: number;
  message: string;
}

export interface Settings {
  lastOpenDir: string | null;
  lastSaveDir: string | null;
}
