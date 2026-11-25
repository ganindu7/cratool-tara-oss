// The one place where the screens talk to the server. Nothing else in this folder calls `fetch`.
//
// The screens hold no data of their own: they show the TARA the server sent, work out its statuses with the
// same rule engine the server uses (@tara/core), and send back changes. Each answer is the whole TARA again.

import type { Action, Change, Delta, Method, Tara } from "@tara/core";

export interface TaraSummary {
  id: string;
  title: string;
  product: string | null;
  documentNumber: string | null;
  revision: string;
  status: "draft" | "released";
  example: boolean;
  updatedAt: string;
  method: string | null;
  basedOn: { id: string; revision: string } | null;
  counts: { assets: number; threats: number; risks: number; controls: number };
  /** The stored document cannot be read as a TARA: what is wrong with it. */
  problem?: string;
}
export interface Installation {
  /** The version of the tool, of its rules, and the document format it writes. */
  version: string;
  rules: string;
  format: string;
  /** Set when a proxy in front of the tool says who the person is. */
  author: string | null;
  methods: { id: string; name: string; origin: "tool" | "installation" }[];
  examples: { name: string; id: string; title: string; loaded: boolean; guide: string | null }[];
}
/** What taking in a TARA from a file would do: shown to the person before anything is stored. */
export interface ImportPlan {
  title: string;
  product: string | null;
  documentNumber: string | null;
  revision: string;
  holds: string[];
  notes: string[];
}
export interface HistoryEntry {
  seq: number;
  at: string;
  author: string;
  summary: string;
  delta: Delta;
  /** The records the change touched, and whether it has since been undone. */
  records: string[];
  undone: boolean;
  undoes?: number;
  external?: boolean;
}
/** What the server answers to a change: the TARA as it now is, and anything the person should know. */
export interface Changed {
  tara: Tara;
  notes: string[];
}

/** A refusal from the server, in words for the person. After a conflict it carries the TARA as it now is. */
export class ApiError extends Error {
  readonly status: number;
  readonly tara: Tara | undefined;
  readonly problems: string[];
  constructor(message: string, status: number, tara?: Tara, problems: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.tara = tara;
    this.problems = problems;
  }
}

const AUTHOR_KEY = "tara.author";
/** The name the person gave, kept in this browser. It labels their changes in the history; it is not a sign-in. */
export const author = {
  get: (): string => localStorage.getItem(AUTHOR_KEY) ?? "",
  set: (name: string): void => localStorage.setItem(AUTHOR_KEY, name.trim()),
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (author.get()) headers["X-Tara-Author"] = encodeURIComponent(author.get());
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new ApiError("The server cannot be reached. Check that it is running, then try again.", 0);
  }
  if (response.status === 204) return null as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      data?.error ?? `The server answered with an error (${response.status}).`,
      response.status,
      data?.tara,
      data?.problems,
    );
  }
  return data as T;
}

export const api = {
  installation: () => call<Installation>("GET", "/config"),
  methods: () => call<{ id: string; name: string; origin: string; method: Method }[]>("GET", "/methods"),
  taras: () => call<TaraSummary[]>("GET", "/taras"),
  create: (values: { title: string; product: string; documentNumber: string; methodId: string }) =>
    call<{ tara: Tara }>("POST", "/taras", values),
  /** What taking in a file would do. Nothing is stored. */
  checkImport: (document: unknown) => call<ImportPlan>("POST", "/taras/import/check", { document }),
  importDocument: (document: unknown, fileName: string) => call<{ tara: Tara }>("POST", "/taras/import", { document, fileName }),
  loadExample: (name: string) => call<{ id: string }>("POST", `/examples/${name}`, {}),
  tara: (id: string) => call<{ tara: Tara }>("GET", `/taras/${id}`),
  /** The TARA if it changed since `seq`, or null if it is still the same. */
  newerThan: (id: string, seq: number) => call<{ tara: Tara } | null>("GET", `/taras/${id}?ifSeq=${seq}`),
  change: (id: string, changes: Change[], baseSeq: number) => call<Changed>("POST", `/taras/${id}/changes`, { changes, baseSeq }),
  remove: (id: string, confirmTitle: string) => call<{ removed: string }>("DELETE", `/taras/${id}`, { confirmTitle }),
  history: (id: string) => call<HistoryEntry[]>("GET", `/taras/${id}/history`),
  undo: (id: string, seq?: number) => call<Changed>("POST", `/taras/${id}/undo`, seq === undefined ? {} : { seq }),
  openRevision: (id: string, revision: string, reason: string) =>
    call<{ id: string }>("POST", `/taras/${id}/revisions`, { revision, reason }),
  actionPlan: (id: string) => call<{ actions: Action[] }>("GET", `/taras/${id}/action-plan`),
  /** Addresses of downloads: opened by the browser, not fetched by the page. */
  exportUrl: (id: string) => `/api/taras/${id}/export`,
  reportUrl: (id: string, forKeeping = false) => `/api/taras/${id}/report${forKeeping ? "?file" : ""}`,
  actionPlanUrl: (id: string) => `/api/taras/${id}/action-plan?format=md`,
};
