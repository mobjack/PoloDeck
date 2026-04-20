import { useEffect, useState } from "react";
import { formatMmSs, getEffectiveRemainingMs, type ClockLike } from "./clock";

/** Re-renders periodically while clock is running so display stays smooth. */
export function TickClock({
  clock,
  className,
}: {
  clock: ClockLike | null | undefined;
  className?: string;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!clock?.running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [clock?.running]);

  if (!clock) return <span className={className}>—</span>;
  const ms = getEffectiveRemainingMs(clock);
  return <span className={className}>{formatMmSs(ms)}</span>;
}
