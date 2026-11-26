// Shared by the tests of the views: the three training examples, a small TARA in which every kind of link
// occurs, and what every drawing must be, whichever view it is of.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  type AttackPath,
  type Checks,
  check,
  createTara,
  type Damage,
  type Element,
  type ElementKind,
  type ImpactLevel,
  type Method,
  parseTara,
  type Tara,
} from "@tara/core";
import { type Graph, graphOf } from "../src/views/graph.ts";
import { type Drawing, NODE, NODE_READABLE, type Size } from "../src/views/layout.ts";

const fromRoot = (path: string) => new URL(`../../../${path}`, import.meta.url);

/** The scoring method shipped with the tool. */
export const defaultMethod = (): Method => JSON.parse(readFileSync(fromRoot("methods/open-tara-1.0.json"), "utf8"));

export const EXAMPLES = ["kettle", "door-lock", "gateway"] as const;

/** One of the training examples, as stored in examples/. */
export const example = (name: (typeof EXAMPLES)[number]): Tara =>
  parseTara(JSON.parse(readFileSync(fromRoot(`examples/${name}.json`), "utf8")));

/** A new, empty TARA. */
export const emptyTara = (): Tara =>
  createTara({ id: "empty", title: "Nothing yet", method: defaultMethod(), now: "2026-11-25T10:00:00.000Z" });

/** A TARA with what follows from it: its checks, and its graph. */
export const withGraph = (tara: Tara): { tara: Tara; checks: Checks; graph: Graph } => {
  const checks = check(tara);
  return { tara, checks, graph: graphOf(tara, checks) };
};

// ------------------------------------------------------------------------------------------- the small TARA

const damage = (id: string, assetId: string, levels: ImpactLevel[], lost: boolean[]): Damage => ({
  id,
  assetId,
  confidentiality: lost[0] === true,
  integrity: lost[1] === true,
  availability: lost[2] === true,
  description: "PROOF damage",
  ratings: { safety: levels[0] ?? 0, financial: levels[1] ?? 0, operational: levels[2] ?? 0, privacy: levels[3] ?? 0 },
  impactRationale: "PROOF rationale",
});

const path = (id: string, threatIds: string[], options: string[], disposition: AttackPath["disposition"]): AttackPath => ({
  id,
  threatIds,
  elementIds: [],
  description: "PROOF path",
  feasibilityBasis: "PROOF basis",
  disposition,
  factors: {
    elapsed_time: options[0] ?? null,
    expertise: options[1] ?? null,
    knowledge: options[2] ?? null,
    window_of_opportunity: options[3] ?? null,
    equipment: options[4] ?? null,
  },
});

/**
 * A small TARA in which every record is complete and every kind of link occurs that the examples do not have:
 * a threat with two damage scenarios, an attack path that carries out two threats (p2), one that is screened
 * out (p3), a control that exists and covers a path (c1), and one that is only proposed and covers none (c2).
 * It has no architecture: `placed` adds one.
 */
export function proof(): Tara {
  return {
    ...emptyTara(),
    id: "proof",
    items: [
      {
        id: "i1",
        name: "Example product",
        configurationRef: "CFG-1",
        boundaryFunctions: "PROOF",
        architectureInterfaces: "PROOF",
        environmentUse: "PROOF",
      },
    ],
    assets: [
      { id: "a1", name: "Switch-on command", itemId: "i1", elementIds: [], variant: null, coverageRationale: null },
      { id: "a2", name: "Owner settings", itemId: "i1", elementIds: [], variant: null, coverageRationale: null },
    ],
    damages: [
      damage("d1", "a1", [2, 1, 3, 0], [false, true, true]),
      damage("d2", "a1", [0, 2, 1, 0], [false, false, true]),
      damage("d3", "a2", [0, 1, 0, 2], [true, false, false]),
    ],
    threats: [
      { id: "t1", category: "tampering", description: "PROOF threat", damageIds: ["d1", "d2"] },
      { id: "t2", category: "information_disclosure", description: "PROOF threat", damageIds: ["d3"] },
    ],
    paths: [
      path("p1", ["t1"], ["lt_1_week", "proficient", "restricted", "moderate", "specialised"], "included"),
      path("p2", ["t1", "t2"], ["lt_1_day", "layman", "public", "easy", "standard"], "included"),
      path("p3", ["t2"], [], "screened_out"),
    ],
    risks: [
      {
        id: "r1",
        threatId: "t1",
        treatment: "reduce",
        existingControlIds: ["c1"],
        proposedControlIds: ["c2"],
        rationale: "PROOF",
        owner: "PROOF owner",
        reviewDate: "2026-11-19",
        residualImpact: 1,
        residualFeasibility: "low",
        residualBasis: "PROOF-RES",
      },
      {
        id: "r2",
        threatId: "t2",
        treatment: "retain",
        existingControlIds: [],
        proposedControlIds: [],
        rationale: "PROOF",
        owner: "PROOF owner",
        reviewDate: null,
        residualImpact: 2,
        residualFeasibility: "high",
        residualBasis: "PROOF-RES",
      },
    ],
    controls: [
      {
        id: "c1",
        name: "Signed commands",
        description: "PROOF",
        type: "technical",
        craTags: ["a", "b"],
        coveredPathIds: ["p1"],
        elementIds: [],
        workLink: null,
      },
      {
        id: "c2",
        name: "Rate limiting",
        description: null,
        type: null,
        craTags: [],
        coveredPathIds: [],
        elementIds: [],
        workLink: null,
      },
    ],
    evidence: [
      {
        id: "e1",
        riskId: "r1",
        controlId: "c1",
        configurationId: "CFG-1",
        state: "verified",
        effect: "PROOF effect",
        implementationRef: "PROOF-IMPL",
        verificationRef: "PROOF-TEST",
        result: "pass",
        verifiedCraTags: ["a"],
      },
    ],
    goalClaims: [
      { id: "g1", kind: "goal", statement: "PROOF goal", riskIds: ["r1"] },
      { id: "g2", kind: "claim", statement: "PROOF claim", riskIds: ["r2"] },
    ],
  };
}

/** An element of the small TARA's item, named by its ID. */
export const element = (id: string, kind: ElementKind, more: Partial<Element> = {}): Element => ({
  id,
  itemId: "i1",
  kind,
  name: id,
  description: null,
  sourceId: null,
  targetId: null,
  direction: null,
  boundaryId: null,
  x: null,
  y: null,
  w: null,
  h: null,
  ...more,
});

/** A data flow between two elements. */
export const flow = (
  id: string,
  sourceId: string | null,
  targetId: string | null,
  direction: Element["direction"] = "forward",
): Element => element(id, "data_flow", { sourceId, targetId, direction });

/**
 * A small architecture: a controller (el1) that talks to a laptop (el2) and a store (el3), the controller and
 * the store inside a boundary (b1), and a component nothing is joined to (el4). f1 carries towards the
 * controller and f2 away from it; f3 both ways; the direction of f4 is not recorded; f5 has an open end.
 */
export const architecture = (): Element[] => [
  element("el1", "component", { boundaryId: "b1" }),
  element("el2", "external_interactor"),
  element("el3", "data_store", { boundaryId: "b1" }),
  element("el4", "component"),
  element("b1", "trust_boundary"),
  flow("f1", "el2", "el1"),
  flow("f2", "el1", "el2"),
  flow("f3", "el1", "el3", "both"),
  flow("f4", "el3", "el1", null),
  flow("f5", "el1", null),
];

/** The small TARA with that architecture, its assets and its first control placed in it, and one more change. */
export function placed(change: (tara: Tara) => void = () => {}): Tara {
  const tara = proof();
  tara.elements = architecture();
  (tara.assets[0] as Tara["assets"][number]).elementIds = ["el1", "f1"];
  (tara.assets[1] as Tara["assets"][number]).elementIds = ["el3"];
  (tara.controls[0] as Tara["controls"][number]).elementIds = ["el1", "b1"];
  change(tara);
  return tara;
}

/** The small TARA without an architecture, with one change. */
export function changed(change: (tara: Tara) => void): Tara {
  const tara = proof();
  change(tara);
  return tara;
}

/** The n-th record of a list, which a test knows to be there. */
export function nth<T>(list: T[], n: number): T {
  const record = list[n];
  assert.ok(record !== undefined, `the list has no record at ${n}`);
  return record;
}

// ------------------------------------------------------------------------------------ what every drawing must be

/** The numbers of a line, in the order they are written. */
export const numbers = (d: string): number[] =>
  d
    .split(/[A-Z ]+/)
    .filter(Boolean)
    .map(Number);

/** Both ways to draw a view: as on the graph, and large enough to read the text of each record. */
export const SIZES: [name: string, size: Size][] = [
  ["as on the graph", NODE],
  ["large enough to read", NODE_READABLE],
];

/** Every shape at both sizes. */
export const atBothSizes = <V>(shapes: Record<string, V>): [name: string, view: V, size: Size][] =>
  Object.entries(shapes).flatMap(([name, view]) =>
    SIZES.map(([sizeName, size]): [string, V, Size] => [`${name}, ${sizeName}`, view, size]),
  );

/** How large each record of a drawing is: the usual size, with what is higher or wider than that. */
export interface Measures {
  size: Size;
  heights?: ReadonlyMap<string, number> | undefined;
  /** A record that is wider than the others: the block of an ego view. */
  widths?: ReadonlyMap<string, number> | undefined;
}

interface Box {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const boxesOfDrawing = (drawing: Pick<Drawing, "at">, { size, heights, widths }: Measures): Box[] =>
  [...drawing.at].map(([id, corner]) => ({
    id,
    left: corner.x,
    right: corner.x + (widths?.get(id) ?? size.w),
    top: corner.y,
    bottom: corner.y + (heights?.get(id) ?? size.h),
  }));

/** Each record has a place inside the frame, every number of it is a number, and no two records overlap. */
export function noneOverlap(drawing: Pick<Drawing, "at" | "box">, measures: Measures): void {
  const boxes = boxesOfDrawing(drawing, measures);
  const frame = drawing.box;
  for (const value of [frame.left, frame.top, frame.width, frame.height])
    assert.ok(Number.isFinite(value), "the frame is a number");
  boxes.forEach((a, k) => {
    for (const b of boxes.slice(k + 1)) {
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      assert.ok(apart, `${a.id} and ${b.id} overlap`);
    }
    const inside =
      a.left >= frame.left && a.right <= frame.left + frame.width && a.top >= frame.top && a.bottom <= frame.top + frame.height;
    assert.ok(inside, `${a.id} is inside the frame`);
  });
}

/** A place is written to a tenth, so a point of a line may be that far from the side it stands on. */
const NEAR = 0.051;

/** Whether a point lies on the edge of a box. */
const onEdge = (box: Box, x: number, y: number): boolean => {
  const within = x >= box.left - NEAR && x <= box.right + NEAR && y >= box.top - NEAR && y <= box.bottom + NEAR;
  const onSide = Math.abs(x - box.left) <= NEAR || Math.abs(x - box.right) <= NEAR;
  const onTopOrBottom = Math.abs(y - box.top) <= NEAR || Math.abs(y - box.bottom) <= NEAR;
  return within && (onSide || onTopOrBottom);
};

/**
 * Every line starts on the edge of one of the two records it joins and ends on the edge of the other, and is
 * made of numbers. What else a line names (the attack path or data flow it stands for) has its ID on the line.
 */
export function linesRunBetweenBoxes(drawing: Drawing, measures: Measures): void {
  const boxes = new Map(boxesOfDrawing(drawing, measures).map((box) => [box.id, box]));
  const carried = new Set(drawing.labels.flatMap((label) => (label.recordId ? [label.recordId] : [])));
  for (const line of drawing.lines) {
    const points = numbers(line.d);
    assert.ok(points.length >= 4 && points.every(Number.isFinite), `${line.key} is made of numbers`);
    const [first, second, ...others] = line.joins;
    const a = boxes.get(first ?? "");
    const b = boxes.get(second ?? "");
    assert.ok(a && b, `${line.key} joins two records that are drawn`);
    for (const other of others) assert.ok(carried.has(other), `${line.key} carries the ID of ${other}`);
    const [startX = 0, startY = 0] = points;
    const [endX = 0, endY = 0] = points.slice(-2);
    const oneWay = onEdge(a, startX, startY) && onEdge(b, endX, endY);
    const otherWay = onEdge(b, startX, startY) && onEdge(a, endX, endY);
    assert.ok(oneWay || otherWay, `${line.key} runs from the edge of one record to the edge of the other: ${line.d}`);
  }
}

/**
 * What hangs beneath a record: under it, set in to the right, each joined by a line that leaves the lower side
 * of the record and ends level on the left side of what hangs, at its middle. In one column, or in so many,
 * filled one after the other.
 */
export function hangsBeneath(
  drawing: Drawing,
  parent: string,
  hung: string[],
  key: (id: string) => string,
  measures: Measures,
  columns = 1,
): void {
  const { size, heights } = measures;
  const heightOf = (id: string) => heights?.get(id) ?? size.h;
  const top = drawing.at.get(parent);
  assert.ok(top, `${parent} has a place`);
  const below = top.y + heightOf(parent);
  const perColumn = Math.ceil(hung.length / columns);
  let last = below;
  hung.forEach((id, n) => {
    const corner = drawing.at.get(id);
    const line = drawing.lines.find((candidate) => candidate.key === key(id));
    assert.ok(corner && line, `${id} hangs, and has its line`);
    const of = numbers(line.d);
    // the next column starts at the top again
    if (n % perColumn === 0) last = below;
    assert.equal(corner.x, top.x + 28 + Math.floor(n / perColumn) * (size.w + 28));
    assert.ok(corner.y > last, `${id} hangs beneath what is above it`);
    last = corner.y + heightOf(id);
    assert.equal(line.arrow, false);
    assert.deepEqual(line.joins, [parent, id]);
    // it leaves the lower side of the record, and ends level on the side of what hangs, at its middle
    assert.deepEqual(of.slice(0, 2), [top.x + 14, below]);
    assert.deepEqual(of.slice(-2), [corner.x, corner.y + heightOf(id) / 2]);
    assert.equal(of.at(-3), corner.y + heightOf(id) / 2);
  });
}

/**
 * "No ugly arrows or links": an arrowhead sits on a straight stretch that meets the side level, and
 * arrowheads on one side have room beside each other or are one.
 */
export function arrowsAreSound(drawing: Drawing, width: number): void {
  const ends = new Map<string, number[]>();
  const head = (x: number, y: number, bendX: number, bendY: number) => {
    assert.equal(y, bendY, "the stretch is level");
    assert.ok(Math.abs(x - bendX) >= 14, "the arrowhead has room on its stretch");
    // it ends on the left or the right side of a record
    const into = [...drawing.at].find(
      ([, corner]) => (x === corner.x || x === corner.x + width) && y > corner.y && y < corner.y + 400,
    );
    assert.ok(into, "the arrowhead meets the side of a record");
    const side = `${into[0]}|${x}`;
    ends.set(side, [...(ends.get(side) ?? []), y]);
  };
  for (const line of drawing.lines.filter((candidate) => candidate.arrow)) {
    const [bendX = 0, bendY = 0, x = 0, y = 0] = numbers(line.d).slice(-4);
    assert.match(line.d, /L [-\d.]+ [-\d.]+$/);
    head(x, y, bendX, bendY);
  }
  // an arrowhead where a line starts sits on a straight stretch too
  for (const line of drawing.lines.filter((candidate) => candidate.arrowStart)) {
    const [x = 0, y = 0, bendX = 0, bendY = 0] = numbers(line.d);
    assert.match(line.d, /^M [-\d.]+ [-\d.]+ L /);
    head(x, y, bendX, bendY);
  }
  for (const heights of ends.values()) {
    const places = [...new Set(heights)].sort((a, b) => a - b);
    places.forEach((y, k) => {
      if (k > 0) assert.ok(y - (places[k - 1] ?? 0) >= 12, "two arrowheads on one side have room beside each other");
    });
  }
}

/** The IDs of the records a drawing places, sorted. */
export const placedIds = (drawing: Pick<Drawing, "at">): string[] => [...drawing.at.keys()].sort();
