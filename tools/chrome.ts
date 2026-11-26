// A headless Chrome that scripts can drive: used to check the screens (browser-check.ts) and to take the
// pictures for the documentation (screenshots.ts).
//
// There is no browser-automation library here. Chrome is started with its DevTools protocol open, and the
// scripts talk to it over a WebSocket: a few commands are all they need.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Tries something until it works: a program that was just started needs a moment. */
export async function eventually<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 0; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (tries > 60) throw error;
      await sleep(150);
    }
  }
}

/** Where Chrome is, or null. `CHROME` in the environment names it where it is not in a usual place. */
export function findChrome(): string | null {
  const places = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return places.find((place) => place && existsSync(place)) ?? null;
}

/** A running Chrome and the few things a script does with its page. The script that started it ends it, through `process`. */
export interface Chrome {
  process: ChildProcess;
  /** Sends one command of the DevTools protocol and gives its result. */
  command: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Runs an expression in the page and gives its value. */
  inPage: <T>(expression: string) => Promise<T>;
  /** Goes to an address and waits for the page to settle. */
  open: (url: string) => Promise<void>;
  /** What went wrong inside the page so far: errors thrown and errors logged. */
  errors: string[];
}

/** Starts a headless Chrome with a profile of its own, and connects to its one page. */
export async function startChrome(options: {
  path: string;
  profile: string;
  port: number;
  width: number;
  height: number;
}): Promise<Chrome> {
  const child = spawn(
    options.path,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${options.port}`,
      `--user-data-dir=${options.profile}`,
      `--window-size=${options.width},${options.height}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const socket = await eventually(async () => {
    const tabs = (await (await fetch(`http://localhost:${options.port}/json`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    const page = tabs.find((tab) => tab.type === "page");
    if (!page) throw new Error("Chrome has no page yet.");
    const opened = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      opened.onopen = done;
      opened.onerror = fail;
    });
    return opened;
  });

  let lastId = 0;
  const waiting = new Map<number, (message: { result?: Record<string, unknown>; error?: { message?: string } }) => void>();
  const errors: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) waiting.get(message.id)?.(message);
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.exception?.description ?? "an exception");
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(
        message.params.args.map((arg: { value?: unknown; description?: string }) => arg.value ?? arg.description).join(" "),
      );
    }
  };
  const command: Chrome["command"] = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++lastId;
      // A command Chrome refuses is a failure of whoever sent it: a check must not pass on a step that did not happen.
      waiting.set(id, (message) => {
        waiting.delete(id);
        if (message.error) fail(new Error(`Chrome refused ${method}: ${message.error.message ?? "no reason given"}`));
        else done(message.result ?? {});
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const inPage: Chrome["inPage"] = async <T>(expression: string) => {
    const result = (await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as {
      result?: { value?: T };
      exceptionDetails?: unknown;
    };
    if (result.exceptionDetails) throw new Error(`In the page: ${JSON.stringify(result.exceptionDetails)}`);
    return result.result?.value as T;
  };
  const open: Chrome["open"] = async (url) => {
    await inPage(`location.href = ${JSON.stringify(url)}`);
    await sleep(900);
  };
  await command("Runtime.enable");
  return { process: child, command, inPage, open, errors };
}
