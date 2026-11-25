// Starts the TARA workbench: the API under /api and, beside it, the built screens.
//
//   node apps/server/src/main.ts
//
// Settings come from the environment (config.ts, docs/deployment.md). With none, the tool listens on
// http://127.0.0.1:8787, reachable from this machine only, and keeps its data in ./data.

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { FileStore } from "@tara/store";
import { createApp } from "./app.ts";
import { isLoopback, readConfig } from "./config.ts";
import { loadExamples, loadMethods } from "./library.ts";
import { TOOL_NAME, TOOL_VERSION, WRITER } from "./version.ts";

const config = readConfig();
await mkdir(config.dataDir, { recursive: true });
const store = new FileStore(config.dataDir, { writer: WRITER });
const app = createApp({ store, config, methods: await loadMethods(config), examples: await loadExamples(config) });

// The screens are plain files, built once (npm run build). Their names carry a fingerprint of their
// content, so a browser may keep them for good; the page itself is always asked for again.
if (existsSync(join(config.webDist, "index.html"))) {
  const root = relative(process.cwd(), config.webDist) || ".";
  app.use(
    "*",
    serveStatic({
      root,
      onFound: (path, c) => {
        c.header("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }),
  );
} else {
  app.get("/", (c) =>
    c.html(
      `<!doctype html><meta charset="utf-8"><title>TARA workbench</title><body style="font: 16px/1.5 system-ui; max-width: 40rem; margin: 15vh auto; padding: 0 1rem">
       <h1 style="font-size: 1.4rem">The screens are not built yet</h1>
       <p>The API is running. Build the screens once with <code>npm run build</code> and start again,
       or run <code>npm run dev</code> while working on them.</p></body>`,
    ),
  );
}

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (address) => {
  console.log(`${TOOL_NAME} ${TOOL_VERSION}`);
  if (isLoopback(config.host)) {
    console.log(`  open      http://localhost:${address.port}`);
  } else {
    console.log(`  listening on ${config.host}, port ${address.port}`);
  }
  console.log(`  data      ${config.dataDir}`);
  if (!isLoopback(config.host)) {
    console.log("  note      The tool can be reached from the network and has no sign-in of its own.");
    console.log("            Put it behind a reverse proxy that signs people in (docs/deployment.md).");
    if (config.allowedHosts.length === 0) {
      console.log("            Set TARA_ALLOWED_HOSTS to the name it is reached by.");
    }
  }
});

// Stop cleanly when asked to, so that a change in progress is finished and not cut off.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
