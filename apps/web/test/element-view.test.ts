// The view of one architecture element: what it holds, where everything stands, and what its lines are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { drawElementView, type ElementView, elementView } from "../src/views/element-view.ts";
import { NODE, NODE_READABLE } from "../src/views/layout.ts";
import { boxesOf } from "../src/views/views.ts";
import {
  arrowsAreSound,
  atBothSizes,
  hangsBeneath,
  linesRunBetweenBoxes,
  noneOverlap,
  numbers,
  placed,
  placedIds,
} from "./helpers.ts";

// ----------------------------------------------------------------------------------------------- what it holds

test("the view of an element holds what it is joined to with the flows between, its assets and its controls", () => {
  assert.deepEqual(elementView(placed(), "el1"), {
    elementId: "el1",
    // f1 carries towards it and f2 away from it; f3 both ways; the direction of f4 is not recorded
    joined: [
      {
        id: "el2",
        flows: [
          { id: "f1", into: true, out: false },
          { id: "f2", into: false, out: true },
        ],
      },
      {
        id: "el3",
        flows: [
          { id: "f3", into: true, out: true },
          { id: "f4", into: false, out: false },
        ],
      },
    ],
    open: ["f5"],
    assets: [{ id: "a1", damages: ["d1", "d2"], elsewhere: ["f1"] }],
    controls: [{ id: "c1", elsewhere: ["b1"] }],
  });
  // seen from the other end, the same flows carry the other way
  assert.deepEqual(elementView(placed(), "el2")?.joined, [
    {
      id: "el1",
      flows: [
        { id: "f1", into: false, out: true },
        { id: "f2", into: true, out: false },
      ],
    },
  ]);
  assert.deepEqual(elementView(placed(), "el4"), { elementId: "el4", joined: [], open: [], assets: [], controls: [] });
});

test("a data flow, a boundary and an element that does not exist have no view of their own", () => {
  for (const id of ["f1", "b1", "nothing"]) assert.equal(elementView(placed(), id), null);
});

// --------------------------------------------------------------------------------------- where everything stands

const pair = (id: string, flows: [into: boolean, out: boolean][]) => ({
  id,
  flows: flows.map(([into, out], n) => ({ id: `${id}-f${n}`, into, out })),
});
const controls = (count: number) => Array.from({ length: count }, (_, n) => ({ id: `c${n}`, elsewhere: [] }));
const view = (parts: Partial<ElementView>): ElementView => ({
  elementId: "e",
  joined: [],
  open: [],
  assets: [],
  controls: [],
  ...parts,
});

const shapes = {
  "two elements joined by three flows, an asset with damage scenarios, a control": view({
    joined: [
      pair("n1", [
        [true, false],
        [false, true],
      ]),
      pair("n2", [[true, true]]),
    ],
    assets: [{ id: "a1", damages: ["d1", "d2"], elsewhere: [] }],
    controls: [{ id: "c1", elsewhere: [] }],
  }),
  "six elements joined, some flows towards it and some away, four assets, three controls": view({
    open: ["f9"],
    joined: [
      pair("n1", [[true, false]]),
      pair("n2", [[false, true]]),
      pair("n3", [
        [true, true],
        [false, false],
      ]),
      pair("n4", [
        [true, false],
        [true, false],
        [false, true],
        [false, true],
        [true, true],
      ]),
      pair("n5", [[false, false]]),
      pair("n6", [[false, true]]),
    ],
    assets: [
      { id: "a1", damages: ["d1", "d2", "d3"], elsewhere: ["x"] },
      { id: "a2", damages: [], elsewhere: [] },
      { id: "a3", damages: ["d4"], elsewhere: [] },
      { id: "a4", damages: ["d5", "d6"], elsewhere: [] },
    ],
    controls: [
      { id: "c1", elsewhere: [] },
      { id: "c2", elsewhere: ["y"] },
      { id: "c3", elsewhere: [] },
    ],
  }),
  "only assets": view({
    assets: [
      { id: "a1", damages: ["d1"], elsewhere: [] },
      { id: "a2", damages: ["d2"], elsewhere: [] },
    ],
  }),
  "only controls": view({ controls: controls(2) }),
  "seventeen controls, two elements joined and two assets": view({
    joined: [pair("n1", [[true, false]]), pair("n2", [[true, true]])],
    assets: [
      { id: "a1", damages: ["d1", "d2", "d3"], elsewhere: [] },
      { id: "a2", damages: ["d4"], elsewhere: [] },
    ],
    controls: controls(17),
  }),
  "the element alone": view({}),
};
const BUSY = shapes["six elements joined, some flows towards it and some away, four assets, three controls"];
const MANY_CONTROLS = shapes["seventeen controls, two elements joined and two assets"];
const idsOf = (shape: ElementView) => boxesOf({ kind: "element", ...shape });
/** Up to six hang in one column, up to twelve in two, more in three. */
const columnsFor = (count: number) => (count > 12 ? 3 : count > 6 ? 2 : 1);

for (const [name, shape, size] of atBothSizes(shapes)) {
  test(`${name}: the element is in the middle, what it is joined to at its left, its assets at its right`, () => {
    const drawn = drawElementView(shape, size);
    const x = (id: string) => drawn.at.get(id)?.x ?? Number.NaN;
    assert.deepEqual(placedIds(drawn), idsOf(shape).sort());
    assert.deepEqual(drawn.at.get(shape.elementId), { x: -size.w / 2, y: -size.h / 2 });
    noneOverlap(drawn, { size });
    linesRunBetweenBoxes(drawn, { size });
    for (const joined of shape.joined) assert.ok(x(joined.id) < x(shape.elementId) - size.w);
    for (const asset of shape.assets) {
      assert.ok(x(asset.id) > x(shape.elementId) + size.w);
      for (const damageId of asset.damages) assert.ok(x(damageId) > x(asset.id) + size.w);
    }
  });

  test(`${name}: the controls that act in it hang beneath it, and the lines to its assets first run clear of them`, () => {
    const drawn = drawElementView(shape, size);
    const hung = shape.controls.map((control) => control.id);
    hangsBeneath(drawn, shape.elementId, hung, (id) => `acts|${id}`, { size }, columnsFor(hung.length));
    const past = Math.max(0, ...hung.map((id) => (drawn.at.get(id)?.x ?? 0) + size.w));
    for (const asset of shape.assets) {
      const line = drawn.lines.find((candidate) => candidate.key === `holds|${asset.id}`);
      assert.deepEqual(line?.joins, [shape.elementId, asset.id]);
      if (hung.length === 0) continue;
      assert.match(line?.d ?? "", /^M [-\d.]+ 0 L [-\d.]+ 0 C/);
      assert.ok(Number(line?.d.split(" ")[4]) > past);
    }
  });

  test(`${name}: a data flow is a line that carries its ID, with an arrowhead at the end the data goes to`, () => {
    const drawn = drawElementView(shape, size);
    arrowsAreSound(drawn, size.w);
    for (const joined of shape.joined) {
      for (const flow of joined.flows) {
        const line = drawn.lines.find((candidate) => candidate.key === `flow|${flow.id}`);
        const label = drawn.labels.find((candidate) => candidate.recordId === flow.id);
        assert.deepEqual([line?.arrow, line?.arrowStart], [flow.into, flow.out]);
        assert.deepEqual(line?.joins, [joined.id, shape.elementId, flow.id]);
        // the ID stands between the two elements
        assert.ok((label?.x ?? Number.NaN) > (drawn.at.get(joined.id)?.x ?? 0) + size.w);
        assert.ok((label?.x ?? Number.NaN) < (drawn.at.get(shape.elementId)?.x ?? 0));
      }
    }
    assert.equal(
      drawn.labels.length,
      shape.joined.reduce((total, joined) => total + joined.flows.length, 0),
    );
    drawn.labels.forEach((a, k) => {
      for (const b of drawn.labels.slice(k + 1)) assert.ok(Math.abs(a.y - b.y) >= 18);
    });
  });
}

test("where arrowheads have no room, the lines that end in one arrive together and the others arrive apart from them", () => {
  const drawn = drawElementView(BUSY);
  const endOf = (flowId: string) =>
    Number(
      drawn.lines
        .find((line) => line.key === `flow|${flowId}`)
        ?.d.split(" ")
        .at(-1),
    );
  const flows = BUSY.joined.flatMap((joined) => joined.flows);
  const withHead = flows.filter((flow) => flow.into).map((flow) => endOf(flow.id));
  const without = flows.filter((flow) => !flow.into).map((flow) => endOf(flow.id));
  assert.equal(new Set(withHead).size, 1);
  assert.equal(new Set(without).size, 1);
  assert.ok(Math.abs((withHead[0] ?? 0) - (without[0] ?? 0)) >= 12);
});

test("records of different heights have their places too, and none overlap", () => {
  const heights = new Map(idsOf(BUSY).map((id, n) => [id, 48 + ((n * 37) % 110)]));
  const drawn = drawElementView(BUSY, NODE_READABLE, heights);
  noneOverlap(drawn, { size: NODE_READABLE, heights });
  linesRunBetweenBoxes(drawn, { size: NODE_READABLE, heights });
  arrowsAreSound(drawn, NODE_READABLE.w);
  hangsBeneath(drawn, "e", ["c1", "c2", "c3"], (id) => `acts|${id}`, { size: NODE_READABLE, heights });
});

for (const [count, columns] of [
  [6, 1],
  [7, 2],
  [12, 2],
  [13, 3],
  [17, 3],
  [40, 3],
] as const) {
  test(`${count} controls hang in ${columns} column${columns > 1 ? "s" : ""}`, () => {
    const shape = view({ controls: controls(count) });
    const drawn = drawElementView(shape);
    assert.equal(new Set(shape.controls.map((control) => drawn.at.get(control.id)?.x)).size, columns);
    noneOverlap(drawn, { size: NODE });
  });
}

test("more than six controls hang in columns: the further columns hang from a rail beneath the element", () => {
  const drawn = drawElementView(MANY_CONTROLS);
  const below = NODE.h / 2;
  const lineOf = (key: string) => numbers(drawn.lines.find((line) => line.key === key)?.d ?? "");
  const tops = MANY_CONTROLS.controls.map((control) => drawn.at.get(control.id)?.y ?? 0);
  assert.equal(new Set(MANY_CONTROLS.controls.map((control) => drawn.at.get(control.id)?.x)).size, 3);
  // a line of the first column goes straight down its stem; one of a further column turns into the rail first
  assert.equal(lineOf("acts|c0").length, 10);
  const far = lineOf("acts|c16");
  assert.equal(far[5], below + 12);
  assert.equal(far[7], far[5]);
  // everything that hangs is beneath the rail, with room for a mark
  assert.ok(Math.min(...tops) > below + 12 + 12);
  arrowsAreSound(drawn, NODE.w);
});
