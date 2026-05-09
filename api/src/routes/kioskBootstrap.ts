import type { FastifyInstance, FastifyRequest } from "fastify";

import { env } from "../config/env.js";

/** Published UI port (docker compose maps host 8080 → nginx in web-app). */
const UI_PORT = 8080;

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** LAN hostname or IP for URLs embedded in the installer (never trust blindly for shell). */
function publicHost(request: FastifyRequest, q: Record<string, string | undefined>): string {
  const fromQuery = q.host?.toString().trim();
  if (fromQuery && /^[a-zA-Z0-9.\-:]+$/.test(fromQuery)) {
    return fromQuery.split(":")[0] ?? fromQuery;
  }
  const h = request.hostname;
  return h && h.length > 0 ? h : "localhost";
}

/** Apt-Cacher NG base URL for Pi bootstrap (--apt-proxy); query overrides POLODECK_PI_APT_PROXY. */
function validateAptProxyUrl(raw: string | string[] | undefined): string | undefined {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return v.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function validateGameId(raw: string | string[] | undefined): string | undefined {
  const id = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim();
  if (!id || id.length < 8 || id.length > 64) return undefined;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return undefined;
  return id;
}

type KioskRole = "SETUP" | "SCOREBOARD" | "SHOT_CLOCK" | "TIMER";

function parseKioskRole(
  raw: string | string[] | undefined
): { ok: true; role: KioskRole } | { ok: false; message: string } {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim().toLowerCase() ?? "";
  if (v === "" || v === "setup") return { ok: true, role: "SETUP" };
  if (v === "board") return { ok: true, role: "SCOREBOARD" };
  if (v === "clock") return { ok: true, role: "SHOT_CLOCK" };
  if (v === "timer") return { ok: true, role: "TIMER" };
  return {
    ok: false,
    message:
      "Invalid kiosk query. Use kiosk=setup (default), kiosk=board, kiosk=clock, kiosk=timer. Optional: gameId=<id>. Example: /kb?kiosk=clock&gameId=...\n",
  };
}

function buildKioskChromiumUrl(opts: {
  host: string;
  role: KioskRole;
  gameId?: string;
}): string {
  const origin = `http://${opts.host}:${UI_PORT}`;
  if (opts.role === "SETUP") {
    return `${origin}/kiosk/setup-screen.html`;
  }
  const gid = opts.gameId;
  if (!gid) {
    return `${origin}/kiosk`;
  }
  if (opts.role === "SCOREBOARD") return `${origin}/kiosk/g/${gid}/display`;
  if (opts.role === "SHOT_CLOCK") return `${origin}/kiosk/g/${gid}/shot-clock`;
  return `${origin}/kiosk/g/${gid}/timer`;
}

/**
 * Pi kiosk installer stub.
 *
 * GET /kb — optional query:
 *   host=<ip-or-dns>   override hostname when curl Host header is wrong
 *   kiosk=setup|board|clock|timer   (default: setup — static setup screen)
 *   gameId=<id>        with board|clock|timer, open that game’s display route
 *   aptProxy=<url>     Apt-Cacher NG base URL (http://cache:3142); overrides POLODECK_PI_APT_PROXY
 *
 * Examples:
 *   curl -fsSL 'http://LAN:3000/kb' | sudo bash
 *   curl -fsSL 'http://LAN:3000/kb?kiosk=board&gameId=...' | sudo bash
 *   curl -fsSL 'http://LAN:3000/kb?aptProxy=http://192.168.1.5:3142' | sudo bash
 */
export async function registerKioskBootstrapRoutes(app: FastifyInstance) {
  app.get("/kb", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const parsed = parseKioskRole(q.kiosk);
    if (!parsed.ok) {
      return reply.status(400).type("text/plain; charset=utf-8").send(parsed.message);
    }
    const host = publicHost(request, q);
    const gameId = validateGameId(q.gameId);
    const role = parsed.role;

    const webOrigin = `http://${host}:${UI_PORT}`;
    const artifactsBase = `${webOrigin.replace(/\/$/, "")}/kiosk`;
    const kioskUrl = buildKioskChromiumUrl({ host, role, gameId });
    const bootUrl = `${artifactsBase}/bootstrap-kiosk.sh`;
    const aptProxy = validateAptProxyUrl(q.aptProxy) ?? env.POLODECK_PI_APT_PROXY;

    const lines = [
      "#!/usr/bin/env bash",
      "# PoloDeck Pi kiosk — from GET /kb (web UI :8080; API :3000)",
      "set -euo pipefail",
      `curl -fsSL ${shellSingleQuote(bootUrl)} -o /tmp/polodeck-bootstrap.sh`,
      `exec bash /tmp/polodeck-bootstrap.sh -- \\`,
      `  --artifacts-base ${shellSingleQuote(artifactsBase)} \\`,
    ];
    if (aptProxy) {
      lines.push(`  --apt-proxy ${shellSingleQuote(aptProxy)} \\`);
    }
    lines.push(`  --url ${shellSingleQuote(kioskUrl)}`, "");
    const body = lines.join("\n");

    return reply
      .header("Content-Type", "text/x-shellscript; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(body);
  });
}
