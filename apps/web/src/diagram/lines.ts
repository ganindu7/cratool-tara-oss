// The lines of the architecture diagram: which data flows share one, and where along a line its label stands.
// Which sides of its two elements a line joins, and its shape, is the same on screen and in the report, and is
// worked out in core (rules/flows.ts). No screen code, so that it can be tested.

import type { Element } from "@tara/core";

/** A data flow with both ends, which are two different elements: only such a flow can be drawn. */
const isDrawn = (flow: Element): boolean => flow.sourceId !== null && flow.targetId !== null && flow.sourceId !== flow.targetId;

/** The data flows that have an open end, and so are not drawn. */
export const openFlows = (flows: Element[]): Element[] => flows.filter((flow) => !isDrawn(flow));

/** Data flows between the same two elements share one line. Each group is one line, in the order of the first flow of each. */
export function sharedLines(flows: Element[]): Element[][] {
  const lines = new Map<string, Element[]>();
  for (const flow of flows.filter(isDrawn)) {
    const ends = [flow.sourceId, flow.targetId].sort().join("|");
    lines.set(ends, [...(lines.get(ends) ?? []), flow]);
  }
  return [...lines.values()];
}

/**
 * How far along each straight line its label stands, from 0 at its first end to 1 at its second. Lines to
 * one element fan out from it, so a label is set towards the end with fewer lines, clear of where they meet.
 * The lines are named by the ID of their first flow.
 */
export function labelPlaces(lines: Element[][]): Map<string, number> {
  const joined = new Map<string, number>();
  const ends = (line: Element[]) => [line[0]?.sourceId, line[0]?.targetId] as [string, string];
  for (const line of lines) for (const end of ends(line)) joined.set(end, (joined.get(end) ?? 0) + 1);
  const along = new Map<string, number>();
  for (const line of lines) {
    const [source, target] = ends(line).map((end) => joined.get(end) ?? 0) as [number, number];
    along.set((line[0] as Element).id, target < source ? 0.7 : target > source ? 0.3 : 0.5);
  }
  return along;
}
