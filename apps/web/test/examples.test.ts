// Every view of every record of the three training examples, and of TARAs with nothing or next to nothing in
// them: nothing that belongs to a view is left out, no boxes overlap, and every line runs from a box to a box.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Scores, type Tara, validateTara } from "@tara/core";
import { assetView } from "../src/views/asset-view.ts";
import { architectureLinks, belongingTo } from "../src/views/belonging.ts";
import { controlView } from "../src/views/control-view.ts";
import { egoView } from "../src/views/ego.ts";
import { elementView } from "../src/views/element-view.ts";
import { chainOf, isThing, thingsToDraw, within } from "../src/views/graph.ts";
import type { Drawing } from "../src/views/layout.ts";
import { compositionOf, stripOf } from "../src/views/ratings.ts";
import { threatView } from "../src/views/threat-view.ts";
import {
  boxesOf,
  centresOf,
  drawView,
  egoViewOf,
  type Held,
  holdView,
  VIEWS,
  type ViewKind,
  viewOf,
} from "../src/views/views.ts";
import {
  arrowsAreSound,
  EXAMPLES,
  element,
  emptyTara,
  example,
  flow,
  linesRunBetweenBoxes,
  type Measures,
  noneOverlap,
  placed,
  placedIds,
  proof,
  SIZES,
  withGraph,
} from "./helpers.ts";

/** A set as a sorted list, to compare two. */
const sorted = (ids: Iterable<string | null | undefined>): string[] =>
  [...new Set([...ids].filter((id): id is string => !!id))].sort();

/** Every record that has an ego view. */
const entitiesOf = (tara: Tara): string[] =>
  [tara.elements, tara.assets, tara.damages, tara.threats, tara.paths, tara.risks, tara.controls, tara.goalClaims].flatMap(
    (list) => list.map((record) => record.id),
  );

/** The block of an ego view is wider than the records around it, and as high as its record needs. */
const BLOCK = [
  { width: 264, height: 190 },
  { width: 340, height: 260 },
];

/** Draws a view in both ways to draw, and says what every drawing must be. */
function drawnSoundly(held: Held, what: string): Drawing[] {
  return SIZES.map(([sizeName, size], way) => {
    const block = BLOCK[way] ?? { width: size.w, height: size.h };
    const centre = boxesOf(held)[0] ?? "";
    const ego = held.kind === "ego";
    const heights = ego ? new Map([[centre, block.height]]) : undefined;
    const measures: Measures = { size, heights, widths: ego ? new Map([[centre, block.width]]) : undefined };
    const drawn = drawView(held, size, heights, ego ? block.width : undefined);
    const context = `${what}, ${sizeName}`;
    assert.deepEqual(placedIds(drawn), boxesOf(held).sort(), `${context}: every box has a place and every place is a box`);
    try {
      noneOverlap(drawn, measures);
      linesRunBetweenBoxes(drawn, measures);
      arrowsAreSound(drawn, size.w);
    } catch (error) {
      throw new Error(`${context}: ${(error as Error).message}`);
    }
    return drawn;
  });
}

/**
 * What is linked to what directly, straight from the document: each pair both ways. One link is one-way: a
 * boundary shows what it contains, and what it contains names its boundary in its block instead.
 */
function directLinks(tara: Tara, scores: Scores): Map<string, Set<string>> {
  const known = new Set(entitiesOf(tara));
  const links = new Map<string, Set<string>>();
  const oneWay = (from: string | null | undefined, to: string | null | undefined) => {
    if (!from || !to || !known.has(from) || !known.has(to)) return;
    links.set(from, (links.get(from) ?? new Set()).add(to));
  };
  const both = (a: string | null | undefined, b: string | null | undefined) => {
    oneWay(a, b);
    oneWay(b, a);
  };
  for (const each of tara.elements) {
    both(each.id, each.sourceId);
    both(each.id, each.targetId);
    oneWay(each.boundaryId, each.id);
  }
  for (const asset of tara.assets) for (const place of asset.elementIds) both(asset.id, place);
  for (const damage of tara.damages) both(damage.assetId, damage.id);
  for (const threat of tara.threats) for (const damageId of threat.damageIds) both(damageId, threat.id);
  for (const path of tara.paths) {
    for (const threatId of path.threatIds) both(threatId, path.id);
    for (const place of path.elementIds) both(path.id, place);
  }
  for (const risk of tara.risks) {
    both(risk.threatId, risk.id);
    for (const pathId of scores.risks.get(risk.threatId)?.includedPathIds ?? []) both(pathId, risk.id);
    for (const controlId of [...risk.existingControlIds, ...risk.proposedControlIds]) both(risk.id, controlId);
  }
  for (const control of tara.controls) {
    for (const pathId of control.coveredPathIds) both(pathId, control.id);
    for (const place of control.elementIds) both(control.id, place);
  }
  for (const goal of tara.goalClaims) for (const riskId of goal.riskIds) both(riskId, goal.id);
  return links;
}

/** What a view shows: its boxes, and the records whose ID stands on a line. */
const shownIn = (held: Held, drawn: Drawing): string[] =>
  sorted([...boxesOf(held), ...drawn.labels.map((label) => label.recordId)]);

for (const name of EXAMPLES) {
  const { tara, checks, graph } = withGraph(example(name));
  const scores = checks.scores;
  const things = thingsToDraw(graph, tara, checks);
  const lit = (centre: string, drawn: Drawing, what: string) => {
    const belonging = belongingTo(graph, tara, centre);
    for (const line of drawn.lines)
      assert.ok(
        line.joins.every((id) => belonging.has(id)),
        `${what}: ${line.key} is lit with ${centre}`,
      );
  };

  test(`${name}: the graph has every record and every thing of the architecture, and no loose end in the method`, () => {
    const lists = [
      tara.items,
      tara.elements.filter(isThing),
      tara.assets,
      tara.damages,
      tara.threats,
      tara.paths,
      tara.risks,
      tara.controls,
    ];
    assert.equal(graph.things.size, lists.reduce((total, list) => total + list.length, 0) + tara.goalClaims.length);
    assert.equal(things.size, graph.things.size + tara.elements.filter((each) => !isThing(each)).length);
    for (const [from, to] of graph.links) assert.ok(graph.things.has(from) && graph.things.has(to));
    // the only loose ends of the examples are components and stores no asset is recorded as living in
    for (const thing of graph.things.values())
      if (thing.loose) assert.equal(thing.kind, "elements", `${thing.id}: ${thing.loose}`);
  });

  test(`${name}: the ego view of every record holds exactly what is linked to it directly, and is drawn soundly`, () => {
    const links = directLinks(tara, scores);
    for (const id of entitiesOf(tara)) {
      const view = egoView(tara, scores, id);
      assert.ok(view, `${id} has an ego view`);
      const held: Held = { kind: "ego", ...view };
      assert.deepEqual(holdView({ kind: "ego", centre: id }, tara, scores), held);
      const around = boxesOf(held).filter((other) => other !== id);
      assert.deepEqual(sorted(around), sorted(links.get(id) ?? []), `what stands around ${id}`);
      const groupCount = view.left.length + view.right.length + (view.beneath ? 1 : 0);
      for (const drawn of drawnSoundly(held, `the ego view of ${id}`)) {
        // one line to each record around the block, and one caption to each group
        assert.equal(drawn.lines.length, around.length);
        assert.equal(drawn.captions.length, groupCount);
        lit(id, drawn, `the ego view of ${id}`);
      }
    }
    for (const item of tara.items) assert.equal(egoView(tara, scores, item.id), null);
    for (const evidence of tara.evidence) assert.equal(egoViewOf(tara, evidence.id), null);
  });

  test(`${name}: the view of every asset shows where it lives, its damage, their threats and paths, and no more`, () => {
    for (const asset of tara.assets) {
      const held = holdView({ kind: "asset", centre: asset.id }, tara, scores);
      assert.ok(held);
      const damages = tara.damages.filter((damage) => damage.assetId === asset.id).map((damage) => damage.id);
      const threats = tara.threats
        .filter((threat) => threat.damageIds.some((id) => damages.includes(id)))
        .map((threat) => threat.id);
      const paths = tara.paths.filter((path) => path.threatIds.some((id) => threats.includes(id))).map((path) => path.id);
      for (const drawn of drawnSoundly(held, `the asset view of ${asset.id}`)) {
        assert.deepEqual(shownIn(held, drawn), sorted([asset.id, ...asset.elementIds, ...damages, ...threats, ...paths]));
        lit(asset.id, drawn, `the asset view of ${asset.id}`);
      }
    }
  });

  test(`${name}: the view of every threat shows its damage, its paths, its risk with controls and goals, and no more`, () => {
    for (const threat of tara.threats) {
      const held = holdView({ kind: "threat", centre: threat.id }, tara, scores);
      assert.ok(held);
      const risk = tara.risks.find((candidate) => candidate.threatId === threat.id);
      const assets = tara.damages.filter((damage) => threat.damageIds.includes(damage.id)).map((damage) => damage.assetId);
      const paths = tara.paths.filter((path) => path.threatIds.includes(threat.id)).map((path) => path.id);
      const controls = risk ? [...risk.existingControlIds, ...risk.proposedControlIds] : [];
      const goals = tara.goalClaims.filter((goal) => risk && goal.riskIds.includes(risk.id)).map((goal) => goal.id);
      const expected = sorted([threat.id, risk?.id, ...threat.damageIds, ...assets, ...paths, ...controls, ...goals]);
      for (const drawn of drawnSoundly(held, `the threat view of ${threat.id}`)) {
        assert.deepEqual(shownIn(held, drawn), expected);
        lit(threat.id, drawn, `the threat view of ${threat.id}`);
      }
    }
  });

  test(`${name}: the view of every element shows what it is joined to, its assets and controls, and no more`, () => {
    for (const each of tara.elements.filter(isThing)) {
      const held = holdView({ kind: "element", centre: each.id }, tara, scores);
      assert.ok(held);
      const flows = tara.elements.filter(
        (other) => other.kind === "data_flow" && (other.sourceId === each.id || other.targetId === each.id),
      );
      const ends = flows.flatMap((one) => [one.sourceId, one.targetId]);
      const assets = tara.assets.filter((asset) => asset.elementIds.includes(each.id)).map((asset) => asset.id);
      const damages = tara.damages.filter((damage) => assets.includes(damage.assetId ?? "")).map((damage) => damage.id);
      const controls = tara.controls.filter((control) => control.elementIds.includes(each.id)).map((control) => control.id);
      const expected = sorted([each.id, ...flows.map((one) => one.id), ...ends, ...assets, ...damages, ...controls]);
      for (const drawn of drawnSoundly(held, `the element view of ${each.id}`)) {
        assert.deepEqual(shownIn(held, drawn), expected);
        lit(each.id, drawn, `the element view of ${each.id}`);
      }
    }
    // a data flow and a boundary have no view of their own
    for (const each of tara.elements.filter((other) => !isThing(other))) assert.equal(elementView(tara, each.id), null);
  });

  test(`${name}: the view of every control shows the risks that have it, the paths it covers, where it acts, and no more`, () => {
    for (const control of tara.controls) {
      const held = holdView({ kind: "control", centre: control.id }, tara, scores);
      assert.ok(held);
      const risks = tara.risks.filter((risk) => [...risk.existingControlIds, ...risk.proposedControlIds].includes(control.id));
      const threats = risks.map((risk) => risk.threatId);
      const paths = tara.paths
        .filter((path) => control.coveredPathIds.includes(path.id) && path.threatIds.some((id) => threats.includes(id)))
        .map((path) => path.id);
      const expected = sorted([control.id, ...risks.map((risk) => risk.id), ...paths, ...control.elementIds]);
      for (const drawn of drawnSoundly(held, `the control view of ${control.id}`)) {
        assert.deepEqual(shownIn(held, drawn), expected);
        lit(control.id, drawn, `the control view of ${control.id}`);
      }
    }
  });

  test(`${name}: every record from the architecture to the evidence is seen in a view that shows it`, () => {
    const all = [...entitiesOf(tara), ...tara.evidence.map((evidence) => evidence.id)];
    for (const id of all) {
      const view = viewOf(tara, id);
      // of the examples only a boundary has no view: its place is the architecture diagram
      if (!view) {
        assert.equal(tara.elements.find((each) => each.id === id)?.kind, "trust_boundary", `${id} has a view`);
        continue;
      }
      const held = holdView(view, tara, scores);
      assert.ok(held, `the ${view.kind} view of ${view.centre} exists`);
      assert.ok(shownIn(held, drawView(held)).includes(view.chosen ?? view.centre), `${id} is shown in its view`);
      assert.equal(view.chosen === null, view.centre === id, `${id} is chosen in its view unless it stands in its middle`);
    }
  });

  test(`${name}: the records a view can be turned to are those that have that view of their own`, () => {
    for (const kind of ["element", "asset", "threat", "control"] as const) {
      const centres = centresOf(kind, tara, things).map((thing) => thing.id);
      assert.ok(centres.length > 0);
      for (const id of centres) assert.deepEqual(viewOf(tara, id), { kind, centre: id, chosen: null });
    }
  });

  test(`${name}: the ratings and the composition of every record can be drawn`, () => {
    for (const thing of things.values()) {
      const strip = stripOf(tara, scores, thing.kind, thing.id);
      assert.equal(strip !== null, ["damages", "paths", "risks"].includes(thing.kind), `${thing.id} has a strip`);
      for (const meter of strip?.meters ?? []) {
        // every record of the examples is rated: no meter is left open, and none is fuller than it has steps
        assert.ok(meter.filled !== null && meter.filled >= 0 && meter.filled <= meter.steps, `${thing.id}: ${meter.says}`);
      }
      const composition = compositionOf(tara, scores, thing.kind, thing.id);
      assert.equal(composition.parts.length > 0, thing.kind !== "items", `${thing.id} is made of something`);
      for (const part of composition.parts)
        assert.ok(part.name && (part.words || part.meter || part.lost), `${thing.id}: ${part.name}`);
      assert.equal(composition.matrix !== undefined, thing.kind === "risks");
    }
  });
}

// ------------------------------------------------------------------------------------ next to nothing in a TARA

test("the small TARA these tests use is a valid document, with and without its architecture", () => {
  assert.deepEqual(validateTara(proof()), []);
  assert.deepEqual(validateTara(placed()), []);
});

test("an empty TARA has an empty graph and no views, and nothing breaks", () => {
  const { tara, checks, graph } = withGraph(emptyTara());
  const things = thingsToDraw(graph, tara, checks);
  assert.deepEqual([graph.things.size, graph.links.length, things.size], [0, 0, 0]);
  assert.equal(viewOf(tara, "A01"), null);
  assert.equal(egoViewOf(tara, "A01"), null);
  for (const kind of Object.keys(VIEWS) as ViewKind[]) {
    assert.equal(holdView({ kind, centre: "A01" }, tara, checks.scores), null);
    assert.deepEqual(centresOf(kind, tara, things), []);
    assert.deepEqual(centresOf(kind, tara, things, "A01"), []);
  }
  for (const view of [assetView, threatView, elementView, controlView]) assert.equal(view(tara, "A01"), null);
  assert.deepEqual([...chainOf(graph, ["A01"])], ["A01"]);
  assert.deepEqual([...within(graph, "A01", 3)], ["A01"]);
  assert.deepEqual([...belongingTo(graph, tara, "A01")], ["A01"]);
  assert.deepEqual(architectureLinks(graph, tara, "A01"), []);
  assert.equal(stripOf(tara, checks.scores, "risks", "R001"), null);
  assert.deepEqual(compositionOf(tara, checks.scores, "assets", "A01"), { parts: [] });
});

/** One record of every kind, and none of them linked to another. Only the risk has its threat: it cannot be without. */
function unlinked(): Tara {
  const whole = proof();
  const firstOf = <T>(list: T[]): T[] => list.slice(0, 1);
  return {
    ...whole,
    elements: [element("el1", "component"), element("b1", "trust_boundary"), flow("f1", null, null, null)],
    assets: firstOf(whole.assets).map((asset) => ({ ...asset, itemId: null })),
    damages: firstOf(whole.damages).map((damage) => ({ ...damage, assetId: null })),
    threats: firstOf(whole.threats).map((threat) => ({ ...threat, damageIds: [] })),
    paths: firstOf(whole.paths).map((path) => ({ ...path, threatIds: [] })),
    risks: firstOf(whole.risks).map((risk) => ({ ...risk, existingControlIds: [], proposedControlIds: [] })),
    controls: firstOf(whole.controls).map((control) => ({ ...control, coveredPathIds: [] })),
    evidence: [],
    goalClaims: firstOf(whole.goalClaims).map((goal) => ({ ...goal, riskIds: [] })),
  };
}

test("a record with no links has its ego view all the same: its block alone, drawn soundly", () => {
  const { tara, checks } = withGraph(unlinked());
  assert.deepEqual(validateTara(tara), []);
  for (const id of ["el1", "b1", "f1", "a1", "d1", "p1", "c1", "g1"]) {
    const held = holdView({ kind: "ego", centre: id }, tara, checks.scores);
    assert.ok(held);
    assert.deepEqual(boxesOf(held), [id], `${id} stands alone`);
    for (const drawn of drawnSoundly(held, `the ego view of ${id}`)) {
      assert.deepEqual([drawn.lines, drawn.labels, drawn.captions], [[], [], []]);
      assert.ok(drawn.box.width > 0 && drawn.box.height > 0);
    }
  }
  // a threat and its risk have each other, and nothing else
  for (const [id, other] of [
    ["t1", "r1"],
    ["r1", "t1"],
  ] as const) {
    const held = holdView({ kind: "ego", centre: id }, tara, checks.scores);
    assert.ok(held);
    assert.deepEqual(boxesOf(held), [id, other]);
    drawnSoundly(held, `the ego view of ${id}`);
  }
});

test("a record with no links is seen in no view, but its own view can still be asked for and drawn: the record alone", () => {
  const { tara, checks, graph } = withGraph(unlinked());
  for (const id of ["el1", "b1", "f1", "a1", "d1", "p1", "c1", "g1"]) assert.equal(viewOf(tara, id), null, id);
  const alone: [ViewKind, string, string[]][] = [
    ["element", "el1", ["el1"]],
    ["asset", "a1", ["a1"]],
    ["control", "c1", ["c1"]],
    ["threat", "t1", ["t1", "r1"]],
  ];
  for (const [kind, centre, boxes] of alone) {
    const held = holdView({ kind, centre }, tara, checks.scores);
    assert.ok(held);
    assert.deepEqual(boxesOf(held), boxes);
    for (const drawn of drawnSoundly(held, `the ${kind} view of ${centre}`)) assert.deepEqual(drawn.labels, []);
  }
  // each is a loose end of the graph, and belongs to nothing but itself
  assert.deepEqual([...chainOf(graph, ["a1"])], ["a1"]);
  for (const id of ["a1", "d1", "p1", "g1"]) assert.ok(graph.things.get(id)?.loose, `${id} is a loose end`);
});
