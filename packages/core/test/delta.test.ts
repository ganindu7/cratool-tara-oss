// What changed between two states of a TARA: the delta, applying it, taking a change back, and overlap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDelta, deltasOverlap, diffTara, invertDelta, Refusal, touchedRecords, undoDelta } from "../src/index.ts";
import { change, example, last } from "./helpers.ts";

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

test("undoing the addition of a record does not hand its ID out again", () => {
  const before = example("kettle");
  const added = change(before, { op: "add", kind: "assets" });
  const taken = last(added.assets).id;
  const undone = applyDelta(added, undoDelta(diffTara(before, added)));
  assert.deepEqual(undone.assets, before.assets, "the record is gone");
  assert.notEqual(last(change(undone, { op: "add", kind: "assets" }).assets).id, taken, "its ID is not given a second time");
  // a record someone else added in between does not stand in the way: both moved the counter, and that is all
  const withAnother = change(added, { op: "add", kind: "assets" });
  const others = applyDelta(withAnother, undoDelta(diffTara(before, added))).assets.map((asset) => asset.id);
  assert.deepEqual(others, [...before.assets.map((asset) => asset.id), last(withAnother.assets).id]);
});

test("an undo never puts a signature or a confirmed review back in a person's name", () => {
  const kettle = example("kettle");
  const refusedFor = (delta: ReturnType<typeof diffTara>, what: RegExp) =>
    assert.throws(
      () => undoDelta(delta),
      (error: unknown) => error instanceof Refusal && error.reason === "conflict" && what.test(error.message),
    );

  const signed = change(kettle, { op: "sign", role: "author", roleTitle: "Security engineer" });
  refusedFor(diffTara(signed, change(signed, { op: "unsign", role: "author" })), /signature back/);
  // the same person signing again in another function alters the signature: taking that back would alter it too
  refusedFor(diffTara(signed, change(signed, { op: "sign", role: "author", roleTitle: "Product owner" })), /signature back/);
  refusedFor(diffTara(kettle, change(kettle, { op: "clearReview", kind: "scope", subjectId: null })), /confirmed review back/);

  // A record that was removed comes back as it was, with the review that went with it: nobody took that away.
  const without = change(kettle, { op: "remove", kind: "paths", id: "AP001" });
  assert.equal(
    without.reviews.some((review) => review.subjectId === "AP001"),
    false,
    "the review of a removed record goes with it",
  );
  assert.deepEqual(applyDelta(without, undoDelta(diffTara(kettle, without))), kettle);

  // taking a statement away is what anyone may do: undoing a signing removes it
  assert.deepEqual(applyDelta(signed, undoDelta(diffTara(kettle, signed))).signoffs, []);
  // and so is undoing a change that only touched the content
  const renamed = change(kettle, { op: "set", kind: "assets", id: "A01", values: { name: "Renamed" } });
  assert.deepEqual(applyDelta(renamed, undoDelta(diffTara(kettle, renamed))).assets, kettle.assets);
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
