import { useEffect, useState } from "react";
import { fetchCapabilities } from "./api";
import type { DeviceCapabilities } from "./types";

export function useCapabilities(apiBase: string) {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      fetchCapabilities(apiBase)
        .then((data) => {
          if (!cancelled) setCapabilities(data);
        })
        .catch(() => {
          /* ignore transient capability errors */
        });
    };

    refresh();
    const id = window.setInterval(refresh, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiBase]);

  return capabilities;
}
