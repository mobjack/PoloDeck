import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        timer: path.resolve(__dirname, "timer.html"),
        shotclock: path.resolve(__dirname, "shot-clock.html"),
      },
    },
  },
});
