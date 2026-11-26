// The bar above the canvas of the architecture diagram: what can be added, how the drawing is looked at, what
// is laid over it, and how much of the TARA is placed on it.

import { type AttackPath, cutText, type Element } from "@tara/core";
import { elementKindName } from "../steps.tsx";
import type { Inside } from "./held.ts";
import { OVERLAYS, type Overlay } from "./layers.ts";
import type { Look } from "./look.ts";
import { LineChoice } from "./panels.tsx";
import type { Tidy } from "./places.ts";

/** The kinds of element that are added from the bar. A data flow is added by joining two elements. */
const ADDED: Element["kind"][] = ["component", "external_interactor", "data_store", "trust_boundary"];
/** From this many elements on, one can be looked for by name. */
const MANY = 8;
/** How much of an attack path's description the list of routes has room for, beside its ID. */
const ROUTE_NAME = 38;

interface Props {
  /** The boxes of the drawing, for finding one. */
  boxes: Element[];
  paths: AttackPath[];
  /** What is laid over the drawing, and what the rows of an element are with it. */
  layer: Overlay;
  rowsKind: Inside;
  onLayer: (overlay: Overlay) => void;
  look: Look;
  onLook: (change: Partial<Look>) => void;
  /** How many elements are chosen together. */
  chosen: number;
  /** What the drawing holds, in a sentence. */
  count: string;
  onGoTo: (elementId: string) => void;
  /** What changes the TARA. Null while it is released. */
  edit: {
    add: (kind: Element["kind"]) => void;
    arrangeAnew: () => void;
    lineUp: (how: Tidy) => void;
  } | null;
}

/** The bar above the canvas. It decides nothing: every choice is handed to the diagram. */
export function Bar({ boxes, paths, layer, rowsKind, onLayer, look, onLook, chosen, count, onGoTo, edit }: Props) {
  return (
    <div className="map-bar">
      {edit && (
        <span className="dg-add">
          <span>Add</span>
          {ADDED.map((kind) => (
            <button type="button" key={kind} onClick={() => edit.add(kind)}>
              {elementKindName(kind)}
            </button>
          ))}
        </span>
      )}
      {edit && boxes.length > 1 && (
        <button
          type="button"
          onClick={edit.arrangeAnew}
          title="Place every element anew from what the records say. Your own arrangement is given up; History brings it back."
        >
          Arrange automatically
        </button>
      )}
      {edit && chosen > 1 && (
        <span className="dg-add">
          <span>{chosen} chosen</span>
          <button type="button" onClick={() => edit.lineUp("left")}>
            Align left
          </button>
          <button type="button" onClick={() => edit.lineUp("top")}>
            Align top
          </button>
          {chosen > 2 && (
            <button type="button" onClick={() => edit.lineUp("space")}>
              Space evenly
            </button>
          )}
        </span>
      )}
      {rowsKind === "assets" && (
        <label className="dg-check">
          <input
            type="checkbox"
            checked={look.assetsInside}
            onChange={(event) => onLook({ assetsInside: event.target.checked })}
          />
          Assets inside
        </label>
      )}
      <LineChoice value={look.line} onChange={(line) => onLook({ line })} />
      <label className="dg-check">
        <input type="checkbox" checked={look.overview} onChange={(event) => onLook({ overview: event.target.checked })} />
        Overview
      </label>
      {boxes.length > MANY && (
        <label className="map-show">
          Find
          <select value="" onChange={(event) => event.target.value && onGoTo(event.target.value)}>
            <option value="">an element…</option>
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.id} {box.name ?? ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="map-show">
        Lay over
        <select value={layer} onChange={(event) => onLayer(event.target.value)}>
          {OVERLAYS.map((overlay) => (
            <option key={overlay.key} value={overlay.key}>
              {overlay.name}
            </option>
          ))}
          {paths.length > 0 && (
            <optgroup label="Route of an attack path">
              {paths.map((path) => (
                <option key={path.id} value={path.id}>
                  {path.id} {cutText(path.description ?? "", ROUTE_NAME)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <span className="map-count">{count}</span>
    </div>
  );
}
