import type { DeviceRole } from "./types";

export interface DeviceSetup {
  serverOrigin: string;
  role: DeviceRole;
}

export interface ResolvedConfig {
  apiBase: string;
  socketUrl: string;
  setup: DeviceSetup;
}

const STORAGE_KEY = "polodeck-arena-setup";

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function defaultServerOrigin(): string {
  const fromEnv =
    import.meta.env.VITE_DEFAULT_SERVER?.trim() ||
    import.meta.env.VITE_SOCKET_URL?.trim() ||
    "http://localhost:3000";
  return trimSlash(fromEnv);
}

export function rolePath(role: DeviceRole): string {
  if (role === "TIMER") return "/timer.html";
  if (role === "SHOT_CLOCK") return "/shot-clock.html";
  return "/";
}

function defaultRoleForPath(pathname: string): DeviceRole {
  if (pathname.endsWith("/timer.html")) return "TIMER";
  if (pathname.endsWith("/shot-clock.html")) return "SHOT_CLOCK";
  return "SCOREBOARD";
}

function parseDeviceRole(value: string | null | undefined): DeviceRole | null {
  if (value === "SCOREBOARD" || value === "TIMER" || value === "SHOT_CLOCK") {
    return value;
  }
  return null;
}

export function loadDeviceSetup(): DeviceSetup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceSetup>;
    const role = parseDeviceRole(parsed.role);
    if (!role || typeof parsed.serverOrigin !== "string" || parsed.serverOrigin.trim() === "") {
      return null;
    }
    return { role, serverOrigin: trimSlash(parsed.serverOrigin.trim()) };
  } catch {
    return null;
  }
}

export function saveDeviceSetup(setup: DeviceSetup): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      role: setup.role,
      serverOrigin: trimSlash(setup.serverOrigin),
    })
  );
}

export function hasStoredSetup(): boolean {
  return loadDeviceSetup() != null;
}

export function resolveConfig(): ResolvedConfig {
  const params = new URLSearchParams(window.location.search);

  const overrideServer = params.get("server")?.trim();
  const overrideRole = parseDeviceRole(params.get("role")?.trim() ?? null);

  const persisted = loadDeviceSetup();
  const setup: DeviceSetup = {
    serverOrigin: trimSlash(overrideServer || persisted?.serverOrigin || defaultServerOrigin()),
    role: overrideRole || persisted?.role || defaultRoleForPath(window.location.pathname),
  };

  const apiBaseFromQuery = params.get("apiBase")?.trim();
  const socketFromQuery = params.get("socketUrl")?.trim();

  const apiBase =
    apiBaseFromQuery || import.meta.env.VITE_API_URL?.trim() || `${setup.serverOrigin}/api`;
  const socketUrl = socketFromQuery || import.meta.env.VITE_SOCKET_URL?.trim() || setup.serverOrigin;

  return {
    setup,
    apiBase: trimSlash(apiBase).endsWith("/api") ? trimSlash(apiBase) : `${trimSlash(apiBase)}/api`,
    socketUrl: trimSlash(socketUrl),
  };
}

export function shouldOpenSetup(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("setup") === "1";
}
