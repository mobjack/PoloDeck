import { useEffect, useRef } from "react";
import type { KioskDevice } from "../api/client";
import { createGameSocket } from "../lib/socketUrl";
import { getOrCreateKioskClientId } from "./useKioskDeviceCheckIn";

/** Push assignment changes from server (live game, activate) without waiting for HTTP poll. */
export function useKioskAssignmentSocket(onDevice: (device: KioskDevice) => void) {
  const onDeviceRef = useRef(onDevice);
  onDeviceRef.current = onDevice;

  useEffect(() => {
    const clientId = getOrCreateKioskClientId();
    const socket = createGameSocket();

    const register = () => {
      socket.emit("device:register", { clientId });
    };

    socket.on("connect", register);
    register();

    socket.on("device:updated", (payload: { device: KioskDevice }) => {
      if (payload.device.clientId === clientId) {
        onDeviceRef.current(payload.device);
      }
    });

    return () => {
      socket.off("connect", register);
      socket.disconnect();
    };
  }, []);
}
