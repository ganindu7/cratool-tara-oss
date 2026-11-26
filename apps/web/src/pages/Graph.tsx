// The Graph step: every record of the assessment and how they are linked, in the order of the method, from
// the item to the goals and claims. It shows the whole TARA or one record with everything it rests on and
// leads to; a record that is chosen lights up its chain and shows its card. From here each record leads to
// its views (RecordView.tsx), which lie over the graph and leave it as it was.
//
// The graph is worked out from the links in the records each time; it stores nothing.

import { cutText } from "@tara/core";
import { useMemo, useRef, useState } from "react";
import type { Ctx, StepDef } from "../steps.tsx";
import { hrefOf } from "../ui/marks.tsx";
import { StepHead } from "../ui/StepHead.tsx";
import { viewHref } from "../ui/ViewLink.tsx";
import type { OpenTara } from "../useTara.ts";
import { chainOf, GRAPH_KINDS, type GraphKind, graphOf, thingsToDraw } from "../views/graph.ts";
import { centresOf, type ViewKind, viewFromKey } from "../views/views.ts";
import { GraphCanvas, StatusLegend } from "./GraphCanvas.tsx";
import { cardRoom, RecordCard, useCardState } from "./RecordCard.tsx";
import { RecordView } from "./RecordView.tsx";

/** The views that follow the chain, with what choosing one of their records in the list shows. */
const CHAIN_VIEWS: [kind: ViewKind, heading: string][] = [
  ["element", "One element, with what it is joined to and what is in it"],
  ["asset", "One asset, with where it lives and what can happen to it"],
  ["threat", "One threat, with what it leads to, how it is carried out and what treats it"],
  ["control", "One control, with the risks it treats and where it acts"],
];

interface Props {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  /** The record the graph is about: it is shown with everything it rests on and leads to. null: the whole TARA. */
  focus: string | null;
  setFocus: (id: string | null) => void;
  /** The view of one record that lies over the graph, as the address names it. */
  view: string | null;
}

/** The screen of the Graph step: the choice of what is shown, the canvas, and over it the view of one record when one is open. */
export function Graph({ step, ctx, open, focus, setFocus, view: viewKey }: Props) {
  const { tara, assessment } = ctx;
  const graph = useMemo(() => graphOf(tara, assessment.checks), [tara, assessment]);
  const things = useMemo(() => thingsToDraw(graph, tara, assessment.checks), [graph, tara, assessment]);
  const view = viewFromKey(viewKey);
  // While a view lies over the graph, the graph shows what it showed before. A view that was entered from a
  // list, with no graph before it, stands alone.
  const beneath = useRef<{ focus: string | null } | null>(null);
  if (view === null) beneath.current = { focus };
  const about = view === null ? focus : (beneath.current?.focus ?? null);

  const [picked, setPicked] = useState<string | null>(null);
  const cards = useCardState();
  const [hidden, setHidden] = useState<ReadonlySet<GraphKind>>(new Set());
  const [openOnly, setOpenOnly] = useState(false);
  const [looseOnly, setLooseOnly] = useState(false);

  const inFocus = useMemo(
    () => (about && graph.things.has(about) ? chainOf(graph, [about]) : new Set(graph.things.keys())),
    [graph, about],
  );
  const visible = useMemo(
    () =>
      [...graph.things.values()].filter(
        (thing) =>
          inFocus.has(thing.id) &&
          !hidden.has(thing.kind) &&
          (!openOnly || (thing.status !== undefined && thing.status.kind !== "done")) &&
          (!looseOnly || thing.loose !== undefined),
      ),
    [graph, inFocus, hidden, openOnly, looseOnly],
  );
  const shown = useMemo(() => new Set(visible.map((thing) => thing.id)), [visible]);
  const links = useMemo(() => graph.links.filter(([from, to]) => shown.has(from) && shown.has(to)), [graph, shown]);
  const lit = useMemo(() => (picked && shown.has(picked) ? chainOf(graph, [picked]) : null), [picked, graph, shown]);
  const looseEnds = [...inFocus].filter((id) => graph.things.get(id)?.loose !== undefined).length;
  const thing = picked ? (graph.things.get(picked) ?? null) : null;

  if (graph.things.size === 0) {
    return (
      <>
        <StepHead title={step.title} intro={step.intro} />
        <p className="empty">Nothing to show yet. The graph fills as items, assets, damage scenarios and threats are added.</p>
      </>
    );
  }
  const recordView = view && (
    <RecordView
      // a view of another record begins anew: nothing is chosen in it but what its address names
      key={viewKey}
      ctx={ctx}
      open={open}
      graph={graph}
      things={things}
      view={view}
      over={beneath.current !== null}
      legend={<StatusLegend />}
      cards={cards}
    />
  );
  // A view says itself what it shows. It has the page to itself, so that the drawing has the room.
  if (view && beneath.current === null) return recordView;

  /** What the list above the graph shows: the whole TARA, one record with its chain, or the view of one record. */
  const show = (choice: string) => {
    setPicked(null);
    const chosenView = viewFromKey(choice);
    if (chosenView) location.hash = viewHref(tara.id, chosenView);
    else setFocus(choice === "all" ? null : choice);
  };
  const toggleKind = (kind: GraphKind, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(kind);
    else next.add(kind);
    setHidden(next);
  };
  const option = (id: string, value = id) => (
    <option key={value} value={value}>
      {id} {cutText(things.get(id)?.text ?? "", 60)}
    </option>
  );
  const kindsShown = GRAPH_KINDS.length - hidden.size;

  return (
    <>
      {view === null && <StepHead title={step.title} intro={step.intro} />}
      <div className="map">
        {recordView}
        <div className="map-bar" inert={view !== null}>
          <label className="map-show">
            Show
            <select value={about && graph.things.has(about) ? about : "all"} onChange={(event) => show(event.target.value)}>
              <option value="all">The whole TARA</option>
              {about &&
                graph.things.has(about) &&
                graph.things.get(about)?.kind !== "risks" &&
                graph.things.get(about)?.kind !== "items" && <option value={about}>{about} and everything linked to it</option>}
              <optgroup label="One risk, with what it rests on and its treatment">
                {tara.risks.map((risk) => option(risk.id))}
              </optgroup>
              {CHAIN_VIEWS.map(([kind, heading]) => (
                <optgroup key={kind} label={heading}>
                  {centresOf(kind, tara, things).map((centre) => option(centre.id, `${kind}:${centre.id}`))}
                </optgroup>
              ))}
              <optgroup label="One item, with everything that follows from it">
                {tara.items.filter((item) => graph.down.has(item.id)).map((item) => option(item.id))}
              </optgroup>
            </select>
          </label>
          <details className="map-filter">
            <summary>
              {hidden.size === 0 && !openOnly
                ? "All kinds"
                : `${kindsShown} of ${GRAPH_KINDS.length} kinds${openOnly ? ", only what needs work" : ""}`}
            </summary>
            <div className="map-filter-body">
              {GRAPH_KINDS.map((kind) => (
                <label key={kind.key} className="check">
                  <input
                    type="checkbox"
                    checked={!hidden.has(kind.key)}
                    onChange={(event) => toggleKind(kind.key, event.target.checked)}
                  />
                  {kind.many}
                </label>
              ))}
              <label className="check map-open-only">
                <input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />
                Only what still needs work
              </label>
            </div>
          </details>
          <StatusLegend />
          {(looseEnds > 0 || looseOnly) && (
            <button
              type="button"
              className={looseOnly ? "map-loose-toggle on" : "map-loose-toggle"}
              aria-pressed={looseOnly}
              title="Records where the chain from item to decision stops short"
              onClick={() => {
                setPicked(null);
                setLooseOnly(!looseOnly);
              }}
            >
              {looseOnly ? "Show everything again" : `${looseEnds} loose ${looseEnds === 1 ? "end" : "ends"}`}
            </button>
          )}
          <span className="map-count">
            {visible.length === graph.things.size
              ? `${visible.length} records`
              : `${visible.length} of ${graph.things.size} records`}
          </span>
        </div>

        <GraphCanvas
          things={visible}
          links={links}
          lit={lit}
          picked={picked}
          centre={about}
          onPick={setPicked}
          onOpen={(id) => {
            location.hash = hrefOf(tara, id) ?? location.hash;
          }}
          card={thing ? cardRoom(cards) : undefined}
          covered={view !== null}
          fill
        >
          {thing ? (
            <RecordCard
              ctx={ctx}
              open={open}
              thing={thing}
              graph={graph}
              things={things}
              state={cards}
              onClose={() => setPicked(null)}
              onGo={(id) => {
                // a record that is not on the canvas is brought there with its own chain
                if (!shown.has(id)) setFocus(id);
                setPicked(id);
              }}
              actions={
                about !== thing.id && (
                  <button type="button" onClick={() => setFocus(thing.id)}>
                    Show only its links
                  </button>
                )
              }
            />
          ) : (
            <p className="map-hint">
              Select a record to light up what it rests on and what rests on it. Drag or scroll to move; pinch, or Ctrl and
              scroll, to zoom.
            </p>
          )}
        </GraphCanvas>
      </div>
    </>
  );
}
