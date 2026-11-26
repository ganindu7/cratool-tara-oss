// The view of one threat scenario: what it holds, where everything stands, and what its lines are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NODE, NODE_READABLE } from "../src/views/layout.ts";
import { drawThreatView, type ThreatView, threatView } from "../src/views/threat-view.ts";
import { boxesOf } from "../src/views/views.ts";
import {
  arrowsAreSound,
  atBothSizes,
  changed,
  hangsBeneath,
  linesRunBetweenBoxes,
  noneOverlap,
  nth,
  placedIds,
  proof,
  SIZES,
} from "./helpers.ts";

// ----------------------------------------------------------------------------------------------- what it holds

test("the view of a threat holds the damage it leads to under their assets, its paths, its risk and its controls", () => {
  assert.deepEqual(threatView(proof(), "t1"), {
    threatId: "t1",
    riskId: "r1",
    assets: [{ id: "a1", damages: ["d1", "d2"] }],
    paths: [
      { id: "p1", screened: false, elsewhere: [] },
      { id: "p2", screened: false, elsewhere: ["t2"] },
    ],
    // c1 covers p1; c2 is only proposed and covers no path: it treats the risk as a whole
    controls: [
      { id: "c1", proposed: false, paths: ["p1"], elsewhere: [] },
      { id: "c2", proposed: true, paths: [], elsewhere: [] },
    ],
    goals: [{ id: "g1", elsewhere: [] }],
  });
  assert.deepEqual(threatView(proof(), "t2"), {
    threatId: "t2",
    riskId: "r2",
    assets: [{ id: "a2", damages: ["d3"] }],
    paths: [
      { id: "p2", screened: false, elsewhere: ["t1"] },
      { id: "p3", screened: true, elsewhere: [] },
    ],
    controls: [],
    goals: [{ id: "g2", elsewhere: [] }],
  });
});

test("the goals and claims that answer its risk are in the view, and one that answers another risk as well says so", () => {
  const shared = changed((tara) => {
    nth(tara.goalClaims, 1).riskIds = ["r2", "r1"];
  });
  assert.deepEqual(threatView(shared, "t1")?.goals, [
    { id: "g1", elsewhere: [] },
    { id: "g2", elsewhere: ["r2"] },
  ]);
  const withoutRisk = changed((tara) => {
    tara.risks = tara.risks.filter((risk) => risk.id !== "r2");
  });
  assert.deepEqual(threatView(withoutRisk, "t2")?.goals, []);
  assert.equal(threatView(withoutRisk, "t2")?.riskId, null);
});

test("a threat to two assets has both; a control another risk has too says so; a path of another threat is not its path", () => {
  const view = threatView(
    changed((tara) => {
      nth(tara.threats, 0).damageIds = ["d1", "d3", "d2"];
      nth(tara.risks, 1).existingControlIds = ["c1"];
      nth(tara.controls, 0).coveredPathIds = ["p3"];
    }),
    "t1",
  );
  assert.deepEqual(view?.assets, [
    { id: "a1", damages: ["d1", "d2"] },
    { id: "a2", damages: ["d3"] },
  ]);
  assert.deepEqual(view?.controls[0], { id: "c1", proposed: false, paths: [], elsewhere: ["r2"] });
});

test("a damage scenario that is not linked to an asset stands without one; a threat that does not exist has no view", () => {
  const unlinked = changed((tara) => {
    nth(tara.damages, 2).assetId = null;
  });
  assert.deepEqual(threatView(unlinked, "t2")?.assets, [{ id: null, damages: ["d3"] }]);
  assert.equal(threatView(proof(), "nothing"), null);
});

// --------------------------------------------------------------------------------------- where everything stands

const view = (parts: Partial<ThreatView>): ThreatView => ({
  threatId: "t",
  riskId: "r",
  assets: [],
  paths: [],
  controls: [],
  goals: [],
  ...parts,
});
const path = (id: string, screened = false) => ({ id, screened, elsewhere: [] });
const control = (id: string, paths: string[], proposed = false) => ({ id, proposed, paths, elsewhere: [] });

const shapes = {
  "two assets, five paths, controls beside paths and for the risk as a whole": view({
    assets: [
      { id: "a1", damages: ["d1", "d2"] },
      { id: "a2", damages: ["d3"] },
    ],
    paths: [path("p1"), path("p2"), path("p3"), path("p4"), path("p5", true)],
    controls: [
      control("c1", ["p1"]),
      control("c2", ["p1", "p3"]),
      control("c3", []),
      control("c4", [], true),
      control("c5", ["p4"]),
    ],
  }),
  "one damage scenario without an asset": view({ assets: [{ id: null, damages: ["d1"] }] }),
  "three paths and no control": view({ assets: [{ id: "a1", damages: ["d1"] }], paths: [path("p1"), path("p2"), path("p3")] }),
  "controls for the risk as a whole and no path": view({ controls: [control("c1", []), control("c2", [])] }),
  "three goals and claims, five paths, a control for the risk as a whole": view({
    assets: [{ id: "a1", damages: ["d1", "d2", "d3"] }],
    paths: [path("p1"), path("p2"), path("p3"), path("p4"), path("p5")],
    controls: [control("c1", ["p2"]), control("c2", [])],
    goals: [
      { id: "g1", elsewhere: [] },
      { id: "g2", elsewhere: ["r9"] },
      { id: "g3", elsewhere: [] },
    ],
  }),
  "the threat with its risk and nothing else": view({}),
};
const FULL = shapes["two assets, five paths, controls beside paths and for the risk as a whole"];
const WITH_GOALS = shapes["three goals and claims, five paths, a control for the risk as a whole"];
const idsOf = (shape: ThreatView) => boxesOf({ kind: "threat", ...shape });

for (const [name, shape, size] of atBothSizes(shapes)) {
  test(`${name}: every record has a place, the threat in the middle with its risk beneath it, and no two overlap`, () => {
    const drawn = drawThreatView(shape, size);
    const risk = drawn.at.get("r");
    assert.deepEqual(placedIds(drawn), idsOf(shape).sort());
    assert.deepEqual(drawn.at.get(shape.threatId), { x: -size.w / 2, y: -size.h / 2 });
    assert.equal(risk?.x, -size.w / 2);
    assert.ok((risk?.y ?? 0) > size.h / 2);
    noneOverlap(drawn, { size });
    linesRunBetweenBoxes(drawn, { size });
    // the goals and claims that answer the risk hang beneath it
    hangsBeneath(
      drawn,
      "r",
      shape.goals.map((goal) => goal.id),
      (id) => `answers|${id}`,
      { size },
    );
  });

  test(`${name}: the records stand in the order of the method, from what is harmed at the left to what treats the risk`, () => {
    const { at } = drawThreatView(shape, size);
    const x = (id: string) => at.get(id)?.x ?? Number.NaN;
    for (const asset of shape.assets) {
      for (const damageId of asset.damages) {
        assert.ok(x(damageId) < x(shape.threatId) - size.w);
        if (asset.id) assert.ok(x(asset.id) < x(damageId) - size.w);
      }
    }
    for (const each of shape.paths) assert.ok(x(each.id) > x(shape.threatId) + size.w);
    for (const each of shape.controls) assert.ok(x(each.id) > x(shape.threatId) + 2 * size.w);
  });

  test(`${name}: an arrowhead sits on a straight stretch that meets the side level, and arrowheads have room or are one`, () => {
    arrowsAreSound(drawThreatView(shape, size), size.w);
  });
}

test("a path points at the threat it carries out, the threat at each damage it leads to; what does not count is faint", () => {
  const { lines } = drawThreatView(FULL);
  const by = (key: string) => lines.find((line) => line.key === key);
  const keysOf = (some: { key: string }[]) => some.map((line) => line.key).sort();
  assert.deepEqual(keysOf(lines.filter((line) => line.arrow)), [
    "by|p1",
    "by|p2",
    "by|p3",
    "by|p4",
    "by|p5",
    "to|d1",
    "to|d2",
    "to|d3",
  ]);
  assert.deepEqual(by("by|p1")?.joins, ["p1", "t"]);
  assert.deepEqual(by("to|d3")?.joins, ["t", "d3"]);
  // a screened-out path, a control that is only proposed
  assert.deepEqual(keysOf(lines.filter((line) => line.faint)), ["by|p5", "treats|c4"]);
  // a control has a line from each path it covers; one that covers none has a line from the risk
  assert.deepEqual(keysOf(lines.filter((line) => line.key.startsWith("covers|"))), [
    "covers|p1|c1",
    "covers|p1|c2",
    "covers|p3|c2",
    "covers|p4|c5",
  ]);
  assert.deepEqual(
    lines.filter((line) => line.key.startsWith("treats|")).map((line) => line.joins),
    [
      ["r", "c3"],
      ["r", "c4"],
    ],
  );
  assert.deepEqual(by("risk")?.joins, ["t", "r"]);
});

for (const [sizeName, size] of SIZES) {
  test(`the line to a control that treats the whole risk passes beneath every path and control, ${sizeName}`, () => {
    const { at, lines } = drawThreatView(FULL, size);
    const bottomOf = (id: string) => (at.get(id)?.y ?? 0) + size.h;
    const besidePaths = FULL.controls.filter((each) => each.paths.length > 0);
    const lowest = Math.max(...FULL.paths.map((each) => bottomOf(each.id)), ...besidePaths.map((each) => bottomOf(each.id)));
    for (const line of lines.filter((candidate) => candidate.key.startsWith("treats|"))) {
      const run = Number(line.d.split(" ")[2]);
      assert.ok(run > lowest);
      assert.equal(run, (at.get("r")?.y ?? 0) + size.h / 2);
    }
    // a control stands beside the first path it covers
    const middleOfTwo = ((at.get("c2")?.y ?? 0) + (at.get("c1")?.y ?? 0)) / 2;
    assert.ok(Math.abs(middleOfTwo - (at.get("p1")?.y ?? 0)) < 1);
  });
}

test("records of different heights have their places too, and none overlap", () => {
  const heights = new Map(idsOf(FULL).map((id, n) => [id, 48 + ((n * 37) % 110)]));
  const tall = drawThreatView(FULL, NODE_READABLE, heights);
  noneOverlap(tall, { size: NODE_READABLE, heights });
  linesRunBetweenBoxes(tall, { size: NODE_READABLE, heights });
  arrowsAreSound(tall, NODE_READABLE.w);

  const taller = new Map(idsOf(WITH_GOALS).map((id, n) => [id, 48 + ((n * 53) % 120)]));
  const drawn = drawThreatView(WITH_GOALS, NODE_READABLE, taller);
  noneOverlap(drawn, { size: NODE_READABLE, heights: taller });
  hangsBeneath(drawn, "r", ["g1", "g2", "g3"], (id) => `answers|${id}`, { size: NODE_READABLE, heights: taller });
});

test("a threat whose risk is gone still has its view: nothing beneath it, and nothing breaks", () => {
  const shape = view({ riskId: null, assets: [{ id: "a1", damages: ["d1"] }], paths: [path("p1")] });
  const drawn = drawThreatView(shape, NODE);
  assert.deepEqual(placedIds(drawn), ["a1", "d1", "p1", "t"]);
  noneOverlap(drawn, { size: NODE });
  linesRunBetweenBoxes(drawn, { size: NODE });
});
