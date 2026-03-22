import { useState } from "react";
import { ApiError, isDatabaseUnavailableError } from "../api/client";

/**
 * Full-page friendly UI when PostgreSQL / Prisma can’t be reached.
 */
export function DatabaseUnavailable() {
  return (
    <div className="page database-unavailable-page">
      <div className="database-unavailable-card" role="alert">
        <div className="database-unavailable-icon" aria-hidden>
          <span className="database-unavailable-wave">〰</span>
          <span className="database-unavailable-pool">🛟</span>
        </div>
        <h1 className="database-unavailable-title">The pool deck can’t find the database</h1>
        <p className="database-unavailable-lead">
          PoloDeck needs PostgreSQL running. Right now the server can’t connect—nothing is wrong with
          your browser.
        </p>
        <ul className="database-unavailable-checklist">
          <li>
            <strong>Start Postgres</strong> (e.g. <code>docker compose up -d</code> or your local
            service).
          </li>
          <li>
            <strong>Check the URL</strong> in <code>.env</code> matches where Postgres listens (often{" "}
            <code>localhost:5432</code>).
          </li>
          <li>
            <strong>Restart the API</strong> after the database is up.
          </li>
        </ul>
        <div className="database-unavailable-actions">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
        <p className="database-unavailable-footnote">
          Still stuck? Peek at the server terminal—look for “Can’t reach database” or connection
          errors.
        </p>
      </div>
    </div>
  );
}

function errorMessageString(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/** Heuristic: still show “Database connectivity” layout for raw Prisma messages from older API responses. */
function looksLikeDatabaseConnectivityMessage(msg: string): boolean {
  return (
    /can['’]t reach database server/i.test(msg) ||
    /reach database server at/i.test(msg) ||
    /please make sure your database server is running/i.test(msg) ||
    (/Invalid `.*` invocation/i.test(msg) && /database server|localhost:\d+/i.test(msg)) ||
    (/prisma/i.test(msg) && /5432|database server/i.test(msg))
  );
}

/** Renders {@link DatabaseUnavailable} or a structured error page with copyable details. */
export function ApiErrorDisplay({ error }: { error: unknown }) {
  const [copied, setCopied] = useState(false);

  if (isDatabaseUnavailableError(error)) {
    return <DatabaseUnavailable />;
  }

  const msg = errorMessageString(error);
  const showDbHeading = looksLikeDatabaseConnectivityMessage(msg);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — ignore */
    }
  };

  return (
    <div className="page api-error-page">
      <h2 className="api-error-h2">Error:</h2>
      <h3 className="api-error-h3">
        {showDbHeading ? "Database Connectivity" : "Request failed"}
      </h3>
      <div className="api-error-code-panel">
        <div className="api-error-code-toolbar">
          <span className="api-error-code-label">Details</span>
          <button
            type="button"
            className="btn secondary btn-compact api-error-copy-btn"
            onClick={handleCopy}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="api-error-code-block" tabIndex={0}>
          <code>{msg}</code>
        </pre>
      </div>
    </div>
  );
}

export function formatApiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
