// The view of one asset: what can happen to it, and by which ways.
//
// The asset stands in the middle with its damage scenarios beside it, the threat scenarios that lead to them
// further out, and on each line from a threat the attack path it stands for. Beneath the asset hang the
// elements of the architecture it lives in. Nothing else of the TARA is in the view.

import type { Tara } from "@tara/core";
import { placesOf } from "./graph.ts";
import {
  apartOn,
  arriveSquare,
  BETWEEN_DAMAGES,
  BETWEEN_THREATS,
  bend,
  CLOSE,
  curveAfterRun,
  type Drawing,
  type DrawnLine,
  type Heights,
  hang,
  LANE,
  LEAVE,
  type LineLabel,
  lineTo,
  NODE,
  off,
  pieces,
  RUN,
  round,
  Sheet,
  type Size,
  startAt,
  sum,
  TO_DAMAGE,
} from "./layout.ts";

// ----------------------------------------------------------------------------------------- what the view holds

/** A threat scenario in the view of an asset: one that leads to a damage scenario of the asset. */
export interface AssetViewThreat {
  id: string;
  /** The damage scenarios of this asset the threat leads to. */
  damages: string[];
  /** Damage scenarios of other assets it leads to as well. They are not drawn. */
  elsewhere: string[];
  /** The attack paths that carry the threat out. A path belongs to its threat, so each leads to every damage scenario of it. */
  paths: string[];
}

/** What the view of an asset holds: the asset, where it lives, its damage scenarios, and the threats that lead to them. */
export interface AssetView {
  assetId: string;
  /** The elements of the architecture it lives in: a component, a store, a data flow that carries it. */
  homes: string[];
  /** The damage scenarios of the asset, in the order of the list. */
  damages: string[];
  threats: AssetViewThreat[];
  /** Those of the paths that are screened out: they are drawn, and do not count. */
  screened: string[];
}

/** What the view of an asset holds. null: the asset is not in the TARA. */
export function assetView(tara: Tara, assetId: string): AssetView | null {
  const asset = tara.assets.find((candidate) => candidate.id === assetId);
  if (!asset) return null;
  const damages = tara.damages.filter((damage) => damage.assetId === assetId).map((damage) => damage.id);
  const own = new Set(damages);
  const threats = tara.threats
    .filter((threat) => threat.damageIds.some((id) => own.has(id)))
    .map((threat) => ({
      id: threat.id,
      damages: damages.filter((id) => threat.damageIds.includes(id)),
      elsewhere: threat.damageIds.filter((id) => !own.has(id)),
      paths: tara.paths.filter((path) => path.threatIds.includes(threat.id)).map((path) => path.id),
    }));
  const drawn = new Set(threats.flatMap((threat) => threat.paths));
  const screened = tara.paths.filter((path) => drawn.has(path.id) && path.disposition === "screened_out").map((path) => path.id);
  return { assetId, homes: placesOf(asset.elementIds, tara.elements), damages, threats, screened };
}

// ------------------------------------------------------------------------------------------ where things stand

type Side = 1 | -1;

/** The measures the placing and the lines both need. */
interface Measures {
  /** The damage scenario a threat stands beside: the first it leads to. */
  homeOf: (threat: AssetViewThreat) => string;
  /** The room a threat takes: its own height, or that of its lines where it has many paths. */
  roomOf: (threat: AssetViewThreat) => number;
  threatsBeside: (damageId: string) => AssetViewThreat[];
  /** The height of the threats beside a damage scenario, and the room the scenario takes with them. */
  threatsHeight: (damageId: string) => number;
  blockOf: (damageId: string) => number;
}

function measure(view: AssetView, sheet: Sheet): Measures {
  const homeOf = (threat: AssetViewThreat) => threat.damages[0] ?? "";
  const roomOf = (threat: AssetViewThreat) => Math.max(sheet.heightOf(threat.id), Math.max(1, threat.paths.length) * LANE);
  const threatsBeside = (damageId: string) => view.threats.filter((threat) => homeOf(threat) === damageId);
  const threatsHeight = (damageId: string) => sum(threatsBeside(damageId).map(roomOf), BETWEEN_THREATS);
  const blockOf = (damageId: string) => Math.max(sheet.heightOf(damageId), threatsHeight(damageId));
  return { homeOf, roomOf, threatsBeside, threatsHeight, blockOf };
}

/**
 * The side of the asset each damage scenario stands on. Damage scenarios joined by a threat form a group and
 * stand on one side, so that no line has to pass the asset; a group goes to the side that has less on it.
 */
function sidesOf(view: AssetView, blockOf: (damageId: string) => number): Map<string, Side> {
  const group = new Map(view.damages.map((id) => [id, id]));
  const topOf = (id: string): string => {
    const above = group.get(id) ?? id;
    return above === id ? id : topOf(above);
  };
  for (const threat of view.threats) {
    const [first, ...others] = threat.damages;
    for (const other of others) group.set(topOf(other), topOf(first ?? other));
  }

  const side = new Map<string, Side>();
  let onTheRight = 0;
  let onTheLeft = 0;
  for (const id of view.damages) {
    const top = topOf(id);
    const chosen = side.get(top) ?? (onTheRight <= onTheLeft ? 1 : -1);
    side.set(top, chosen);
    side.set(id, chosen);
    if (chosen > 0) onTheRight += blockOf(id) + BETWEEN_DAMAGES;
    else onTheLeft += blockOf(id) + BETWEEN_DAMAGES;
  }
  return side;
}

/**
 * Puts the damage scenarios of one side one above the other, each with its threats beyond it.
 * clear: the room that what hangs beneath the asset needs.
 */
function placeSide(sheet: Sheet, measures: Measures, damages: string[], side: Side, clear: number): void {
  const width = sheet.width;
  const damageX = side > 0 ? width / 2 + clear + TO_DAMAGE : -width / 2 - clear - TO_DAMAGE - width;
  const threatX = side > 0 ? damageX + width + CLOSE + RUN + LEAVE : damageX - CLOSE - RUN - LEAVE - width;
  let top = -sum(damages.map(measures.blockOf), BETWEEN_DAMAGES) / 2;
  for (const damageId of damages) {
    const block = measures.blockOf(damageId);
    sheet.put(damageId, damageX, top + block / 2);
    let threatTop = top + (block - measures.threatsHeight(damageId)) / 2;
    for (const threat of measures.threatsBeside(damageId)) {
      const room = measures.roomOf(threat);
      sheet.put(threat.id, threatX, threatTop + room / 2);
      threatTop += room + BETWEEN_THREATS;
    }
    top += block + BETWEEN_DAMAGES;
  }
}

// ----------------------------------------------------------------------------------------------- the lines

/** One line of a threat: an attack path of it, or the line of a threat that has no path yet. y: the height it runs at. */
interface Lane {
  threat: AssetViewThreat;
  pathId: string | null;
  y: number;
}

const lanesOf = (view: AssetView, sheet: Sheet): Lane[] =>
  view.threats.flatMap((threat) => {
    const count = Math.max(1, threat.paths.length);
    return Array.from({ length: count }, (_, k) => ({
      threat,
      pathId: threat.paths[k] ?? null,
      y: sheet.middleOf(threat.id) + off(k, count, LANE),
    }));
  });

/**
 * Where the lines of each threat meet each damage scenario. The lines of one threat meet it at one place. Each
 * threat has a place of its own there, in the order the threats stand, as long as arrowheads have room beside
 * each other; otherwise all lines join and arrive as one.
 */
function arrivalsOf(view: AssetView, sheet: Sheet): (damageId: string, threatId: string) => number {
  const places = new Map<string, Map<string, number>>();
  for (const damageId of view.damages) {
    const from = view.threats
      .filter((threat) => threat.damages.includes(damageId))
      .sort((a, b) => sheet.middleOf(a.id) - sheet.middleOf(b.id));
    const step = apartOn(sheet.heightOf(damageId), from.length);
    places.set(damageId, new Map(from.map((threat, k) => [threat.id, sheet.middleOf(damageId) + off(k, from.length, step)])));
  }
  return (damageId, threatId) => places.get(damageId)?.get(threatId) ?? sheet.middleOf(damageId);
}

/** The view of an asset, drawn: the asset in the middle, damage scenarios to both sides, each with its threats further out. */
export function drawAssetView(view: AssetView, node: Size = NODE, heights?: Heights): Drawing {
  const sheet = new Sheet(node, heights);
  const width = sheet.width;
  const measures = measure(view, sheet);
  const side = sidesOf(view, measures.blockOf);
  const sideOf = (damageId: string): Side => side.get(damageId) ?? 1;

  sheet.put(view.assetId, -width / 2, 0);
  // where it lives hangs beneath the asset; the lines to the damage scenarios then first run clear of it, on both sides alike
  const hung = hang(sheet, { parent: view.assetId, key: "in", ids: view.homes });
  for (const each of [1, -1] as const) {
    const here = view.damages.filter((id) => sideOf(id) === each);
    placeSide(sheet, measures, here, each, hung.clear);
  }

  const stems: DrawnLine[] = view.damages.map((damageId) => {
    const towards = sideOf(damageId);
    const from = (towards * width) / 2;
    const to = towards > 0 ? sheet.cornerOf(damageId).x : sheet.cornerOf(damageId).x + width;
    const d = curveAfterRun(from, 0, from + towards * hung.clear, to, sheet.middleOf(damageId));
    return { key: `of|${damageId}`, d, arrow: false, joins: [view.assetId, damageId], faint: false };
  });

  const lanes = lanesOf(view, sheet);
  const arrival = arrivalsOf(view, sheet);
  const lines: DrawnLine[] = [];
  const labels: LineLabel[] = [];
  for (const lane of lanes) {
    const { threat, pathId } = lane;
    // seen from the threat, its damage scenarios lie towards the asset
    const towards = -sideOf(measures.homeOf(threat));
    const corner = sheet.cornerOf(threat.id);
    const edge = towards < 0 ? corner.x : corner.x + width;
    const middle = sheet.middleOf(threat.id);
    const half = sheet.heightOf(threat.id) / 2;
    // the line leaves the side of the threat near its own height, and not nearer than this to a corner
    const leave = middle + Math.max(-half + 8, Math.min(half - 8, lane.y - middle));
    const runFrom = edge + towards * LEAVE;
    const runTo = runFrom + towards * RUN;
    const start = pieces(startAt(edge, leave), bend(edge, leave, runFrom, lane.y), lineTo(runTo, lane.y));
    const faint = pathId === null || view.screened.includes(pathId);

    for (const damageId of threat.damages) {
      const end = towards < 0 ? sheet.cornerOf(damageId).x + width : sheet.cornerOf(damageId).x;
      const d = pieces(start, arriveSquare(runTo, lane.y, end, arrival(damageId, threat.id)));
      const joins = [threat.id, damageId, ...(pathId ? [pathId] : [])];
      lines.push({ key: `${threat.id}|${pathId}|${damageId}`, d, arrow: true, joins, faint });
    }
    labels.push({
      key: `${threat.id}|${pathId}`,
      x: round((runFrom + runTo) / 2),
      y: round(lane.y),
      recordId: pathId,
      of: threat.id,
      faint,
      ...(pathId === null ? { text: "No attack path" } : {}),
    });
  }

  const reaches = lanes.flatMap((lane) => [lane.y - LANE / 2, lane.y + LANE / 2]);
  return { at: sheet.at, lines: [...hung.lines, ...stems, ...lines], labels, captions: [], box: sheet.frame(reaches) };
}
