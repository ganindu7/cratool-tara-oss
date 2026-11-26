// The ego view: one record as the primary component, with only what is linked to it directly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { belongingTo } from "../src/views/belonging.ts";
import { drawEgoView, type EgoView, egoView, hasEgoView } from "../src/views/ego.ts";
import { NODE, NODE_READABLE } from "../src/views/layout.ts";
import { boxesOf } from "../src/views/views.ts";
import { hangsBeneath, linesRunBetweenBoxes, noneOverlap, nth, numbers, placed, placedIds, withGraph } from "./helpers.ts";

// ----------------------------------------------------------------------------------------------- what it holds

const {
  tara: TARA,
  checks: CHECKS,
  graph: GRAPH,
} = withGraph(
  placed((tara) => {
    nth(tara.paths, 0).elementIds = ["el2", "f1", "el1"];
    nth(tara.paths, 2).elementIds = ["el1"];
  }),
);
const of = (id: string): EgoView => {
  const view = egoView(TARA, CHECKS.scores, id);
  assert.ok(view, `${id} has an ego view`);
  return view;
};
const groups = (id: string) => {
  const view = of(id);
  return {
    left: view.left.map((group) => [group.title, group.ids]),
    right: view.right.map((group) => [group.title, group.ids]),
    beneath: view.beneath && [view.beneath.title, view.beneath.ids],
  };
};

test("a damage scenario has its asset to the left and its threats to the right; an asset where it lives, and its damage", () => {
  assert.deepEqual(groups("d1"), { left: [["Damage of", ["a1"]]], right: [["Threats that lead to it", ["t1"]]], beneath: null });
  assert.deepEqual(groups("a1"), {
    left: [["Lives in", ["el1", "f1"]]],
    right: [["Damage scenarios", ["d1", "d2"]]],
    beneath: null,
  });
});

test("a threat has the damage it leads to, its paths, and its risk beneath; a screened-out path is there, and marked", () => {
  assert.deepEqual(groups("t2"), {
    left: [["Leads to", ["d3"]]],
    right: [["Carried out by", ["p2", "p3"]]],
    beneath: ["Its risk", ["r2"]],
  });
  assert.deepEqual(of("t2").right[0]?.faint, ["p3"]);
});

test("an attack path has its threats, the risks it counts towards and the controls that cover it, and its route beneath", () => {
  assert.deepEqual(groups("p1"), {
    left: [["Carries out", ["t1"]]],
    right: [
      ["Counts towards", ["r1"]],
      ["Covered by", ["c1"]],
    ],
    // in the order of the attack
    beneath: ["Its route", ["el2", "f1", "el1"]],
  });
  // p2 carries out two threats, and counts towards the risk of each
  assert.deepEqual(groups("p2").right, [["Counts towards", ["r1", "r2"]]]);
  // p3 is screened out: it counts towards no risk
  assert.deepEqual(groups("p3"), { left: [["Carries out", ["t2"]]], right: [], beneath: ["Its route", ["el1"]] });
});

test("a risk has its threat and the paths that count, its controls and its goals; a control only proposed is marked", () => {
  assert.deepEqual(groups("r1"), {
    left: [
      ["Risk of", ["t1"]],
      ["Attack paths that count", ["p1", "p2"]],
    ],
    right: [
      ["Treated by", ["c1", "c2"]],
      ["Answered by", ["g1"]],
    ],
    beneath: null,
  });
  assert.deepEqual(of("r1").right[0]?.faint, ["c2"]);
  // of r2's paths only p2 counts: p3 is screened out
  assert.deepEqual(groups("r2").left[1], ["Attack paths that count", ["p2"]]);
});

test("a control has the risks it treats and the paths it covers, and where it acts beneath; a goal the risks it answers", () => {
  assert.deepEqual(groups("c1"), {
    left: [
      ["Treats", ["r1"]],
      ["Covers", ["p1"]],
    ],
    right: [],
    beneath: ["Acts in", ["el1", "b1"]],
  });
  // only proposed for that risk
  assert.deepEqual(of("c2").left[0], { title: "Treats", ids: ["r1"], faint: ["r1"] });
  assert.deepEqual(groups("g2"), { left: [["Answers", ["r2"]]], right: [], beneath: null });
});

test("an element of any kind has one: a component, a data flow with what it joins, a boundary with what it contains", () => {
  assert.deepEqual(groups("el1"), {
    left: [["Data flows", ["f1", "f2", "f3", "f4", "f5"]]],
    right: [
      ["Assets in it", ["a1"]],
      ["Attack paths through it", ["p1", "p3"]],
    ],
    beneath: ["Controls that act in it", ["c1"]],
  });
  assert.deepEqual(of("el1").right[1]?.faint, ["p3"]);
  assert.deepEqual(groups("f1"), {
    left: [["Joins", ["el2", "el1"]]],
    right: [
      ["Assets it carries", ["a1"]],
      ["Attack paths through it", ["p1"]],
    ],
    beneath: null,
  });
  // an open end
  assert.deepEqual(groups("f5"), { left: [["Joins", ["el1"]]], right: [], beneath: null });
  assert.deepEqual(groups("b1"), {
    left: [],
    right: [["Contains", ["el1", "el3"]]],
    beneath: ["Controls that act at it", ["c1"]],
  });
});

test("a record with nothing linked to it still has its block; an item, an evidence entry and what is not there have none", () => {
  assert.deepEqual(of("el4"), { id: "el4", left: [], right: [], beneath: null });
  for (const id of ["i1", "e1", "nothing"]) {
    assert.equal(egoView(TARA, CHECKS.scores, id), null);
    assert.equal(hasEgoView(TARA, id), false);
  }
  for (const id of ["el1", "f1", "b1", "a1", "d1", "t1", "p1", "r1", "c1", "g1"]) assert.equal(hasEgoView(TARA, id), true);
});

// --------------------------------------------------------------------------------------- where everything stands

const many = (count: number, prefix: string) => Array.from({ length: count }, (_, k) => `${prefix}${k}`);
const shapes: Record<string, EgoView> = {
  "groups at both sides and something beneath": {
    id: "x",
    left: [
      { title: "Rests on", ids: ["l1", "l2"] },
      { title: "Also", ids: ["l3"] },
    ],
    right: [
      { title: "Leads to", ids: ["r1", "r2", "r3"], faint: ["r2"] },
      { title: "And", ids: ["r4"] },
    ],
    beneath: { title: "With it", ids: ["b1", "b2"] },
  },
  "seventeen records beneath and two at the right": {
    id: "x",
    left: [],
    right: [{ title: "Leads to", ids: ["r1", "r2"] }],
    beneath: { title: "With it", ids: many(17, "b") },
  },
  "only what it rests on": { id: "x", left: [{ title: "Rests on", ids: many(9, "l") }], right: [], beneath: null },
  "a record that two groups name": {
    id: "x",
    left: [
      { title: "Rests on", ids: ["l1", "both"] },
      { title: "Also", ids: ["both", "l2"] },
    ],
    right: [{ title: "Leads to", ids: ["both", "r1"] }],
    beneath: null,
  },
  "the block alone": { id: "x", left: [], right: [], beneath: null },
};
const idsOf = (shape: EgoView) => boxesOf({ kind: "ego", ...shape });
const columnsFor = (count: number) => (count > 12 ? 3 : count > 6 ? 2 : 1);

// the block is wider than the records around it and as high as its record needs, in both ways to draw
const ways = [
  { name: "as on the graph", size: NODE, blockWidth: 264, blockHeight: 190 },
  { name: "large enough to read", size: NODE_READABLE, blockWidth: 340, blockHeight: 260 },
];

for (const [shapeName, shape] of Object.entries(shapes)) {
  for (const { name, size, blockWidth, blockHeight } of ways) {
    const heights = new Map([["x", blockHeight]]);
    const measures = { size, heights, widths: new Map([["x", blockWidth]]) };
    const draw = () => drawEgoView(shape, size, heights, blockWidth);
    const leftIds = shape.left.flatMap((group) => group.ids);
    const rightIds = shape.right.flatMap((group) => group.ids).filter((id) => !leftIds.includes(id));

    test(`${shapeName}, ${name}: the block is in the middle, what it rests on at its left, what follows at its right`, () => {
      const drawn = draw();
      const x = (id: string) => drawn.at.get(id)?.x ?? Number.NaN;
      assert.deepEqual(placedIds(drawn), idsOf(shape).sort());
      assert.deepEqual(drawn.at.get("x"), { x: -blockWidth / 2, y: -blockHeight / 2 });
      noneOverlap(drawn, measures);
      linesRunBetweenBoxes(drawn, measures);
      for (const id of leftIds) assert.ok(x(id) + size.w < -blockWidth / 2);
      for (const id of rightIds) assert.ok(x(id) > blockWidth / 2);
    });

    test(`${shapeName}, ${name}: every line runs between the block and one record, level at a side, with no arrowhead`, () => {
      const drawn = draw();
      const faint = new Set([...shape.left, ...shape.right].flatMap((group) => group.faint ?? []));
      // one line to each record, however many groups name it
      assert.equal(drawn.lines.length, idsOf(shape).length - 1);
      for (const line of drawn.lines) {
        const [block, other = ""] = line.joins;
        const of = numbers(line.d);
        assert.equal(block, "x");
        assert.deepEqual([line.arrow, line.arrowStart === true], [false, false]);
        // what does not count is drawn faint
        assert.equal(line.faint, faint.has(other));
        assert.equal(of.at(-1), of.at(-3), "it meets the side level");
      }
      // a line to the left ends at the middle of the block's left side; one to the right leaves the middle of its right side
      const lineTo = (id: string) => numbers(drawn.lines.find((line) => line.joins[1] === id)?.d ?? "");
      for (const id of leftIds) assert.deepEqual(lineTo(id).slice(-2), [-blockWidth / 2, 0]);
      for (const id of rightIds) assert.deepEqual(lineTo(id).slice(0, 2), [blockWidth / 2, 0]);
    });

    test(`${shapeName}, ${name}: what stands with the record hangs beneath, and a line to the right first runs past it`, () => {
      const drawn = draw();
      const hung = shape.beneath?.ids ?? [];
      hangsBeneath(drawn, "x", hung, (id) => `with|${id}`, measures, columnsFor(hung.length));
      const past = Math.max(blockWidth / 2, ...hung.map((id) => (drawn.at.get(id)?.x ?? 0) + size.w));
      if (past <= blockWidth / 2) return;
      for (const id of rightIds) {
        const of = numbers(drawn.lines.find((line) => line.joins[1] === id)?.d ?? "");
        assert.equal(of[3], 0);
        assert.ok((of[2] ?? 0) > past);
      }
    });

    test(`${shapeName}, ${name}: each group has its words above it, and so has what hangs`, () => {
      const drawn = draw();
      const all = [...shape.left, ...shape.right, ...(shape.beneath ? [shape.beneath] : [])];
      assert.deepEqual(drawn.captions.map((caption) => caption.text).sort(), all.map((group) => group.title).sort());
      for (const caption of drawn.captions.filter((candidate) => candidate.key !== "beneath")) {
        assert.ok(caption.y >= drawn.box.top, "the words are inside the frame");
      }
      // its words stand right above the first record that has its place in the group
      const placedBefore = new Set<string>();
      for (const group of [...shape.left, ...shape.right]) {
        const caption = drawn.captions.find((candidate) => candidate.text === group.title);
        const first = drawn.at.get(group.ids.find((id) => !placedBefore.has(id)) ?? "");
        for (const id of group.ids) placedBefore.add(id);
        assert.ok(caption);
        if (!first) continue;
        assert.equal(caption.x, first.x);
        assert.ok(first.y - caption.y >= 12);
      }
      const beneath = drawn.captions.find((caption) => caption.key === "beneath");
      if (!beneath || !shape.beneath) return;
      assert.ok(beneath.y > blockHeight / 2);
      assert.ok(beneath.y + 12 <= Math.min(...shape.beneath.ids.map((id) => drawn.at.get(id)?.y ?? 0)));
    });
  }
}

test("a record that two groups name has one place, in the first group that names it", () => {
  const drawn = drawEgoView(shapes["a record that two groups name"] as EgoView);
  assert.ok((drawn.at.get("both")?.x ?? 0) < 0, "it stands at the left, where it is named first");
  assert.equal(drawn.lines.filter((line) => line.joins[1] === "both").length, 1);
});

test("what belongs to a chosen record lights the line to the block: a route, a control, what a boundary contains", () => {
  const lit = (id: string) => belongingTo(GRAPH, TARA, id);
  const lineBetween = (centre: string, other: string) =>
    drawEgoView(of(centre)).lines.find((line) => line.joins[1] === other)?.joins ?? ["missing"];
  for (const [centre, other] of [
    ["p1", "el2"],
    ["p1", "f1"],
    ["p1", "c1"],
    ["b1", "el3"],
    ["c1", "b1"],
    ["el1", "p3"],
    ["f1", "a1"],
    ["r1", "g1"],
    ["d1", "a1"],
  ] as const) {
    // chosen at the edge, and chosen in the middle
    assert.ok(
      lineBetween(centre, other).every((id) => lit(other).has(id)),
      `${centre} to ${other}, with ${other} chosen`,
    );
    assert.ok(
      lineBetween(centre, other).every((id) => lit(centre).has(id)),
      `${centre} to ${other}, with ${centre} chosen`,
    );
  }
});
