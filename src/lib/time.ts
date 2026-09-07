/** Converte "mm:ss" ou "h:mm:ss" pra segundos. `null` se o texto for inválido. */
export function parseTimecode(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) {
    return null;
  }
  const nums = parts.map(Number);
  let seconds = 0;
  for (const n of nums) {
    seconds = seconds * 60 + n;
  }
  return seconds >= 0 ? seconds : null;
}

/** Converte segundos pra "mm:ss" (ou "h:mm:ss" se passar de 1h). */
export function formatTimecode(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
