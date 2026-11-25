// Takes the pictures of the tool that the documentation and the website show: docs/images/*.png.
//
//   npm run site:screenshots
//
// The pictures are of the real tool with the training examples in it, so they cannot show something the
// tool does not do. The script starts the tool on a data folder of its own (your data is not touched),
// loads the examples, makes a few changes so that the history has something to show, and photographs each
// address with Chrome. Run it again whenever a screen changes, and commit the pictures.
//
// It needs the built screens (npm run build) and Chrome or Chromium. If Chrome is not where the script
// looks, give its path: CHROME=/path/to/chrome npm run site:screenshots

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findChrome, startChrome } from "./chrome.ts";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "docs/images");
const PORT = 8799;
const base = `http://localhost:${PORT}`;

/** Each picture: its file name, the address it shows, and the size of the window. */
const SHOTS: [name: string, address: string, width: number, height: number][] = [
  ["start", "/#/", 1360, 1000],
  ["risks", "/#/tara/example-kettle/risks/R003", 1440, 860],
  ["treatment", "/#/tara/example-kettle/treatment/R003", 1440, 980],
  ["attack-path", "/#/tara/example-kettle/paths/AP002", 1440, 980],
  ["diagram", "/#/tara/example-gateway/diagram?over=AP003", 1440, 940],
  ["gaps", "/#/tara/example-door-lock/diagram?over=gaps", 1440, 940],
  ["graph", "/#/tara/example-gateway/graph?focus=R003", 1640, 960],
  ["scope", "/#/tara/example-kettle/scope", 1440, 900],
  ["method", "/#/tara/example-kettle/method", 1440, 900],
  ["history", "/#/tara/example-door-lock/controls?panel=history", 1440, 900],
  ["what-is-left", "/#/tara/example-door-lock/treatment?panel=left", 1440, 900],
  ["report", "/api/taras/example-gateway/report", 1240, 1500],
];

const chromePath = findChrome();
if (!chromePath) {
  console.error("Chrome was not found. Give its path: CHROME=/path/to/chrome npm run site:screenshots");
  process.exit(1);
}
if (!existsSync(join(root, "apps/web/dist/index.html"))) {
  console.error("The screens are not built. Run `npm run build` first.");
  process.exit(1);
}

const scratch = await mkdtemp(join(tmpdir(), "tara-screenshots-"));
const server = spawn(process.execPath, ["apps/server/src/main.ts"], {
  cwd: root,
  env: { ...process.env, TARA_DATA_DIR: join(scratch, "data"), PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: "ignore",
});

/** What the tool answers when a TARA is read or changed, as far as this script needs it. */
interface Answer {
  tara: { seq: number };
}

/** Sends a request to the tool as a named person. */
async function call(method: string, path: string, body?: unknown, author = "Ada Example"): Promise<Answer> {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Tara-Author": encodeURIComponent(author) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as Answer;
}

try {
  // Wait until the tool answers.
  for (let attempt = 0; ; attempt++) {
    try {
      await call("GET", "/health");
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  for (const name of ["kettle", "door-lock", "gateway"]) await call("POST", `/examples/${name}`, {});

  // A little work on the door lock, by two people, so that the history and "what is left" have content:
  // the control that was only proposed is built, and a rating is changed.
  const lock = "/taras/example-door-lock";
  let seq = (await call("GET", lock)).tara.seq as number;
  const change = async (author: string, ...changes: unknown[]) => {
    seq = (await call("POST", `${lock}/changes`, { baseSeq: seq, changes }, author)).tara.seq;
  };
  await change("Ada Example", { op: "setControlState", id: "CTL-007", state: "built" });
  await change("Grace Example", { op: "set", kind: "paths", id: "AP003", values: { "factors.expertise": "proficient" } });
  await change("Ada Example", {
    op: "set",
    kind: "controls",
    id: "CTL-007",
    values: { workLink: "https://example.org/tickets/412" },
  });

  await mkdir(out, { recursive: true });
  const chrome = await startChrome({ path: chromePath, profile: join(scratch, "chrome"), port: 9335, width: 1440, height: 900 });
  try {
    // The person in the pictures has said who they are, so the screens show a name and not the request for one.
    await chrome.open(`${base}/`);
    await chrome.inPage(`localStorage.setItem("tara.author", "Ada Example")`);
    for (const [name, address, width, height] of SHOTS) {
      // Twice the density of the window, so that the pictures are sharp on any screen.
      await chrome.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
      await chrome.open("about:blank");
      await chrome.open(`${base}${address}`);
      // Lets the diagram and the embedded report finish drawing.
      await new Promise((done) => setTimeout(done, 1200));
      const shot = (await chrome.command("Page.captureScreenshot", { format: "png" })) as { data: string };
      await writeFile(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
      console.log(`+ docs/images/${name}.png`);
    }
  } finally {
    chrome.process.kill();
  }
} finally {
  server.kill();
  // Chrome may still be closing its profile: try a few times, and leave the folder to the system if it stays.
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
}
