// What an element of the architecture holds: the assets that live in it and the controls that act in it.
//
// An asset and a control name their places in the same way, in `elementIds`, so the same few functions put
// either of them in an element, move it and take it out. No screen code, so that it can be tested.

import { cutText, type Tara } from "@tara/core";

/** What can sit in an element as a row, and be moved to another. */
export type Inside = "assets" | "controls";

/** What names elements as its places: an asset, a control, and an attack path, whose places in order are its route. */
export type Placed = Inside | "paths";

/** A row: an asset or a control, with what it is called. */
export interface Held {
  id: string;
  name: string | null;
}

const held = ({ id, name }: Held): Held => ({ id, name });

/** The elements an asset lives in, a control acts in, or the route of an attack path passes. */
export const homesOf = (tara: Tara, kind: Placed, id: string): string[] =>
  tara[kind].find((record) => record.id === id)?.elementIds ?? [];

/** The assets that live in an element, or the controls that act in it. */
export const heldIn = (tara: Tara, kind: Inside, elementId: string): Held[] =>
  tara[kind].filter((record) => record.elementIds.includes(elementId)).map(held);

/**
 * What does not say where it is yet: the assets of the item that live nowhere, or the controls that act
 * nowhere. A control may rightly stay so: a procedure or a training has no place in the architecture.
 */
export function notPlaced(tara: Tara, kind: Inside, itemId: string): Held[] {
  if (kind === "controls") return tara.controls.filter((control) => control.elementIds.length === 0).map(held);
  const ofItem = tara.assets.filter((asset) => asset.itemId === itemId || asset.itemId === null);
  return ofItem.filter((asset) => asset.elementIds.length === 0).map(held);
}

/** How many of the assets, or of the controls, have a place among these elements, and how many there are. */
export function placedCount(tara: Tara, kind: Inside, elementIds: Set<string>): { placed: number; all: number } {
  const placed = tara[kind].filter((record) => record.elementIds.some((id) => elementIds.has(id)));
  return { placed: placed.length, all: tara[kind].length };
}

/** The homes of a row once it is put in an element: moved there from `from`, or added to where it is already. */
export const putIn = (homes: string[], from: string | null, to: string): string[] => [
  ...new Set(from === null ? [...homes, to] : homes.map((home) => (home === from ? to : home))),
];

/** The homes of a row once it is taken out of an element. */
export const takenOut = (homes: string[], from: string): string[] => homes.filter((home) => home !== from);

/**
 * What a change of places did, in words, for the note that offers to take it back.
 * what: the ID of the asset or control, or of the attack path whose route changed. Null where nothing changed.
 */
export function whatWasDone(kind: Placed, what: string, before: string[], next: string[]): string | null {
  if (next.join() === before.join()) return null;
  const added = next.filter((id) => !before.includes(id)).join(", ");
  const removed = before.filter((id) => !next.includes(id)).join(", ");
  if (kind === "paths") {
    if (next.length === 0) return `The route of ${what} was cleared`;
    if (added) return `${added} put on the route of ${what}`;
    return removed ? `${removed} taken off the route of ${what}` : `The route of ${what} was reordered`;
  }
  if (added && removed) return `${what} moved from ${removed} to ${added}`;
  return added ? `${what} put in ${added}` : `${what} taken out of ${removed}`;
}

/** The name of a row, with the ID that leads to it. */
export const nameOf = (row: Held): string => row.name ?? "No name yet";

/**
 * The name of a row as it fits beside its ID in so many characters: whole, or cut after a whole word. The ID
 * stands in front of it and leads to the name in full.
 */
export const rowText = (row: Held, room: number): string => cutText(nameOf(row), Math.max(8, room - row.id.length - 1));
