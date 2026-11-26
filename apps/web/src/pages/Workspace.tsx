// One TARA, open for work: the ribbon at the top, the route of the steps at the left, the chosen step in
// the middle, and on request what is still left to do and the history of changes.

import { cutText, type Tara } from "@tara/core";
import { useEffect, useState } from "react";
import { api, HISTORY_LISTED, type HistoryEntry } from "../api.ts";
import { type OpenPoint, openPoints } from "../openPoints.ts";
import { type Ctx, STEPS, type StepDef, stepByKey } from "../steps.tsx";
import { Brand } from "../ui/Brand.tsx";
import { hrefOf, RecordLinks, StatusChip } from "../ui/marks.tsx";
import { Ways } from "../ui/StepHead.tsx";
import { WhoAmI } from "../ui/WhoAmI.tsx";
import { type OpenTara, useTara } from "../useTara.ts";
import { GRAPH_KINDS } from "../views/graph.ts";
import { DiagramStep, DRAWN_STEPS } from "./DiagramStep.tsx";
import { Graph } from "./Graph.tsx";
import { LinksPane } from "./LinksPane.tsx";
import { DocumentStep, ExportStep, MethodStep } from "./Other.tsx";
import { RecordStep } from "./RecordStep.tsx";
import { ReportStep } from "./ReportStep.tsx";
import { ScopeStep } from "./ScopeStep.tsx";

interface Props {
  taraId: string;
  stepKey: string;
  recordId: string | null;
  /** How the page is shown, from the address: as a list or a drawing, what is laid over a drawing, which panel is open. */
  view: URLSearchParams;
  setView: (name: string, value: string | null) => void;
  /** The name the person goes by, and how to change it; no way to change it where a proxy says who the person is. */
  who: string;
  onRename: (() => void) | undefined;
  /** The version of the tool, shown beside its name. */
  version: string;
}

/** The page of one open TARA. Until the TARA has arrived it says that it is loading, or why the TARA cannot be shown. */
export function Workspace({ taraId, stepKey, recordId, view, setView, who, onRename, version }: Props) {
  const open = useTara(taraId);
  const { tara, assessment } = open;
  if (!tara || !assessment) {
    return (
      <div className="loading">
        {open.message ? (
          <p className="error" role="alert">
            {open.message.text} <a href="#/">Back to the list</a>
          </p>
        ) : (
          "Loading…"
        )}
      </div>
    );
  }

  const ctx: Ctx = { tara, assessment };
  const step = stepByKey(stepKey);
  const points = openPoints(ctx);
  const drawer = view.get("panel");
  const toggleDrawer = (name: "left" | "history") => setView("panel", drawer === name ? null : name);
  const released = tara.meta.status === "released";
  const meta = [tara.meta.documentNumber, `Revision ${tara.meta.revision}`, released ? "Released" : "Draft"];
  // An example says that it is one where its product is named: nobody should take it for a real assessment.
  const product = [tara.meta.product, tara.meta.example ? "(training example)" : null].filter(Boolean).join(" ");

  return (
    <div className="workspace">
      <header className="masthead">
        <Brand version={version} href="#/" />
        {/* Which TARA this is: the product above its title, both whole. A long title takes a second line; it is never cut. */}
        <span className="masthead-title masthead-tara">
          {product && <span className="masthead-product">{product}</span>}
          <span>{tara.meta.title}</span>
        </span>
        <span className="masthead-meta">{meta.filter(Boolean).join(", ")}</span>
        <span className="masthead-actions">
          <span className="masthead-meta" aria-live="polite">
            {open.saving ? "Saving…" : ""}
          </span>
          <a className="button" href={`#/tara/${taraId}/graph`} title="Every record and how they are linked">
            Graph
          </a>
          <a className="button" href={`#/tara/${taraId}/report`}>
            Report
          </a>
          <button
            type="button"
            className={["button", points.length > 0 ? "pending" : "", drawer === "left" ? "on" : ""].join(" ")}
            aria-expanded={drawer === "left"}
            title="What is still open in this assessment, by step"
            onClick={() => toggleDrawer("left")}
          >
            {leftToDo(points)}
          </button>
          <button
            type="button"
            className={drawer === "history" ? "button on" : "button"}
            aria-expanded={drawer === "history"}
            title="Every change that was made, with who made it, and the way to take one back"
            onClick={() => toggleDrawer("history")}
          >
            History
          </button>
          <WhoAmI who={who} onRename={onRename} />
        </span>
        {/* A drawer hangs from the top bar, under the button that opened it, however many lines the bar takes. */}
        {drawer === "left" && <WhatIsLeft taraId={taraId} points={points} onClose={() => setView("panel", null)} />}
        {drawer === "history" && <History open={open} onClose={() => setView("panel", null)} />}
      </header>

      <nav className="route" aria-label="Steps of the assessment">
        <ol>
          {STEPS.map((s) => (
            <Stop key={s.key} step={s} taraId={taraId} current={s.key === step.key} points={points} ctx={ctx} />
          ))}
        </ol>
      </nav>

      <main className="step">
        {open.message && (
          <p
            className={open.message.kind === "error" ? "banner error" : "banner"}
            role={open.message.kind === "error" ? "alert" : "status"}
          >
            {open.message.text}
            <button type="button" className="link" onClick={open.dismiss}>
              Dismiss
            </button>
          </p>
        )}
        {released && <p className="banner">This TARA is released and cannot be changed. Open a new revision to continue.</p>}
        {!released && !who && onRename && (
          <p className="banner">
            Your changes are recorded under the name "Unnamed" until you say who you are.
            <button type="button" className="link" onClick={onRename}>
              Say who you are
            </button>
          </p>
        )}
        <StepScreen step={step} ctx={ctx} open={open} recordId={recordId} view={view} setView={setView} who={who} />
      </main>
    </div>
  );
}

/** How much is still open, for the button in the ribbon. */
function leftToDo(points: OpenPoint[]): string {
  const toComplete = points.filter((point) => point.status.kind === "todo").length;
  const toReview = points.length - toComplete;
  if (points.length === 0) return "Nothing left to do";
  return [toComplete > 0 ? `${toComplete} to complete` : null, toReview > 0 ? `${toReview} to review` : null]
    .filter(Boolean)
    .join(", ");
}

/** A step as a stop on the route: its mark says how the step stands, and the line beneath its name how much is open. */
function Stop({
  step,
  taraId,
  current,
  points,
  ctx,
}: {
  step: StepDef;
  taraId: string;
  current: boolean;
  points: OpenPoint[];
  ctx: Ctx;
}) {
  const open = points.filter((point) => point.step === step);
  const toComplete = open.filter((point) => point.status.kind === "todo").length;
  const state = !started(step, ctx) ? "empty" : toComplete > 0 ? "todo" : open.length > 0 ? "waiting" : "done";
  const count = { empty: "", todo: `${toComplete} to complete`, waiting: `${open.length} to review`, done: "Complete" }[state];
  return (
    <li className={`stop stop-${state}${current ? " stop-current" : ""}`}>
      <a href={`#/tara/${taraId}/${step.key}`} aria-current={current ? "step" : undefined}>
        <span className="stop-mark" aria-hidden="true" />
        <span className="stop-title">{step.title}</span>
        <span className="stop-count">{count}</span>
      </a>
    </li>
  );
}

/** Whether a step has anything to say yet: a step that checks nothing, or lists no record so far, has no mark. */
function started(step: StepDef, ctx: Ctx): boolean {
  if (!step.checked) return false;
  return step.kind === undefined || ctx.tara[step.kind].length > 0;
}

interface ScreenProps {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  recordId: string | null;
  view: URLSearchParams;
  setView: (name: string, value: string | null) => void;
  who: string;
}

/** The screen of the chosen step. Steps that list records share one screen; the others have their own. */
function StepScreen({ step, ctx, open, recordId, view, setView, who }: ScreenProps) {
  const place = `#/tara/${ctx.tara.id}/${step.key}`;
  const show = view.get("show");
  // A record is opened and closed without leaving the view: what follows the "?" stays as it is.
  const select = (id: string | null) => {
    location.hash = `${recordPlace(place, id)}${view.size > 0 ? `?${view}` : ""}`;
  };
  switch (step.key) {
    case "scope":
      return <ScopeStep step={step} ctx={ctx} open={open} />;
    case "graph":
      return (
        <Graph
          step={step}
          ctx={ctx}
          open={open}
          focus={view.get("focus")}
          setFocus={(id) => setView("focus", id)}
          view={view.get("view")}
        />
      );
    case "report":
      return <ReportStep step={step} ctx={ctx} open={open} signing={show === "release"} who={who} />;
    case "document":
      return <DocumentStep step={step} ctx={ctx} open={open} />;
    case "method":
      return <MethodStep step={step} ctx={ctx} open={open} />;
    case "export":
      return <ExportStep step={step} ctx={ctx} />;
  }

  // Two choices of how a list is shown. A step whose records are part of the architecture can be shown as
  // its drawing; one whose records stand on the graph, with the links of the open record beside it.
  const item = ctx.tara.items[0];
  const drawn = step.key in DRAWN_STEPS && item !== undefined;
  const linked = GRAPH_KINDS.some((kind) => kind.key === step.kind);
  const ways = (
    <>
      {drawn && (
        <Ways
          label="How the step is shown"
          ways={[
            { name: "List", href: place, on: show !== "diagram", title: "The records as a list" },
            {
              name: "Diagram",
              href: `${place}?show=diagram`,
              on: show === "diagram",
              title:
                "The architecture: its elements arranged and joined, with the assets they hold and the routes of attack paths",
            },
          ]}
        />
      )}
      {linked && show !== "diagram" && (
        <Ways
          label="What stands beside the list"
          ways={[
            { name: "Page", href: recordPlace(place, recordId), on: show !== "links", title: "The list and the open record" },
            {
              name: "Page and links",
              href: `${recordPlace(place, recordId)}?show=links`,
              on: show === "links",
              title: "The list, and beside it the open record with what it is linked to",
            },
          ]}
        />
      )}
    </>
  );
  if (drawn && show === "diagram") {
    return (
      <DiagramStep
        step={step}
        ctx={ctx}
        open={open}
        itemId={item.id}
        selected={recordId}
        onSelect={select}
        overlay={view.get("over")}
        onOverlay={(over) => setView("over", over)}
        ways={ways}
      />
    );
  }
  return (
    <RecordStep
      step={step}
      ctx={ctx}
      open={open}
      selected={recordId}
      onSelect={select}
      ways={ways}
      beside={linked && show === "links" ? <LinksPane ctx={ctx} centre={recordId} /> : undefined}
    />
  );
}

/** The address of a step with one of its records open. */
const recordPlace = (place: string, recordId: string | null): string =>
  recordId ? `${place}/${encodeURIComponent(recordId)}` : place;

/** Everything that is still open, by step, each leading to where it is settled. */
function WhatIsLeft({ taraId, points, onClose }: { taraId: string; points: OpenPoint[]; onClose: () => void }) {
  const steps = STEPS.filter((step) => points.some((point) => point.step === step));
  return (
    <aside className="drawer" aria-label="What is left to do">
      <DrawerHead title="What is left to do" onClose={onClose} />
      {points.length === 0 && (
        <p className="next next-done">Every check is settled. The assessment waits only for its signatures and release.</p>
      )}
      {steps.map((step) => (
        <section key={step.key}>
          <h3>
            <a href={`#/tara/${taraId}/${step.key}`}>{step.title}</a>
          </h3>
          <ul className="open-list">
            {points
              .filter((point) => point.step === step)
              .map((point) => (
                <li key={point.key}>
                  <a className="ref" href={point.href}>
                    {point.name}
                  </a>
                  <StatusChip status={point.status} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function DrawerHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="drawer-head">
      <h2>{title}</h2>
      <button type="button" className="link" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** A value of a change, for one line: whole, or cut after a whole word. The record's ID, above, leads to it in full. */
const short = (value: unknown): string => {
  if (value === undefined) return "nothing";
  if (value === null) return "empty";
  return cutText(typeof value === "string" ? value : JSON.stringify(value), 90);
};

/** How many records of a change its line names; the rest are counted, and "What changed" lists every place. */
const RECORDS_NAMED = 8;
/** How many places of a change are listed when it is opened; the rest are counted. */
const PLACES_LISTED = 40;

/** The records a change touched, as links: the first few by their IDs, and how many more there are. */
function Touched({ tara, records }: { tara: Tara; records: string[] }) {
  const linked = records.filter((record) => hrefOf(tara, record) !== null);
  if (linked.length === 0) return null;
  const more = linked.length - RECORDS_NAMED;
  return (
    <span>
      <RecordLinks tara={tara} ids={linked.slice(0, RECORDS_NAMED)} />
      {more > 0 && `, and ${more} more`}
    </span>
  );
}

/**
 * Every change that was stored, newest first, with who made it and what it changed. A change is taken back from
 * here, unless that would put a signature or a confirmed review back in someone's name (core, `undoDelta`).
 */
function History({ open, onClose }: { open: OpenTara; onClose: () => void }) {
  const { tara } = open;
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const id = tara?.id;
  const seq = tara?.seq;
  // The history is read again whenever the TARA changes: `seq` is the number of its last change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seq is what says that there is something new to read
  useEffect(() => {
    if (id)
      api
        .history(id)
        .then(setEntries)
        .catch(() => setEntries([]));
  }, [id, seq]);
  if (!tara) return null;
  const frozen = tara.meta.status === "released";

  return (
    <aside className="drawer" aria-label="History">
      <DrawerHead title="History" onClose={onClose} />
      <p className="help">
        Every change is kept, with who made it. Undoing a change is itself a change: nothing is ever lost from this list.
      </p>
      {entries === null && <p className="muted">Loading…</p>}
      <ol className="history">
        {entries?.map((entry) => (
          <li key={entry.seq} className={entry.undone ? "undone" : undefined}>
            <span className="history-what">{entry.summary}</span>
            <span className="history-who">
              {entry.author}, {when(entry.at)}
              {entry.undone && ", undone since"}
            </span>
            <Touched tara={tara} records={entry.records} />
            <span className="actions">
              {entry.delta.length > 0 && (
                <button type="button" className="link" onClick={() => setExpanded(expanded === entry.seq ? null : entry.seq)}>
                  {expanded === entry.seq ? "Hide the details" : `What changed (${entry.delta.length})`}
                </button>
              )}
              {!frozen && !entry.undone && !entry.external && entry.delta.length > 0 && (
                <button type="button" className="link" onClick={() => open.run(api.undo(tara.id, entry.seq))}>
                  Undo
                </button>
              )}
            </span>
            {expanded === entry.seq && (
              <ul className="delta">
                {entry.delta.slice(0, PLACES_LISTED).map((change) => (
                  <li key={change.path}>
                    <code>{change.path}</code>
                    <span>
                      <del>{short(change.before)}</del> <ins>{short(change.after)}</ins>
                    </span>
                  </li>
                ))}
                {entry.delta.length > PLACES_LISTED && (
                  <li>And {entry.delta.length - PLACES_LISTED} more. The history file of the TARA holds every one.</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {entries !== null && entries.length >= HISTORY_LISTED && (
        <p className="help">
          These are the last {HISTORY_LISTED} changes. Every change since the first is in the history file of the TARA.
        </p>
      )}
    </aside>
  );
}
