// Starts everything needed to work on the tool: the server, restarted when its code changes, and Vite, which
// serves the screens and reloads them as they are edited.
//
//   npm run dev        then open http://localhost:5173
//
// Both stop together when this is stopped.

import { type ChildProcess, spawn } from "node:child_process";

const children: ChildProcess[] = [];
const start = (name: string, command: string, args: string[]) => {
  const child = spawn(command, args, { stdio: "inherit" });
  child.on("exit", (code) => {
    // One has stopped: stop the other, and end with its result.
    for (const other of children) if (other !== child) other.kill();
    if (code) console.error(`${name} stopped with code ${code}.`);
    process.exit(code ?? 0);
  });
  children.push(child);
};

start("server", process.execPath, ["--watch", "apps/server/src/main.ts"]);
start("screens", "npm", ["run", "dev", "--workspace", "@tara/web"]);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const child of children) child.kill();
  });
}
