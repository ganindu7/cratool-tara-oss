// The view of one threat scenario: what it leads to, how it is carried out, and what treats its risk.
//
// The threat stands in the middle with its risk beneath it, and beneath the risk the goals and claims that
// answer it. To the left are the damage scenarios it leads to, each with its asset; to the right the attack
// paths that carry it out, and beyond each path the controls that cover it. The records stand in the order
// of the method, as on the graph. Nothing else of the TARA is in the view.

import type { Tara } from "@tara/core";
import { riskHas } from "./graph.ts";
import {
  type AssetWithDamages,
  AWAY,
  apartOn,
  arriveSquare,
  BETWEEN_GROUPS,
  curve,
  curveAfterRun,
  type Drawing,
  type DrawnLine,
  type Heights,
  hang,
  lineTo,
  NODE,
  off,
  pieces,
  pileWithDamages,
  RUN_IN,
  Sheet,
  type Size,
  startAt,
  sum,
  TO_CONTROL,
  TO_CONTROL_MOST,
  TO_DAMAGE,
  TO_RISK,
} from "./layout.ts";

// ----------------------------------------------------------------------------------------- what the view holds

/** An attack path in the view of a threat: one that carries the threat out. */
export interface ThreatViewPath {
  id: string;
  screened: boolean;
  /** Other threats the path carries out as well. They are not drawn. */
  elsewhere: string[];
}

/** A control in the view of a threat: one that the threat's risk has, with the paths of the threat it covers. */
export interface ThreatViewControl {
  id: string;
  /** For this risk the control is only proposed. */
  proposed: boolean;
  /** The paths of this threat the control covers. None: it treats the risk as a whole. */
  paths: string[];
  /** Other risks that have the control as well. They are not drawn. */
  elsewhere: string[];
}

/**
 * What the view of a threat holds: the threat and its risk, the damage scenarios it leads to under their assets,
 * the attack paths that carry it out, and the controls and the goals and claims of its risk.
 */
export interface ThreatView {
  threatId: string;
  /** The risk of the threat. */
  riskId: string | null;
  /** The damage scenarios the threat leads to, in the order they are linked, under the asset they are damage of. */
  assets: AssetWithDamages[];
  /** The attack paths that carry it out. */
  paths: ThreatViewPath[];
  /** The controls of its risk, existing or only proposed. */
  controls: ThreatViewControl[];
  /** The goals and claims that answer its risk. elsewhere: other risks they answer as well. They are not drawn. */
  goals: { id: string; elsewhere: string[] }[];
}

/** What the view of a threat holds. null: the threat is not in the TARA. */
export function threatView(tara: Tara, threatId: string): ThreatView | null {
  const threat = tara.threats.find((candidate) => candidate.id === threatId);
  if (!threat) return null;
  const risk = tara.risks.find((candidate) => candidate.threatId === threatId) ?? null;

  const assets: AssetWithDamages[] = [];
  for (const damageId of threat.damageIds) {
    const damage = tara.damages.find((candidate) => candidate.id === damageId);
    if (!damage) continue;
    const group = assets.find((asset) => asset.id === damage.assetId);
    if (group) group.damages.push(damageId);
    else assets.push({ id: damage.assetId, damages: [damageId] });
  }

  const paths = tara.paths
    .filter((path) => path.threatIds.includes(threatId))
    .map((path) => ({
      id: path.id,
      screened: path.disposition === "screened_out",
      elsewhere: path.threatIds.filter((id) => id !== threatId),
    }));

  const controls: ThreatViewControl[] = [];
  for (const controlId of risk ? [...risk.existingControlIds, ...risk.proposedControlIds] : []) {
    const control = tara.controls.find((candidate) => candidate.id === controlId);
    if (!control || !risk) continue;
    controls.push({
      id: controlId,
      proposed: !risk.existingControlIds.includes(controlId),
      paths: paths.filter((path) => control.coveredPathIds.includes(path.id)).map((path) => path.id),
      elsewhere: tara.risks.filter((other) => other.id !== risk.id && riskHas(other, controlId)).map((other) => other.id),
    });
  }

  const goals = tara.goalClaims
    .filter((goal) => risk !== null && goal.riskIds.includes(risk.id))
    .map((goal) => ({ id: goal.id, elsewhere: goal.riskIds.filter((id) => id !== risk?.id) }));
  return { threatId, riskId: risk?.id ?? null, assets, paths, controls, goals };
}

// ------------------------------------------------------------------------------------------ where things stand

/** The controls of a view by where they stand: beside the first path they cover, or level with the risk. */
function controlsByPlace(view: ThreatView): { beside: (pathId: string) => string[]; whole: string[] } {
  const homeOf = (control: ThreatViewControl) => view.paths.find((path) => control.paths.includes(path.id))?.id ?? null;
  return {
    beside: (pathId) => view.controls.filter((control) => homeOf(control) === pathId).map((control) => control.id),
    whole: view.controls.filter((control) => homeOf(control) === null).map((control) => control.id),
  };
}

/**
 * The view of a threat, drawn, in the order of the method from left to right: assets, damage scenarios, the
 * threat with its risk beneath it, attack paths, controls. A control stands beside the first path it covers.
 * Controls that cover no path of this threat treat the risk as a whole: they stand level with the risk, below
 * the paths, so that their line passes beneath every path. The goals and claims that answer the risk hang
 * beneath it.
 */
export function drawThreatView(view: ThreatView, node: Size = NODE, heights?: Heights): Drawing {
  const sheet = new Sheet(node, heights);
  const width = sheet.width;
  const { beside, whole } = controlsByPlace(view);
  const damageX = -width / 2 - AWAY - width;
  const assetX = damageX - TO_DAMAGE - width;
  const pathX = width / 2 + AWAY;
  const nearestControlX = pathX + width + TO_CONTROL;

  sheet.put(view.threatId, -width / 2, 0);
  pileWithDamages(sheet, view.assets, assetX, damageX);

  // each path has a row, as high as the path or as the controls piled beside it
  const rows = view.paths.map((path) => Math.max(sheet.heightOf(path.id), sheet.stackHeight(beside(path.id))));
  const tall = sum(rows, BETWEEN_GROUPS);
  let top = -tall / 2;
  view.paths.forEach((path, k) => {
    const row = rows[k] ?? 0;
    sheet.put(path.id, pathX, top + row / 2);
    sheet.pile(beside(path.id), nearestControlX, top + row / 2);
    top += row + BETWEEN_GROUPS;
  });

  const riskId = view.riskId;
  if (riskId) {
    const below = sheet.heightOf(view.threatId) / 2 + TO_RISK + sheet.heightOf(riskId) / 2;
    const wholeHeight = sheet.stackHeight(whole);
    const underPaths = (view.paths.length > 0 ? tall / 2 + BETWEEN_GROUPS : -wholeHeight / 2) + wholeHeight / 2;
    const level = whole.length === 0 ? below : Math.max(below, underPaths);
    sheet.put(riskId, -width / 2, level);
    sheet.pile(whole, nearestControlX, level);
  }
  const hung = riskId ? hang(sheet, { parent: riskId, key: "answers", ids: view.goals.map((goal) => goal.id) }).lines : [];

  // A control that stands far above or below a path it covers gets more room between them, so that its line
  // bends gently and the lines of several controls can be told apart.
  const climbs = view.controls.flatMap((control) =>
    control.paths.map((pathId) => Math.abs(sheet.middleOf(pathId) - sheet.middleOf(control.id))),
  );
  const controlX = pathX + width + Math.round(Math.min(TO_CONTROL_MOST, Math.max(TO_CONTROL, Math.max(0, ...climbs) * 0.4)));
  for (const control of view.controls) sheet.moveTo(control.id, controlX);

  const lines = [...linesToTheLeft(view, sheet, assetX, damageX), ...linesToTheRight(view, sheet, pathX, controlX)];
  if (riskId) lines.push(...linesOfTheRisk(view, sheet, riskId, whole, controlX), ...hung);
  return { at: sheet.at, lines, labels: [], captions: [], box: sheet.frame() };
}

// ----------------------------------------------------------------------------------------------- the lines

/** From each asset to its damage scenarios, and from the threat to each damage scenario it leads to. */
function linesToTheLeft(view: ThreatView, sheet: Sheet, assetX: number, damageX: number): DrawnLine[] {
  const width = sheet.width;
  const lines: DrawnLine[] = [];
  for (const asset of view.assets) {
    for (const damageId of asset.damages) {
      const middle = sheet.middleOf(damageId);
      if (asset.id) {
        const d = curve(assetX + width, sheet.middleOf(asset.id), damageX, middle);
        lines.push({ key: `of|${damageId}`, d, arrow: false, joins: [asset.id, damageId], faint: false });
      }
      // the threat leads to the damage scenario: the line meets its side square, after a straight stretch for the arrowhead
      const d = pieces(startAt(-width / 2, 0), arriveSquare(-width / 2, 0, damageX + width, middle));
      lines.push({ key: `to|${damageId}`, d, arrow: true, joins: [view.threatId, damageId], faint: false });
    }
  }
  return lines;
}

/** From each path to the threat it carries out, and from each path to the controls that cover it. */
function linesToTheRight(view: ThreatView, sheet: Sheet, pathX: number, controlX: number): DrawnLine[] {
  const width = sheet.width;
  const lines: DrawnLine[] = [];
  // each path has a place of its own on the side of the threat while arrowheads have room; otherwise the lines arrive as one
  const step = apartOn(sheet.heightOf(view.threatId), view.paths.length);
  view.paths.forEach((path, k) => {
    const middle = sheet.middleOf(path.id);
    const d = pieces(startAt(pathX, middle), arriveSquare(pathX, middle, width / 2, off(k, view.paths.length, step)));
    lines.push({ key: `by|${path.id}`, d, arrow: true, joins: [path.id, view.threatId], faint: path.screened });
  });
  for (const control of view.controls) {
    for (const pathId of control.paths) {
      const d = curve(pathX + width, sheet.middleOf(pathId), controlX, sheet.middleOf(control.id));
      lines.push({
        key: `covers|${pathId}|${control.id}`,
        d,
        arrow: false,
        joins: [pathId, control.id],
        faint: control.proposed,
      });
    }
  }
  return lines;
}

/** From the threat down to its risk, and from the risk to each control that treats it as a whole. */
function linesOfTheRisk(view: ThreatView, sheet: Sheet, riskId: string, whole: string[], controlX: number): DrawnLine[] {
  const width = sheet.width;
  const level = sheet.middleOf(riskId);
  const proposed = new Set(view.controls.filter((control) => control.proposed).map((control) => control.id));
  const down = pieces(startAt(0, sheet.heightOf(view.threatId) / 2), lineTo(0, sheet.cornerOf(riskId).y));
  const lines: DrawnLine[] = [{ key: "risk", d: down, arrow: false, joins: [view.threatId, riskId], faint: false }];
  for (const controlId of whole) {
    const d = curveAfterRun(width / 2, level, controlX - RUN_IN, controlX, sheet.middleOf(controlId));
    lines.push({ key: `treats|${controlId}`, d, arrow: false, joins: [riskId, controlId], faint: proposed.has(controlId) });
  }
  return lines;
}
