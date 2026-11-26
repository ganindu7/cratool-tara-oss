// The graph of a TARA: the links it has are the links the records have, and a loose end is a real gap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { check, type Tara } from "@tara/core";
import {
  chainOf,
  type Graph,
  graphOf,
  inFormOrder,
  kindOf,
  reach,
  riskStatus,
  thingsToDraw,
  within,
} from "../src/views/graph.ts";
import { changed, element, flow, nth, placed, proof, withGraph } from "./helpers.ts";

const build = (change: (tara: Tara) => void = () => {}) => withGraph(changed(change));
const looseEnds = (graph: Graph) =>
  Object.fromEntries([...graph.things.values()].filter((thing) => thing.loose).map((thing) => [thing.id, thing.loose]));

test("the graph has every record once and every link the records have", () => {
  const { tara, graph } = build();
  const lists = [tara.items, tara.assets, tara.damages, tara.threats, tara.paths, tara.risks, tara.controls, tara.goalClaims];
  assert.equal(
    graph.things.size,
    lists.reduce((total, list) => total + list.length, 0),
  );
  const drawn = new Set(graph.links.map(([from, to]) => `${from}>${to}`));
  for (const asset of tara.assets) assert.ok(drawn.has(`${asset.itemId}>${asset.id}`));
  for (const damage of tara.damages) assert.ok(drawn.has(`${damage.assetId}>${damage.id}`));
  for (const threat of tara.threats) for (const damageId of threat.damageIds) assert.ok(drawn.has(`${damageId}>${threat.id}`));
  for (const path of tara.paths) for (const threatId of path.threatIds) assert.ok(drawn.has(`${threatId}>${path.id}`));
  for (const risk of tara.risks) {
    for (const controlId of [...risk.existingControlIds, ...risk.proposedControlIds])
      assert.ok(drawn.has(`${risk.id}>${controlId}`));
  }
  for (const goal of tara.goalClaims) for (const riskId of goal.riskIds) assert.ok(drawn.has(`${riskId}>${goal.id}`));
});

test("a risk rests on the attack paths that count towards it, not on one that was screened out", () => {
  const { graph } = build();
  assert.deepEqual(graph.up.get("r1")?.sort(), ["p1", "p2"]);
  assert.deepEqual(graph.up.get("r2"), ["p2"]);
  assert.equal(graph.down.get("p3"), undefined);
  // while no path counts yet, the risk rests on its threat
  const noPathYet = build((tara) => {
    tara.paths = [];
  });
  assert.deepEqual(noPathYet.graph.up.get("r1"), ["t1"]);
});

test("in a complete TARA every record is on a chain: there is no loose end", () => {
  assert.deepEqual(looseEnds(build().graph), {});
});

test("a gap is a loose end, with what is missing in words", () => {
  const has = (change: (tara: Tara) => void, expected: Record<string, string>) => {
    const found = looseEnds(build(change).graph);
    for (const [id, why] of Object.entries(expected)) assert.equal(found[id], why, id);
  };
  has(
    (tara) => {
      nth(tara.threats, 1).damageIds = [];
    },
    { t2: "Leads to no damage scenario", d3: "No threat scenario leads to this damage" },
  );
  has(
    (tara) => {
      for (const path of tara.paths) path.threatIds = path.threatIds.filter((id) => id !== "t2");
    },
    { t2: "No attack path carries out this threat", p3: "Carries out no threat" },
  );
  has(
    (tara) => {
      nth(tara.goalClaims, 1).riskIds = [];
    },
    { r2: "No control, goal or claim: the risk is not treated yet", g2: "Answers no risk" },
  );
  has(
    (tara) => {
      nth(tara.goalClaims, 1).riskIds = [];
      nth(tara.risks, 1).treatment = "avoid";
    },
    { r2: "No goal or claim records how the risk is avoided" },
  );
  has(
    (tara) => {
      nth(tara.assets, 1).itemId = null;
    },
    { a2: "Not linked to an item" },
  );
  has(
    (tara) => {
      tara.assets = [];
      tara.damages = [];
      for (const threat of tara.threats) threat.damageIds = [];
    },
    { i1: "No asset belongs to this item" },
  );
});

test("an asset with a recorded reason for having no damage scenario is not a loose end, nor is a screened-out path", () => {
  const withReason = build((tara) => {
    tara.damages = tara.damages.filter((damage) => damage.assetId !== "a2");
    nth(tara.threats, 1).damageIds = [];
    nth(tara.assets, 1).coverageRationale = "Read-only data";
  });
  assert.equal(withReason.graph.things.get("a2")?.loose, undefined);
  const withoutReason = build((tara) => {
    tara.damages = tara.damages.filter((damage) => damage.assetId !== "a2");
    nth(tara.threats, 1).damageIds = [];
  });
  assert.equal(withoutReason.graph.things.get("a2")?.loose, "No damage scenario, and no reason recorded why none applies");
  assert.equal(build().graph.things.get("p3")?.loose, undefined);
});

test("the whole chain of a record is what it rests on and what rests on it; a distance counts links either way", () => {
  const { graph } = build();
  assert.deepEqual([...chainOf(graph, ["r2"])].sort(), ["a2", "d3", "g2", "i1", "p2", "r2", "t2"]);
  // p2 carries out both threats: the chain of one threat's risk does not wander into the other threat
  assert.deepEqual([...reach(graph, ["t2"], "down")].sort(), ["g2", "p2", "p3", "r2"]);
  assert.deepEqual([...reach(graph, ["p2"], "up")].filter((id) => id.startsWith("t")).sort(), ["t1", "t2"]);
  assert.deepEqual([...within(graph, "d3", 1)].sort(), ["a2", "d3", "t2"]);
  assert.equal(within(graph, "d3", 2).has("p3"), true);
  assert.equal(within(graph, "d3", 1).has("p3"), false);
  assert.deepEqual([...within(graph, "d3", 0)], ["d3"]);
});

test("a thing says what it is: its words on one line, the value of a risk, the state of a control, a goal or a claim", () => {
  const { graph } = build((tara) => {
    nth(tara.assets, 0).name = "  Switch-on\n   command ";
    nth(tara.controls, 0).workLink = "https://example.org/ticket/1";
  });
  const thing = (id: string) => graph.things.get(id);
  assert.equal(thing("a1")?.text, "Switch-on command");
  // a risk has no words of its own: it says those of its threat
  assert.deepEqual([thing("r1")?.text, thing("r1")?.value], ["PROOF threat", 5]);
  assert.deepEqual([thing("c1")?.state, thing("c1")?.workLink], ["verified", "https://example.org/ticket/1"]);
  assert.deepEqual([thing("c2")?.state, thing("c2")?.workLink], ["proposed", null]);
  assert.deepEqual([thing("g1")?.what, thing("g2")?.what], ["Goal", "Claim"]);
  assert.deepEqual([kindOf({ kind: "goalClaims" }).one, kindOf({ kind: "paths" }).many], ["Goal or claim", "Attack paths"]);
});

test("every record on the graph says how it stands; a risk by its rating while that is open, then by its treatment", () => {
  const tara = proof();
  const checks = check(tara);
  const graph = graphOf(tara, checks);
  assert.deepEqual(graph.things.get("a1")?.status, checks.assets.get("a1"));
  assert.deepEqual(graph.things.get("p1")?.status, checks.paths.get("p1"));
  const rating = checks.riskRating.get("r1");
  assert.ok(rating);
  // nothing is reviewed in the small TARA, so the rating is still open, and is what the risk says
  assert.notEqual(rating.kind, "done");
  assert.deepEqual(graph.things.get("r1")?.status, rating);
  const settled = { riskRating: new Map([["r1", { ...rating, kind: "done" as const }]]), riskTreatment: checks.riskTreatment };
  assert.deepEqual(riskStatus(settled, "r1"), checks.riskTreatment.get("r1"));
});

// ------------------------------------------------------------------------------------ the architecture on the graph

const elements = () => [
  flow("fl1", null, null),
  element("cm1", "component"),
  element("bd1", "trust_boundary"),
  element("st1", "data_store"),
  flow("fl2", null, null),
  element("ex1", "external_interactor"),
];
const withElements = () =>
  withGraph(
    changed((tara) => {
      tara.elements = elements();
    }),
  );

test("the things of the architecture are on the graph under their item, each named by its kind; no flow or boundary", () => {
  const { tara, graph, checks } = withElements();
  assert.deepEqual(
    tara.elements.filter((each) => graph.things.has(each.id)).map((each) => each.id),
    ["cm1", "st1", "ex1"],
  );
  assert.deepEqual([graph.things.get("cm1")?.kind, graph.things.get("cm1")?.what], ["elements", "Component"]);
  assert.deepEqual(graph.up.get("st1"), ["i1"]);
  // a view draws a data flow and a boundary too, where a record names them
  const all = thingsToDraw(graph, tara, checks);
  assert.deepEqual([all.get("fl1")?.what, all.get("bd1")?.what], ["Data flow", "Trust boundary"]);
  assert.equal(all.size, graph.things.size + 3);
});

test("a component or a store that no asset lives in is a loose end; an outside party is not", () => {
  const { graph } = withElements();
  assert.equal(graph.things.get("cm1")?.loose, "No asset is recorded as living here");
  assert.equal(graph.things.get("st1")?.loose, "No asset is recorded as living here");
  assert.equal(graph.things.get("ex1")?.loose, undefined);
});

test("an asset that names where it lives hangs there; one that does not hangs on its item", () => {
  const { graph } = withGraph(placed());
  // a1 lives in el1 and is carried by f1, which is not on the graph
  assert.deepEqual(graph.up.get("a1"), ["el1"]);
  assert.deepEqual(graph.up.get("a2"), ["el3"]);
  assert.deepEqual(graph.up.get("el1"), ["i1"]);
  assert.equal(graph.things.get("el1")?.loose, undefined);
  const onlyCarried = withGraph(
    placed((tara) => {
      nth(tara.assets, 0).elementIds = ["f1"];
    }),
  );
  assert.deepEqual(onlyCarried.graph.up.get("a1"), ["i1"]);
});

test("a form lists the elements in the order of the architecture list, with the data flows after everything else", () => {
  const list = elements();
  assert.deepEqual(
    inFormOrder(list).map((each) => each.id),
    ["cm1", "bd1", "st1", "ex1", "fl1", "fl2"],
  );
  // the list itself is left as it was
  assert.equal(list[0]?.id, "fl1");
});
