// The view of one control: what it holds, where everything stands, and what its lines are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type ControlView, controlView, drawControlView } from "../src/views/control-view.ts";
import { NODE } from "../src/views/layout.ts";
import { boxesOf } from "../src/views/views.ts";
import { atBothSizes, hangsBeneath, linesRunBetweenBoxes, noneOverlap, nth, numbers, placed, placedIds } from "./helpers.ts";

// ----------------------------------------------------------------------------------------------- what it holds

test("the view of a control holds the risks that have it, the paths it covers for each, and where it acts", () => {
  // c1 exists for r1 and covers p1, a path of r1's threat; it acts in a component and at a boundary
  assert.deepEqual(controlView(placed(), "c1"), {
    controlId: "c1",
    risks: [{ id: "r1", proposed: false, paths: ["p1"] }],
    screened: [],
    apart: [],
    places: ["el1", "b1"],
  });
  // c2 is only proposed for r1 and covers no path: it treats the risk as a whole, and acts nowhere in particular
  assert.deepEqual(controlView(placed(), "c2"), {
    controlId: "c2",
    risks: [{ id: "r1", proposed: true, paths: [] }],
    screened: [],
    apart: [],
    places: [],
  });
  assert.equal(controlView(placed(), "nothing"), null);
});

test("a path of two threats is covered for each risk that has the control; a screened-out one says so", () => {
  const forBoth = placed((tara) => {
    nth(tara.controls, 0).coveredPathIds = ["p1", "p2", "p3"];
    nth(tara.risks, 1).proposedControlIds = ["c1"];
  });
  const view = controlView(forBoth, "c1");
  assert.deepEqual(view?.risks, [
    { id: "r1", proposed: false, paths: ["p1", "p2"] },
    { id: "r2", proposed: true, paths: ["p2", "p3"] },
  ]);
  assert.deepEqual(view?.screened, ["p3"]);
  const apart = placed((tara) => {
    nth(tara.controls, 0).coveredPathIds = ["p1", "p3"];
  });
  assert.deepEqual(controlView(apart, "c1")?.apart, ["p3"]);
});

// --------------------------------------------------------------------------------------- where everything stands

const view = (parts: Partial<ControlView>): ControlView => ({
  controlId: "c",
  risks: [],
  screened: [],
  apart: [],
  places: [],
  ...parts,
});

const shapes = {
  "three risks, one treated as a whole and one only proposed, two places": view({
    risks: [
      { id: "r1", proposed: false, paths: ["p1", "p2", "p3"] },
      { id: "r2", proposed: false, paths: [] },
      { id: "r3", proposed: true, paths: ["p4"] },
    ],
    screened: ["p2"],
    places: ["h1", "h2"],
  }),
  "seven risks": view({
    risks: Array.from({ length: 7 }, (_, n) => ({ id: `r${n}`, proposed: n > 4, paths: n % 2 ? [`p${n}`] : [] })),
    places: ["h1"],
  }),
  "only where it acts": view({ places: ["h1", "h2", "h3"] }),
  "fourteen places": view({ places: Array.from({ length: 14 }, (_, n) => `h${n}`) }),
  "the control alone": view({}),
};
const THREE_RISKS = shapes["three risks, one treated as a whole and one only proposed, two places"];
const columnsFor = (count: number) => (count > 12 ? 3 : count > 6 ? 2 : 1);

for (const [name, shape, size] of atBothSizes(shapes)) {
  test(`${name}: every record has a place, the control in the middle, the risks at its left, where it acts beneath it`, () => {
    const drawn = drawControlView(shape, size);
    assert.deepEqual(placedIds(drawn), boxesOf({ kind: "control", ...shape }).sort());
    assert.deepEqual(drawn.at.get(shape.controlId), { x: -size.w / 2, y: -size.h / 2 });
    noneOverlap(drawn, { size });
    linesRunBetweenBoxes(drawn, { size });
    for (const risk of shape.risks) assert.ok((drawn.at.get(risk.id)?.x ?? 0) < -size.w / 2 - size.w);
    hangsBeneath(drawn, shape.controlId, shape.places, (id) => `in|${id}`, { size }, columnsFor(shape.places.length));
  });
}

test("a risk has a line for each path the control covers for it, with the path's ID, or one line without", () => {
  const drawn = drawControlView(THREE_RISKS);
  const toRisks = drawn.lines.filter((line) => !line.key.startsWith("in|"));
  assert.deepEqual(
    toRisks.map((line) => line.key),
    ["covers|r1|p1", "covers|r1|p2", "covers|r1|p3", "treats|r2", "covers|r3|p4"],
  );
  assert.deepEqual(drawn.lines.find((line) => line.key === "covers|r1|p1")?.joins, ["r1", "c", "p1"]);
  assert.deepEqual(drawn.lines.find((line) => line.key === "treats|r2")?.joins, ["r2", "c"]);
  // a path that is screened out; a control that is only proposed for the risk
  assert.deepEqual(
    drawn.lines.filter((line) => line.faint).map((line) => line.key),
    ["covers|r1|p2", "covers|r3|p4"],
  );
  assert.equal(
    drawn.lines.some((line) => line.arrow || line.arrowStart),
    false,
  );
  assert.deepEqual(
    drawn.labels.map((label) => [label.recordId, label.of]),
    [
      ["p1", "r1"],
      ["p2", "r1"],
      ["p3", "r1"],
      ["p4", "r3"],
    ],
  );
  // the ID of a path is faint when the path does not count; a control that is only proposed leaves the ID as it is
  assert.deepEqual(
    drawn.labels.filter((label) => label.faint).map((label) => label.recordId),
    ["p2"],
  );
  drawn.labels.forEach((a, k) => {
    for (const b of drawn.labels.slice(k + 1)) assert.ok(Math.abs(a.y - b.y) >= 18);
  });
  // a line meets the control level, on its left side
  for (const line of toRisks) {
    const [bendY, x, y] = numbers(line.d).slice(-3);
    assert.equal(y, bendY);
    assert.equal(x, -NODE.w / 2);
  }
});
