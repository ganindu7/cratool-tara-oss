// The arithmetic of the architecture diagram (src/diagram): where elements stand and how tall they are, which
// lines are drawn and where, what an element holds, and what is laid over the drawing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CUT, check, type Element, facingSides, type Place, type Tara } from "@tara/core";
import { boxShown, type DrawnNode, drawnLines, drawnNodes, type Marked, shownOf } from "../src/diagram/drawing.ts";
import { heldIn, homesOf, notPlaced, placedCount, putIn, rowText, takenOut, whatWasDone } from "../src/diagram/held.ts";
import { gapsAt, highestRiskAt, overlayFor, riskValues, routeOf, routeWith, rowsOf } from "../src/diagram/layers.ts";
import { labelPlaces, openFlows, sharedLines } from "../src/diagram/lines.ts";
import {
  changesAfterDrag,
  frameAround,
  GRID,
  HEAD_HEIGHT,
  headCentre,
  heightOf,
  isBox,
  isFlow,
  isFrame,
  NODE_WIDTH,
  type OnCanvas,
  onGrid,
  placesOf,
  tidy,
} from "../src/diagram/places.ts";
import { EXAMPLES, emptyTara, example, placed } from "./helpers.ts";

/** A TARA whose elements nobody has placed: as one arrives from a file. */
const unplaced = (tara: Tara): Tara => ({
  ...tara,
  elements: tara.elements.map((element) => ({ ...element, x: null, y: null, w: null, h: null })),
});
/** How many rows each element shows with its assets inside, and with the controls laid over. */
const ROWS = ["assets", "controls"] as const;
const rowsIn = (tara: Tara, kind: (typeof ROWS)[number]) => (id: string) => heldIn(tara, kind, id).length;

const overlap = (a: Place, b: Place) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (inner: Place, outer: Place) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** No box covers another, and every box that belongs to a frame lies inside it. */
function standsClear(elements: Element[], places: Map<string, Place>, where: string): void {
  const boxes = elements.filter(isBox);
  for (const box of boxes) assert.ok(places.has(box.id), `${where}: ${box.id} has a place`);
  boxes.forEach((a, index) => {
    for (const b of boxes.slice(index + 1)) {
      assert.ok(!overlap(places.get(a.id) as Place, places.get(b.id) as Place), `${where}: ${a.id} and ${b.id} overlap`);
    }
    if (a.boundaryId === null) return;
    assert.ok(
      within(places.get(a.id) as Place, places.get(a.boundaryId) as Place),
      `${where}: ${a.id} is inside ${a.boundaryId}`,
    );
  });
}

// ------------------------------------------------------------------------------------------------ places

test("an element is as tall as its head and a row for each thing it holds", () => {
  assert.equal(heightOf(0), HEAD_HEIGHT);
  assert.equal(heightOf(1), 58 + 9 + 19);
  assert.equal(heightOf(6), 58 + 9 + 6 * 19);
});

test("an element stays where a person placed it, at the diagram's width and the height of what it holds", () => {
  for (const name of EXAMPLES) {
    const tara = example(name);
    for (const kind of ROWS) {
      const places = placesOf(tara.elements, rowsIn(tara, kind));
      for (const box of tara.elements.filter(isBox)) {
        const expected = { x: box.x, y: box.y, w: NODE_WIDTH, h: heightOf(heldIn(tara, kind, box.id).length) };
        assert.deepEqual(places.get(box.id), expected, `${name}, ${kind}: ${box.id}`);
      }
      for (const flow of tara.elements.filter(isFlow)) assert.equal(places.has(flow.id), false, "a data flow has no place");
      standsClear(tara.elements, places, `${name} as arranged, with its ${kind}`);
    }
  }
});

test("elements that nobody placed stand clear of each other, however many rows they hold", () => {
  for (const name of EXAMPLES) {
    const tara = unplaced(example(name));
    for (const kind of ROWS) {
      standsClear(tara.elements, placesOf(tara.elements, rowsIn(tara, kind)), `${name} from its records, with its ${kind}`);
    }
    // and with far more in one element than any example has
    const crowded = (id: string) => (id === tara.elements.find(isBox)?.id ? 14 : 3);
    standsClear(tara.elements, placesOf(tara.elements, crowded), `${name} from its records, crowded`);
  }
});

test("a tall element has the room it needs, its frame grows around it, and a placed element is not moved", () => {
  const tara = unplaced(placed());
  const flat = placesOf(tara.elements, () => 0);
  const tall = placesOf(tara.elements, (id) => (id === "el1" ? 10 : 0));
  assert.equal(tall.get("el1")?.h, heightOf(10));
  standsClear(tara.elements, tall, "with one tall element");
  // the frame that holds it is as much taller as the element is, or more
  const grown = (tall.get("b1")?.h ?? 0) - (flat.get("b1")?.h ?? 0);
  assert.ok(grown > 0 && (tall.get("b1")?.h ?? 0) >= heightOf(10), "the frame grows around it");

  const fixed = { ...tara, elements: tara.elements.map((e) => (e.id === "el3" ? { ...e, x: 900, y: 12 } : e)) };
  assert.deepEqual(placesOf(fixed.elements, (id) => (id === "el1" ? 10 : 0)).get("el3"), { x: 900, y: 12, w: NODE_WIDTH, h: 58 });
});

test("a TARA without elements has no places, and one element alone has one", () => {
  assert.equal(placesOf(emptyTara().elements, () => 0).size, 0);
  const alone = placed().elements.filter((element) => element.id === "el4");
  assert.deepEqual([...placesOf(alone, () => 2).keys()], ["el4"]);
});

test("an element belongs to the frame the middle of its head lies in: the smallest, where frames lie in one another", () => {
  const outer = { id: "outer", place: { x: 0, y: 0, w: 600, h: 400 } };
  const inner = { id: "inner", place: { x: 100, y: 100, w: 300, h: 200 } };
  assert.deepEqual(headCentre({ x: 100, y: 100 }), { x: 100 + NODE_WIDTH / 2, y: 100 + HEAD_HEIGHT / 2 });
  assert.equal(frameAround(headCentre({ x: 120, y: 120 }), [outer, inner]), "inner");
  assert.equal(frameAround(headCentre({ x: 120, y: 120 }), [inner, outer]), "inner");
  assert.equal(frameAround(headCentre({ x: 10, y: 10 }), [outer, inner]), "outer");
  assert.equal(frameAround(headCentre({ x: 700, y: 10 }), [outer, inner]), null);
  assert.equal(frameAround({ x: 5, y: 5 }, []), null);
});

test("several chosen elements are lined up on their left or top edge, or spaced evenly along the way they are spread", () => {
  const at = (x: number, y: number): Place => ({ x, y, w: NODE_WIDTH, h: 58 });
  const places = new Map([
    ["a", at(0, 10)],
    ["b", at(130, 40)],
    ["c", at(480, 20)],
    ["d", at(900, 900)],
  ]);
  assert.deepEqual(
    [...tidy(places, ["a", "b", "c"], "left")],
    [
      ["a", { x: 0, y: 10 }],
      ["b", { x: 0, y: 40 }],
      ["c", { x: 0, y: 20 }],
    ],
  );
  assert.deepEqual(
    [...tidy(places, ["b", "c"], "top").values()].map((point) => point.y),
    [20, 20],
  );
  // spread wider than high: spaced along x, the first and the last stay, what is between goes to the grid
  const spaced = tidy(places, ["c", "a", "b"], "space");
  assert.deepEqual(spaced.get("a"), { x: 0, y: 10 });
  assert.deepEqual(spaced.get("b"), { x: 240, y: 40 });
  assert.deepEqual(spaced.get("c"), { x: 480, y: 20 });
  assert.equal((spaced.get("b")?.x ?? 1) % GRID, 0);
  // one element, or one that is not drawn, changes nothing
  assert.equal(tidy(places, ["a"], "left").size, 0);
  assert.equal(tidy(places, ["a", "gone"], "top").size, 0);
  assert.equal(onGrid(17), 12);
  assert.equal(onGrid(19), 24);
});

// ------------------------------------------------------------------------------------------------ lines

test("data flows between the same two elements share one line, and a flow with an open end is not drawn", () => {
  const flows = placed().elements.filter(isFlow);
  const lines = sharedLines(flows).map((line) => line.map((flow) => flow.id));
  assert.deepEqual(lines, [
    ["f1", "f2"],
    ["f3", "f4"],
  ]);
  assert.deepEqual(
    openFlows(flows).map((flow) => flow.id),
    ["f5"],
  );
  for (const name of EXAMPLES) {
    const all = example(name).elements.filter(isFlow);
    assert.equal(
      sharedLines(all).flat().length + openFlows(all).length,
      all.length,
      `${name}: every flow is drawn or named as open`,
    );
  }
});

test("a line joins the sides of its two elements that face one another", () => {
  const at = (x: number, y: number, h = 58): Place => ({ x, y, w: NODE_WIDTH, h });
  assert.deepEqual(facingSides(at(0, 0), at(400, 30)), ["right", "left"]);
  assert.deepEqual(facingSides(at(400, 30), at(0, 0)), ["left", "right"]);
  assert.deepEqual(facingSides(at(0, 0), at(40, 300)), ["bottom", "top"]);
  assert.deepEqual(facingSides(at(40, 300), at(0, 0)), ["top", "bottom"]);
  // a tall element is judged by its middle, not its top
  assert.deepEqual(facingSides(at(0, 0, 300), at(0, 100)), ["top", "bottom"]);
});

test("the label of a straight line stands towards the end with fewer lines, clear of where lines meet", () => {
  const flows = example("gateway").elements.filter(isFlow);
  const lines = sharedLines(flows);
  const along = labelPlaces(lines);
  // C02 is joined to five elements: a line to it carries its label near the other end
  const towards = (flowId: string) => along.get(flowId);
  assert.equal(towards("DF04"), 0.3, "DF04 runs from EX02 to C02");
  assert.equal(towards("DF06"), 0.7, "DF06 runs from C02 to C03");
  // DF01 runs from EX01 to C01: one line there, two here
  assert.equal(towards("DF01"), 0.3);
  assert.equal(along.size, lines.length);
  for (const place of along.values()) assert.ok([0.3, 0.5, 0.7].includes(place));
});

// ------------------------------------------------------------------------------------------------ what an element holds

test("an element holds the assets that live in it and the controls that act in it", () => {
  const tara = placed();
  assert.deepEqual(homesOf(tara, "assets", "a1"), ["el1", "f1"]);
  assert.deepEqual(homesOf(tara, "controls", "c1"), ["el1", "b1"]);
  assert.deepEqual(homesOf(tara, "paths", "p1"), []);
  assert.deepEqual(homesOf(tara, "assets", "gone"), []);
  assert.deepEqual(heldIn(tara, "assets", "el1"), [{ id: "a1", name: "Switch-on command" }]);
  assert.deepEqual(heldIn(tara, "controls", "b1"), [{ id: "c1", name: "Signed commands" }]);
  assert.deepEqual(heldIn(tara, "assets", "el4"), []);
  // every asset and control of an example that names an element is held by it
  for (const name of EXAMPLES) {
    const example_ = example(name);
    for (const kind of ROWS) {
      for (const record of example_[kind]) {
        for (const home of record.elementIds) {
          assert.ok(
            heldIn(example_, kind, home).some((row) => row.id === record.id),
            `${name}: ${record.id} in ${home}`,
          );
        }
      }
    }
  }
});

test("what is not placed yet waits: the assets of the item, and the controls that act nowhere", () => {
  const tara = placed((changed) => {
    changed.assets.push({ id: "a3", name: "Pairing key", itemId: "i1", elementIds: [], variant: null, coverageRationale: null });
    changed.assets.push({ id: "a4", name: null, itemId: null, elementIds: [], variant: null, coverageRationale: null });
    changed.assets.push({
      id: "a5",
      name: "Of another item",
      itemId: "i2",
      elementIds: [],
      variant: null,
      coverageRationale: null,
    });
  });
  assert.deepEqual(
    notPlaced(tara, "assets", "i1").map((row) => row.id),
    ["a3", "a4"],
  );
  assert.deepEqual(notPlaced(tara, "controls", "i1"), [{ id: "c2", name: "Rate limiting" }]);
  const elementIds = new Set(tara.elements.map((element) => element.id));
  assert.deepEqual(placedCount(tara, "assets", elementIds), { placed: 2, all: 5 });
  assert.deepEqual(placedCount(tara, "controls", elementIds), { placed: 1, all: 2 });
  for (const name of EXAMPLES) assert.deepEqual(notPlaced(example(name), "assets", "IT01"), [], `${name}: every asset is placed`);
});

test("a row is put in an element, moved from one to another, and taken out, without doubles", () => {
  assert.deepEqual(putIn(["C01"], null, "C02"), ["C01", "C02"]);
  assert.deepEqual(putIn(["C01"], null, "C01"), ["C01"]);
  assert.deepEqual(putIn(["C01", "DF01"], "C01", "C02"), ["C02", "DF01"]);
  assert.deepEqual(putIn(["C01", "C02"], "C01", "C02"), ["C02"]);
  assert.deepEqual(putIn([], null, "C01"), ["C01"]);
  assert.deepEqual(takenOut(["C01", "C02"], "C01"), ["C02"]);
  assert.deepEqual(takenOut(["C01"], "C09"), ["C01"]);
});

test("what was done is said in words, and nothing is said where nothing changed", () => {
  assert.equal(whatWasDone("assets", "A03", ["C01"], ["C01"]), null);
  assert.equal(whatWasDone("assets", "A03", [], ["ST01"]), "A03 put in ST01");
  assert.equal(whatWasDone("assets", "A03", ["C01"], ["ST01"]), "A03 moved from C01 to ST01");
  assert.equal(whatWasDone("controls", "CTL-001", ["C01", "ST01"], ["C01"]), "CTL-001 taken out of ST01");
  assert.equal(whatWasDone("paths", "AP001", [], ["EX01", "DF01"]), "EX01, DF01 put on the route of AP001");
  assert.equal(whatWasDone("paths", "AP001", ["EX01", "DF01"], ["EX01"]), "DF01 taken off the route of AP001");
  assert.equal(whatWasDone("paths", "AP001", ["EX01", "DF01"], []), "The route of AP001 was cleared");
  assert.equal(whatWasDone("paths", "AP001", ["EX01", "DF01"], ["DF01", "EX01"]), "The route of AP001 was reordered");
});

test("the name of a row is whole where it fits beside its ID, and cut after a whole word where it does not", () => {
  const row = { id: "A01", name: "Machine program and settings" };
  assert.equal(rowText(row, 40), "Machine program and settings");
  const cut = rowText(row, 26);
  assert.equal(cut, `Machine program and${CUT}`);
  assert.ok(`${row.id} ${cut}`.length <= 26);
  // a longer ID leaves less room for the name
  assert.equal(rowText({ id: "CTL-001", name: "Machine program and settings" }, 26), `Machine program${CUT}`);
  assert.equal(rowText({ id: "A02", name: null }, 26), "No name yet");
});

// ------------------------------------------------------------------------------------------------ what is laid over

test("the address says what is laid over the drawing, and where it does not, the step decides", () => {
  const kettle = example("kettle");
  assert.equal(overlayFor("gaps", "architecture", kettle), "gaps");
  assert.equal(
    overlayFor("none", "controls", kettle),
    "none",
    "nothing can be asked for, also where the step would show something",
  );
  assert.equal(overlayFor("AP003", "architecture", kettle), "AP003");
  assert.equal(overlayFor(null, "architecture", kettle), "none");
  assert.equal(overlayFor(null, "assets", kettle), "none");
  assert.equal(overlayFor(null, "controls", kettle), "controls");
  assert.equal(overlayFor(null, "paths", kettle), "AP001");
  // an address that names what no longer exists is as good as none
  assert.equal(overlayFor("AP999", "controls", kettle), "controls");
  assert.equal(overlayFor("assets", "architecture", kettle), "none");

  // from the attack paths: the first with a route, else the first, else nothing
  const noRoutes = placed();
  assert.equal(overlayFor(null, "paths", noRoutes), "p1");
  const oneRoute = placed((tara) => {
    (tara.paths[1] as Tara["paths"][number]).elementIds = ["el2", "f1", "el1"];
  });
  assert.equal(overlayFor(null, "paths", oneRoute), "p2");
  assert.equal(overlayFor(null, "paths", emptyTara()), "none");
});

test("the rows of an element are its assets, and with the controls or the gaps laid over, its controls", () => {
  assert.equal(rowsOf("none"), "assets");
  assert.equal(rowsOf("risk"), "assets");
  assert.equal(rowsOf("AP001"), "assets");
  assert.equal(rowsOf("controls"), "controls");
  assert.equal(rowsOf("gaps"), "controls");
});

test("the highest risk that reaches an element comes through an asset it holds or a route that passes it", () => {
  const tara = placed((changed) => {
    (changed.paths[2] as Tara["paths"][number]).elementIds = ["el2", "el4"];
  });
  // the value of each risk, by its threat scenario: the first risk is the higher
  const [first, second] = [4, 2];
  const values = new Map<string, number | null>([
    ["t1", first],
    ["t2", second],
  ]);
  const highest = highestRiskAt(tara, values);
  // a1 (damaged under t1) lives in el1 and on f1; a2 (damaged under t2) in el3; p3 (t2) passes el2 and el4
  assert.deepEqual(Object.fromEntries(highest), { el1: first, f1: first, el3: second, el2: second, el4: second });

  // where two risks reach one element, the higher shows
  const both = placed((changed) => {
    (changed.paths[1] as Tara["paths"][number]).elementIds = ["el3"];
  });
  assert.equal(highestRiskAt(both, values).get("el3"), first);
  assert.equal(highestRiskAt(both, new Map([...values].reverse())).get("el3"), first, "whichever is met first");
  // a risk without a value yet still reaches
  assert.equal(highestRiskAt(tara, new Map()).get("el1"), null);
  assert.equal(highestRiskAt(emptyTara(), values).size, 0);

  // the kettle: the Wi-Fi password in the settings memory is its highest risk, 5
  const kettle = example("kettle");
  const atKettle = highestRiskAt(kettle, riskValues(check(kettle).scores.risks));
  assert.equal(atKettle.get("ST01"), 5);
  for (const id of atKettle.keys())
    assert.ok(
      kettle.elements.some((element) => element.id === id),
      `${id} is an element`,
    );
});

test("the gap view names each component and data store a risk reaches, once", () => {
  for (const name of EXAMPLES) {
    const tara = example(name);
    const gaps = gapsAt(tara, riskValues(check(tara).scores.risks));
    assert.ok(gaps.size > 0, `${name} has elements a risk reaches`);
    for (const [id, place] of gaps) {
      assert.equal(place.elementId, id);
      const kind = tara.elements.find((element) => element.id === id)?.kind;
      assert.ok(kind === "component" || kind === "data_store", `${name}: ${id} is a component or a store`);
    }
  }
});

test("a route numbers its elements and flows from the entry point, and choosing one puts it on or takes it off", () => {
  const kettle = example("kettle");
  const route = routeOf(kettle, "AP001");
  assert.deepEqual(
    [...(route?.steps ?? [])],
    [
      ["EX01", 1],
      ["DF01", 2],
      ["C01", 3],
    ],
  );
  assert.equal(route?.path.id, "AP001");
  for (const overlay of ["none", "risk", "controls", "gaps", "AP999"]) assert.equal(routeOf(kettle, overlay), null);

  assert.deepEqual(routeWith(["EX01"], ["DF01"]), ["EX01", "DF01"]);
  assert.deepEqual(routeWith(["EX01", "DF01", "C01"], ["DF01"]), ["EX01", "C01"]);
  // a line that two flows share: both go on, and when both are on, both come off
  assert.deepEqual(routeWith(["EX01", "DF01"], ["DF01", "DF02"]), ["EX01", "DF01", "DF02"]);
  assert.deepEqual(routeWith(["EX01", "DF01", "DF02"], ["DF01", "DF02"]), ["EX01"]);
  assert.deepEqual(routeWith([], ["C01"]), ["C01"]);
});

test("a frame, a flow and a box are told apart by their kind", () => {
  const kinds = (id: string) => {
    const element = placed().elements.find((candidate) => candidate.id === id) as Element;
    return [isBox(element), isFrame(element), isFlow(element)];
  };
  assert.deepEqual(kinds("el1"), [true, false, false]);
  assert.deepEqual(kinds("b1"), [false, true, false]);
  assert.deepEqual(kinds("f1"), [false, false, true]);
});

// ------------------------------------------------------------------------------------------------ what the canvas shows

const scoresOf = (tara: Tara) => check(tara).scores.risks;
const nobody: Marked = { selected: null, chosen: [], takes: () => false };
/** The drawing of a TARA with something laid over it: its boxes and frames, and its lines. */
function drawingOf(tara: Tara, overlay: string, marked: Marked = nobody, assetsInside = true) {
  const shown = shownOf(tara, scoresOf(tara), overlay, assetsInside);
  const places = placesOf(tara.elements, (id) => shown.rowsIn(id).length);
  const nodes = drawnNodes(tara.elements, places, shown, marked);
  const lines = drawnLines(tara.elements.filter(isFlow), places, shown, marked.selected);
  return { shown, places, nodes, lines };
}
const boxOf = (nodes: DrawnNode[], id: string) => {
  const node = nodes.find((candidate) => candidate.id === id);
  assert.ok(node?.type === "box", `${id} is drawn as a box`);
  return node;
};

test("an element shows its assets, unless they are put away, and its controls while those are laid over", () => {
  const kettle = example("kettle");
  const ids = (overlay: string, assetsInside: boolean) =>
    shownOf(kettle, scoresOf(kettle), overlay, assetsInside)
      .rowsIn("C01")
      .map((row) => row.id);
  assert.deepEqual(ids("none", true), ["A01", "A02"]);
  assert.deepEqual(ids("none", false), []);
  assert.deepEqual(ids("AP001", true), ["A01", "A02"]);
  assert.deepEqual(ids("controls", false), ["CTL-001", "CTL-002"], "controls are shown whether or not the assets are");
  assert.deepEqual(ids("gaps", true), ["CTL-001", "CTL-002"]);
  const shown = (overlay: string) => shownOf(kettle, scoresOf(kettle), overlay, true);
  assert.deepEqual([shown("none").route, shown("none").risks, shown("none").gaps], [null, null, null]);
  assert.ok(shown("risk").risks && !shown("risk").gaps && !shown("risk").route);
  assert.ok(shown("gaps").gaps && !shown("gaps").risks);
  assert.equal(shown("AP002").route?.path.id, "AP002");
});

test("what is laid over an element shows in it: its place on a route, the risk that reaches it, how it stands in the gap view", () => {
  const kettle = example("kettle");
  const at = (overlay: string, id: string) => boxShown(id, shownOf(kettle, scoresOf(kettle), overlay, true));
  // nothing laid over: no step, no value, no outline
  assert.deepEqual(
    [at("none", "C01").step, at("none", "C01").risk, at("none", "C01").onRoute, at("none", "C01").gap],
    [null, undefined, null, null],
  );
  // AP001 enters at EX01, passes DF01 and reaches C01
  assert.deepEqual([at("AP001", "EX01").step, at("AP001", "C01").step, at("AP001", "ST01").step], [1, 3, null]);
  assert.deepEqual([at("AP001", "EX01").onRoute, at("AP001", "ST01").onRoute], [true, false]);
  // the highest risk of the kettle reaches the settings memory; none reaches... every element is named, with a value or without
  assert.equal(at("risk", "ST01").risk, 5);
  for (const element of kettle.elements.filter(isBox)) assert.notEqual(at("risk", element.id).risk, undefined);
  // the gap view: an outside party is not ours to protect; a value shows only where a risk is not met
  assert.equal(at("gaps", "EX01").gap, "none");
  for (const id of ["C01", "ST01"]) {
    const box = at("gaps", id);
    assert.ok(box.gap !== null && box.gap !== "none", `${id} is reached by a risk`);
    assert.equal(box.risk !== undefined, box.gap === "gap" || box.gap === "planned");
  }
});

test("every asset in an element is a row of it: none stands behind a count", () => {
  const tara = example("kettle");
  for (let n = 5; n <= 16; n++) {
    tara.assets.push({
      id: `A${n}`,
      name: `Asset ${n}`,
      itemId: "IT01",
      elementIds: ["C01"],
      variant: null,
      coverageRationale: null,
    });
  }
  const { nodes, places } = drawingOf(tara, "none");
  const rows = boxOf(nodes, "C01").data.rows.map((row) => row.id);
  assert.equal(rows.length, 14);
  for (let n = 5; n <= 16; n++) assert.ok(rows.includes(`A${n}`));
  assert.equal(places.get("C01")?.h, heightOf(14), "and the element is as tall as they need");
});

test("frames are listed before what they hold, and a box in a frame is placed from the frame's corner", () => {
  for (const name of EXAMPLES) {
    const tara = example(name);
    const { nodes, places } = drawingOf(tara, "none");
    assert.equal(
      nodes.length,
      tara.elements.filter((element) => !isFlow(element)).length,
      `${name}: every box and frame is drawn`,
    );
    const order = nodes.map((node) => node.id);
    for (const node of nodes) {
      if (node.type !== "box") continue;
      const { element } = node.data;
      assert.equal(node.width, NODE_WIDTH);
      const own = places.get(node.id) as Place;
      if (element.boundaryId === null) {
        assert.equal(node.parentId, undefined);
        assert.deepEqual(node.position, { x: own.x, y: own.y });
        continue;
      }
      const frame = places.get(element.boundaryId) as Place;
      assert.equal(node.parentId, element.boundaryId);
      assert.ok(
        order.indexOf(element.boundaryId) < order.indexOf(node.id),
        `${name}: ${element.boundaryId} comes before ${node.id}`,
      );
      assert.deepEqual(node.position, { x: own.x - frame.x, y: own.y - frame.y });
    }
  }
  // the kettle: the controller stands at 360, 204 in a frame whose corner is at 300, 110
  const kettle = drawingOf(example("kettle"), "none").nodes;
  assert.deepEqual(boxOf(kettle, "C01").position, { x: 60, y: 94 });
  const frame = kettle.find((node) => node.id === "TB01");
  assert.ok(frame?.type === "frame");
  assert.deepEqual([frame.position, frame.width, frame.height, frame.zIndex], [{ x: 300, y: 110 }, 640, 250, -1]);
  assert.equal(drawingOf(emptyTara(), "none").nodes.length, 0);
});

test("the canvas marks the chosen record, the elements chosen together, and where what is being placed can go", () => {
  const kettle = example("kettle");
  const marked: Marked = { selected: "A03", chosen: ["EX01", "EX02"], takes: (id) => id === "C01" };
  const { nodes } = drawingOf(kettle, "none", marked);
  assert.deepEqual(
    nodes.filter((node) => node.selected).map((node) => node.id),
    ["EX01", "EX02"],
  );
  assert.equal(boxOf(nodes, "ST01").data.chosenRow, "A03", "the chosen asset is a row of the settings memory");
  assert.deepEqual(
    nodes.filter((node) => node.type === "box" && node.data.target).map((node) => node.id),
    ["C01"],
  );
  const chosenBox = drawingOf(kettle, "none", { ...nobody, selected: "TB01" }).nodes;
  assert.deepEqual(
    chosenBox.filter((node) => node.selected).map((node) => node.id),
    ["TB01"],
  );
  // with the controls laid over, a frame names the controls that act at the boundary
  const withControls = placed();
  const frame = drawingOf(withControls, "controls").nodes.find((node) => node.id === "b1");
  assert.ok(frame?.type === "frame");
  assert.equal(frame.data.note, "c1");
  const plain = drawingOf(withControls, "none").nodes.find((node) => node.id === "b1");
  assert.ok(plain?.type === "frame");
  assert.equal(plain.data.note, "");
});

test("a line carries the IDs of its flows and of what they carry, and shows its direction when it is one flow's own", () => {
  const { lines } = drawingOf(placed(), "none");
  assert.deepEqual(
    lines.map((line) => [line.id, line.flowIds, line.source, line.target]),
    [
      ["f1", ["f1", "f2"], "el2", "el1"],
      ["f3", ["f3", "f4"], "el1", "el3"],
    ],
  );
  // a1 lives on f1; nothing lives on f3 or f4
  assert.deepEqual(
    lines.map((line) => line.label),
    ["f1, f2 · a1", "f3, f4"],
  );
  // flows that share a line run both ways between them: no arrowhead
  for (const line of lines) assert.deepEqual(line.arrows, { start: false, end: false });
  assert.deepEqual(
    drawingOf(placed(), "none", nobody, false).lines.map((line) => line.label),
    ["f1, f2", "f3, f4"],
  );

  // with the controls laid over, a line names the controls that act on its flows
  const onFlow = placed((tara) => {
    (tara.controls[0] as Tara["controls"][number]).elementIds = ["f3", "f4"];
  });
  assert.deepEqual(
    drawingOf(onFlow, "controls").lines.map((line) => line.label),
    ["f1, f2", "f3, f4 · c1"],
  );

  // one flow of its own: forward ends in an arrowhead, backward starts with one, both ways has both, unrecorded has none
  const directions = placed((tara) => {
    tara.elements = tara.elements.filter((element) => !["f2", "f4"].includes(element.id));
    for (const element of tara.elements) {
      if (element.id === "f3") element.direction = "backward";
    }
  });
  const arrows = Object.fromEntries(drawingOf(directions, "none").lines.map((line) => [line.id, line.arrows]));
  assert.deepEqual(arrows, { f1: { start: false, end: true }, f3: { start: true, end: false } });
  const gateway = drawingOf(example("gateway"), "none").lines;
  assert.deepEqual(gateway.find((line) => line.id === "DF04")?.arrows, { start: true, end: true });
  for (const line of gateway)
    assert.ok(["left", "right", "top", "bottom"].includes(line.sides[0]) && line.sides[0] !== line.sides[1]);
});

test("a line comes forward when it or an end of it is chosen or it is on the route shown, and the others step back", () => {
  const kettle = example("kettle");
  const state = (overlay: string, selected: string | null) =>
    Object.fromEntries(
      drawingOf(kettle, overlay, { ...nobody, selected }).lines.map((line) => [
        line.id,
        line.forward ? "forward" : line.back ? "back" : "-",
      ]),
    );
  assert.deepEqual(state("none", null), { DF01: "-", DF02: "-", DF03: "-" });
  assert.deepEqual(state("none", "DF02"), { DF01: "-", DF02: "forward", DF03: "-" }, "a chosen line comes forward alone");
  assert.deepEqual(state("none", "ST01"), { DF01: "back", DF02: "back", DF03: "forward" }, "the lines of a chosen element");
  assert.deepEqual(state("none", "A03"), { DF01: "-", DF02: "-", DF03: "-" }, "a chosen asset moves no line");
  // AP001 passes DF01
  assert.deepEqual(state("AP001", null), { DF01: "forward", DF02: "back", DF03: "back" });
  // only a line on the route shown is the attacker's: a line that is merely chosen is not
  const onRoute = (overlay: string, selected: string | null) =>
    drawingOf(kettle, overlay, { ...nobody, selected })
      .lines.filter((line) => line.onRoute)
      .map((line) => line.id);
  assert.deepEqual(onRoute("AP001", "DF02"), ["DF01"]);
  assert.deepEqual(onRoute("none", "DF01"), []);
  const numbered = drawingOf(kettle, "AP001").lines.map((line) => line.label);
  assert.deepEqual(numbered, ["2. DF01 · A01, A04", "DF02", "DF03"]);
});

// ------------------------------------------------------------------------------------------------ after a drag

/** The boxes and frames of a drawing as they stand on the canvas, with one of them moved by so much. */
function afterMoving(tara: Tara, id: string, by: { x: number; y: number }): OnCanvas[] {
  return drawingOf(tara, "none").nodes.map((node) => ({
    element: node.data.element,
    at: node.id === id ? { x: node.position.x + by.x, y: node.position.y + by.y } : node.position,
    within: node.type === "box" ? (node.parentId ?? null) : null,
    ...(node.type === "frame" ? { size: { w: node.width, h: node.height } } : {}),
  }));
}

test("a drag stores where the element then stands on the whole drawing, and nothing where nothing moved", () => {
  const kettle = example("kettle");
  // the controller, 24 to the right inside its frame: its place is counted on the drawing, not from the frame
  assert.deepEqual(changesAfterDrag(afterMoving(kettle, "C01", { x: 24, y: 0 }), ["C01"]), [
    { op: "set", kind: "elements", id: "C01", values: { x: 384, y: 204 } },
  ]);
  assert.deepEqual(changesAfterDrag(afterMoving(kettle, "C01", { x: 0, y: 0 }), ["C01"]), []);
  assert.deepEqual(changesAfterDrag(afterMoving(kettle, "C01", { x: 24, y: 0 }), []), []);
});

test("an element dragged out of its frame leaves it, and one dragged into a frame belongs to it", () => {
  const kettle = example("kettle");
  // the controller far to the left of the kettle's frame
  assert.deepEqual(changesAfterDrag(afterMoving(kettle, "C01", { x: -330, y: 300 }), ["C01"]), [
    { op: "set", kind: "elements", id: "C01", values: { x: 30, y: 504, boundaryId: null } },
  ]);
  // the phone app into the kettle
  assert.deepEqual(changesAfterDrag(afterMoving(kettle, "EX01", { x: 480, y: 60 }), ["EX01"]), [
    { op: "set", kind: "elements", id: "EX01", values: { x: 480, y: 156, boundaryId: "TB01" } },
  ]);
});

test("a frame that is dragged takes what is in it along, and what is in it stays in it", () => {
  const kettle = example("kettle");
  const changes = changesAfterDrag(afterMoving(kettle, "TB01", { x: 120, y: -48 }), ["TB01"]);
  assert.deepEqual(changes, [
    { op: "set", kind: "elements", id: "TB01", values: { x: 420, y: 62 } },
    { op: "set", kind: "elements", id: "C01", values: { x: 480, y: 156 } },
    { op: "set", kind: "elements", id: "ST01", values: { x: 840, y: 156 } },
  ]);
  // a frame dragged over an element that stood outside does not take it in: only what was dragged is looked at
  const over = changesAfterDrag(afterMoving(kettle, "TB01", { x: -280, y: 0 }), ["TB01"]);
  assert.deepEqual(
    over.map((change) => (change.op === "set" ? change.id : "")),
    ["TB01", "C01", "ST01"],
  );
});
