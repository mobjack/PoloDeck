import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TimerView } from "./TimerView";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TimerView />
  </StrictMode>
);
