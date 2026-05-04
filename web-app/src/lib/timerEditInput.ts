/**
 * Pre-fill the game time field to match the main timer display:
 * - Under 1:00: one decimal of seconds (e.g. 32.1)
 * - Otherwise: m:ss or m:ss.s
 */
export function formatGameTimeForInput(remainingMs: number): string {
  const s = Math.max(0, remainingMs) / 1000;
  if (s < 60) {
    return s.toFixed(1);
  }
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (r < 10) {
    return `${m}:0${r.toFixed(1)}`;
  }
  return `${m}:${r.toFixed(1)}`;
}

/**
 * Parse user input to remaining ms. Accepts:
 * - `38.2` — seconds (tenths)
 * - `1:32` or `0:32.1` — minutes : seconds
 */
export function parseGameTimeInputToMs(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":");
    if (parts.length < 2) return null;
    const min = parseInt(parts[0]!.trim(), 10);
    const sec = parseFloat(parts[1]!.replace(",", "."));
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(sec) || sec < 0) {
      return null;
    }
    return Math.round((min * 60 + sec) * 1000);
  }
  const sec = parseFloat(t.replace(",", "."));
  if (!Number.isFinite(sec) || sec < 0) {
    return null;
  }
  return Math.round(sec * 1000);
}

/** Whole seconds for shot (0–99); returns ms. */
export function parseShotSecondsInputToMs(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    return null;
  }
  return n * 1000;
}

export function formatShotSecondsForInput(remainingMs: number): string {
  const s = Math.max(0, remainingMs) / 1000;
  return String(Math.min(99, Math.max(0, Math.round(s - 1e-9))));
}
