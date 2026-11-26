// Which view a record is seen in, what a view holds and draws whichever record is in its middle, where a mark
// leads, and what belongs to a record that is chosen.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Tara } from "@tara/core";
import { architectureLinks, belongingTo } from "../src/views/belonging.ts";
import { chainOf, thingsToDraw } from "../src/views/graph.ts";
import { NODE } from "../src/views/layout.ts";
import {
  boxesOf,
  centresOf,
  drawView,
  egoViewOf,
  holdView,
  markLeadsTo,
  VIEWS,
  type ViewKind,
  viewFromKey,
  viewKey,
  viewOf,
  viewTip,
} from "../src/views/views.ts";
import { nth, placed, placedIds, withGraph } from "./helpers.ts";

// -------------------------------------------------------------------------------- which view a record is seen in

const of = (id: string, tara: Tara = placed()) => viewOf(tara, id);

test("an asset and its damage are seen in the view of the asset; a threat, its risk, paths and goals in the threat's", () => {
  assert.deepEqual(of("a1"), { kind: "asset", centre: "a1", chosen: null });
  assert.deepEqual(of("d2"), { kind: "asset", centre: "a1", chosen: "d2" });
  assert.deepEqual(of("t2"), { kind: "threat", centre: "t2", chosen: null });
  assert.deepEqual(of("r2"), { kind: "threat", centre: "t2", chosen: "r2" });
  // a path is seen in the view of the first threat it carries out
  assert.deepEqual(of("p2"), { kind: "threat", centre: "t1", chosen: "p2" });
  assert.deepEqual(of("g2"), { kind: "threat", centre: "t2", chosen: "g2" });
});

test("a thing of the architecture and a control have their own view; a data flow is a line where it starts from", () => {
  assert.deepEqual(of("el1"), { kind: "element", centre: "el1", chosen: null });
  assert.deepEqual(of("el3"), { kind: "element", centre: "el3", chosen: null });
  assert.deepEqual(of("f1"), { kind: "element", centre: "el2", chosen: "f1" });
  assert.deepEqual(of("c1"), { kind: "control", centre: "c1", chosen: null });
  assert.deepEqual(of("c2"), { kind: "control", centre: "c2", chosen: null });
});

test("an evidence entry is seen by its control, in the view of the threat of its risk", () => {
  assert.deepEqual(of("e1"), { kind: "threat", centre: "t1", chosen: "c1" });
});

test("there is no view where there would be nothing to see, and none for an item or a boundary", () => {
  const bare = placed((tara) => {
    tara.damages = tara.damages.filter((damage) => damage.assetId !== "a2");
    nth(tara.paths, 2).threatIds = [];
    nth(tara.assets, 1).elementIds = [];
    nth(tara.goalClaims, 0).riskIds = [];
    nth(tara.risks, 0).proposedControlIds = [];
  });
  // no place and no damage scenario; no threat; no risk; no risk and no place
  for (const id of ["a2", "p3", "g1", "c2"]) assert.equal(of(id, bare), null, id);
  // nothing joined and nothing in it; an open end; a boundary; an item
  for (const id of ["el4", "f5", "b1", "i1", "nothing"]) assert.equal(of(id), null, id);

  // an asset that only has a place, and a control that only has one, have a view
  const onlyPlaced = placed((tara) => {
    tara.damages = tara.damages.filter((damage) => damage.assetId !== "a2");
  });
  assert.deepEqual(of("a2", onlyPlaced), { kind: "asset", centre: "a2", chosen: null });
  const onlyActing = placed((tara) => {
    nth(tara.risks, 0).proposedControlIds = [];
    nth(tara.controls, 1).elementIds = ["el2"];
  });
  assert.deepEqual(of("c2", onlyActing), { kind: "control", centre: "c2", chosen: null });

  // without an architecture an asset is seen by its damage scenarios alone
  const withoutArchitecture = { ...bare, elements: [] };
  assert.deepEqual(of("a1", withoutArchitecture), { kind: "asset", centre: "a1", chosen: null });
  assert.equal(of("el1", withoutArchitecture), null);
});

test("every entity has an ego view of itself; an item, an evidence entry and what is not in the TARA have none", () => {
  for (const id of ["el1", "f1", "b1", "a1", "d1", "t1", "p1", "r1", "c1", "g1"]) {
    assert.deepEqual(egoViewOf(placed(), id), { kind: "ego", centre: id, chosen: null });
  }
  for (const id of ["i1", "e1", "nothing"]) assert.equal(egoViewOf(placed(), id), null);
});

test("a view can be named in one word, with the chosen record after it, and read back from it", () => {
  for (const id of ["a1", "d2", "t2", "r2", "p2", "g1", "el1", "f1", "c1", "e1"]) {
    const view = of(id);
    assert.ok(view);
    assert.deepEqual(viewFromKey(viewKey(view)), view);
  }
  assert.equal(viewKey({ kind: "asset", centre: "a1", chosen: "d2" }), "asset:a1:d2");
  assert.equal(viewKey({ kind: "element", centre: "el2", chosen: "f1" }), "element:el2:f1");
  assert.deepEqual(viewFromKey("ego:p1"), { kind: "ego", centre: "p1", chosen: null });
  // the IDs of this tool have hyphens and no colons
  assert.deepEqual(viewFromKey("asset:A01:DS-0002"), { kind: "asset", centre: "A01", chosen: "DS-0002" });
  for (const kind of Object.keys(VIEWS) as ViewKind[]) {
    assert.deepEqual(viewFromKey(viewKey({ kind, centre: "x", chosen: "y" })), { kind, centre: "x", chosen: "y" });
  }
  for (const other of [null, undefined, "", "around:a1", "risk:r1", "item:i1", "asset:", "element:"])
    assert.equal(viewFromKey(other), null);
});

test("each view has a name, a kind of record in its middle, and words for the way into it", () => {
  // the ego view has a record of any kind in its middle
  assert.deepEqual(
    Object.values(VIEWS).map((view) => view.of),
    ["elements", "assets", "threats", "controls", null],
  );
  assert.equal(
    viewTip({ kind: "asset", centre: "A01", chosen: "DS-0002" }),
    `Asset view of A01, with DS-0002 chosen: ${VIEWS.asset.shows}`,
  );
  assert.equal(viewTip({ kind: "asset", centre: "A01", chosen: "A01" }), `Asset view of A01: ${VIEWS.asset.shows}`);
  assert.equal(viewTip({ kind: "ego", centre: "R003", chosen: null }), `Ego view of R003: ${VIEWS.ego.shows}`);
});

// ----------------------------------------------------------------------- a view, whichever record is in its middle

for (const [kind, centre] of [
  ["element", "el1"],
  ["asset", "a1"],
  ["threat", "t1"],
  ["control", "c1"],
  ["ego", "p1"],
] as [ViewKind, string][]) {
  test(`the ${kind} view of ${centre}: every box has a place and every place is a box, the record in the middle first`, () => {
    const { tara, checks } = withGraph(placed());
    const held = holdView({ kind, centre }, tara, checks.scores);
    assert.ok(held);
    const drawn = drawView(held);
    assert.equal(held.kind, kind);
    assert.equal(boxesOf(held)[0], centre);
    assert.deepEqual(placedIds(drawn), boxesOf(held).sort());
    assert.deepEqual(drawn.at.get(centre), { x: -NODE.w / 2, y: -NODE.h / 2 });
    // a line runs between boxes, or stands for a record that is not a box and whose ID it carries
    const boxes = new Set(boxesOf(held));
    const carried = new Set(drawn.labels.flatMap((label) => (label.recordId ? [label.recordId] : [])));
    for (const line of drawn.lines)
      for (const id of line.joins) assert.ok(boxes.has(id) || carried.has(id), `${line.key}: ${id}`);
  });
}

test("a record that is not one that stands in the middle of a view, or is not there, has none", () => {
  const { tara, checks } = withGraph(placed());
  for (const [kind, centre] of [
    ["element", "f1"],
    ["element", "a1"],
    ["asset", "t1"],
    ["threat", "r1"],
    ["control", "nothing"],
    ["ego", "i1"],
    ["ego", "e1"],
  ] as [ViewKind, string][]) {
    assert.equal(holdView({ kind, centre }, tara, checks.scores), null, `${kind} of ${centre}`);
  }
});

test("the ego view is one of the views: held and drawn as the others are, with a block as wide as it is told", () => {
  const withRoute = placed((tara) => {
    nth(tara.paths, 0).elementIds = ["el2", "f1", "el1"];
  });
  const { tara, checks } = withGraph(withRoute);
  const held = holdView({ kind: "ego", centre: "p1" }, tara, checks.scores);
  assert.ok(held);
  assert.deepEqual(boxesOf(held), ["p1", "t1", "r1", "c1", "el2", "f1", "el1"]);
  const drawn = drawView(held, NODE, undefined, 264);
  assert.deepEqual(placedIds(drawn), boxesOf(held).sort());
  assert.deepEqual(drawn.at.get("p1"), { x: -132, y: -NODE.h / 2 });
});

test("the records a view can be turned to are those with something around them, and the one that stands there now", () => {
  const { tara, checks, graph } = withGraph(placed());
  const things = thingsToDraw(graph, tara, checks);
  const ids = (kind: ViewKind, also?: string) => centresOf(kind, tara, things, also).map((thing) => thing.id);
  assert.deepEqual(ids("element"), ["el1", "el2", "el3"]);
  assert.deepEqual(ids("element", "el4"), ["el1", "el2", "el3", "el4"]);
  // a data flow or a boundary never stands in the middle of an element view
  assert.deepEqual(ids("element", "b1"), ["el1", "el2", "el3"]);
  assert.deepEqual(
    centresOf("asset", tara, things).map((thing) => [thing.id, thing.text]),
    [
      ["a1", "Switch-on command"],
      ["a2", "Owner settings"],
    ],
  );
  assert.deepEqual(ids("threat"), ["t1", "t2"]);

  const unused = withGraph(
    placed((changed) => {
      nth(changed.risks, 0).proposedControlIds = [];
    }),
  );
  const others = centresOf("control", unused.tara, thingsToDraw(unused.graph, unused.tara, unused.checks));
  assert.deepEqual(
    others.map((thing) => thing.id),
    ["c1"],
  );

  // an ego view has a record of any kind in its middle: it is turned to the other records of that kind
  assert.deepEqual(ids("ego", "d2"), ["d1", "d2", "d3"]);
  assert.deepEqual(ids("ego", "f2"), ["el1", "el2", "el3", "el4", "b1", "f1", "f2", "f3", "f4", "f5"]);
  assert.deepEqual(ids("ego"), []);
});

// --------------------------------------------------------------------------------- where a mark on a record leads

test("a mark leads to the view the record it names is seen in, with the record that carries the mark chosen there", () => {
  const tara = placed((changed) => {
    nth(changed.threats, 1).damageIds = ["d3", "d1"];
  });
  // a damage scenario of another asset: the view of that asset; a threat a path carries out too: that threat, the path chosen
  assert.deepEqual(markLeadsTo("leads to", "t2", "d1", tara), { kind: "asset", centre: "a1", chosen: "d1" });
  assert.deepEqual(markLeadsTo("carries out", "p2", "t2", tara), { kind: "threat", centre: "t2", chosen: "p2" });
  // a risk a control treats or a goal answers as well: the view of that risk's threat, with the control or the goal chosen
  assert.deepEqual(markLeadsTo("treats", "c1", "r2", tara), { kind: "threat", centre: "t2", chosen: "c1" });
  assert.deepEqual(markLeadsTo("answers", "g1", "r2", tara), { kind: "threat", centre: "t2", chosen: "g1" });
  assert.equal(markLeadsTo("treats", "c1", "nothing", tara), null);
  // another element a record is in: the view of that element, with the record chosen; a data flow: the element it
  // starts from, with the flow chosen; a boundary: nowhere
  assert.deepEqual(markLeadsTo("lives in", "a1", "el3", tara), { kind: "element", centre: "el3", chosen: "a1" });
  assert.deepEqual(markLeadsTo("lives in", "a1", "f1", tara), { kind: "element", centre: "el2", chosen: "f1" });
  assert.equal(markLeadsTo("acts in", "c1", "b1", tara), null);
});

// ------------------------------------------------------------------------- what belongs to a record that is chosen

// A line of a drawing is lit when everything it joins belongs to the chosen record: the other half of what "joins" says.
const { tara: PLACED, checks: CHECKS, graph: GRAPH } = withGraph(placed());
const belonging = (id: string) => belongingTo(GRAPH, PLACED, id);
const missing = (all: Set<string>, ids: string[]) => ids.filter((id) => !all.has(id));

test("to a chosen record belongs its chain, as on the graph", () => {
  for (const id of ["r2", "t1", "d3", "g1"]) assert.deepEqual(missing(belonging(id), [...chainOf(GRAPH, [id])]), []);
  // a threat's chain already holds where its assets live: the architecture adds nothing to it
  assert.deepEqual([...belonging("t2")].sort(), [...chainOf(GRAPH, ["t2"])].sort());
});

test("a data flow belongs to the elements at its ends and to the assets it carries, with what follows from them", () => {
  assert.deepEqual(missing(belonging("f1"), ["f1", "el1", "el2", "a1", "d1", "d2", "t1", "r1"]), []);
  assert.equal(belonging("f1").has("el3"), false);
  // an open end
  assert.deepEqual([...belonging("f5")].sort(), ["el1", "f5"]);
});

test("an element belongs to what its data flows join it to, and to the controls that act in it", () => {
  assert.deepEqual(missing(belonging("el1"), ["f1", "f2", "f3", "f4", "f5", "el2", "el3", "c1", "a1", "d1"]), []);
  assert.equal(belonging("el1").has("el4"), false);
  // a control acts at the boundary
  assert.deepEqual(missing(belonging("b1"), ["c1", "el1", "el3"]), []);
});

test("an asset belongs to every place it lives in, and so does what follows from it; a control to the places it acts in", () => {
  assert.deepEqual(missing(belonging("a1"), ["el1", "f1"]), []);
  assert.deepEqual(missing(belonging("d2"), ["a1", "el1", "f1"]), []);
  assert.deepEqual(missing(belonging("c1"), ["el1", "b1", "r1"]), []);
  // c2 reaches el1 through the risk it is proposed for, whose asset lives there; it acts at no boundary
  assert.equal(belonging("c2").has("el1"), true);
  assert.equal(belonging("c2").has("b1"), false);
});

test("so the line of a data flow is lit from either end and from the flow, and not from a record in neither element", () => {
  const held = holdView({ kind: "element", centre: "el1" }, PLACED, CHECKS.scores);
  assert.ok(held);
  const line = drawView(held).lines.find((candidate) => candidate.key === "flow|f1");
  assert.ok(line);
  for (const id of ["el1", "el2", "f1"])
    assert.equal(
      line.joins.every((joined) => belonging(id).has(joined)),
      true,
      id,
    );
  for (const id of ["a2", "el3", "t2"])
    assert.equal(
      line.joins.every((joined) => belonging(id).has(joined)),
      false,
      id,
    );
});

// --------------------------------------------------------------- what a card says besides the links of the graph

const sections = (id: string) => architectureLinks(GRAPH, PLACED, id);

test("the card of a data flow says what it joins, the assets it carries and the controls that act on it", () => {
  assert.deepEqual(sections("f1"), [
    { title: "Joins", ids: ["el2", "el1"], none: "Both ends are open." },
    { title: "Assets it carries", ids: ["a1"] },
    { title: "Controls that act here", ids: [] },
  ]);
  assert.deepEqual(sections("f5")[0]?.ids, ["el1"]);
});

test("the card of a component or a store says its data flows and the controls that act in it; a boundary its contents", () => {
  assert.deepEqual(sections("el1"), [
    { title: "Data flows", ids: ["f1", "f2", "f3", "f4", "f5"] },
    { title: "Controls that act here", ids: ["c1"] },
  ]);
  assert.deepEqual(sections("b1"), [
    { title: "Contains", ids: ["el1", "el3"] },
    { title: "Controls that act here", ids: ["c1"] },
  ]);
});

test("the card of an asset says the data flows that carry it; that of a control where it acts; any other nothing more", () => {
  assert.deepEqual(sections("a1"), [{ title: "Carried by", ids: ["f1"] }]);
  assert.deepEqual(sections("a2"), [{ title: "Carried by", ids: [] }]);
  assert.deepEqual(sections("c1"), [{ title: "Acts in", ids: ["el1", "b1"] }]);
  for (const id of ["d1", "t1", "p1", "r1", "g1", "nothing"]) assert.deepEqual(sections(id), []);
});
