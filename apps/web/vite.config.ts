import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// While developing, Vite serves the screens and passes everything under /api on to the server.
// For use, the screens are built once (npm run build) and the server serves the result itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:8787" } },
  },
  build: { outDir: "dist", sourcemap: true },
});
