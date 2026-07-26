import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from &&
    typeof (location.state as { from?: string }).from === "string"
      ? (location.state as { from: string }).from
      : "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onRecovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.recoveryReset({
        recoveryCode,
        username,
        newPassword,
      });
      await api.auth.login(username, newPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page setup-page">
      <header className="setup-header">
        <p className="setup-brand">PoloDeck</p>
        <h1>Sign in</h1>
      </header>
      {error ? (
        <div className="setup-error">
          <ApiErrorDisplay error={error} />
        </div>
      ) : null}

      {!showRecovery ? (
        <form className="setup-card" onSubmit={(e) => void onSubmit(e)}>
          <label className="setup-label">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="setup-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" className="setup-linkish" onClick={() => setShowRecovery(true)}>
            Forgot password?
          </button>
        </form>
      ) : (
        <form className="setup-card" onSubmit={(e) => void onRecovery(e)}>
          <h2>Reset with recovery code</h2>
          <p>Use the recovery code saved during setup. No internet email is required.</p>
          <label className="setup-label">
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="setup-label">
            Recovery code
            <input value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} />
          </label>
          <label className="setup-label">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={busy || newPassword.length < 8}>
            Reset and sign in
          </button>
          <button type="button" className="setup-linkish" onClick={() => setShowRecovery(false)}>
            Back to sign in
          </button>
        </form>
      )}
      <p className="setup-hint">
        <Link to="/">Back</Link>
      </p>
    </div>
  );
}
