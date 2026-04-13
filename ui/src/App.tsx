import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GameDayList } from "./pages/GameDayList";
import { GameDayDetail } from "./pages/GameDayDetail";
import { NewGameDay } from "./pages/NewGameDay";
import { EditGameDay } from "./pages/EditGameDay";
import { AddGame } from "./pages/AddGame";
import { EditGame } from "./pages/EditGame";
import { GameRoster } from "./pages/GameRoster";
import { GameSheet } from "./pages/GameSheet";
import { ScoreboardControl } from "./pages/ScoreboardControl";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<GameDayList />} />
          <Route path="/game-days/new" element={<NewGameDay />} />
          <Route path="/game-days/:id" element={<GameDayDetail />} />
          <Route path="/game-days/:id/edit" element={<EditGameDay />} />
          <Route path="/game-days/:id/games/new" element={<AddGame />} />
          <Route path="/game-days/:id/games/:gameId/edit" element={<EditGame />} />
          <Route path="/game-days/:id/games/:gameId/roster" element={<GameRoster />} />
          <Route path="/game-days/:id/games/:gameId/sheet" element={<GameSheet />} />
          <Route path="/game-days/:id/games/:gameId/scoreboard" element={<ScoreboardControl />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
