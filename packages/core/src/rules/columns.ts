// Things set out in columns and linked across them: the order within each column, and the height each thing
// stands at, such that a thing stands level with what it is linked to and no two overlap.
//
// The graph of a TARA and the automatic arrangement of an architecture both stand their records this way.
// Nothing is stored: the same things with the same links are set out the same way each time.

/** A link between two things, by their IDs. Which way it points does not matter here. */
export type Link = readonly [from: string, to: string];

/** What `settleColumns` is told about the drawing it sets out: how tall each thing is, and the room to keep between two. */
export interface ColumnsOptions {
  /** How tall each thing is drawn. */
  heightOf: (id: string) => number;
  /** The room between two things of one column. */
  gap: number;
}

/** How often the columns are gone through, there and back. More changes little on drawings of this kind. */
const SWEEPS = 6;

const mean = (values: number[]): number => values.reduce((total, value) => total + value, 0) / values.length;

/** The things each thing is linked to, among those that are set out. */
function neighboursOf(ids: string[], links: readonly Link[]): Map<string, string[]> {
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [from, to] of links) {
    if (from === to || !neighbours.has(from) || !neighbours.has(to)) continue;
    neighbours.get(from)?.push(to);
    neighbours.get(to)?.push(from);
  }
  return neighbours;
}

/**
 * The top edge of every thing, by ID, the highest at 0.
 *
 * columns: the things of each column, in the order of their list. Within a column they are put in the order,
 * and at the heights, that bring each level with the middle of what it is linked to; a thing nothing is
 * linked to keeps the place its list gives it. Two things of a column are never closer than the gap.
 */
export function settleColumns(
  columns: readonly (readonly string[])[],
  links: readonly Link[],
  { heightOf, gap }: ColumnsOptions,
): Map<string, number> {
  const inOrder = columns.map((column) => [...column]).filter((column) => column.length > 0);
  const neighbours = neighboursOf(inOrder.flat(), links);
  const top = new Map<string, number>();
  const middle = (id: string): number => (top.get(id) ?? 0) + heightOf(id) / 2;

  // To begin with, every column is stacked from the top in the order of its list.
  for (const column of inOrder) {
    let free = 0;
    for (const id of column) {
      top.set(id, free);
      free += heightOf(id) + gap;
    }
  }
  /** Where a thing would like its top edge: such that its middle is level with the middle of what it is linked to. */
  const wish = (id: string): number => {
    const linked = (neighbours.get(id) ?? []).map(middle);
    return linked.length > 0 ? mean(linked) - heightOf(id) / 2 : (top.get(id) ?? 0);
  };
  /**
   * Sets the things of one column at the heights they wish for, in the order of those wishes, without letting
   * two overlap: each takes its wish or the first free height below the thing above it, and the column as a
   * whole is then moved so that it is as much too low as too high.
   */
  const settle = (column: string[]): void => {
    const wished = new Map(column.map((id) => [id, wish(id)]));
    const wishOf = (id: string): number => wished.get(id) ?? 0;
    // a stable sort, by where the middles would stand: things that wish for the same keep the order they had
    column.sort((a, b) => wishOf(a) + heightOf(a) / 2 - (wishOf(b) + heightOf(b) / 2));
    let free = Number.NEGATIVE_INFINITY;
    const given = column.map((id) => {
      const at = Math.max(wishOf(id), free);
      free = at + heightOf(id) + gap;
      return at;
    });
    const shift = mean(column.map((id, index) => (given[index] ?? 0) - wishOf(id)));
    column.forEach((id, index) => {
      top.set(id, (given[index] ?? 0) - shift);
    });
  };
  for (let round = 0; round < SWEEPS; round++) {
    for (const column of round % 2 === 0 ? inOrder : [...inOrder].reverse()) settle(column);
  }

  const highest = Math.min(0, ...top.values());
  return new Map([...top].map(([id, at]) => [id, Math.round(at - highest)]));
}
