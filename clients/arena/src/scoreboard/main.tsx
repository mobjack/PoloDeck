import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScoreboardView } from "./ScoreboardView";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScoreboardView />
  </StrictMode>
);
