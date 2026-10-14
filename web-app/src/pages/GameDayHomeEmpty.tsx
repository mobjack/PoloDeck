export function GameDayHomeEmpty() {
  return (
    <div className="game-day-shell-placeholder">
      <div className="game-day-shell-placeholder-mark" aria-hidden>
        PD
      </div>
      <div>
        <span className="game-day-shell-placeholder-kicker">Ready on local WiFi</span>
        <p className="game-day-shell-placeholder-title">Run the game from the deck</p>
        <p className="game-day-shell-placeholder-hint">
          Choose a game day to manage its schedule, operators, and displays—or create a new one to
          get started.
        </p>
      </div>
    </div>
  );
}
