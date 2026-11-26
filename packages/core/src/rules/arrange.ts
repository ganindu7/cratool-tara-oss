// Where the elements of an architecture are drawn.
//
// A person can place every element by hand, and the place is kept. But the drawing must not depend on that:
// a TARA taken in from a file brings its records and not how someone arranged them, and a new element has no
// place yet. So every element always has a place: the one it was given, or else one worked out here from
// what the records say. The screens and the report both draw from this, and so draw the same.
//
// What is worked out reads from the outside in, as a data flow diagram is read: the outside parties on the
// left, then what they talk to, then what that talks to. A trust boundary is a frame around what is in it, and
// is set out as one block among its neighbours; inside, its own elements are set out the same way. Elements
// that are joined by a data flow stand level with one another where they can, so that the lines are short and
// cross little.

import type { Element } from "../model/tara.ts";
import { type Link, settleColumns } from "./columns.ts";

/** How wide and how tall something is drawn. */
export interface Size {
  w: number;
  h: number;
}
/** Where something is drawn: its top left corner, and its size. */
export interface Place extends Size {
  x: number;
  y: number;
}

/** The size a component, an outside party and a data store is drawn at where nothing says otherwise. */
export const ELEMENT_SIZE: Size = { w: 190, h: 76 };
/** The room between two elements, or frames, that stand one below the other. */
const GAP = 44;
/** The room between two columns: enough for a line with its label. */
const BETWEEN_COLUMNS = 110;
/** The room a frame keeps around what is in it. Its name stands in the room at the top. */
const PADDING = 50;
/** The size of a frame that holds nothing yet. */
const EMPTY_FRAME: Size = { w: ELEMENT_SIZE.w + 2 * PADDING, h: 160 };

const isFlow = (element: Element): boolean => element.kind === "data_flow";
const isFrame = (element: Element): boolean => element.kind === "trust_boundary";
/** A person gave it a place. */
const isPlaced = (element: Element): element is Element & { x: number; y: number } => element.x !== null && element.y !== null;

/** The box around some places. */
function around(places: Place[]): Place {
  const x = Math.min(...places.map((place) => place.x));
  const y = Math.min(...places.map((place) => place.y));
  const right = Math.max(...places.map((place) => place.x + place.w));
  const bottom = Math.max(...places.map((place) => place.y + place.h));
  return { x, y, w: right - x, h: bottom - y };
}

// ---------------------------------------------------------------------------------------------------- the tree

/** The boxes and frames of one item as a tree: a frame holds what names it as its boundary. */
interface Tree {
  /** Everything that is drawn as a box or a frame, by ID. */
  byId: Map<string, Element>;
  /** What a frame holds, or with null what stands in no frame, in the order of the list. */
  kidsOf: (frameId: string | null) => Element[];
  /** Everything inside a frame, however deep. */
  insideOf: (frameId: string) => Element[];
  /** The child of a frame (or of the whole, with null) that is or holds an element. Null where it is not in there. */
  kidHolding: (frameId: string | null, id: string) => string | null;
  /** The data flows that can be drawn: each joins two different boxes. */
  flows: Link[];
}

function treeOf(elements: Element[]): Tree {
  const drawn = elements.filter((element) => !isFlow(element));
  const byId = new Map(drawn.map((element) => [element.id, element]));
  const frameAbove = (element: Element | undefined): string | null => {
    const above = element?.boundaryId ?? null;
    const frame = above === null ? undefined : byId.get(above);
    return frame && isFrame(frame) && frame.id !== element?.id ? frame.id : null;
  };
  // An element stands in the frame it names. A frame that, going up from frame to frame, comes back to itself
  // stands in none; what it holds still stands in it.
  const parent = new Map<string, string | null>();
  for (const element of drawn) {
    let above = frameAbove(element);
    const seen = new Set<string>();
    for (let at = above; at !== null && !seen.has(at); at = frameAbove(byId.get(at))) {
      if (at === element.id) above = null;
      seen.add(at);
    }
    parent.set(element.id, above);
  }
  const kidsOf = (frameId: string | null) => drawn.filter((element) => parent.get(element.id) === frameId);
  const insideOf = (frameId: string): Element[] => kidsOf(frameId).flatMap((kid) => [kid, ...insideOf(kid.id)]);
  const kidHolding = (frameId: string | null, id: string): string | null => {
    for (let at: string | null = id; at !== null && parent.has(at); at = parent.get(at) ?? null) {
      if ((parent.get(at) ?? null) === frameId) return at;
    }
    return null;
  };
  const isBox = (id: string | null): id is string => id !== null && byId.has(id) && !isFrame(byId.get(id) as Element);
  const flows = elements
    .filter(isFlow)
    .flatMap((flow): Link[] =>
      isBox(flow.sourceId) && isBox(flow.targetId) && flow.sourceId !== flow.targetId ? [[flow.sourceId, flow.targetId]] : [],
    );
  return { byId, kidsOf, insideOf, kidHolding, flows };
}

// ------------------------------------------------------------------------------------------ worked out anew

/**
 * The columns of a group, from the left: first the things the drawing is read from, then what is joined to
 * them, then what is joined to that. What is joined to nothing in the columns so far starts again at the left.
 */
function columnsOf(ids: string[], links: Link[], readFrom: string[]): string[][] {
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [from, to] of links) {
    neighbours.get(from)?.push(to);
    neighbours.get(to)?.push(from);
  }
  const column = new Map<string, number>();
  const spread = (from: string[]) => {
    for (const id of from) column.set(id, 0);
    for (let edge = from; edge.length > 0; ) {
      const next = edge.flatMap((id) => (neighbours.get(id) ?? []).filter((other) => !column.has(other)));
      for (const id of next) column.set(id, (column.get(edge[0] as string) ?? 0) + 1);
      edge = [...new Set(next)];
    }
  };
  spread(readFrom.filter((id) => neighbours.has(id)));
  for (const id of ids) if (!column.has(id)) spread([id]);
  const columns: string[][] = [];
  for (const id of ids) {
    const at = column.get(id) ?? 0;
    columns[at] = [...(columns[at] ?? []), id];
  }
  return columns.filter((each) => each !== undefined);
}

/** What sets out a group needs to know, whichever group it is. */
interface SettingOut {
  tree: Tree;
  sizeOf: (element: Element) => Size;
}

/**
 * Sets out everything a frame holds (or, with null, everything that stands in no frame), each frame among it
 * as one block with its own contents set out inside it.
 * toTheLeft: the boxes that stand in earlier columns, here or around this frame. A frame is read from where it
 * is entered from those.
 * Gives the place of each, counted from the top left corner of the room they take together, and that room.
 */
function setOut(
  { tree, sizeOf }: SettingOut,
  frameId: string | null,
  toTheLeft: ReadonlySet<string>,
): { places: Map<string, Place>; room: Size } {
  const kids = tree.kidsOf(frameId);
  const places = new Map<string, Place>();
  if (kids.length === 0) return { places, room: { w: 0, h: 0 } };

  // Two children are linked where a data flow joins something in the one with something in the other. A flow
  // with one end here and the other elsewhere says where the group is entered: from the left, or at all.
  const links: Link[] = [];
  const entered = { fromTheLeft: [] as string[], atAll: [] as string[] };
  for (const [source, target] of tree.flows) {
    const from = tree.kidHolding(frameId, source);
    const to = tree.kidHolding(frameId, target);
    if (from && to && from !== to) links.push([from, to]);
    if ((from === null) === (to === null)) continue;
    const [here, elsewhere] = from ? [from, target] : [to as string, source];
    entered.atAll.push(here);
    if (toTheLeft.has(elsewhere)) entered.fromTheLeft.push(here);
  }
  // The whole is read from its outside parties; a frame from where it is entered, from the left if it is;
  // either, failing that, from its first element.
  const outside = kids.filter((kid) => kid.kind === "external_interactor").map((kid) => kid.id);
  const ids = kids.map((kid) => kid.id);
  const readFrom = [frameId === null ? outside : entered.fromTheLeft, entered.atAll, ids.slice(0, 1)].find(
    (each) => each.length > 0,
  );
  const columns = columnsOf(ids, links, readFrom ?? []);

  // A frame is set out inside once it is known what stands to its left; it is then as large as what it holds, with room around it.
  const boxesOf = (kid: Element): string[] =>
    isFrame(kid) ? tree.insideOf(kid.id).flatMap((each) => (isFrame(each) ? [] : [each.id])) : [kid.id];
  const inside = new Map<string, { places: Map<string, Place>; room: Size }>();
  const left = new Set(toTheLeft);
  for (const column of columns) {
    const here = column.map((id) => tree.byId.get(id) as Element);
    for (const kid of here.filter(isFrame)) inside.set(kid.id, setOut({ tree, sizeOf }, kid.id, left));
    for (const kid of here) for (const id of boxesOf(kid)) left.add(id);
  }
  const sizeOfKid = (id: string): Size => {
    const held = inside.get(id);
    if (!held) return sizeOf(tree.byId.get(id) as Element);
    return held.places.size > 0 ? { w: held.room.w + 2 * PADDING, h: held.room.h + 2 * PADDING } : EMPTY_FRAME;
  };

  const top = settleColumns(columns, links, { heightOf: (id) => sizeOfKid(id).h, gap: GAP });
  let x = 0;
  for (const column of columns) {
    for (const id of column) places.set(id, { x, y: top.get(id) ?? 0, ...sizeOfKid(id) });
    x += Math.max(...column.map((id) => sizeOfKid(id).w)) + BETWEEN_COLUMNS;
  }
  // What a frame holds stands inside it.
  for (const [id, held] of inside) {
    const frame = places.get(id) as Place;
    for (const [heldId, place] of held.places) {
      places.set(heldId, { ...place, x: frame.x + PADDING + place.x, y: frame.y + PADDING + place.y });
    }
  }
  const all = around([...places.values()]);
  return { places, room: { w: all.x + all.w, h: all.y + all.h } };
}

// --------------------------------------------------------------------------------------- what a person placed

/**
 * The places of everything, where a person placed some of it. What was placed stays where it was put. What
 * was not is set beneath what was, in the frame it belongs to, arranged among itself as it would be anyway:
 * a new element appears below the drawing, ready to be moved to where it belongs.
 */
function keepPlaced(tree: Tree, sizeOf: (element: Element) => Size, worked: Map<string, Place>): Map<string, Place> {
  const places = new Map<string, Place>();
  /** Nobody placed it, nor anything in it: it goes where it is set, and what it holds goes with it. */
  const floats = (element: Element): boolean =>
    !isPlaced(element) && !(isFrame(element) && tree.insideOf(element.id).some(isPlaced));

  /** Settles what a frame holds, or what stands in no frame, and gives the places of those children. */
  const settle = (frameId: string | null): Place[] => {
    const kids = tree.kidsOf(frameId);
    const settled: Place[] = [];
    for (const kid of kids.filter((each) => !floats(each))) {
      const place = isFrame(kid) ? frameAround(kid) : { x: kid.x ?? 0, y: kid.y ?? 0, ...sizeOf(kid) };
      places.set(kid.id, place);
      settled.push(place);
    }
    const floating = kids.filter(floats);
    if (floating.length === 0) return settled;

    const asWorked = around(floating.map((kid) => worked.get(kid.id) as Place));
    const frame = frameId === null ? undefined : tree.byId.get(frameId);
    // beneath what is placed here; in a placed frame that holds nothing placed, at its top left corner
    const corner =
      settled.length > 0
        ? { x: around(settled).x, y: around(settled).y + around(settled).h + GAP }
        : frame && isPlaced(frame)
          ? { x: frame.x + PADDING, y: frame.y + PADDING }
          : asWorked;
    for (const kid of floating) {
      for (const moved of [kid, ...(isFrame(kid) ? tree.insideOf(kid.id) : [])]) {
        const place = worked.get(moved.id) as Place;
        places.set(moved.id, { ...place, x: place.x - asWorked.x + corner.x, y: place.y - asWorked.y + corner.y });
      }
      settled.push(places.get(kid.id) as Place);
    }
    return settled;
  };

  /** A frame that was placed keeps its corner, and its size if it was given one. Otherwise it stands around what it holds. */
  const frameAround = (frame: Element): Place => {
    const held = settle(frame.id);
    if (!isPlaced(frame)) {
      const box = around(held);
      return { x: box.x - PADDING, y: box.y - PADDING, w: box.w + 2 * PADDING, h: box.h + 2 * PADDING };
    }
    const reach = held.length > 0 ? around(held) : null;
    const needed = {
      w: Math.max(EMPTY_FRAME.w, reach ? reach.x + reach.w + PADDING - frame.x : 0),
      h: Math.max(EMPTY_FRAME.h, reach ? reach.y + reach.h + PADDING - frame.y : 0),
    };
    return { x: frame.x, y: frame.y, w: frame.w ?? needed.w, h: frame.h ?? needed.h };
  };

  settle(null);
  return places;
}

/**
 * The place of every element of one item, by ID. Data flows have none: they run between their ends.
 * sizeOf: how large each component, outside party and data store is drawn; a frame is as large as what it holds.
 */
export function arrangeElements(
  elements: Element[],
  sizeOf: (element: Element) => Size = () => ELEMENT_SIZE,
): Map<string, Place> {
  const tree = treeOf(elements);
  const worked = setOut({ tree, sizeOf }, null, new Set()).places;
  return [...tree.byId.values()].some(isPlaced) ? keepPlaced(tree, sizeOf, worked) : worked;
}
