// One TARA, open for work: the steps of the method on the left, the chosen step in the middle, and on
// request what is still left to do and the history of changes.

import { cutText, type Finding, findings } from "@tara/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type HistoryEntry } from "../api.ts";
import { SCOPE_LABELS } from "../scopeLabels.ts";
import { type Ctx, QUESTIONS, STEPS, type StepDef, stepByKey } from "../steps.tsx";
import { Brand } from "../ui/Brand.tsx";
import { hrefOf, RecordLinks } from "../ui/marks.tsx";
import { type OpenTara, useTara } from "../useTara.ts";
import { Diagram } from "./Diagram.tsx";
import { Graph } from "./Graph.tsx";
import { DocumentStep, ExportStep, MethodStep } from "./Other.tsx";
import { RecordPanel, RecordStep } from "./RecordStep.tsx";
import { ReportStep } from "./ReportStep.tsx";
import { ScopeStep } from "./ScopeStep.tsx";

interface Props {
  taraId: string;
  stepKey: string;
  recordId: string | null;
  /** How the page is shown, from the address: what is laid over a drawing, which panel is open. */
  view: URLSearchParams;
  setView: (name: string, value: string | null) => void;
  /** The name the person goes by, and how to change it. */
  who: string;
  onRename: () => void;
  /** The version of the tool, shown beside its name. */
  version: string;
}

export function Workspace({ taraId, stepKey, recordId, view, setView, who, onRename, version }: Props) {
  const open = useTara(taraId);
  const drawer = view.get("panel");
  const setDrawer = (name: "left" | "history" | null) => setView("panel", name);
  const { tara, assessment } = open;

  const all = useMemo(() => (assessment ? findings(assessment.checks) : []), [assessment]);
  // The top bar grows with a long title. What sits under it (the form of a record, the panels at the side)
  // is told how tall the bar is, so that it starts where the bar ends.
  const bar = useRef<HTMLElement>(null);
  const loaded = tara !== null;
  useEffect(() => {
    const element = bar.current;
    if (!loaded || !element) return;
    const tell = () => document.documentElement.style.setProperty("--bar", `${element.offsetHeight}px`);
    const observer = new ResizeObserver(tell);
    observer.observe(element);
    tell();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bar");
    };
  }, [loaded]);
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
  // The architecture has two addresses: ".../architecture" is its list and ".../diagram" its drawing.
  const drawing = stepKey === "diagram";
  const step = stepByKey(drawing ? "architecture" : stepKey);
  const select = (id: string | null) => {
    location.hash = `#/tara/${taraId}/${drawing ? "diagram" : step.key}${id ? `/${encodeURIComponent(id)}` : ""}`;
  };
  const stillOpen = all.filter((f) => f.status.kind !== "done");
  const todo = stillOpen.filter((f) => f.status.kind === "todo").length;

  return (
    <div className="workspace">
      <header className="topbar" ref={bar}>
        <Brand version={version} href="#/" />
        <a className="doc" href={`#/tara/${taraId}/document`} title="Document details">
          {/* Which TARA this is: the product above its title, both whole. A long title takes a second line; it is never cut. */}
          {tara.meta.product && <span className="doc-product">{tara.meta.product}</span>}
          <span className="doc-title">{tara.meta.title}</span>
          <span className="doc-meta">
            {[tara.meta.documentNumber, `Revision ${tara.meta.revision}`].filter(Boolean).join(", ")}
            <span className={`tag tag-${tara.meta.status}`}>{tara.meta.status === "released" ? "Released" : "Draft"}</span>
            {tara.meta.example && <span className="tag tag-example">Training example</span>}
          </span>
        </a>
        <span className="saving" aria-live="polite">
          {open.saving ? "Saving…" : ""}
        </span>
        <button
          type="button"
          className={drawer === "left" ? "on" : ""}
          onClick={() => setDrawer(drawer === "left" ? null : "left")}
        >
          {stillOpen.length === 0 ? "Nothing left to do" : `${todo} to do, ${stillOpen.length - todo} waiting`}
        </button>
        <button
          type="button"
          className={drawer === "history" ? "on" : ""}
          onClick={() => setDrawer(drawer === "history" ? null : "history")}
        >
          History
        </button>
        <button type="button" className="who" onClick={onRename} title="The name your changes are recorded under">
          {who || "Say who you are"}
        </button>
      </header>

      <nav className="rail" aria-label="Steps">
        {[1, 2, 3, 4, 0].map((question) => (
          <section key={question}>
            <h2>
              {question > 0 && <span className="question-number">{question}</span>}
              {QUESTIONS[question]}
            </h2>
            <ul>
              {STEPS.filter((s) => s.question === question).map((s) => (
                <RailStep key={s.key} step={s} taraId={taraId} current={s.key === step.key} findings={all} />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <main className="content">
        {!who && tara.meta.status !== "released" && (
          <p className="banner banner-note">
            Your changes are recorded under the name "Unnamed" until you say who you are.
            <button type="button" className="link" onClick={onRename}>
              Say who you are
            </button>
          </p>
        )}
        {open.message && (
          <p
            className={open.message.kind === "error" ? "banner banner-error" : "banner banner-note"}
            role={open.message.kind === "error" ? "alert" : "status"}
          >
            {open.message.text}
            <button type="button" className="link" onClick={open.dismiss}>
              Dismiss
            </button>
          </p>
        )}
        <StepScreen
          step={step}
          ctx={ctx}
          open={open}
          recordId={recordId}
          select={select}
          drawing={drawing}
          view={view}
          setView={setView}
        />
      </main>

      {drawer === "left" && <WhatIsLeft tara={ctx} items={stillOpen} onClose={() => setDrawer(null)} />}
      {drawer === "history" && <History open={open} onClose={() => setDrawer(null)} />}
    </div>
  );
}

/** A step in the rail, with how far it is: how many of its records are done, waiting, or need something. */
function RailStep({
  step,
  taraId,
  current,
  findings: all,
}: {
  step: StepDef;
  taraId: string;
  current: boolean;
  findings: Finding[];
}) {
  const own = step.checked ? all.filter((f) => f.step === step.checked) : [];
  const count = (kind: string) => own.filter((f) => f.status.kind === kind).length;
  const [done, waiting, todo] = [count("done"), count("waiting"), count("todo")];
  const summary = own.length === 0 ? "" : todo > 0 ? `${todo} to do` : waiting > 0 ? `${waiting} waiting` : "Done";
  return (
    <li className={current ? "current" : ""}>
      <a href={`#/tara/${taraId}/${step.key}`} aria-current={current ? "page" : undefined}>
        <span className="rail-title">{step.title}</span>
        {own.length > 0 && (
          <>
            <span className={`rail-count ${todo > 0 ? "is-todo" : waiting > 0 ? "is-waiting" : "is-done"}`}>{summary}</span>
            {/* How far the step is, drawn only while something in it is still open. */}
            {done < own.length && (
              <span className="rail-bar" aria-hidden="true">
                <span className="seg-done" style={{ flexGrow: done }} />
                <span className="seg-waiting" style={{ flexGrow: waiting }} />
                <span className="seg-todo" style={{ flexGrow: todo }} />
              </span>
            )}
          </>
        )}
      </a>
    </li>
  );
}

interface ScreenProps {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  recordId: string | null;
  select: (id: string | null) => void;
  /** The architecture is shown as its drawing rather than its list. */
  drawing: boolean;
  view: URLSearchParams;
  setView: (name: string, value: string | null) => void;
}

/** The screen of the chosen step. Steps that list records share one screen; the others have their own. */
function StepScreen({ step, ctx, open, recordId, select, drawing, view, setView }: ScreenProps) {
  switch (step.key) {
    case "scope":
      return <ScopeStep ctx={ctx} open={open} intro={step.intro} />;
    case "graph":
      return <Graph ctx={ctx} intro={step.intro} chosen={view.get("focus")} onChoose={(id) => setView("focus", id)} />;
    case "report":
      return <ReportStep ctx={ctx} open={open} intro={step.intro} />;
    case "document":
      return <DocumentStep ctx={ctx} open={open} />;
    case "method":
      return <MethodStep ctx={ctx} open={open} intro={step.intro} />;
    case "export":
      return <ExportStep ctx={ctx} intro={step.intro} />;
  }
  if (step.key === "architecture") {
    const toggle = (
      <nav className="toggle" aria-label="How the architecture is shown">
        <a
          className={drawing ? "button" : "button on"}
          href={`#/tara/${ctx.tara.id}/architecture`}
          aria-current={drawing ? undefined : "page"}
        >
          List
        </a>
        <a
          className={drawing ? "button on" : "button"}
          href={`#/tara/${ctx.tara.id}/diagram`}
          aria-current={drawing ? "page" : undefined}
        >
          Diagram
        </a>
      </nav>
    );
    const item = ctx.tara.items[0];
    if (drawing && item) {
      const record = ctx.tara.elements.find((e) => e.id === recordId);
      return (
        <div className={record ? "step with-panel" : "step"}>
          <div className="step-main">
            <header className="step-head">
              <div>
                <h1>{step.title}</h1>
                <p className="lede">{step.intro}</p>
              </div>
              {toggle}
            </header>
            <Diagram
              ctx={ctx}
              open={open}
              itemId={item.id}
              selected={recordId}
              onSelect={select}
              overlay={view.get("over") ?? "none"}
              onOverlay={(over) => setView("over", over === "none" ? null : over)}
            />
          </div>
          {record && <RecordPanel step={step} record={record as never} ctx={ctx} open={open} onClose={() => select(null)} />}
        </div>
      );
    }
    return <RecordStep step={step} ctx={ctx} open={open} selected={recordId} onSelect={select} aside={toggle} />;
  }
  return <RecordStep step={step} ctx={ctx} open={open} selected={recordId} onSelect={select} />;
}

/** Everything that is still open, by step, each leading to where it is settled. */
function WhatIsLeft({ tara: ctx, items, onClose }: { tara: Ctx; items: Finding[]; onClose: () => void }) {
  const stepOf = (finding: Finding) => STEPS.find((s) => s.checked === finding.step) ?? (STEPS[0] as StepDef);
  const groups = STEPS.filter((s) => s.checked && items.some((f) => f.step === s.checked));
  return (
    <aside className="drawer" aria-label="What is left to do">
      <header className="panel-head">
        <h2>What is left</h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </header>
      {items.length === 0 && (
        <p className="notice notice-done">Every check is settled. The assessment waits only for its signatures and release.</p>
      )}
      {groups.map((step) => (
        <section key={step.key}>
          <h3>
            <a href={`#/tara/${ctx.tara.id}/${step.key}`}>{step.title}</a>
          </h3>
          <ul className="left-list">
            {items
              .filter((f) => stepOf(f).key === step.key)
              .map((f) => {
                const name = f.recordId ?? (f.scopeKey ? SCOPE_LABELS[f.scopeKey].label : step.title);
                const href = f.recordId
                  ? `#/tara/${ctx.tara.id}/${step.key}/${encodeURIComponent(f.recordId)}`
                  : `#/tara/${ctx.tara.id}/${step.key}`;
                return (
                  <li key={`${f.step}-${f.recordId ?? f.scopeKey}`} className={`row-${f.status.kind}`}>
                    <a href={href} className={f.recordId ? "id" : ""}>
                      {name}
                    </a>
                    <span>{f.status.message}</span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </aside>
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

/** Every change that was stored, newest first, with who made it and what it changed. Any of them can be undone. */
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
      <header className="panel-head">
        <h2>History</h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="help">
        Every change is kept, with who made it. Undoing a change is itself a change: nothing is ever lost from this list.
      </p>
      {entries === null && <p className="muted">Loading…</p>}
      <ol className="history">
        {entries?.map((entry) => (
          <li key={entry.seq} className={entry.undone ? "undone" : ""}>
            <p className="history-what">{entry.summary}</p>
            <p className="history-who">
              {entry.author}, {when(entry.at)}
              {entry.undone && ", undone since"}
            </p>
            {entry.records.length > 0 && (
              <p className="history-records">
                <RecordLinks tara={tara} ids={entry.records.filter((id) => hrefOf(tara, id) !== null).slice(0, 8)} />
              </p>
            )}
            <p className="row">
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
            </p>
            {expanded === entry.seq && (
              <ul className="delta">
                {entry.delta.slice(0, 40).map((change) => (
                  <li key={change.path}>
                    <code>{change.path}</code>
                    <span>
                      <del>{short(change.before)}</del> <ins>{short(change.after)}</ins>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
