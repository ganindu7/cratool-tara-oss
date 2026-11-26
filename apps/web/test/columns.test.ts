// Where the records of the whole graph stand: one column per kind in the order of the method, no two records
// on top of each other, and the same arrangement every time for the same records.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeColumns, COLUMN_GAP, ROW_GAP } from "../src/views/columns.ts";
import { chainOf, GRAPH_KINDS, type Thing } from "../src/views/graph.ts";
import { NODE } from "../src/views/layout.ts";
import { EXAMPLES, emptyTara, example, withGraph } from "./helpers.ts";

const drawn = (name: (typeof EXAMPLES)[number]) => {
  const { graph } = withGraph(example(name));
  const things = [...graph.things.values()];
  return { graph, things, places: arrangeColumns(things, graph.links) };
};
const columnOf = (thing: Thing) => GRAPH_KINDS.findIndex((kind) => kind.key === thing.kind);

for (const name of EXAMPLES) {
  test(`${name}: every record of the graph has a place, in the column of its kind`, () => {
    const { things, places } = drawn(name);
    assert.equal(places.size, things.length);
    // columns stand in the order of the method, a set distance apart, and a kind without records takes none
    const used = [...new Set(things.map(columnOf))].sort((a, b) => a - b);
    for (const thing of things) {
      assert.equal(places.get(thing.id)?.x, used.indexOf(columnOf(thing)) * (NODE.w + COLUMN_GAP), thing.id);
    }
  });

  test(`${name}: no two records of a column overlap, and the highest stands at the top`, () => {
    const { things, places } = drawn(name);
    const heights = things.map((thing) => places.get(thing.id)?.y ?? Number.NaN);
    assert.equal(Math.min(...heights), 0);
    for (const kind of GRAPH_KINDS) {
      const column = things
        .filter((thing) => thing.kind === kind.key)
        .map((thing) => places.get(thing.id)?.y ?? Number.NaN)
        .sort((a, b) => a - b);
      column.slice(1).forEach((y, index) => {
        assert.ok(y - (column[index] ?? 0) >= NODE.h + ROW_GAP - 1, `${kind.many}: ${column[index]} and ${y} are too close`);
      });
    }
  });

  test(`${name}: the same records are arranged the same way each time`, () => {
    const { graph, things } = drawn(name);
    assert.deepEqual([...arrangeColumns(things, graph.links)], [...arrangeColumns([...things], [...graph.links])]);
  });

  test(`${name}: a record stands near what it is linked to`, () => {
    const { graph, things, places } = drawn(name);
    const centre = (id: string) => (places.get(id)?.y ?? 0) + NODE.h / 2;
    const tallest = Math.max(...GRAPH_KINDS.map((kind) => things.filter((thing) => thing.kind === kind.key).length));
    // on average a link rises or falls by less than a third of the tallest column: the lines stay short
    const rise = graph.links.map(([from, to]) => Math.abs(centre(from) - centre(to)));
    const mean = rise.reduce((total, each) => total + each, 0) / Math.max(1, rise.length);
    assert.ok(mean < (tallest * (NODE.h + ROW_GAP)) / 3, `links rise by ${Math.round(mean)} on average`);
  });

  test(`${name}: the chain of one risk is arranged as well as the whole`, () => {
    const { graph } = withGraph(example(name));
    const risk = [...graph.things.values()].find((thing) => thing.kind === "risks");
    assert.ok(risk);
    const chain = chainOf(graph, [risk.id]);
    const things = [...graph.things.values()].filter((thing) => chain.has(thing.id));
    const places = arrangeColumns(
      things,
      graph.links.filter(([from, to]) => chain.has(from) && chain.has(to)),
    );
    assert.equal(places.size, things.length);
    const seen = new Set([...places.values()].map((place) => `${place.x},${place.y}`));
    assert.equal(seen.size, things.length, "no two records share a place");
  });
}

test("a TARA with nothing on its graph is arranged without a place", () => {
  const { graph } = withGraph(emptyTara());
  assert.equal(arrangeColumns([...graph.things.values()], graph.links).size, graph.things.size);
});

test("a link to a record that is not drawn is left out of account", () => {
  const { graph, things } = drawn("kettle");
  const some = things.filter((thing) => thing.kind === "assets" || thing.kind === "risks");
  const places = arrangeColumns(some, graph.links);
  assert.equal(places.size, some.length);
  for (const place of places.values()) assert.ok(Number.isFinite(place.x) && Number.isFinite(place.y));
});
