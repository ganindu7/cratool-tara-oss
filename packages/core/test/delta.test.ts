import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDelta, deltasOverlap, diffTara, invertDelta, Refusal, touchedRecords } from "../src/index.ts";
import { change, example } from "./helpers.ts";

test("the delta between two states names each place that changed, with before and after", () => {
  const before = example("kettle");
  const after = change(before, {
    op: "set",
    kind: "damages",
    id: "DS-0004",
    values: { "ratings.privacy": 1, description: "Changed" },
  });
  const delta = diffTara(before, after);
  assert.deepEqual(delta.map((e) => e.path).sort(), ["damages/DS-0004/description", "damages/DS-0004/ratings.privacy"]);
  assert.deepEqual(
    delta.find((e) => e.path.endsWith("privacy")),
    { path: "damages/DS-0004/ratings.privacy", before: 0, after: 1 },
  );
  assert.deepEqual(touchedRecords(delta), ["DS-0004"]);
});

test("a delta applied forwards gives the new state, and its inverse gives the old one back", () => {
  const before = example("gateway");
  const after = change(
    before,
    { op: "add", kind: "assets", values: { name: "Audit log", itemId: "IT01" } },
    { op: "remove", kind: "threats", id: "TS005" },
    { op: "setScope", key: "intended_use", values: { decision: "Something else" } },
    { op: "setMeta", values: { title: "Renamed" } },
    { op: "clearReview", kind: "scope", subjectId: null },
  );
  // survives being written to a file and read back, as the history does
  const delta = JSON.parse(JSON.stringify(diffTara(before, after)));
  assert.deepEqual(applyDelta(before, delta), after);
  assert.deepEqual(applyDelta(after, invertDelta(delta)), before);
});

test("a record that is put back by an undo returns to its place in the list", () => {
  const before = example("kettle");
  const after = change(before, { op: "remove", kind: "damages", id: "DS-0004" });
  const undone = applyDelta(after, invertDelta(diffTara(before, after)));
  assert.deepEqual(
    undone.damages.map((d) => d.id),
    before.damages.map((d) => d.id),
  );
});

test("a delta is refused where the TARA no longer holds what it expects", () => {
  const before = example("kettle");
  const mine = diffTara(before, change(before, { op: "set", kind: "assets", id: "A01", values: { name: "Mine" } }));
  const theirs = change(before, { op: "set", kind: "assets", id: "A01", values: { name: "Theirs" } });
  assert.throws(() => applyDelta(theirs, mine), Refusal);
});

test("two deltas overlap when they change the same place, or one removes what the other changes", () => {
  const base = example("kettle");
  const delta = (...changes: Parameters<typeof change>[1][]) => diffTara(base, change(base, ...changes));
  const name = delta({ op: "set", kind: "assets", id: "A01", values: { name: "x" } });
  const sameName = delta({ op: "set", kind: "assets", id: "A01", values: { name: "y" } });
  const otherField = delta({ op: "set", kind: "assets", id: "A01", values: { variant: "z" } });
  const removed = delta({ op: "remove", kind: "assets", id: "A01" });
  assert.equal(deltasOverlap(name, sameName), true);
  assert.equal(deltasOverlap(name, otherField), false);
  assert.equal(deltasOverlap(name, removed), true);
  // Two people each add an asset. The second is applied to the TARA as the first left it, so it gets the
  // next ID. Both moved the counter, and that alone is no conflict.
  const afterFirst = change(base, { op: "add", kind: "assets" });
  const afterSecond = change(afterFirst, { op: "add", kind: "assets" });
  assert.equal(deltasOverlap(diffTara(base, afterFirst), diffTara(afterFirst, afterSecond)), false);
});
