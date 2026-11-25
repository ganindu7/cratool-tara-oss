// The API of the TARA workbench.
//
// The server is thin on purpose. It does three things: it works out who is asking, it hands the request to
// the store and the rule engine, and it turns their answers (and their refusals) into HTTP. It holds no
// state of its own and never touches a file: the data is the store's business, the rules are @tara/core's.
//
// Everything is under /api. docs/api.md lists the routes with examples.

import {
  actionPlan,
  actionPlanMarkdown,
  applyChanges,
  applyDelta,
  assess,
  type Change,
  createTara,
  FORMAT,
  InvalidTara,
  invertDelta,
  nextRevision,
  Refusal,
  RULES_VERSION,
  slugify,
  type Tara,
  touchedRecords,
  UNNAMED_AUTHOR,
} from "@tara/core";
import { buildReport, renderHtml, reportFileName } from "@tara/report";
import { Conflict, NotFound, type Store } from "@tara/store";
import { type Context, Hono } from "hono";
import type { Config } from "./config.ts";
import { planImport } from "./import.ts";
import type { ExampleEntry, MethodEntry } from "./library.ts";

import { TOOL_NAME, TOOL_VERSION } from "./version.ts";

export interface AppParts {
  store: Store;
  config: Pick<Config, "allowedHosts" | "userHeader">;
  methods: MethodEntry[];
  examples: ExampleEntry[];
  /** Gives the present moment; replaced in tests. */
  clock?: () => string;
}

/** The largest request the tool reads. A TARA is some tens or hundreds of kilobytes. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** What the report page may do: show its own styles and drawings, and nothing else. It loads and sends nothing. */
const REPORT_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

/** The host of a request, in small letters and without its port: "LocalHost:8787" gives "localhost". */
const hostName = (host: string | undefined): string => (host ?? "").toLowerCase().replace(/:\d+$/, "");

export function createApp(parts: AppParts): Hono {
  const { store, config, methods, examples } = parts;
  const clock = parts.clock ?? (() => new Date().toISOString());
  const app = new Hono();

  // -------------------------------------------------------------------------------------------- guards

  // A request must name the tool by one of its own addresses. Without this, a web page on another site
  // could reach a tool running on the visitor's machine through a name that resolves to 127.0.0.1.
  app.use("*", async (c, next) => {
    if (config.allowedHosts.length > 0 && !config.allowedHosts.includes(hostName(c.req.header("host")))) {
      return c.json({ error: "This address is not one the tool is set up to be reached by (TARA_ALLOWED_HOSTS)." }, 421);
    }
    return next();
  });

  // A request that changes something must come from the tool's own page, and carry JSON. A form or a script
  // on another site can send neither without the browser asking first, and nothing here answers that question.
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    const origin = c.req.header("origin");
    if (origin !== undefined && hostName(origin.replace(/^[a-z]+:\/\//i, "")) !== hostName(c.req.header("host"))) {
      return c.json({ error: "A change must come from the tool's own page." }, 403);
    }
    const site = c.req.header("sec-fetch-site");
    if (site !== undefined && site !== "same-origin" && site !== "none") {
      return c.json({ error: "A change must come from the tool's own page." }, 403);
    }
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return c.json({ error: "This is larger than any TARA. Nothing was read." }, 413);
    if (length > 0 && !(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return c.json({ error: "Send JSON (Content-Type: application/json)." }, 415);
    }
    return next();
  });

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Frame-Options", "SAMEORIGIN");
  });

  // ------------------------------------------------------------------------------------------- helpers

  /**
   * Who is asking. The tool has no sign-in of its own. On one's own machine a person types their name once
   * and the page sends it along; behind a reverse proxy that signs people in, the proxy's header is the name
   * and what the page sends is ignored. Either way the name is a label for the history, not a permission.
   */
  const authorOf = (c: Context): string => {
    const raw = config.userHeader ? c.req.header(config.userHeader) : c.req.header("x-tara-author");
    if (!raw) return UNNAMED_AUTHOR;
    try {
      return decodeURIComponent(raw).trim().slice(0, 80) || UNNAMED_AUTHOR;
    } catch {
      return raw.trim().slice(0, 80) || UNNAMED_AUTHOR;
    }
  };
  const bodyOf = async (c: Context): Promise<Record<string, unknown>> => {
    const body = await c.req.json().catch(() => null);
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  };
  const idOf = (c: Context): string => c.req.param("id") ?? "";
  /** An ID that is free: the wanted one, or the wanted one with the next number that is. */
  const freeId = async (wanted: string): Promise<string> => {
    if (!(await store.exists(wanted))) return wanted;
    for (let n = 2; ; n++) {
      const candidate = `${wanted.slice(0, 56)}-${n}`;
      if (!(await store.exists(candidate))) return candidate;
    }
  };
  const toolUrl = (c: Context, id: string): string => `${new URL(c.req.url).origin}/#/tara/${id}`;
  const report = (c: Context, tara: Tara, forKeeping: boolean): string =>
    renderHtml(
      buildReport(tara, {
        generatedAt: clock(),
        generatedBy: authorOf(c),
        madeWith: `${TOOL_NAME} ${TOOL_VERSION}, rules ${RULES_VERSION}`,
        ...(forKeeping ? {} : { toolUrl: toolUrl(c, tara.id) }),
      }),
    );
  const download = (c: Context, body: string, type: string, fileName: string, attach: boolean) =>
    c.body(body, 200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `${attach ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    });

  // Refusals of every kind become an answer a person can read. Anything else is a fault of the tool.
  app.onError((error, c) => {
    if (error instanceof Conflict) return c.json({ error: error.message, tara: error.current }, 409);
    if (error instanceof NotFound) return c.json({ error: error.message }, 404);
    if (error instanceof InvalidTara)
      return c.json({ error: "This is not a valid TARA document.", problems: error.problems }, 422);
    if (error instanceof Refusal) {
      const status = error.reason === "not_found" ? 404 : error.reason === "invalid" ? 400 : 409;
      return c.json({ error: error.message }, status);
    }
    console.error(error);
    return c.json({ error: "The tool ran into a fault. Nothing was changed. The server's log has the details." }, 500);
  });

  // --------------------------------------------------------------------------------------- installation

  app.get("/api/health", async (c) =>
    c.json({ status: "ok", version: TOOL_VERSION, rules: RULES_VERSION, format: FORMAT, taras: (await store.list()).length }),
  );

  app.get("/api/config", async (c) => {
    const present = new Set((await store.list()).map((t) => t.id));
    return c.json({
      /** The version of the tool, shown on every page, and the document format it writes. */
      version: TOOL_VERSION,
      rules: RULES_VERSION,
      format: FORMAT,
      /** Set when a proxy says who the person is: the page then shows the name and does not ask for one. */
      author: config.userHeader ? authorOf(c) : null,
      methods: methods.map((m) => ({ id: m.id, name: m.name, origin: m.origin })),
      examples: examples.map((e) => ({
        name: e.name,
        id: e.tara.id,
        title: e.tara.meta.title,
        loaded: present.has(e.tara.id),
        /** The document of the example that says how to read it. */
        guide: e.tara.references.find((r) => r.content !== null)?.id ?? null,
      })),
    });
  });

  app.get("/api/methods", (c) => c.json(methods));

  // ------------------------------------------------------------------------------- TARAs: list and make

  app.get("/api/taras", async (c) => c.json(await store.list()));

  app.post("/api/taras", async (c) => {
    const body = await bodyOf(c);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title === "") throw new Refusal("A TARA needs a title.");
    const method = methods.find((m) => m.id === body.methodId) ?? methods[0];
    if (!method) throw new Refusal("No scoring method is installed. Put one into the methods folder.", "conflict");
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    // A product name that a TARA here has already, whatever its capitals, is that product: the new TARA is
    // listed with it, rather than beside it under a second spelling.
    const asked = text(body.product)?.trim() ?? "";
    const known = (await store.list()).find((t) => t.product !== null && t.product.toLowerCase() === asked.toLowerCase());
    const tara = createTara({
      id: await freeId(slugify(title)),
      title,
      product: known?.product ?? asked,
      organisation: text(body.organisation),
      documentNumber: text(body.documentNumber),
      method: method.method,
      now: clock(),
    });
    return c.json({ tara: await store.create(tara, { author: authorOf(c), summary: "Created" }) }, 201);
  });

  // Takes in a TARA from a file, in two steps (import.ts). /check reads the file and says what taking it in
  // would do, and stores nothing. Without /check it is taken in, as a new draft.
  const readImport = async (c: Context) => {
    const body = await bodyOf(c);
    // The ID of a new TARA follows from its title; the file's own ID names nothing here.
    const title = (body.document as { meta?: { title?: unknown } } | null)?.meta?.title;
    const id = await freeId(slugify(typeof title === "string" ? title : "imported"));
    const fileName = typeof body.fileName === "string" ? body.fileName.replace(/[^\w .()-]/g, "_").slice(0, 120) : null;
    return { ...planImport(body.document, await store.list(), id, clock()), fileName };
  };
  app.post("/api/taras/import/check", async (c) => c.json((await readImport(c)).plan));
  app.post("/api/taras/import", async (c) => {
    const { tara, plan, fileName } = await readImport(c);
    const summary = `Imported${fileName ? ` from ${fileName}` : ""}, as a new draft`;
    return c.json({ tara: await store.create(tara, { author: authorOf(c), summary }), notes: plan.notes }, 201);
  });

  // Puts a fresh copy of a training example into the data folder, unless it is there already.
  app.post("/api/examples/:name", async (c) => {
    const example = examples.find((e) => e.name === c.req.param("name"));
    if (!example) throw new Refusal("There is no such example.", "not_found");
    if (!(await store.exists(example.tara.id)))
      await store.create(example.tara, { author: authorOf(c), summary: "Training example loaded" });
    return c.json({ id: example.tara.id }, 201);
  });

  // -------------------------------------------------------------------------------- one TARA: read, change

  // ?ifSeq=N answers 204 when the TARA is still at change N: an open page asks this to learn of others' changes.
  app.get("/api/taras/:id", async (c) => {
    const tara = await store.read(idOf(c));
    if (c.req.query("ifSeq") === String(tara.seq)) return c.body(null, 204);
    return c.json({ tara });
  });

  // The one way a TARA is changed: a list of changes, made together or not at all.
  app.post("/api/taras/:id/changes", async (c) => {
    const body = await bodyOf(c);
    const changes = body.changes as Change[];
    const author = authorOf(c);
    let notes: string[] = [];
    const options = { author, summary: "", ...(typeof body.baseSeq === "number" ? { baseSeq: body.baseSeq } : {}) };
    const tara = await store.update(idOf(c), options, (current) => {
      const applied = applyChanges(current, changes, { author, now: clock() });
      notes = applied.notes;
      return applied;
    });
    // The report as issued is kept beside the TARA, so that it stays exactly as it was signed.
    if (tara.meta.status === "released" && changes.some((change) => change?.op === "release")) {
      await store.writeFile(tara.id, `releases/${slugify(tara.meta.revision)}/report.html`, report(c, tara, true));
    }
    return c.json({ tara, notes });
  });

  app.delete("/api/taras/:id", async (c) => {
    const body = await bodyOf(c);
    const tara = await store.read(idOf(c));
    // The title is typed again, so that a TARA is not removed by a slip.
    if (typeof body.confirmTitle !== "string" || body.confirmTitle.trim() !== tara.meta.title.trim()) {
      throw new Refusal("Type the title of the TARA exactly as shown to confirm.");
    }
    await store.remove(tara.id, { author: authorOf(c) });
    return c.json({ removed: tara.id });
  });

  // --------------------------------------------------------------------------------------- history, undo

  app.get("/api/taras/:id/history", async (c) => {
    const entries = await store.history(idOf(c));
    const undone = new Set(entries.map((entry) => entry.undoes).filter((seq) => seq !== undefined));
    const limit = Math.min(Number(c.req.query("limit")) || 200, 1000);
    return c.json(
      entries
        .slice(-limit)
        .reverse()
        .map((entry) => ({ ...entry, records: touchedRecords(entry.delta), undone: undone.has(entry.seq) })),
    );
  });

  // Takes one change back, as a new change: the history keeps both. Without `seq`, the last change.
  app.post("/api/taras/:id/undo", async (c) => {
    const body = await bodyOf(c);
    const id = idOf(c);
    const entries = await store.history(id);
    const entry =
      typeof body.seq === "number" ? entries.find((e) => e.seq === body.seq) : entries.findLast((e) => e.delta.length > 0);
    if (!entry) throw new Refusal("There is no such change to undo.", "not_found");
    if (entry.external || entry.delta.length === 0)
      throw new Refusal("This entry holds no change that can be undone.", "conflict");
    if (entries.some((e) => e.undoes === entry.seq)) throw new Refusal("This change has been undone already.", "conflict");
    const tara = await store.update(
      id,
      { author: authorOf(c), summary: `Undid: ${entry.summary}`, undoes: entry.seq },
      (current) => {
        if (current.meta.status === "released") throw new Refusal("This TARA is released and cannot be changed.", "frozen");
        return applyDelta(current, invertDelta(entry.delta));
      },
    );
    return c.json({ tara, notes: [] });
  });

  // --------------------------------------------------------------------------------- revisions and export

  // Opens the next revision of a released TARA: a new draft with everything carried over.
  app.post("/api/taras/:id/revisions", async (c) => {
    const body = await bodyOf(c);
    const released = await store.read(idOf(c));
    if (released.meta.status !== "released")
      throw new Refusal("Only a released TARA gets a next revision. This one can still be changed.", "conflict");
    const revision = typeof body.revision === "string" ? body.revision.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (revision === "" || revision === released.meta.revision)
      throw new Refusal("Give the new revision a number that differs from the released one.");
    if (reason === "")
      throw new Refusal("Say why the new revision is opened: a design change, a new vulnerability, the yearly review.");
    const open = (await store.list()).find((t) => t.basedOn?.id === released.id && t.status === "draft");
    if (open) throw new Refusal(`Revision ${open.revision} of this TARA is open already. Continue there.`, "conflict");
    const base = released.meta.basedOn ? released.id.replace(/-rev-[a-z0-9-]+$/, "") : released.id;
    const draft = nextRevision(released, {
      id: await freeId(`${base.slice(0, 44)}-rev-${slugify(revision)}`),
      revision,
      reason,
      now: clock(),
    });
    await store.create(draft, { author: authorOf(c), summary: `Revision ${revision} opened: ${reason}` });
    return c.json({ id: draft.id }, 201);
  });

  // The TARA as a file: the whole assessment in the documented format, for a backup or another installation.
  app.get("/api/taras/:id/export", async (c) => {
    const tara = await store.read(idOf(c));
    return download(c, `${JSON.stringify(tara, null, 2)}\n`, "application/json", `${reportFileName(tara)}.tara.json`, true);
  });

  // The report as one web page. A released TARA gives the report exactly as it was issued.
  // ?file: a page to keep, whose IDs lead to places inside the document instead of into the tool.
  app.get("/api/taras/:id/report", async (c) => {
    const tara = await store.read(idOf(c));
    const forKeeping = c.req.query("file") !== undefined;
    const issued =
      tara.meta.status === "released"
        ? await store.readFile(tara.id, `releases/${slugify(tara.meta.revision)}/report.html`)
        : null;
    const response = download(c, issued ?? report(c, tara, forKeeping), "text/html", `${reportFileName(tara)}.html`, forKeeping);
    response.headers.set("Content-Security-Policy", REPORT_POLICY);
    return response;
  });

  // The work that follows from the assessment, as data or as a Markdown document.
  app.get("/api/taras/:id/action-plan", async (c) => {
    const tara = await store.read(idOf(c));
    const actions = actionPlan(tara, assess(tara));
    if (c.req.query("format") === "md") {
      return download(c, actionPlanMarkdown(tara, actions), "text/markdown", `${reportFileName(tara)}-action-plan.md`, true);
    }
    return c.json({ tara: { id: tara.id, title: tara.meta.title, revision: tara.meta.revision }, actions });
  });

  app.all("/api/*", (c) => c.json({ error: "There is nothing at this address. docs/api.md lists the routes." }, 404));

  return app;
}
