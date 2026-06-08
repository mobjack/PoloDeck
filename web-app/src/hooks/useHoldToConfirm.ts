import { useCallback, useEffect, useRef, useState } from "react";

export interface HoldToConfirm {
  /** 0..1 progress of the current hold. */
  progress: number;
  holding: boolean;
  /** Spread onto the button element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}

/**
 * Press-and-hold gesture for dangerous actions (e.g. the horn). Fires `onComplete`
 * only after the finger is held for `durationMs`; releasing early cancels with no effect.
 */
export function useHoldToConfirm(options: {
  durationMs?: number;
  onComplete: () => void;
  disabled?: boolean;
}): HoldToConfirm {
  const { durationMs = 1000, onComplete, disabled = false } = options;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  const start = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      startRef.current = performance.now();
      setHolding(true);
      const loop = (t: number) => {
        const p = Math.min(1, (t - startRef.current) / durationMs);
        setProgress(p);
        if (p >= 1) {
          rafRef.current = null;
          setHolding(false);
          setProgress(0);
          onCompleteRef.current();
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    },
    [disabled, durationMs]
  );

  useEffect(() => stop, [stop]);

  return {
    progress,
    holding,
    handlers: {
      onPointerDown: start,
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    },
  };
}
