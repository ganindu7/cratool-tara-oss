// The records of a TARA as a graph: every record a thing, every link a line, in the direction of the method,
// from what is protected to what is decided. The views of one record (views.ts) draw a part of it.
//
// Nothing here is stored: the graph is worked out from the document and its checks each time.
// No screen code here, so that the rules of the graph can be tested.

import {
  type Checks,
  type ControlState,
  controlState,
  ELEMENT_KIND_NAMES,
  type Element,
  isBlank,
  type Risk,
  type Status,
  type Tara,
} from "@tara/core";

// ------------------------------------------------------------------------------------------------ the things

/** The kinds of record that stand on the graph, in the order of the method, with what one and several are called. */
export const GRAPH_KINDS = [
  { key: "items", one: "Assessed item", many: "Assessed items" },
  { key: "elements", one: "Architecture element", many: "Architecture elements" },
  { key: "assets", one: "Asset", many: "Assets" },
  { key: "damages", one: "Damage scenario", many: "Damage scenarios" },
  { key: "threats", one: "Threat scenario", many: "Threat scenarios" },
  { key: "paths", one: "Attack path", many: "Attack paths" },
  { key: "risks", one: "Risk", many: "Risks" },
  { key: "controls", one: "Control", many: "Controls" },
  { key: "goalClaims", one: "Goal or claim", many: "Goals and claims" },
] as const;
/** One of those kinds, by its key: the name under which the TARA holds the records of the kind. */
export type GraphKind = (typeof GRAPH_KINDS)[number]["key"];

/** A record as the graph and the views draw it. */
export interface Thing {
  id: string;
  kind: GraphKind;
  /** Its own words, on one line. Empty while nothing is entered. */
  text: string;
  /** How the record stands. Undefined where no check says anything about it. */
  status: Status | undefined;
  /** For a risk: its value, or null while it cannot be worked out. */
  value?: number | null;
  /** For a control: where it stands in the product, and where the work on it is tracked. */
  state?: ControlState;
  workLink?: string | null;
  /** What it is, in a word, where its kind has several: a component or a data flow, a goal or a claim. */
  what?: string;
  /** Set when the chain stops here although the method expects it to go on: what is missing, in words. */
  loose?: string;
}

/** The graph of a TARA: its records as things, and their links, kept so that a chain can be followed from any record. */
export interface Graph {
  things: Map<string, Thing>;
  links: [from: string, to: string][];
  /** What each record rests on, and what rests on it. */
  up: Map<string, string[]>;
  down: Map<string, string[]>;
  /** The threat each risk is the risk of. */
  threatOf: Map<string, string>;
}

/** What a record's kind is called. */
export const kindOf = (thing: Pick<Thing, "kind">): (typeof GRAPH_KINDS)[number] =>
  GRAPH_KINDS.find((kind) => kind.key === thing.kind) ?? GRAPH_KINDS[0];

/** A text as one line: runs of spaces and line breaks become one space. */
const onOneLine = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------------------------------- the architecture

/** Whether an element is a thing: a component, an outside party or a store. A data flow relates things; a boundary holds them. */
export const isThing = (element: Pick<Element, "kind">): boolean =>
  element.kind === "component" || element.kind === "external_interactor" || element.kind === "data_store";

/** The data flows that start or end at an element. */
export const flowsAt = (elements: Element[], id: string): Element[] =>
  elements.filter((flow) => flow.kind === "data_flow" && (flow.sourceId === id || flow.targetId === id));

/** Those of the records that name an element as a place they live or act in. */
export const placedIn = <T extends { elementIds: string[] }>(records: T[], elementId: string): T[] =>
  records.filter((record) => record.elementIds.includes(elementId));

/** The elements in the order a form lists them to choose from: as in the architecture list, the data flows after all others. */
export const inFormOrder = (elements: Element[]): Element[] =>
  [...elements].sort((a, b) => Number(a.kind === "data_flow") - Number(b.kind === "data_flow"));

/** The places a record names, in the order its form lists them. A place that is no longer in the architecture is left out. */
export const placesOf = (ids: string[], elements: Element[]): string[] =>
  inFormOrder(elements)
    .filter((element) => ids.includes(element.id))
    .map((element) => element.id);

/** Whether a risk has a control, existing or only proposed. */
export const riskHas = (risk: Pick<Risk, "existingControlIds" | "proposedControlIds">, controlId: string): boolean =>
  risk.existingControlIds.includes(controlId) || risk.proposedControlIds.includes(controlId);

/** An element as a thing that can be drawn, whatever its kind. The graph has the things only; a view draws the others too. */
export const elementThing = (element: Element, checks: Pick<Checks, "elements">): Thing => ({
  id: element.id,
  kind: "elements",
  text: onOneLine(element.name),
  status: checks.elements.get(element.id),
  what: ELEMENT_KIND_NAMES[element.kind],
});

/**
 * How a risk stands. A risk is rated and then treated, and has a status for each: the rating's while the
 * rating is open, the treatment's once the rating stands.
 */
export function riskStatus(checks: Pick<Checks, "riskRating" | "riskTreatment">, riskId: string): Status | undefined {
  const rating = checks.riskRating.get(riskId);
  if (rating && rating.kind !== "done") return rating;
  return checks.riskTreatment.get(riskId) ?? rating;
}

// -------------------------------------------------------------------------------------------------- the graph

/** Every record and link of the TARA, in the direction of the method: from what is protected to what is decided. */
export function graphOf(tara: Tara, checks: Checks): Graph {
  const things = thingsOf(tara, checks);
  const links = linksOf(tara, checks).filter(([from, to]) => things.has(from) && things.has(to));
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const [from, to] of links) {
    down.set(from, [...(down.get(from) ?? []), to]);
    up.set(to, [...(up.get(to) ?? []), from]);
  }
  const graph: Graph = { things, links, up, down, threatOf: new Map(tara.risks.map((risk) => [risk.id, risk.threatId])) };
  markLooseEnds(tara, graph);
  return graph;
}

/** Every record that stands on the graph. Of the architecture only the things do. */
function thingsOf(tara: Tara, checks: Checks): Map<string, Thing> {
  const things = new Map<string, Thing>();
  const add = (
    kind: GraphKind,
    id: string,
    text: string | null | undefined,
    status: Status | undefined,
    more: Partial<Thing> = {},
  ) => things.set(id, { id, kind, text: onOneLine(text), status, ...more });

  for (const item of tara.items) add("items", item.id, item.name, checks.items.get(item.id));
  for (const element of tara.elements.filter(isThing)) things.set(element.id, elementThing(element, checks));
  for (const asset of tara.assets) add("assets", asset.id, asset.name, checks.assets.get(asset.id));
  for (const damage of tara.damages) add("damages", damage.id, damage.description, checks.damages.get(damage.id));
  for (const threat of tara.threats) add("threats", threat.id, threat.description, checks.threats.get(threat.id));
  for (const path of tara.paths) add("paths", path.id, path.description, checks.paths.get(path.id));
  for (const risk of tara.risks) {
    const threat = tara.threats.find((candidate) => candidate.id === risk.threatId);
    const value = checks.scores.risks.get(risk.threatId)?.value ?? null;
    add("risks", risk.id, threat?.description, riskStatus(checks, risk.id), { value });
  }
  for (const control of tara.controls) {
    const more = { state: controlState(tara, control.id), workLink: control.workLink };
    add("controls", control.id, control.name, checks.controls.get(control.id), more);
  }
  for (const goal of tara.goalClaims) {
    const what = goal.kind === "claim" ? "Claim" : "Goal";
    add("goalClaims", goal.id, goal.statement, checks.goalClaims.get(goal.id), { what });
  }
  return things;
}

/** Every link the records name, whether or not both ends still exist. */
function linksOf(tara: Tara, checks: Checks): [string, string][] {
  const links: [string, string][] = [];
  // the things of the architecture stand between the item and its assets: an asset lives in a component or a store
  const things = new Set<string>();
  for (const element of tara.elements.filter(isThing)) {
    things.add(element.id);
    links.push([element.itemId, element.id]);
  }
  for (const asset of tara.assets) {
    const homes = asset.elementIds.filter((id) => things.has(id));
    // an asset that names where it lives hangs there; one that does not hangs on its item
    if (homes.length > 0) for (const home of homes) links.push([home, asset.id]);
    else if (asset.itemId) links.push([asset.itemId, asset.id]);
  }
  for (const damage of tara.damages) if (damage.assetId) links.push([damage.assetId, damage.id]);
  for (const threat of tara.threats) for (const damageId of threat.damageIds) links.push([damageId, threat.id]);
  for (const path of tara.paths) for (const threatId of path.threatIds) links.push([threatId, path.id]);
  for (const risk of tara.risks) {
    // a risk rests on the attack paths that count towards it; where there are none yet, directly on its threat
    const counted = checks.scores.risks.get(risk.threatId)?.includedPathIds ?? [];
    if (counted.length > 0) for (const pathId of counted) links.push([pathId, risk.id]);
    else links.push([risk.threatId, risk.id]);
    for (const controlId of [...risk.existingControlIds, ...risk.proposedControlIds]) links.push([risk.id, controlId]);
  }
  for (const goal of tara.goalClaims) for (const riskId of goal.riskIds) links.push([riskId, goal.id]);
  return links;
}

/**
 * Loose ends. In a finished TARA every record is on a chain from an item to a decision. A record where the
 * chain stops short is unfinished work or a gap, except where the method allows it to stop.
 */
function markLooseEnds(tara: Tara, graph: Graph): void {
  const ends = (id: string) => !graph.down.has(id);
  const starts = (id: string) => !graph.up.has(id);
  const loose = (id: string, why: string) => {
    const thing = graph.things.get(id);
    if (thing) thing.loose = why;
  };

  for (const item of tara.items) if (ends(item.id)) loose(item.id, "No asset belongs to this item");
  // a component or a store with nothing worth protecting in it is a question to answer; an outside party often rightly has none
  for (const element of tara.elements.filter(isThing)) {
    if (element.kind !== "external_interactor" && ends(element.id)) loose(element.id, "No asset is recorded as living here");
  }
  for (const asset of tara.assets) {
    if (starts(asset.id)) loose(asset.id, "Not linked to an item");
    else if (ends(asset.id) && isBlank(asset.coverageRationale)) {
      loose(asset.id, "No damage scenario, and no reason recorded why none applies");
    }
  }
  for (const damage of tara.damages) {
    if (starts(damage.id)) loose(damage.id, "Not linked to an asset");
    else if (ends(damage.id)) loose(damage.id, "No threat scenario leads to this damage");
  }
  for (const threat of tara.threats) {
    if (starts(threat.id)) loose(threat.id, "Leads to no damage scenario");
    else if (!tara.paths.some((path) => path.threatIds.includes(threat.id)))
      loose(threat.id, "No attack path carries out this threat");
  }
  // a path that is screened out rightly stops at its threat
  for (const path of tara.paths) if (starts(path.id)) loose(path.id, "Carries out no threat");
  for (const risk of tara.risks) {
    if (!ends(risk.id)) continue;
    const avoided = risk.treatment === "avoid";
    loose(
      risk.id,
      avoided ? "No goal or claim records how the risk is avoided" : "No control, goal or claim: the risk is not treated yet",
    );
  }
  for (const goal of tara.goalClaims) if (starts(goal.id)) loose(goal.id, "Answers no risk");
}

/**
 * Every record a view can draw: those of the graph, and each data flow and boundary, which a view draws
 * where a record names it although the graph has no place for it.
 */
export function thingsToDraw(graph: Graph, tara: Tara, checks: Pick<Checks, "elements">): Map<string, Thing> {
  const all = new Map(graph.things);
  for (const element of tara.elements) if (!all.has(element.id)) all.set(element.id, elementThing(element, checks));
  return all;
}

// ------------------------------------------------------------------------------------------------ the chains

/**
 * Everything reached from the seeds by following links one way.
 *
 * An attack path can carry out several threats, and so count towards several risks. Coming to a path from one
 * threat or one risk, the way goes on only within that threat: the chain of a risk does not wander into the
 * other threats its paths also serve.
 */
export function reach(graph: Graph, seeds: string[], direction: "up" | "down"): Set<string> {
  const next = direction === "up" ? graph.up : graph.down;
  const kindOfId = (id: string) => graph.things.get(id)?.kind;
  const seen = new Set<string>();
  const found = new Set<string>();
  const todo: [id: string, threat: string | null][] = seeds.map((id) => [id, null]);

  for (let step = todo.pop(); step; step = todo.pop()) {
    const [id, threat] = step;
    const kind = kindOfId(id);
    // the threat a path is being looked at for: set on arriving from a threat or from a risk
    const within = kind === "threats" ? id : kind === "risks" ? (graph.threatOf.get(id) ?? null) : null;
    for (const neighbour of next.get(id) ?? []) {
      const other = kindOfId(neighbour);
      const leavesThreat =
        (other === "threats" && neighbour !== threat) || (other === "risks" && graph.threatOf.get(neighbour) !== threat);
      if (kind === "paths" && threat !== null && leavesThreat) continue;
      const carried = other === "paths" ? within : null;
      const state = `${neighbour}|${carried ?? ""}`;
      if (seen.has(state)) continue;
      seen.add(state);
      found.add(neighbour);
      todo.push([neighbour, carried]);
    }
  }
  return found;
}

/** Records with everything they rest on and everything that rests on them. */
export const chainOf = (graph: Graph, seeds: string[]): Set<string> =>
  new Set([...seeds, ...reach(graph, seeds, "up"), ...reach(graph, seeds, "down")]);

/** A record with everything linked to it within so many links, whichever way the links point. */
export function within(graph: Graph, centre: string, distance: number): Set<string> {
  const seen = new Set([centre]);
  let edge = [centre];
  for (let step = 0; step < distance && edge.length > 0; step++) {
    const next: string[] = [];
    for (const id of edge) {
      for (const neighbour of [...(graph.up.get(id) ?? []), ...(graph.down.get(id) ?? [])]) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    edge = next;
  }
  return seen;
}
