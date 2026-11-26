// The view of one asset: what it holds, where everything stands, and what its lines are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type AssetView, assetView, drawAssetView } from "../src/views/asset-view.ts";
import { NODE, NODE_READABLE } from "../src/views/layout.ts";
import { boxesOf } from "../src/views/views.ts";
import {
  atBothSizes,
  changed,
  hangsBeneath,
  linesRunBetweenBoxes,
  noneOverlap,
  nth,
  numbers,
  placed,
  placedIds,
  proof,
} from "./helpers.ts";

// ----------------------------------------------------------------------------------------------- what it holds

test("the view of an asset holds its damage scenarios, the threats that lead to them and the paths of those threats", () => {
  assert.deepEqual(assetView(proof(), "a1"), {
    assetId: "a1",
    homes: [],
    damages: ["d1", "d2"],
    threats: [{ id: "t1", damages: ["d1", "d2"], elsewhere: [], paths: ["p1", "p2"] }],
    screened: [],
  });
  // p3 is screened out: it is in the view, and marked as not counting
  assert.deepEqual(assetView(proof(), "a2"), {
    assetId: "a2",
    homes: [],
    damages: ["d3"],
    threats: [{ id: "t2", damages: ["d3"], elsewhere: [], paths: ["p2", "p3"] }],
    screened: ["p3"],
  });
});

test("where the asset lives is in the view: a component, a store, a data flow that carries it; not one that is gone", () => {
  const withOneGone = placed((tara) => {
    nth(tara.assets, 0).elementIds = ["el1", "f1", "gone"];
  });
  assert.deepEqual(assetView(withOneGone, "a1")?.homes, ["el1", "f1"]);
  assert.deepEqual(assetView(withOneGone, "a2")?.homes, ["el3"]);
  // in the order its form lists them: as in the architecture list, the data flows after everything else
  const inAnotherOrder = placed((tara) => {
    nth(tara.assets, 0).elementIds = ["f3", "el3", "f1", "el1"];
  });
  assert.deepEqual(assetView(inAnotherOrder, "a1")?.homes, ["el1", "el3", "f1", "f3"]);
});

test("a threat that also leads to damage of another asset says so, and that damage scenario is not in the view", () => {
  const view = assetView(
    changed((tara) => {
      nth(tara.threats, 1).damageIds = ["d3", "d1"];
    }),
    "a1",
  );
  assert.deepEqual(view?.damages, ["d1", "d2"]);
  assert.deepEqual(
    view?.threats.find((threat) => threat.id === "t2"),
    { id: "t2", damages: ["d1"], elsewhere: ["d3"], paths: ["p2", "p3"] },
  );
});

test("an asset without a damage scenario has a view with nothing around it; an asset that does not exist has none", () => {
  const alone = changed((tara) => {
    tara.damages = tara.damages.filter((damage) => damage.assetId !== "a2");
  });
  assert.deepEqual(assetView(alone, "a2"), { assetId: "a2", homes: [], damages: [], threats: [], screened: [] });
  assert.equal(assetView(proof(), "nothing"), null);
});

// --------------------------------------------------------------------------------------- where everything stands

const threat = (id: string, damages: string[], paths: number) => ({
  id,
  damages,
  elsewhere: [],
  paths: Array.from({ length: paths }, (_, n) => `${id}-p${n}`),
});
const view = (parts: Partial<AssetView>): AssetView => ({
  assetId: "a",
  homes: [],
  damages: [],
  threats: [],
  screened: [],
  ...parts,
});

const shapes = {
  "one damage scenario, four threats with up to five paths": view({
    damages: ["d1"],
    threats: [threat("t1", ["d1"], 4), threat("t2", ["d1"], 5), threat("t3", ["d1"], 1), threat("t4", ["d1"], 0)],
    screened: ["t1-p3"],
  }),
  "three damage scenarios, two of them joined by a threat": view({
    damages: ["d1", "d2", "d3"],
    threats: [threat("t1", ["d1", "d3"], 2), threat("t2", ["d2"], 1), threat("t3", ["d2"], 3)],
  }),
  "five damage scenarios and no threat yet": view({ damages: ["d1", "d2", "d3", "d4", "d5"] }),
  "the asset alone": view({}),
  "six damage scenarios on both sides, and three places the asset lives in": view({
    homes: ["h1", "h2", "h3"],
    damages: ["d1", "d2", "d3", "d4", "d5", "d6"],
    threats: [threat("t1", ["d1"], 2), threat("t2", ["d2", "d4"], 3), threat("t3", ["d6"], 1)],
  }),
  "the asset with the one place it lives in": view({ homes: ["h1"] }),
};
const JOINED = shapes["three damage scenarios, two of them joined by a threat"];
const MANY_PATHS = shapes["one damage scenario, four threats with up to five paths"];

for (const [name, shape, size] of atBothSizes(shapes)) {
  test(`${name}: every record has a place, the asset in the middle, and no two overlap`, () => {
    const drawn = drawAssetView(shape, size);
    assert.deepEqual(placedIds(drawn), boxesOf({ kind: "asset", ...shape }).sort());
    assert.deepEqual(drawn.at.get(shape.assetId), { x: -size.w / 2, y: -size.h / 2 });
    noneOverlap(drawn, { size });
    linesRunBetweenBoxes(drawn, { size });
  });

  test(`${name}: where the asset lives hangs beneath it, and the lines to its damage first run clear of what hangs`, () => {
    const drawn = drawAssetView(shape, size);
    hangsBeneath(drawn, shape.assetId, shape.homes, (id) => `in|${id}`, { size });
    const past = Math.max(0, ...shape.homes.map((id) => (drawn.at.get(id)?.x ?? 0) + size.w));
    for (const damageId of shape.damages) {
      const line = drawn.lines.find((candidate) => candidate.key === `of|${damageId}`)?.d ?? "";
      const [x0 = 0, y0, x1 = 0, y1] = numbers(line);
      assert.deepEqual([Math.abs(x0), y0], [size.w / 2, 0]);
      if (shape.homes.length === 0) {
        assert.match(line, /^M [-\d.]+ 0 C/);
        continue;
      }
      // with something hanging, the line runs level until it is past it, on either side alike
      assert.match(line, /^M [-\d.]+ 0 L [-\d.]+ 0 C/);
      assert.equal(y1, 0);
      assert.ok(Math.abs(x1) > past);
    }
  });

  // "No ugly arrows or links": the arrowhead sits on a straight stretch that meets the side square, and arrowheads do not pile up
  test(`${name}: a line meets its damage scenario square after a straight stretch, and arrowheads have room or are one`, () => {
    const drawn = drawAssetView(shape, size);
    const ends = new Map<string, number[]>();
    for (const line of drawn.lines.filter((candidate) => candidate.arrow)) {
      const damageId = line.joins[1] ?? "";
      const [bendX = 0, bendY = 0, x = 0, y = 0] = numbers(line.d).slice(-4);
      assert.match(line.d, /L [-\d.]+ [-\d.]+$/);
      // level, so square to an upright side, with room for the arrowhead
      assert.equal(y, bendY);
      assert.ok(Math.abs(x - bendX) >= 14);
      const box = drawn.at.get(damageId) ?? { x: Number.NaN, y: Number.NaN };
      assert.ok(x === box.x || x === box.x + size.w, "it ends on a side of the damage scenario");
      assert.ok(y > box.y + 4 && y < box.y + size.h - 4);
      ends.set(damageId, [...(ends.get(damageId) ?? []), y]);
    }
    for (const heights of ends.values()) {
      const places = [...new Set(heights)].sort((a, b) => a - b);
      places.forEach((y, k) => {
        if (k > 0) assert.ok(y - (places[k - 1] ?? 0) >= 12);
      });
    }
  });
}

for (const [name, shape] of Object.entries(shapes)) {
  test(`${name}: a threat has a line for each path to each of its damage scenarios, and the IDs of the paths stand clear`, () => {
    const drawn = drawAssetView(shape);
    for (const each of shape.threats) {
      const labels = drawn.labels.filter((label) => label.of === each.id);
      assert.deepEqual(
        labels.map((label) => label.recordId),
        each.paths.length > 0 ? each.paths : [null],
      );
      for (const label of labels) {
        const lines = drawn.lines.filter((line) => line.key.startsWith(`${label.key}|`));
        assert.deepEqual(
          lines.map((line) => line.joins[1]),
          each.damages,
        );
        // the ID stands between the threat and its damage scenario
        const threatMiddle = (drawn.at.get(each.id)?.x ?? 0) + NODE.w / 2;
        const damageMiddle = (drawn.at.get(each.damages[0] ?? "")?.x ?? 0) + NODE.w / 2;
        const between =
          label.x > Math.min(threatMiddle, damageMiddle) + NODE.w / 2 &&
          label.x < Math.max(threatMiddle, damageMiddle) - NODE.w / 2;
        assert.ok(between, `${label.key} stands between its threat and its damage scenario`);
      }
    }
    drawn.labels.forEach((a, k) => {
      for (const b of drawn.labels.slice(k + 1)) assert.ok(Math.abs(a.y - b.y) >= 18 || Math.abs(a.x - b.x) >= 80);
    });
  });
}

test("records of different heights have their places too, and none overlap", () => {
  const shape = { ...JOINED, homes: ["h1", "h2"] };
  const heights = new Map([
    ["a", 48],
    ["d1", 150],
    ["d2", 62],
    ["d3", 48],
    ["t1", 120],
    ["t2", 76],
    ["t3", 148],
    ["h1", 105],
    ["h2", 62],
  ]);
  const drawn = drawAssetView(shape, NODE_READABLE, heights);
  noneOverlap(drawn, { size: NODE_READABLE, heights });
  linesRunBetweenBoxes(drawn, { size: NODE_READABLE, heights });
  hangsBeneath(drawn, "a", shape.homes, (id) => `in|${id}`, { size: NODE_READABLE, heights });
  assert.deepEqual(drawn.at.get("a"), { x: -NODE_READABLE.w / 2, y: -24 });
});

test("damage scenarios joined by a threat stand on the same side of the asset; others are shared out between both", () => {
  const { at } = drawAssetView(JOINED);
  const x = (id: string) => at.get(id)?.x ?? 0;
  assert.equal(x("d1") > 0, x("d3") > 0);
  assert.notEqual(x("d2") > 0, x("d1") > 0);
  // a threat stands beyond its damage scenario, seen from the asset
  for (const [threatId, damageId] of [
    ["t1", "d1"],
    ["t2", "d2"],
    ["t3", "d2"],
  ] as const) {
    assert.ok(Math.abs(x(threatId)) > Math.abs(x(damageId)));
  }
});

test("a line stands for its path: a screened-out path and a threat without one are faint, and a path has its ID on it", () => {
  const drawn = drawAssetView(MANY_PATHS);
  const keysOf = (lines: { key: string }[]) => lines.map((line) => line.key).sort();
  assert.deepEqual(keysOf(drawn.lines.filter((line) => line.faint)), ["t1|t1-p3|d1", "t4|null|d1"]);
  assert.deepEqual(
    drawn.lines.filter((line) => !line.arrow).map((line) => line.joins),
    [["a", "d1"]],
  );
  assert.deepEqual(drawn.lines.find((line) => line.key === "t2|t2-p0|d1")?.joins.sort(), ["d1", "t2", "t2-p0"]);
  assert.deepEqual(
    drawn.labels.map((label) => label.recordId),
    [...MANY_PATHS.threats.flatMap((each) => each.paths), null],
  );
  // a threat without a path says so on its line; that, and the ID of a path that is screened out, are faint
  const last = drawn.labels.at(-1);
  assert.deepEqual([last?.recordId, last?.of, last?.text, last?.faint], [null, "t4", "No attack path", true]);
  assert.deepEqual(
    drawn.labels.filter((label) => label.faint).map((label) => label.recordId),
    ["t1-p3", null],
  );
});
