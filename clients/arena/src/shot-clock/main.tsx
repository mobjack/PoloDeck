import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShotClockView } from "./ShotClockView";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShotClockView />
  </StrictMode>
);
