import { Navigate, useSearchParams } from "react-router-dom";

/**
 * Legacy per-game browser display URLs redirect to server-managed mode.
 * Add ?legacy=1 for a fixed-game preview in a desktop browser.
 */
export function LegacyKioskGate({ children }: { children: React.ReactNode }) {
  const [search] = useSearchParams();
  if (search.get("legacy") !== "1") {
    return <Navigate to="/kiosk/managed" replace />;
  }
  return <>{children}</>;
}
