// What stands around the canvas of the architecture diagram and on it, besides the drawing itself: the choice
// of how lines are drawn, the notes that say what a layer shows, the tray of what is not placed yet, and the
// small panels of placing something without dragging it. Each says its part; pages/Diagram.tsx decides when.

import { type Coverage, LINE_STYLES, type LineStyle } from "@tara/core";
import type { ReactNode } from "react";
import type { Held, Inside } from "./held.ts";
import type { Route } from "./layers.ts";

import { type Carried, ROOM, Row } from "./shapes.tsx";

/** One of something, or several: "One element is", "3 elements are". */
const count = (many: number, one: string, several: string): string => (many === 1 ? one : `${many} ${several}`);

/** A small picture of each way to draw a line. */
const PICTURE: Record<LineStyle, string> = {
  straight: "M3 13 L21 5",
  curved: "M3 13 C12 13 12 5 21 5",
  stepped: "M3 13 H12 V5 H21",
};

/** How data flows are drawn: three small pictures of a line side by side, the chosen one filled. */
export function LineChoice({ value, onChange }: { value: LineStyle; onChange: (line: LineStyle) => void }) {
  return (
    <div className="dg-lines" role="radiogroup" aria-label="How data flows are drawn">
      <span className="dg-lines-label">Lines</span>
      <span className="dg-lines-set">
        {LINE_STYLES.map(({ key, name }) => (
          <label key={key} className={key === value ? "dg-line dg-line-on" : "dg-line"}>
            <input type="radio" name="diagram-lines" checked={key === value} onChange={() => onChange(key)} />
            <svg width="24" height="18" viewBox="0 0 24 18" aria-hidden="true">
              <path d={PICTURE[key]} />
            </svg>
            <span>{name}</span>
          </label>
        ))}
      </span>
    </div>
  );
}

/** What the gap view found among the elements of this item, and what its outlines mean. */
export function GapNote({ places, onGoTo }: { places: Coverage[]; onGoTo: (elementId: string) => void }) {
  const gaps = places.filter((place) => place.state === "gap").sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const proposed = places.filter((place) => place.state === "planned").length;
  const asking = (place: Coverage) =>
    place.risks
      .filter((risk) => risk.asks)
      .map((risk) => risk.riskId)
      .join(", ");
  return (
    <div className="banner dg-gaps-note">
      {gaps.length === 0 ? (
        <p>
          <b>No gaps.</b> Every component and data store that a risk to be reduced reaches has a control acting on it, or on the
          attack's route before it
          {proposed > 0 && `, though ${count(proposed, "one has", "have")} only controls that are still proposed`}.
        </p>
      ) : (
        <p>
          <b>
            {count(gaps.length, "One element is", "elements are")} reached by a risk, and no control acts there or earlier on the
            attack's route:
          </b>{" "}
          {gaps.map((gap, index) => (
            <span key={gap.elementId}>
              {index > 0 && ", "}
              <button type="button" className="link" onClick={() => onGoTo(gap.elementId)}>
                {gap.elementId}
              </button>
              <span className="muted"> ({asking(gap)})</span>
            </span>
          ))}
          .
        </p>
      )}
      <p className="muted">
        A control acts on an element when it is placed in it, on a data flow that ends at it, or at the boundary around it. A
        control the attack has to pass first also counts, which is why the order of a route matters. A gap is a question, not a
        failed check: a procedure or training may protect the element without having a place here. Choose an element to put a
        control on it.
      </p>
      <ul className="map-legend" aria-label="What the outlines mean">
        <li>
          <span className="dg-key dg-gap-gap" />
          Reached by a risk, no control
        </li>
        <li>
          <span className="dg-key dg-gap-planned" />
          Only proposed controls
        </li>
        <li>
          <span className="dg-key dg-gap-covered" />A control acts here
        </li>
        <li>
          <span className="dg-key dg-gap-before" />
          Met earlier on the route
        </li>
      </ul>
    </div>
  );
}

interface RouteNoteProps {
  route: Route;
  /** Where the attack path is listed. */
  href: string;
  /** The route is being recorded: each element chosen goes on it. */
  routing: boolean;
  /** Null while the TARA is released: the route can be read and not changed. */
  onRouting: ((on: boolean) => void) | null;
  onClear: () => void;
}

/** The route that is laid over the drawing, in words, with the way to record or change it. */
export function RouteNote({ route, href, routing, onRouting, onClear }: RouteNoteProps) {
  const [entry, ...later] = route.path.elementIds;
  return (
    <p className="banner dg-route-note">
      <b>{route.path.id}</b>{" "}
      {entry === undefined ? (
        "has no route yet"
      ) : (
        <>
          enters at <b>{entry}</b>
          {later.length > 0 && `, then passes ${later.join(", then ")}`}
        </>
      )}
      .{" "}
      {onRouting && routing && (
        <>
          Choose elements and data flows in the order of the attack, starting where the attacker gets in. Choosing one again takes
          it off.{" "}
          <button type="button" className="link" onClick={() => onRouting(false)}>
            Done
          </button>{" "}
          {entry !== undefined && (
            <button type="button" className="link" onClick={onClear}>
              Start again
            </button>
          )}
        </>
      )}
      {onRouting && !routing && (
        <button type="button" className="link" onClick={() => onRouting(true)}>
          {entry === undefined ? "Record the route" : "Change the route"}
        </button>
      )}{" "}
      <a className="ref" href={href}>
        Open {route.path.id}
      </a>
    </p>
  );
}

/** The data flows that are not drawn because an end is open, each leading to where its ends are set. */
export function OpenEndsNote({ ids, onChoose }: { ids: string[]; onChoose: (id: string) => void }) {
  return (
    <p className="banner">
      {count(ids.length, "One data flow has", "data flows have")} an open end and {ids.length === 1 ? "is" : "are"} not drawn:{" "}
      {ids.map((id, index) => (
        <span key={id}>
          {index > 0 && ", "}
          <button type="button" className="link" onClick={() => onChoose(id)}>
            {id}
          </button>
        </span>
      ))}
      . Choose one to set its ends.
    </p>
  );
}

const TRAY_WORDS: Record<Inside, { label: string; one: string; several: string; how: string }> = {
  assets: {
    label: "Assets not placed",
    one: "asset is not placed",
    several: "assets are not placed",
    how: 'Point at one and choose "Place it on the diagram", then choose the element it lives in.',
  },
  controls: {
    label: "Controls not placed",
    one: "control is not placed on the architecture",
    several: "controls are not placed on the architecture",
    how:
      "This says where a control acts, not whether it is in place: that is recorded with each risk. Point at one and choose " +
      '"Place it on the diagram", then choose where it acts. A control of the organisation or of a process may stay here.',
  },
};

interface TrayProps {
  kind: Inside;
  rows: Held[];
  open: boolean;
  onToggle: () => void;
  /** The row that is chosen or being placed. */
  chosen: string | null;
  /** Whether rows can be placed: not in a released TARA. */
  canPlace: boolean;
}

/** The assets that do not say where they live yet, or the controls that do not say where they act, waiting to be placed. */
export function Tray({ kind, rows, open, onToggle, chosen, canPlace }: TrayProps) {
  const words = TRAY_WORDS[kind];
  return (
    <aside className={`dg-tray dg-rows-${kind}${open ? "" : " dg-tray-shut"}`} aria-label={words.label}>
      <button type="button" className="dg-tray-head" onClick={onToggle} aria-expanded={open}>
        <b>{rows.length}</b> {rows.length === 1 ? words.one : words.several}
      </button>
      {open && canPlace && <p className="muted">{words.how}</p>}
      {open && (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <Row row={row} carried={{ kind, id: row.id, from: null }} on={row.id === chosen} room={ROOM.inTray} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

interface OfferProps {
  /** The row the pointer is over, and where on the screen it is. */
  row: Carried & { at: DOMRect };
  name: string;
  onBegin: () => void;
  /** The pointer has reached the offer, or left it. */
  onHold: (held: boolean) => void;
}

/** Beside a row the pointer rests on: the offer to place it, or to move it, without dragging. */
export function Offer({ row, name, onBegin, onHold }: OfferProps) {
  const left = Math.min(row.at.right + 6, innerWidth - 250);
  return (
    <div
      className="dg-offer"
      role="tooltip"
      style={{ left, top: row.at.top - 6 }}
      onMouseEnter={() => onHold(true)}
      onMouseLeave={() => onHold(false)}
    >
      <p>
        <b>{name}</b>
      </p>
      <button type="button" className="primary" onClick={onBegin}>
        {row.from ? "Move it to another element" : "Place it on the diagram"}
      </button>
      <p className="muted">You then choose where, on the diagram or from a list. Nothing changes until you do.</p>
    </div>
  );
}

interface PlacingProps {
  row: Carried;
  name: string;
  /** Where it can go, for the list: the ID of each element and what it is called. */
  choices: { id: string; label: string }[];
  onSettle: (elementId: string) => void;
  onCancel: () => void;
}

/** While something is being placed: what it is, and the choice of where it goes, on the diagram or from a list. */
export function Placing({ row, name, choices, onSettle, onCancel }: PlacingProps) {
  const where =
    row.kind === "controls" ? "the element, data flow or boundary where it acts" : "the element or data flow it lives in";
  return (
    <div className="dg-placing" role="dialog" aria-label="Choose where it goes">
      <p>
        <b>{name}</b>
        {row.from && ` moves from ${row.from}.`} Choose {where}: on the diagram, or here.
      </p>
      <div className="dg-placing-how">
        <select value="" aria-label="Where it goes" onChange={(event) => event.target.value && onSettle(event.target.value)}>
          <option value="">Choose from the list…</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface DoneProps {
  /** What was done on the diagram since it was opened, the latest last. */
  notes: { text: string }[];
  onUndo: () => void;
  onHide: () => void;
}

/** What was just done on the diagram, with the way to take it back. */
export function Done({ notes, onUndo, onHide }: DoneProps): ReactNode {
  const last = notes.at(-1);
  if (!last) return null;
  return (
    <div className="dg-done" role="status">
      <span>{last.text}.</span>{" "}
      <button type="button" className="link" onClick={onUndo}>
        Undo
      </button>
      {notes.length > 1 && <span className="muted"> ({notes.length - 1} earlier)</span>}
      <button
        type="button"
        className="link dg-done-close"
        onClick={onHide}
        aria-label="Hide this note"
        title="Hide. What was done stays."
      >
        ×
      </button>
    </div>
  );
}
