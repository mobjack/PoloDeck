import { useEffect, useState } from "react";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

export type WakeLockStatus = "active" | "unsupported" | "unavailable" | "idle";

/**
 * Keeps the screen awake while the page is visible using the Screen Wake Lock API.
 * Re-acquires after the tab becomes visible again (locks drop on visibility change).
 * Returns a status the UI can use to warn when the screen may sleep during a game.
 */
export function useWakeLock(enabled: boolean = true): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() => {
    if (typeof navigator === "undefined") return "idle";
    return (navigator as WakeLockNavigator).wakeLock ? "idle" : "unsupported";
  });

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void sentinel.release();
          sentinel = null;
          return;
        }
        setStatus("active");
        sentinel.addEventListener("release", () => {
          if (!cancelled) setStatus("unavailable");
        });
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) void sentinel.release();
    };
  }, [enabled]);

  return status;
}
