import { networkInterfaces } from "node:os";

/** Best-effort primary non-internal IPv4 address for LAN display. */
export function detectLanIPv4(): string | null {
  const nets = networkInterfaces();
  const candidates: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family !== "IPv4" && (e.family as string) !== "4") continue;
      if (e.internal) continue;
      candidates.push(e.address);
    }
  }
  // Prefer common private ranges
  const preferred = candidates.find(
    (a) =>
      a.startsWith("192.168.") ||
      a.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(a)
  );
  return preferred ?? candidates[0] ?? null;
}

export function listLanIPv4(): string[] {
  const nets = networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family !== "IPv4" && (e.family as string) !== "4") continue;
      if (e.internal) continue;
      out.push(e.address);
    }
  }
  return out;
}
