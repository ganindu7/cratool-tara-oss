// Where the elements of an architecture are drawn.
//
// A person can place every element by hand, and the place is kept. But the drawing must not depend on that:
// a TARA taken in from a file brings its records and not how someone arranged them, and a new element has no
// place yet. So every element always has a place: the one it was given, or else one worked out here from
// what the records say. The screens and the report both draw from this, and so draw the same.

import type { Element } from "../model/tara.ts";

/** The size every component, outside party and data store is drawn at. A position is its top left corner. */
export const ELEMENT_SIZE = { w: 190, h: 76 };

export interface Place {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 44;
const PADDING = 50;
const TOP = 40;
const BETWEEN_COLUMNS = 110;

/**
 * The place of every element of one item, by ID. Data flows have none: they run between their ends.
 *
 * Elements that were never placed are set out in columns, from the outside in: the outside parties on the
 * left, then what stands inside no boundary, then each trust boundary as a frame around what is in it.
 */
export function arrangeElements(elements: Element[]): Map<string, Place> {
  const places = new Map<string, Place>();
  const things = elements.filter((e) => e.kind !== "data_flow" && e.kind !== "trust_boundary");
  const boundaries = elements.filter((e) => e.kind === "trust_boundary");
  let left = 0;

  /** Stacks elements in a column from a point downwards, and gives the height the column takes. */
  const stack = (column: Element[], x: number, y: number): number => {
    column.forEach((element, index) => {
      places.set(element.id, { x, y: y + index * (ELEMENT_SIZE.h + GAP), ...ELEMENT_SIZE });
    });
    return Math.max(0, column.length * (ELEMENT_SIZE.h + GAP) - GAP);
  };

  const outsideParties = things.filter((e) => e.boundaryId === null && e.kind === "external_interactor");
  const unbounded = things.filter((e) => e.boundaryId === null && e.kind !== "external_interactor");
  for (const column of [outsideParties, unbounded]) {
    if (column.length === 0) continue;
    stack(column, left, TOP + PADDING);
    left += ELEMENT_SIZE.w + BETWEEN_COLUMNS;
  }
  for (const boundary of boundaries) {
    const members = things.filter((e) => e.boundaryId === boundary.id);
    const height = stack(members, left + PADDING, TOP + PADDING);
    places.set(boundary.id, { x: left, y: TOP, w: ELEMENT_SIZE.w + 2 * PADDING, h: Math.max(160, height + 2 * PADDING) });
    left += ELEMENT_SIZE.w + 2 * PADDING + BETWEEN_COLUMNS;
  }

  // What a person placed stays where it was put.
  for (const element of elements) {
    const worked = places.get(element.id);
    if (!worked || element.x === null || element.y === null) continue;
    const size = element.kind === "trust_boundary" ? { w: element.w ?? worked.w, h: element.h ?? worked.h } : ELEMENT_SIZE;
    places.set(element.id, { x: element.x, y: element.y, ...size });
  }
  return places;
}
