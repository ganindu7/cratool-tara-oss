// How this installation is set up. Everything comes from the environment; nothing is read from a file in
// the repository, so the same code runs on a laptop, on a team server and in a container (docs/deployment.md).

import { resolve } from "node:path";

export interface Config {
  /** The data folder: where every TARA lives (TARA_DATA_DIR). */
  dataDir: string;
  /** The address the server listens on (HOST) and its port (PORT). 127.0.0.1 means: this machine only. */
  host: string;
  port: number;
  /**
   * The host names the tool may be reached by (TARA_ALLOWED_HOSTS, comma-separated). A request that names
   * another host is refused. This stops a web page elsewhere from talking to the tool through the browser.
   */
  allowedHosts: string[];
  /**
   * The request header in which a reverse proxy that signs people in passes on their name (TARA_USER_HEADER,
   * for example "X-Forwarded-User"). When set, the name people give in the tool itself is ignored.
   */
  userHeader: string | null;
  /** The folder of the built screens (TARA_WEB_DIST). */
  webDist: string;
  /** The folders of the scoring methods and the examples that come with the tool. */
  methodsDir: string;
  examplesDir: string;
}

/** The names under which a machine reaches itself. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
export const isLoopback = (host: string): boolean => host === "127.0.0.1" || host === "::1" || host === "localhost";

/** The root of the repository, from this file's place in it. */
const repository = (path: string): string => resolve(import.meta.dirname, "../../..", path);

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.HOST?.trim() || "127.0.0.1";
  const named = (env.TARA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return {
    dataDir: resolve(env.TARA_DATA_DIR?.trim() || repository("data")),
    host,
    port: Number(env.PORT) || 8787,
    // Reachable from this machine only: only its own names are accepted. Opened to a network: the names
    // given, or any name if none is given (then the reverse proxy in front decides what reaches the tool).
    allowedHosts: named.length > 0 ? [...LOOPBACK_HOSTS, ...named] : isLoopback(host) ? LOOPBACK_HOSTS : [],
    userHeader: env.TARA_USER_HEADER?.trim() || null,
    webDist: resolve(env.TARA_WEB_DIST?.trim() || repository("apps/web/dist")),
    methodsDir: repository("methods"),
    examplesDir: repository("examples"),
  };
}
