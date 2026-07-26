import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, type AuthUser, type SetupStatus } from "../api/client";

/**
 * For operator UI routes: redirect to /setup when required, or /login when auth is enabled.
 * Kiosk routes should not wrap with this component.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.setup.status(), api.auth.me()])
      .then(([s, me]) => {
        if (cancelled) return;
        setStatus(s);
        setUser(me.user);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
        setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="page">
        <p>Loading…</p>
      </div>
    );
  }

  if (status?.requireSetup && !status.setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (status?.authEnabled && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
