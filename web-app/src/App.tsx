import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GameDayShell } from "./pages/GameDayShell";
import { GameDayHomeEmpty } from "./pages/GameDayHomeEmpty";
import { GameDayDetail } from "./pages/GameDayDetail";
import { NewGameDay } from "./pages/NewGameDay";
import { EditGameDay } from "./pages/EditGameDay";
import { AddGame } from "./pages/AddGame";
import { EditGame } from "./pages/EditGame";
import { GameRoster } from "./pages/GameRoster";
import { GameSheet } from "./pages/GameSheet";
import { Scoresheet } from "./pages/Scoresheet";
import { ScoreboardControl } from "./pages/ScoreboardControl";
import { TimerController } from "./pages/TimerController";
import { KioskHome } from "./pages/KioskHome";
import { KioskManaged } from "./pages/KioskManaged";
import { KioskScoreboardDisplay } from "./pages/KioskScoreboardDisplay";
import { KioskShotClockDisplay } from "./pages/KioskShotClockDisplay";
import { KioskTimerDisplay } from "./pages/KioskTimerDisplay";
import { KiosksAdmin } from "./pages/KiosksAdmin";
import { LegacyKioskGate } from "./pages/RedirectKioskToManaged";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/kiosk" element={<KioskHome />} />
          <Route path="/kiosk/managed" element={<KioskManaged />} />
          <Route
            path="/kiosk/g/:gameId/display"
            element={
              <LegacyKioskGate>
                <KioskScoreboardDisplay />
              </LegacyKioskGate>
            }
          />
          <Route
            path="/kiosk/g/:gameId/shot-clock"
            element={
              <LegacyKioskGate>
                <KioskShotClockDisplay />
              </LegacyKioskGate>
            }
          />
          <Route
            path="/kiosk/g/:gameId/timer"
            element={
              <LegacyKioskGate>
                <KioskTimerDisplay />
              </LegacyKioskGate>
            }
          />
          <Route path="/game-days/new" element={<NewGameDay />} />
          <Route path="/game-days/:id/edit" element={<EditGameDay />} />
          <Route path="/game-days/:id/games/new" element={<AddGame />} />
          <Route path="/game-days/:id/games/:gameId/edit" element={<EditGame />} />
          <Route path="/game-days/:id/games/:gameId/roster" element={<GameRoster />} />
          <Route path="/game-days/:id/games/:gameId/sheet" element={<GameSheet />} />
          <Route path="/game-days/:id/games/:gameId/scoresheet" element={<Scoresheet />} />
          <Route path="/game-days/:id/games/:gameId/scoreboard" element={<ScoreboardControl />} />
          <Route path="/timer" element={<TimerController />} />
          <Route
            path="/game-days/:id/games/:gameId/timer"
            element={<Navigate to="/timer" replace />}
          />
          <Route path="/" element={<GameDayShell />}>
            <Route index element={<GameDayHomeEmpty />} />
            <Route path="game-days/:id" element={<GameDayDetail />} />
            <Route path="kiosks" element={<KiosksAdmin />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
