import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Plain CSS + es2019 target: runs on old Android System WebView (Redmi 8 / Android 9+).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", target: "es2019", cssTarget: "chrome70", chunkSizeWarningLimit: 2000 },
});
