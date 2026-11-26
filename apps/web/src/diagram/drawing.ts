// What the drawing shows of each element and of each line, worked out from the TARA and from what is laid
// over it. The canvas only draws what is said here. No screen code, so that all of it can be tested.

import { type Coverage, type Element, facingSides, type Place, type Side, type Tara } from "@tara/core";
import { type Held, heldIn, type Inside } from "./held.ts";
import { gapsAt, highestRiskAt, type Overlay, type Route, riskValues, routeOf, rowsOf } from "./layers.ts";
import { labelPlaces, sharedLines } from "./lines.ts";
import { isBox, isFrame, NEW_FRAME, NODE_WIDTH, type Point } from "./places.ts";

/** What is laid over the drawing, worked out once for all its elements. */
export interface Shown {
  rowsKind: Inside;
  /** The rows an element shows: the controls that act in it, or the assets that live in it unless they are put away. */
  rowsIn: (elementId: string) => Held[];
  /** The route of the attack path that is shown, if one is. */
  route: Route | null;
  /** The highest risk that reaches each element, while that is laid over. */
  risks: Map<string, number | null> | null;
  /** How each component and data store stands, while the gaps are laid over. */
  gaps: Map<string, Coverage> | null;
}

/** scores: the value of each risk by its threat scenario, from the checks. assetsInside: whether elements show their assets. */
export function shownOf(
  tara: Tara,
  scores: Map<string, { value: number | null }>,
  overlay: Overlay,
  assetsInside: boolean,
): Shown {
  const rowsKind = rowsOf(overlay);
  const withRows = rowsKind === "controls" || assetsInside;
  const values = riskValues(scores);
  return {
    rowsKind,
    rowsIn: (elementId) => (withRows ? heldIn(tara, rowsKind, elementId) : []),
    route: routeOf(tara, overlay),
    risks: overlay === "risk" ? highestRiskAt(tara, values) : null,
    gaps: overlay === "gaps" ? gapsAt(tara, values) : null,
  };
}

/** What a box shows besides its own name. */
export interface BoxShown {
  /** The assets that live in the element, or the controls that act in it. */
  rows: Held[];
  rowsKind: Inside;
  /** With a route shown: the element's place on it, counted from 1 at the entry point. */
  step: number | null;
  /** The risk value in the head: the highest that reaches the element, or in the gap view the risk that is not met. Undefined where none is shown. */
  risk: number | null | undefined;
  /** With a route shown: whether the element is on it. */
  onRoute: boolean | null;
  /** With the gaps shown: how the element stands. "none": no risk reaches it. */
  gap: Coverage["state"] | "none" | null;
}

/** What is laid over one element: its rows, and whichever of step, value and outline the layer has for it. */
export function boxShown(elementId: string, shown: Shown): BoxShown {
  const { route, risks, gaps } = shown;
  const gap = gaps?.get(elementId);
  const unmet = gap && (gap.state === "gap" || gap.state === "planned") ? gap.value : undefined;
  return {
    rows: shown.rowsIn(elementId),
    rowsKind: shown.rowsKind,
    step: route?.steps.get(elementId) ?? null,
    risk: risks ? (risks.get(elementId) ?? null) : unmet,
    onRoute: route ? route.steps.has(elementId) : null,
    gap: gaps ? (gap?.state ?? "none") : null,
  };
}

/** What a box shows: the element, what is laid over it, the chosen row if it is one of its own, and whether it takes what is being placed. */
export interface BoxData extends BoxShown, Record<string, unknown> {
  element: Element;
  chosenRow: string | null;
  target: boolean;
}

/** What a frame shows. note: the controls that act at the boundary, while controls are laid over. */
export interface FrameData extends Record<string, unknown> {
  element: Element;
  note: string;
}

/** A box or a frame as the canvas takes it. Inside a frame a box is placed from the frame's corner, so that it moves with its frame. */
export type DrawnNode =
  | { type: "box"; id: string; position: Point; parentId?: string; width: number; selected: boolean; data: BoxData }
  | {
      type: "frame";
      id: string;
      position: Point;
      width: number;
      height: number;
      zIndex: number;
      selected: boolean;
      data: FrameData;
    };

/** What of the page's state the canvas shows. */
export interface Marked {
  /** The chosen record: an element, or a row inside one. */
  selected: string | null;
  /** The elements chosen together, to be lined up. */
  chosen: string[];
  /** Whether what is being placed can go into an element. */
  takes: (elementId: string) => boolean;
}

/** The frames and boxes of the drawing. Frames come first: the canvas wants a node listed after the node that contains it. */
export function drawnNodes(own: Element[], places: Map<string, Place>, shown: Shown, marked: Marked): DrawnNode[] {
  const frames = own.filter(isFrame).map((frame): DrawnNode => {
    const place = places.get(frame.id) ?? { x: 0, y: 0, ...NEW_FRAME };
    const acting = shown.rowsKind === "controls" ? shown.rowsIn(frame.id).map((control) => control.id) : [];
    return {
      type: "frame",
      id: frame.id,
      position: { x: place.x, y: place.y },
      width: place.w,
      height: place.h,
      zIndex: -1,
      selected: frame.id === marked.selected,
      data: { element: frame, note: acting.join(", ") },
    };
  });
  const boxes = own.filter(isBox).map((box): DrawnNode => {
    const at = places.get(box.id) ?? { x: 0, y: 0 };
    const around = box.boundaryId === null ? undefined : places.get(box.boundaryId);
    return {
      type: "box",
      id: box.id,
      position: around ? { x: at.x - around.x, y: at.y - around.y } : { x: at.x, y: at.y },
      ...(around && box.boundaryId ? { parentId: box.boundaryId } : {}),
      width: NODE_WIDTH,
      selected: box.id === marked.selected || marked.chosen.includes(box.id),
      data: { element: box, ...boxShown(box.id, shown), chosenRow: marked.selected, target: marked.takes(box.id) },
    };
  });
  return [...frames, ...boxes];
}

/** A line of the drawing: one data flow, or several between the same two elements. */
export interface DrawnLine {
  /** The ID of its first flow, which names the line. */
  id: string;
  flowIds: string[];
  source: string;
  target: string;
  /** The side of each of the two elements the line joins. */
  sides: [Side, Side];
  /** The IDs of its flows, with their place on the route shown, and the IDs of what the flows carry. */
  label: string;
  /** How far along a straight line the label stands. */
  along: number;
  /** An arrowhead where the line starts, and one where it ends. Flows that share a line show none. */
  arrows: { start: boolean; end: boolean };
  /** The line is on the route of the attack path shown: it is drawn in the attacker's colour, whatever is chosen. */
  onRoute: boolean;
  /** The line comes forward: it is chosen, an element at one of its ends is, or it is on the route shown. */
  forward: boolean;
  /** The line steps back, because others come forward. */
  back: boolean;
}

/** places: where the boxes stand. selected: the chosen record, which may be a flow, a box, or something else. */
export function drawnLines(flows: Element[], places: Map<string, Place>, shown: Shown, selected: string | null): DrawnLine[] {
  const lines = sharedLines(flows);
  const along = labelPlaces(lines);
  const { route } = shown;
  const boxChosen = selected !== null && places.has(selected);
  return lines.flatMap((line): DrawnLine[] => {
    const first = line[0] as Element;
    const [source, target] = [first.sourceId as string, first.targetId as string];
    const [from, to] = [places.get(source), places.get(target)];
    if (!from || !to) return [];
    const flowIds = line.map((flow) => flow.id);
    const chosen = selected !== null && [...flowIds, source, target].includes(selected);
    const onRoute = flowIds.some((id) => route?.steps.has(id));
    const forward = chosen || onRoute;
    const named = flowIds.map((id) => (route?.steps.has(id) ? `${route.steps.get(id)}. ${id}` : id)).join(", ");
    // What a flow carries is named by its ID, as the rows of an element are: nothing stands behind a count.
    const carried = [...new Set(flowIds.flatMap((id) => shown.rowsIn(id).map((row) => row.id)))].join(", ");
    const direction = line.length === 1 ? first.direction : null;
    return [
      {
        id: first.id,
        flowIds,
        source,
        target,
        sides: facingSides(from, to),
        label: carried ? `${named} · ${carried}` : named,
        along: along.get(first.id) ?? 0.5,
        arrows: { start: direction === "backward" || direction === "both", end: direction === "forward" || direction === "both" },
        onRoute,
        forward,
        back: (route !== null || boxChosen) && !forward,
      },
    ];
  });
}
