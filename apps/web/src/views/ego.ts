// The ego view of one record: the record in the middle as a block one looks into to see what it is made of,
// and around it only what is linked to it directly. It does not follow the chain: the four views that do
// (views.ts) are one click away.
//
// It has one form for every entity that can be looked at this way: an architecture element of any kind, an
// asset, a damage scenario, a threat scenario, an attack path, a risk, a control, a goal or claim. Not an item,
// which is the whole; nor an evidence entry, which is a record about a risk and a control.
//
// To the left stands what the record rests on or comes from, to the right what follows from it, each group
// under a few words that say how it is linked; beneath hangs what stands with it.

import type { Scores, Tara } from "@tara/core";
import { flowsAt, isThing, placedIn, placesOf, riskHas } from "./graph.ts";
import {
  AWAY,
  BETWEEN,
  BETWEEN_GROUPS,
  type Caption,
  curve,
  curveAfterRun,
  type Drawing,
  type DrawnLine,
  HANG,
  type Heights,
  hang,
  IN_ONE_COLUMN,
  NODE,
  RAIL,
  SET_IN,
  Sheet,
  type Size,
  sum,
} from "./layout.ts";

// ----------------------------------------------------------------------------------------- what the view holds

/** Records that are linked to the one in the middle in one way. */
export interface EgoGroup {
  /** That way, in a few words. */
  title: string;
  ids: string[];
  /** Those whose link does not count yet or any more. */
  faint?: string[];
}

/** What the ego view of a record holds: the record, and what is linked to it directly, in groups by where they stand. */
export interface EgoView {
  id: string;
  left: EgoGroup[];
  right: EgoGroup[];
  /** What stands with the record: its places, its route, its risk, the controls that act in it. */
  beneath: EgoGroup | null;
}

type Sides = Omit<EgoView, "id">;

/** A group, or none where it has no record. A record is named once; those of `faint` that are in the group are marked. */
function group(title: string, ids: (string | null | undefined)[], faint: string[] = []): EgoGroup[] {
  const known = [...new Set(ids.filter((id): id is string => !!id))];
  if (known.length === 0) return [];
  const marked = faint.filter((id) => known.includes(id));
  return [{ title, ids: known, ...(marked.length > 0 ? { faint: marked } : {}) }];
}

const first = (groups: EgoGroup[]): EgoGroup | null => groups[0] ?? null;

/** Those of the paths that are screened out. */
const screenedOf = (tara: Tara, pathIds: string[]): string[] =>
  pathIds.filter((id) => tara.paths.find((path) => path.id === id)?.disposition === "screened_out");

function aroundElement(tara: Tara, id: string): Sides | null {
  const elements = tara.elements;
  const element = elements.find((candidate) => candidate.id === id);
  if (!element) return null;
  const living = placedIn(tara.assets, id).map((asset) => asset.id);
  const acting = placedIn(tara.controls, id).map((control) => control.id);
  const through = tara.paths.filter((path) => path.elementIds.includes(id)).map((path) => path.id);
  const passing = group("Attack paths through it", through, screenedOf(tara, through));

  if (element.kind === "data_flow") {
    const ends = [element.sourceId, element.targetId].filter((end) => elements.some((candidate) => candidate.id === end));
    return {
      left: group("Joins", ends),
      right: [...group("Assets it carries", living), ...passing],
      beneath: first(group("Controls that act on it", acting)),
    };
  }
  if (isThing(element)) {
    return {
      left: group(
        "Data flows",
        flowsAt(elements, id).map((flow) => flow.id),
      ),
      right: [...group("Assets in it", living), ...passing],
      beneath: first(group("Controls that act in it", acting)),
    };
  }
  const contained = elements.filter((candidate) => candidate.boundaryId === id).map((candidate) => candidate.id);
  return { left: [], right: group("Contains", contained), beneath: first(group("Controls that act at it", acting)) };
}

function aroundAsset(tara: Tara, id: string): Sides | null {
  const asset = tara.assets.find((candidate) => candidate.id === id);
  if (!asset) return null;
  const damages = tara.damages.filter((damage) => damage.assetId === id).map((damage) => damage.id);
  return {
    left: group("Lives in", placesOf(asset.elementIds, tara.elements)),
    right: group("Damage scenarios", damages),
    beneath: null,
  };
}

function aroundDamage(tara: Tara, id: string): Sides | null {
  const damage = tara.damages.find((candidate) => candidate.id === id);
  if (!damage) return null;
  const asset = tara.assets.find((candidate) => candidate.id === damage.assetId);
  const threats = tara.threats.filter((threat) => threat.damageIds.includes(id)).map((threat) => threat.id);
  return { left: group("Damage of", [asset?.id]), right: group("Threats that lead to it", threats), beneath: null };
}

function aroundThreat(tara: Tara, id: string): Sides | null {
  const threat = tara.threats.find((candidate) => candidate.id === id);
  if (!threat) return null;
  const damages = threat.damageIds.filter((damageId) => tara.damages.some((damage) => damage.id === damageId));
  const paths = tara.paths.filter((path) => path.threatIds.includes(id)).map((path) => path.id);
  const risk = tara.risks.find((candidate) => candidate.threatId === id);
  return {
    left: group("Leads to", damages),
    right: group("Carried out by", paths, screenedOf(tara, paths)),
    beneath: first(group("Its risk", [risk?.id])),
  };
}

function aroundPath(tara: Tara, scores: Scores, id: string): Sides | null {
  const path = tara.paths.find((candidate) => candidate.id === id);
  if (!path) return null;
  const threats = path.threatIds.filter((threatId) => tara.threats.some((threat) => threat.id === threatId));
  const counted = tara.risks
    .filter((risk) => scores.risks.get(risk.threatId)?.includedPathIds.includes(id))
    .map((risk) => risk.id);
  const covering = tara.controls.filter((control) => control.coveredPathIds.includes(id)).map((control) => control.id);
  // a control counts for the path once a risk of one of its threats has it as one that exists
  const exists = (controlId: string) =>
    tara.risks.some((risk) => threats.includes(risk.threatId) && risk.existingControlIds.includes(controlId));
  const notYet = covering.filter((controlId) => !exists(controlId));
  // the route stands in the order of the attack, from where the attacker gets in
  const route = path.elementIds.filter((elementId) => tara.elements.some((element) => element.id === elementId));
  return {
    left: group("Carries out", threats),
    right: [...group("Counts towards", counted), ...group("Covered by", covering, notYet)],
    beneath: first(group("Its route", route)),
  };
}

function aroundRisk(tara: Tara, scores: Scores, id: string): Sides | null {
  const risk = tara.risks.find((candidate) => candidate.id === id);
  if (!risk) return null;
  const threat = tara.threats.find((candidate) => candidate.id === risk.threatId);
  const counting = scores.risks.get(risk.threatId)?.includedPathIds ?? [];
  const controls = [...risk.existingControlIds, ...risk.proposedControlIds].filter((controlId) =>
    tara.controls.some((control) => control.id === controlId),
  );
  const onlyProposed = risk.proposedControlIds.filter((controlId) => !risk.existingControlIds.includes(controlId));
  const answers = tara.goalClaims.filter((goal) => goal.riskIds.includes(id)).map((goal) => goal.id);
  return {
    left: [...group("Risk of", [threat?.id]), ...group("Attack paths that count", counting)],
    right: [...group("Treated by", controls, onlyProposed), ...group("Answered by", answers)],
    beneath: null,
  };
}

function aroundControl(tara: Tara, id: string): Sides | null {
  const control = tara.controls.find((candidate) => candidate.id === id);
  if (!control) return null;
  const risks = tara.risks.filter((risk) => riskHas(risk, id));
  const proposedFor = risks.filter((risk) => !risk.existingControlIds.includes(id)).map((risk) => risk.id);
  const covered = tara.paths.filter((path) => control.coveredPathIds.includes(path.id)).map((path) => path.id);
  const treats = group(
    "Treats",
    risks.map((risk) => risk.id),
    proposedFor,
  );
  return {
    left: [...treats, ...group("Covers", covered, screenedOf(tara, covered))],
    right: [],
    beneath: first(group("Acts in", placesOf(control.elementIds, tara.elements))),
  };
}

function aroundGoal(tara: Tara, id: string): Sides | null {
  const goal = tara.goalClaims.find((candidate) => candidate.id === id);
  if (!goal) return null;
  const risks = goal.riskIds.filter((riskId) => tara.risks.some((risk) => risk.id === riskId));
  return { left: group("Answers", risks), right: [], beneath: null };
}

/**
 * What is linked to a record directly, by the kind of record it is.
 * scores: which attack paths count towards which risk.
 * null: the record is not in the TARA, or is of a kind that has no ego view.
 */
export function egoView(tara: Tara, scores: Scores, id: string): EgoView | null {
  const sides =
    aroundElement(tara, id) ??
    aroundAsset(tara, id) ??
    aroundDamage(tara, id) ??
    aroundThreat(tara, id) ??
    aroundPath(tara, scores, id) ??
    aroundRisk(tara, scores, id) ??
    aroundControl(tara, id) ??
    aroundGoal(tara, id);
  return sides && { id, ...sides };
}

/** Whether a record has an ego view: it is an entity of its own. Not an item, an evidence entry, or what is not in the TARA. */
export function hasEgoView(tara: Tara, id: string): boolean {
  const lists: { id: string }[][] = [
    tara.elements,
    tara.assets,
    tara.damages,
    tara.threats,
    tara.paths,
    tara.risks,
    tara.controls,
    tara.goalClaims,
  ];
  return lists.some((list) => list.some((record) => record.id === id));
}

// ------------------------------------------------------------------------------------------ where things stand

/** The room the words above a group take. */
const CAPTION = 18;

/** The height of a group: its words, and its records one above the other. */
const groupHeight = (sheet: Sheet, group: EgoGroup): number => CAPTION + sum(group.ids.map(sheet.heightOf), BETWEEN);

/**
 * The ego view, drawn: the block in the middle, as wide as it is told and as high as its record needs; the
 * groups it rests on in one column to its left and those that follow from it in one column to its right,
 * each under its words; what stands with it hanging beneath. Every line runs between the block and one
 * record, without an arrowhead: where a record stands says how it is linked.
 */
export function drawEgoView(view: EgoView, node: Size = NODE, heights?: Heights, blockWidth = node.w): Drawing {
  const sheet = new Sheet(node, heights);
  const width = sheet.width;
  const half = blockWidth / 2;
  const below = sheet.heightOf(view.id) / 2;
  sheet.put(view.id, -half, 0);

  // what stands with the record hangs beneath it, in up to three columns
  const beneath = view.beneath?.ids ?? [];
  const hung = hang(sheet, { parent: view.id, key: "with", ids: beneath, columns: 3, parentWidth: blockWidth });
  const lines: DrawnLine[] = [...hung.lines];
  const captions: Caption[] = [];
  // its words stand between the block and the first record, beneath the rail where there is one
  if (view.beneath && beneath.length > 0) {
    const y = below + (beneath.length > IN_ONE_COLUMN ? RAIL : 0) + (HANG - 12) / 2;
    captions.push({ key: "beneath", x: -half + SET_IN + 2, y, text: view.beneath.title });
  }

  // a line to the right first runs level until it is past what hangs
  const columns = [
    { side: -1, groups: view.left, x: -half - AWAY - width },
    { side: 1, groups: view.right, x: half + hung.clear + AWAY },
  ] as const;
  for (const { side, groups, x } of columns) {
    let top =
      -sum(
        groups.map((each) => groupHeight(sheet, each)),
        BETWEEN_GROUPS,
      ) / 2;
    for (const each of groups) {
      captions.push({ key: `${side}|${each.title}`, x, y: top, text: each.title });
      let recordTop = top + CAPTION;
      for (const id of each.ids) {
        // a record has one place, in the first group that names it
        if (sheet.at.has(id)) continue;
        sheet.putBelow(id, x, recordTop);
        const middle = sheet.middleOf(id);
        const d = side < 0 ? curve(x + width, middle, -half, 0) : curveAfterRun(half, 0, half + hung.clear, x, middle);
        const faint = each.faint?.includes(id) === true;
        lines.push({ key: `${side < 0 ? "from" : "to"}|${id}`, d, arrow: false, joins: [view.id, id], faint });
        recordTop += sheet.heightOf(id) + BETWEEN;
      }
      top += groupHeight(sheet, each) + BETWEEN_GROUPS;
    }
  }

  const box = sheet.frame(
    captions.map((caption) => caption.y),
    (id) => (id === view.id ? blockWidth : width),
  );
  return { at: sheet.at, lines, labels: [], captions, box };
}
