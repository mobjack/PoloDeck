import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, type SetupStatus } from "../api/client";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

type Step = "account" | "name" | "network" | "confirm" | "recovery";

export function SetupWizard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("account");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [installName, setInstallName] = useState("");
  const [networkAccess, setNetworkAccess] = useState<"LOCAL_ONLY" | "LAN">("LAN");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.setup
      .status()
      .then(setStatus)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page setup-page">
        <p>Checking PoloDeck setup…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page setup-page">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (status?.setupComplete && !recoveryCode) {
    return <Navigate to="/" replace />;
  }
  if (status && !status.requireSetup && !status.setupComplete && !recoveryCode) {
    // Docker/dev: setup optional — send home
    return <Navigate to="/" replace />;
  }

  const lan = status?.primaryLanAddress;
  const port = status?.uiPort ?? 8080;
  const shareUrl = lan ? `http://${lan}:${port}` : `http://localhost:${port}`;

  async function finish() {
    if (password !== password2) {
      setError(new Error("Passwords do not match."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.setup.complete({
        username,
        password,
        installName,
        networkAccess,
      });
      setRecoveryCode(result.recoveryCode);
      setStatus(result.status);
      setStep("recovery");
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page setup-page">
      <header className="setup-header">
        <p className="setup-brand">PoloDeck</p>
        <h1>Set up this computer</h1>
        <p className="setup-sub">
          A few quick choices so coaches and scoreboards can get to work.
        </p>
      </header>

      {error ? (
        <div className="setup-error">
          <ApiErrorDisplay error={error} />
        </div>
      ) : null}

      {step === "account" && (
        <section className="setup-card">
          <h2>Create the administrator</h2>
          <p>You will use this account to manage games and scoreboards.</p>
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
              autoComplete="new-password"
            />
          </label>
          <label className="setup-label">
            Confirm password
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            type="button"
            disabled={username.length < 3 || password.length < 8}
            onClick={() => {
              setError(null);
              if (password !== password2) {
                setError(new Error("Passwords do not match."));
                return;
              }
              setStep("name");
            }}
          >
            Continue
          </button>
        </section>
      )}

      {step === "name" && (
        <section className="setup-card">
          <h2>Name this PoloDeck</h2>
          <p>For example, your school or pool name.</p>
          <label className="setup-label">
            Name
            <input
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              placeholder="Westside High Pool"
            />
          </label>
          <div className="setup-actions">
            <button type="button" onClick={() => setStep("account")}>
              Back
            </button>
            <button
              type="button"
              disabled={installName.trim().length < 1}
              onClick={() => setStep("network")}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === "network" && (
        <section className="setup-card">
          <h2>Who can connect?</h2>
          <label className="setup-radio">
            <input
              type="radio"
              checked={networkAccess === "LOCAL_ONLY"}
              onChange={() => setNetworkAccess("LOCAL_ONLY")}
            />
            <span>
              <strong>This computer only</strong>
              <br />
              Only browsers on this computer can open PoloDeck.
            </span>
          </label>
          <label className="setup-radio">
            <input
              type="radio"
              checked={networkAccess === "LAN"}
              onChange={() => setNetworkAccess("LAN")}
            />
            <span>
              <strong>Allow scoreboards and controllers on this network</strong>
              <br />
              Phones, tablets, and Raspberry Pi scoreboards on the same Wi‑Fi can connect.
            </span>
          </label>
          <div className="setup-actions">
            <button type="button" onClick={() => setStep("name")}>
              Back
            </button>
            <button type="button" onClick={() => setStep("confirm")}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === "confirm" && (
        <section className="setup-card">
          <h2>Confirm</h2>
          <ul className="setup-summary">
            <li>
              Administrator: <strong>{username}</strong>
            </li>
            <li>
              Name: <strong>{installName}</strong>
            </li>
            <li>
              Access:{" "}
              <strong>
                {networkAccess === "LAN"
                  ? "Scoreboards and controllers on this network"
                  : "This computer only"}
              </strong>
            </li>
            {networkAccess === "LAN" ? (
              <li>
                Others should open: <code>{shareUrl}</code>
              </li>
            ) : null}
          </ul>
          {networkAccess === "LAN" ? (
            <p className="setup-hint">
              Connect a Raspberry Pi scoreboard with:{" "}
              <code>{`curl -fsSL 'http://${lan ?? "<this-computer-address>"}:${port}/kb' | sudo bash`}</code>
            </p>
          ) : null}
          <div className="setup-actions">
            <button type="button" onClick={() => setStep("network")}>
              Back
            </button>
            <button type="button" disabled={submitting} onClick={() => void finish()}>
              {submitting ? "Saving…" : "Finish setup"}
            </button>
          </div>
        </section>
      )}

      {step === "recovery" && recoveryCode && (
        <section className="setup-card">
          <h2>Save your recovery code</h2>
          <p>
            If you forget the administrator password, you can reset it with this code. Store it
            somewhere safe — PoloDeck cannot email it to you.
          </p>
          <pre className="setup-recovery">{recoveryCode}</pre>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(recoveryCode);
            }}
          >
            Copy code
          </button>
          <button type="button" onClick={() => navigate("/", { replace: true })}>
            Open PoloDeck
          </button>
          {networkAccess === "LAN" ? (
            <p className="setup-hint">
              If scoreboards cannot connect yet, restart PoloDeck from the Applications menu or
              wait a moment for the service to reload network settings.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
