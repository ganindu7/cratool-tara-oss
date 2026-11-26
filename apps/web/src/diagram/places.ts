// Where the elements of one item stand on the architecture diagram, and the arithmetic of moving them.
//
// An element has the place a person gave it, or else the one `arrangeElements` works out from the records.
// What the diagram adds is height: an element is drawn as a head with one row beneath it for each asset or
// control it holds, so it is as tall as what is in it, and the arrangement is worked out for elements of
// that height. No screen code, so that all of it can be tested.

import { arrangeElements, type Change, type Element, type Place } from "@tara/core";

/** The width of a component, an outside party and a data store on the diagram. */
export const NODE_WIDTH = 176;
/** The height of the head of an element: its ID and its name. */
export const HEAD_HEIGHT = 58;
/** The height of one row inside an element: an asset that lives there, or a control that acts there. */
export const ROW_HEIGHT = 19;
/** The space above and below the rows of an element, together. */
const ROWS_PADDING = 9;
/** Positions snap to this grid while an element is dragged. */
export const GRID = 12;
/** The size a trust boundary is given when it is added. */
export const NEW_FRAME = { w: 360, h: 240 };

/** A place on the drawing, or on the canvas. */
export interface Point {
  x: number;
  y: number;
}

/** A trust boundary is drawn as a frame. */
export const isFrame = (element: Element): boolean => element.kind === "trust_boundary";
/** A data flow is drawn as a line. */
export const isFlow = (element: Element): boolean => element.kind === "data_flow";
/** Everything else is a box, which can hold assets and controls: a component, an outside party, a data store. */
export const isBox = (element: Element): boolean => !isFrame(element) && !isFlow(element);

/** How tall an element is drawn: its head, and a row for each thing it holds. */
export const heightOf = (rows: number): number => HEAD_HEIGHT + (rows > 0 ? ROWS_PADDING + rows * ROW_HEIGHT : 0);

/**
 * The place of every box and frame of one item, at the size the diagram draws it.
 * rowsIn: how many rows each box shows at the moment, which decides its height.
 */
export const placesOf = (elements: Element[], rowsIn: (elementId: string) => number): Map<string, Place> =>
  arrangeElements(elements, (element) => ({ w: NODE_WIDTH, h: heightOf(rowsIn(element.id)) }));

/** The middle of an element's head: the point that says which frame the element is in. */
export const headCentre = (at: Point): Point => ({ x: at.x + NODE_WIDTH / 2, y: at.y + HEAD_HEIGHT / 2 });

/** The frame a point lies in: the smallest, where frames lie inside one another. Null where it lies in none. */
export function frameAround(point: Point, frames: { id: string; place: Place }[]): string | null {
  const holds = (place: Place) =>
    point.x >= place.x && point.x <= place.x + place.w && point.y >= place.y && point.y <= place.y + place.h;
  const around = frames.filter((frame) => holds(frame.place)).sort((a, b) => a.place.w * a.place.h - b.place.w * b.place.h);
  return around[0]?.id ?? null;
}

/** A box or a frame as it stands on the canvas when a drag ends. */
export interface OnCanvas {
  element: Element;
  /** Its corner, counted from the corner of the frame it is drawn in, if it is drawn in one. */
  at: Point;
  /** The frame it is drawn in, which it moves with. */
  within: string | null;
  /** For a frame: its size. */
  size?: { w: number; h: number };
}

/**
 * What a drag changed. Everything that moved gets its place on the whole drawing stored: what was dragged, and
 * what sits in a frame that was. A box then belongs to the frame the middle of its head lies in, or to none.
 */
export function changesAfterDrag(canvas: OnCanvas[], draggedIds: string[]): Change[] {
  const byId = new Map(canvas.map((each) => [each.element.id, each]));
  const onDrawing = (each: OnCanvas): Point => {
    const frame = each.within === null ? undefined : byId.get(each.within);
    return { x: Math.round(each.at.x + (frame?.at.x ?? 0)), y: Math.round(each.at.y + (frame?.at.y ?? 0)) };
  };
  const frames = canvas.filter((each) => isFrame(each.element));
  const framePlaces = frames.map((each) => ({ id: each.element.id, place: { ...onDrawing(each), ...(each.size ?? NEW_FRAME) } }));
  const moved = canvas.filter((each) => draggedIds.includes(each.element.id) || draggedIds.includes(each.within ?? ""));

  return moved.flatMap((each): Change[] => {
    const { element } = each;
    const at = onDrawing(each);
    const values: Record<string, unknown> = at.x === element.x && at.y === element.y ? {} : { ...at };
    const frame = isBox(element) ? frameAround(headCentre(at), framePlaces) : element.boundaryId;
    if (frame !== element.boundaryId) values.boundaryId = frame;
    return Object.keys(values).length > 0 ? [{ op: "set", kind: "elements", id: element.id, values }] : [];
  });
}

/** A position, on the grid. */
export const onGrid = (value: number): number => Math.round(value / GRID) * GRID;

/** How several chosen elements are put in order: on their left edge, on their top edge, or evenly spaced. */
export type Tidy = "left" | "top" | "space";

/**
 * Where the chosen elements stand once they are lined up. Evenly spaced means along the direction they are
 * spread in most, between the first and the last, which stay. Fewer than two elements are left as they are.
 */
export function tidy(places: Map<string, Place>, ids: string[], how: Tidy): Map<string, Point> {
  const chosen = ids.flatMap((id) => {
    const place = places.get(id);
    return place ? [{ id, x: place.x, y: place.y }] : [];
  });
  const moved = new Map<string, Point>();
  if (chosen.length < 2) return moved;
  if (how === "space") return spaced(chosen);
  const edge = Math.min(...chosen.map((point) => (how === "left" ? point.x : point.y)));
  for (const { id, x, y } of chosen) moved.set(id, how === "left" ? { x: edge, y } : { x, y: edge });
  return moved;
}

function spaced(chosen: (Point & { id: string })[]): Map<string, Point> {
  const spread = (axis: "x" | "y") => Math.max(...chosen.map((p) => p[axis])) - Math.min(...chosen.map((p) => p[axis]));
  const axis = spread("x") > spread("y") ? "x" : "y";
  const inOrder = [...chosen].sort((a, b) => a[axis] - b[axis]);
  const first = (inOrder[0] as Point)[axis];
  const step = ((inOrder.at(-1) as Point)[axis] - first) / (inOrder.length - 1);
  return new Map(inOrder.map(({ id, x, y }, index) => [id, { x, y, [axis]: onGrid(first + index * step) }]));
}
