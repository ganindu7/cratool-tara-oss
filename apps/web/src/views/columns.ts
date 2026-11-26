// Where the records of the whole graph stand: one column for each kind of record, in the order of the method,
// and within a column an order and a height that keep the lines short and crossing little. The settling of
// the columns is the same that arranges an architecture (core, rules/columns.ts).
//
// No screen code here, so that the arrangement can be tested. It is worked out anew whenever the graph is
// drawn; nothing of it is stored.

import { type Link, settleColumns } from "@tara/core";
import { GRAPH_KINDS, type Thing } from "./graph.ts";
import { NODE, type Places } from "./layout.ts";

/** The room between two columns. */
export const COLUMN_GAP = 46;
/** The room between two records that stand one above the other in a column. */
export const ROW_GAP = 12;
/** The room above a column for the name of its kind and the number of its records. */
export const HEADING_ROOM = 40;

/**
 * The top left corner of every record: columns by kind, and within each column the records in the order and
 * at the heights that bring them level with what they are linked to. A kind without records takes no column.
 */
export function arrangeColumns(things: Thing[], links: readonly Link[]): Places {
  const columns = GRAPH_KINDS.map((kind) => things.filter((thing) => thing.kind === kind.key).map((thing) => thing.id)).filter(
    (column) => column.length > 0,
  );
  const top = settleColumns(columns, links, { heightOf: () => NODE.h, gap: ROW_GAP });
  const places: Places = new Map();
  columns.forEach((column, index) => {
    for (const id of column) places.set(id, { x: index * (NODE.w + COLUMN_GAP), y: top.get(id) ?? 0 });
  });
  return places;
}
