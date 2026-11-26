// The views of one record: which there are, which one a record is seen in, and what each holds and draws.
// This is what a screen asks; the views themselves are in the files beside this one.
//
// A view has one record in its middle and what belongs to it around it, and nothing else of the TARA. Four
// follow the chain of the method from the record in their middle: an architecture element, an asset, a threat
// scenario, a control. They share one grammar. Across runs the chain of the method. What stands with a record
// without being the next in the chain hangs beneath it. A relation that is a record of its own and not a box
// (an attack path, a data flow) is a line that carries its ID.
//
// The fifth, the ego view, does not follow the chain: it shows one record of any kind as a block, with only
// what is linked to it directly.

import type { Scores, Tara } from "@tara/core";
import { type AssetView, assetView, drawAssetView } from "./asset-view.ts";
import { type ControlView, controlView, drawControlView } from "./control-view.ts";
import { drawEgoView, type EgoView, egoView, hasEgoView } from "./ego.ts";
import { drawElementView, type ElementView, elementView } from "./element-view.ts";
import { type GraphKind, isThing, riskHas, type Thing } from "./graph.ts";
import { type Drawing, type Heights, NODE, type Size } from "./layout.ts";
import { drawThreatView, type ThreatView, threatView } from "./threat-view.ts";

// --------------------------------------------------------------------------------------------- the five views

interface ViewWords {
  /** What the view is called, and what the record in its middle is called. */
  name: string;
  noun: string;
  /** The kind of record in its middle. null: a record of any kind. */
  of: GraphKind | null;
  /** What it shows, to end a sentence that begins with its name. */
  shows: string;
}

/** What there is to say of each view. */
export const VIEWS = {
  element: {
    name: "Element view",
    noun: "Element",
    of: "elements",
    shows:
      "the element with what it is joined to, the assets that live in it with their damage scenarios, " +
      "and the controls that act in it, and nothing else",
  },
  asset: {
    name: "Asset view",
    noun: "Asset",
    of: "assets",
    shows:
      "the asset with where it lives, its damage scenarios, the threats that lead to them and their attack paths, " +
      "and nothing else",
  },
  threat: {
    name: "Threat view",
    noun: "Threat",
    of: "threats",
    shows:
      "the threat with the damage it leads to, the attack paths that carry it out, the controls of its risk " +
      "and the goals and claims that answer it, and nothing else",
  },
  control: {
    name: "Control view",
    noun: "Control",
    of: "controls",
    shows: "the control with the risks it treats, the attack paths it covers and where it acts, and nothing else",
  },
  ego: {
    name: "Ego view",
    noun: "Record",
    of: null,
    shows: "the record in the middle as a block that shows what it is made of, and around it only what is linked to it directly",
  },
} as const satisfies Record<string, ViewWords>;
/** One of the five views, by its key: the first part of the word an address names a view by, "asset" in "asset:A01". */
export type ViewKind = keyof typeof VIEWS;

/** A view, and the record that is chosen in it when it opens. */
export interface ViewOf {
  kind: ViewKind;
  centre: string;
  chosen: string | null;
}

/** What a view holds, by its kind. */
export type Held =
  | ({ kind: "element" } & ElementView)
  | ({ kind: "asset" } & AssetView)
  | ({ kind: "threat" } & ThreatView)
  | ({ kind: "control" } & ControlView)
  | ({ kind: "ego" } & EgoView);

/**
 * What the view of a record holds.
 * scores: which attack paths count, which the ego view shows.
 * null: the record is not in the TARA, or is not one that stands in the middle of such a view.
 */
export function holdView(view: Pick<ViewOf, "kind" | "centre">, tara: Tara, scores: Scores): Held | null {
  const { kind, centre } = view;
  switch (kind) {
    case "element": {
      const held = elementView(tara, centre);
      return held && { kind, ...held };
    }
    case "asset": {
      const held = assetView(tara, centre);
      return held && { kind, ...held };
    }
    case "threat": {
      const held = threatView(tara, centre);
      return held && { kind, ...held };
    }
    case "control": {
      const held = controlView(tara, centre);
      return held && { kind, ...held };
    }
    case "ego": {
      const held = egoView(tara, scores, centre);
      return held && { kind, ...held };
    }
  }
}

/** The records a view draws as boxes, the one in the middle first. The others it holds are lines that carry their ID. */
export function boxesOf(held: Held): string[] {
  const boxes = (): (string | null)[] => {
    switch (held.kind) {
      case "element":
        return [
          held.elementId,
          ...held.joined.map((pair) => pair.id),
          ...held.assets.flatMap((asset) => [asset.id, ...asset.damages]),
          ...held.controls.map((control) => control.id),
        ];
      case "asset":
        return [held.assetId, ...held.homes, ...held.damages, ...held.threats.map((threat) => threat.id)];
      case "threat":
        return [
          held.threatId,
          held.riskId,
          ...held.assets.flatMap((asset) => [asset.id, ...asset.damages]),
          ...held.paths.map((path) => path.id),
          ...held.controls.map((control) => control.id),
          ...held.goals.map((goal) => goal.id),
        ];
      case "control":
        return [held.controlId, ...held.risks.map((risk) => risk.id), ...held.places];
      case "ego":
        return [held.id, ...[...held.left, ...held.right].flatMap((group) => group.ids), ...(held.beneath?.ids ?? [])];
    }
  };
  return [...new Set(boxes().filter((id): id is string => id !== null))];
}

/**
 * A view, drawn: where its boxes stand, and the lines between them.
 * node: the size of a record. heights: the height of each record that needs another one for its words.
 * blockWidth: how wide the block in the middle of an ego view is.
 */
export function drawView(held: Held, node: Size = NODE, heights?: Heights, blockWidth?: number): Drawing {
  switch (held.kind) {
    case "element":
      return drawElementView(held, node, heights);
    case "asset":
      return drawAssetView(held, node, heights);
    case "threat":
      return drawThreatView(held, node, heights);
    case "control":
      return drawControlView(held, node, heights);
    case "ego":
      return drawEgoView(held, node, heights, blockWidth);
  }
}

// -------------------------------------------------------------------------------- which view a record is seen in

const withNothingChosen = (kind: ViewKind, centre: string): ViewOf => ({ kind, centre, chosen: null });

/** The view of the threat a risk is the risk of, with a record chosen in it. */
function inViewOfRisk(tara: Tara, riskId: string | undefined, chosen: string): ViewOf | null {
  const risk = tara.risks.find((candidate) => candidate.id === riskId);
  return risk ? { kind: "threat", centre: risk.threatId, chosen } : null;
}

/** A data flow is a line in the view of the element it starts from; a thing has a view when something is joined to or in it. */
function viewOfElement(tara: Tara, id: string): ViewOf | null {
  const element = tara.elements.find((candidate) => candidate.id === id);
  if (element?.kind !== "data_flow") {
    const held = elementView(tara, id);
    return held && held.joined.length + held.assets.length + held.controls.length > 0 ? withNothingChosen("element", id) : null;
  }
  const isEnd = (end: string | null) => tara.elements.some((candidate) => candidate.id === end && isThing(candidate));
  const joinsTwo = isEnd(element.sourceId) && isEnd(element.targetId) && element.sourceId !== element.targetId;
  return joinsTwo && element.sourceId ? { kind: "element", centre: element.sourceId, chosen: id } : null;
}

/**
 * The view a record is seen in: every record from the architecture to the goals and claims has one of the four.
 *
 * A component, an outside party or a store: its own, and a data flow as a line in the view of the element it
 * starts from. An asset and its damage scenarios: the view of the asset. A threat, its risk, the attack paths
 * that carry it out and the goals and claims that answer the risk: the view of the threat; so is an evidence
 * entry, by its control. A control: its own.
 *
 * null where there would be nothing to see: an element nothing is joined to and nothing is in, an asset
 * without a place or a damage scenario, a damage scenario without an asset, a path that carries out no threat,
 * a control no risk has and that acts nowhere, a goal that answers no risk. An item and a boundary have no
 * view: theirs is the architecture diagram.
 */
export function viewOf(tara: Tara, id: string): ViewOf | null {
  const byId = (record: { id: string }) => record.id === id;
  const hasPlace = (elementIds: string[]) =>
    elementIds.some((elementId) => tara.elements.some((element) => element.id === elementId));

  if (tara.elements.some(byId)) return viewOfElement(tara, id);
  const asset = tara.assets.find(byId);
  if (asset) {
    const hasDamage = tara.damages.some((damage) => damage.assetId === id);
    return hasDamage || hasPlace(asset.elementIds) ? withNothingChosen("asset", id) : null;
  }
  const damage = tara.damages.find(byId);
  if (damage) return damage.assetId ? { kind: "asset", centre: damage.assetId, chosen: id } : null;
  if (tara.threats.some(byId)) return withNothingChosen("threat", id);
  if (tara.risks.some(byId)) return inViewOfRisk(tara, id, id);
  const path = tara.paths.find(byId);
  if (path) {
    const [firstThreat] = path.threatIds;
    return firstThreat ? { kind: "threat", centre: firstThreat, chosen: id } : null;
  }
  const control = tara.controls.find(byId);
  if (control) {
    const treats = tara.risks.some((risk) => riskHas(risk, id));
    return treats || hasPlace(control.elementIds) ? withNothingChosen("control", id) : null;
  }
  const goal = tara.goalClaims.find(byId);
  if (goal) {
    const answered = goal.riskIds.find((riskId) => tara.risks.some((risk) => risk.id === riskId));
    return inViewOfRisk(tara, answered, id);
  }
  const evidence = tara.evidence.find(byId);
  if (evidence) return inViewOfRisk(tara, evidence.riskId, evidence.controlId);
  return null;
}

/** The ego view of a record, where it has one. */
export const egoViewOf = (tara: Tara, id: string): ViewOf | null => (hasEgoView(tara, id) ? withNothingChosen("ego", id) : null);

// --------------------------------------------------------------------------------- where a mark on a record leads

/** What a mark on a record says the record is linked to besides what is drawn. */
export type Also = "leads to" | "carries out" | "treats" | "answers" | "lives in" | "acts in";

/**
 * Where a mark leads: to the view the record it names is seen in, with the record that carries the mark
 * chosen there where it is drawn there. A damage scenario of another asset is seen in the view of that asset;
 * a threat a path carries out as well, and a risk a control treats or a goal answers as well, in the view of
 * that threat; an element in its own view.
 */
export function markLeadsTo(does: Also, owner: string, other: string, tara: Tara): ViewOf | null {
  if (does === "leads to") return viewOf(tara, other);
  if (does === "carries out") return { kind: "threat", centre: other, chosen: owner };
  if (does === "treats" || does === "answers") return inViewOfRisk(tara, other, owner);
  // a place in the architecture: its own view with the owner chosen; a data flow is itself chosen where it is a line
  const place = viewOf(tara, other);
  return place && place.centre === other ? { ...place, chosen: owner } : place;
}

// ------------------------------------------------------------------------- the records a view can be turned to

/**
 * The records that can stand in the middle of a view of this kind, to choose from.
 * things: every record that can be drawn (thingsToDraw in graph.ts).
 * also: the record that stands there now. It is listed whatever is around it; for an ego view, which has a
 * record of any kind in its middle, it says which kind: the others are every record of that kind.
 */
export function centresOf(kind: ViewKind, tara: Tara, things: ReadonlyMap<string, Thing>, also?: string): Thing[] {
  const all = [...things.values()];
  const of = VIEWS[kind].of;
  if (of === null) {
    const like = also === undefined ? undefined : things.get(also)?.kind;
    return all.filter((thing) => thing.kind === like);
  }
  // of the architecture only a thing stands in the middle of a view: a data flow is a line there, a boundary has none
  const flowsAndBoundaries = new Set(tara.elements.filter((element) => !isThing(element)).map((element) => element.id));
  const canStand = (thing: Thing) => thing.kind === of && !flowsAndBoundaries.has(thing.id);
  return all.filter((thing) => canStand(thing) && (thing.id === also || viewOf(tara, thing.id)?.centre === thing.id));
}

// ------------------------------------------------------------------------------------------ a view, in words

/** A view as one word, so that an address can name it: "asset:A01:DS-0002" is the view of A01 with DS-0002 chosen. */
export const viewKey = (view: ViewOf): string => `${view.kind}:${view.centre}${view.chosen ? `:${view.chosen}` : ""}`;

const VIEW_KEY = new RegExp(`^(${Object.keys(VIEWS).join("|")}):([^:]+)(?::(.+))?$`);

/** The view such a word names. null: it names none. */
export function viewFromKey(key: string | null | undefined): ViewOf | null {
  const [, kind, centre, chosen] = VIEW_KEY.exec(key ?? "") ?? [];
  return kind && centre ? { kind: kind as ViewKind, centre, chosen: chosen ?? null } : null;
}

/** What a way into a view says when the pointer rests on it: which view, of which record, and what it shows. */
export function viewTip(view: ViewOf): string {
  const withChosen = view.chosen && view.chosen !== view.centre ? `, with ${view.chosen} chosen` : "";
  return `${VIEWS[view.kind].name} of ${view.centre}${withChosen}: ${VIEWS[view.kind].shows}`;
}
