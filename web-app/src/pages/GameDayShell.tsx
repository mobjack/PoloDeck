import { useEffect, useMemo, useState } from "react";
import { MessageCircleQuestionMark } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { api, type DeviceCapabilities } from "../api/client";
import type { GameDay } from "../types/gameDay";
import { ApiErrorDisplay } from "../components/DatabaseUnavailable";

export function GameDayShell() {
  const [list, setList] = useState<GameDay[]>([]);
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.gameDays.list(), api.capabilities()])
      .then(([gameDays, caps]) => {
        setList(gameDays);
        setCapabilities(caps);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshCapabilities = () => {
      api
        .capabilities()
        .then((caps) => {
          if (!cancelled) setCapabilities(caps);
        })
        .catch(() => {
          /* keep last good snapshot on transient errors */
        });
    };

    const id = window.setInterval(refreshCapabilities, 6000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshCapabilities();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGuideOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guideOpen]);

  const sortedDays = useMemo(() => {
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [list]);

  if (loading) {
    return (
      <div className="page page--shell">
        <p>Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page page--shell">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }

  return (
    <div className="page page--shell">
      <header className="page-header page-header--client-status game-day-shell-header">
        <div className="game-day-shell-header-text">
          <h1>Water Polo Deck Manager</h1>
          <div className="client-status-line">
            <span
              className="client-status-item"
              title={capabilities?.hasScoreboard ? "Scoreboard connected" : "Scoreboard not connected"}
            >
              Scoreboard{" "}
              <span
                className={`client-dot ${capabilities?.hasScoreboard ? "client-dot-on" : "client-dot-off"}`}
                aria-hidden
              />
            </span>
            <span
              className="client-status-item"
              title={capabilities?.hasTimer ? "Timer connected" : "Timer not connected"}
            >
              Timer{" "}
              <span
                className={`client-dot ${capabilities?.hasTimer ? "client-dot-on" : "client-dot-off"}`}
                aria-hidden
              />
            </span>
            <span
              className="client-status-item"
              title={
                capabilities?.hasShotClock
                  ? `${capabilities.shotClockCount} shot clock(s) connected`
                  : "Shot clocks not connected"
              }
            >
              Shot clocks
              {capabilities?.hasShotClock && capabilities.shotClockCount > 1
                ? ` (${capabilities.shotClockCount})`
                : ""}{" "}
              <span
                className={`client-dot ${capabilities?.hasShotClock ? "client-dot-on" : "client-dot-off"}`}
                aria-hidden
              />
            </span>
          </div>
        </div>
        <button
          type="button"
          className="game-day-shell-help-btn"
          onClick={() => setGuideOpen(true)}
          aria-label="Open user guide"
          title="User guide"
        >
          <MessageCircleQuestionMark size={22} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="game-day-shell-layout">
        <aside className="game-day-shell-sidebar" aria-label="Game days">
          <h2 className="game-day-shell-sidebar-title">Game days</h2>
          <NavLink to="/game-days/new" className="btn primary game-day-shell-new-btn">
            New game day
          </NavLink>
          <ul className="game-day-shell-list">
            {sortedDays.length === 0 ? (
              <li className="game-day-shell-empty">No game days yet. Create one to get started.</li>
            ) : (
              sortedDays.map((gd) => (
                <li key={gd.id}>
                  <NavLink
                    to={`/game-days/${gd.id}`}
                    className={({ isActive }) =>
                      `game-day-shell-link${isActive ? " game-day-shell-link--active" : ""}`
                    }
                  >
                    <span className="game-day-shell-link-date">{gd.date}</span>
                    <span className="game-day-shell-link-location">{gd.location}</span>
                    <span className="game-day-shell-link-count">{gd.games.length} games</span>
                  </NavLink>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="game-day-shell-main" aria-live="polite">
          <Outlet />
        </main>
      </div>

      {guideOpen ? (
        <div
          className="modal-backdrop user-guide-modal-backdrop"
          role="presentation"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="modal user-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-guide-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="user-guide-modal-header">
              <h2 id="user-guide-dialog-title" className="user-guide-modal-heading">
                User guide
              </h2>
              <button
                type="button"
                className="btn secondary user-guide-modal-close"
                onClick={() => setGuideOpen(false)}
              >
                Close
              </button>
            </div>
            <ul className="user-guide-list user-guide-list--modal">
              <li>
                Create a <strong>game day</strong> (date and location) with <strong>New game day</strong>.
              </li>
              <li>
                Select a day on the left to <strong>add games</strong>, set timing, and edit rosters.
              </li>
              <li>
                Use <strong>Roster</strong> on each game to enter or import player names by cap number.
              </li>
              <li>
                Connect <strong>scoreboard</strong>, <strong>timer</strong>, and <strong>shot clock</strong> clients to
                the server; status appears above.
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
