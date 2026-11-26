// How the screens are served while developing, and how they are built.
//
// While developing, Vite serves the screens and passes everything under /api on to the server (WEB_PORT and
// API_URL say where, if not at their usual places). For use, the screens are built once (npm run build) and
// the server serves the result itself.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The configuration Vite reads. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:8787" } },
  },
  build: { outDir: "dist", sourcemap: true },
});
