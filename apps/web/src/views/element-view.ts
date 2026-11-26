// The view of one architecture element: what it is joined to, and what is in it.
//
// The element stands in the middle. To its left are the elements it is joined to, each line a data flow that
// carries its ID and points the way the data goes. To its right are the assets that live in it, each with its
// damage scenarios. Beneath it hang the controls that act in it. Nothing else of the TARA is in the view.

import type { Element, Tara } from "@tara/core";
import { flowsAt, isThing, placedIn } from "./graph.ts";
import {
  AWAY,
  curve,
  curveAfterRun,
  type Drawing,
  type DrawnLine,
  feedFromLeft,
  type Heights,
  hang,
  NODE,
  pileWithDamages,
  Sheet,
  type Size,
  TO_DAMAGE,
} from "./layout.ts";

/** A data flow between the element and one it is joined to. into: it carries towards this element; out: away from it. */
export interface JoiningFlow {
  id: string;
  into: boolean;
  out: boolean;
}

/**
 * What the view of an element holds: the element, the elements it is joined to with the data flows between
 * them, the assets that live in it, and the controls that act in it.
 */
export interface ElementView {
  elementId: string;
  /** The elements it is joined to, each with the data flows between the two. */
  joined: { id: string; flows: JoiningFlow[] }[];
  /** Data flows of it whose other end is open: there is nothing to draw them to. */
  open: string[];
  /** The assets that live in it, each with its damage scenarios. elsewhere: other elements it lives in, which are not drawn. */
  assets: { id: string; damages: string[]; elsewhere: string[] }[];
  /** The controls that act in it. elsewhere: other elements they act in as well. */
  controls: { id: string; elsewhere: string[] }[];
}

/** A data flow as seen from one of its ends. */
function seenFrom(flow: Element, elementId: string): JoiningFlow {
  const startsHere = flow.sourceId === elementId;
  const towards = startsHere ? "backward" : "forward";
  const away = startsHere ? "forward" : "backward";
  return {
    id: flow.id,
    into: flow.direction === "both" || flow.direction === towards,
    out: flow.direction === "both" || flow.direction === away,
  };
}

/**
 * What the view of an element holds, for a component, an outside party or a store.
 * null: it is not in the TARA, or it is a data flow (a line in the view of an element at its end) or a boundary.
 */
export function elementView(tara: Tara, elementId: string): ElementView | null {
  const elements = tara.elements;
  const element = elements.find((candidate) => candidate.id === elementId);
  if (!element || !isThing(element)) return null;
  const things = new Set(elements.filter(isThing).map((candidate) => candidate.id));

  const joined: ElementView["joined"] = [];
  const open: string[] = [];
  for (const flow of flowsAt(elements, elementId)) {
    const other = flow.sourceId === elementId ? flow.targetId : flow.sourceId;
    if (!other || other === elementId || !things.has(other)) {
      open.push(flow.id);
      continue;
    }
    const pair = joined.find((candidate) => candidate.id === other);
    if (pair) pair.flows.push(seenFrom(flow, elementId));
    else joined.push({ id: other, flows: [seenFrom(flow, elementId)] });
  }

  const known = new Set(elements.map((candidate) => candidate.id));
  const others = (ids: string[]) => ids.filter((id) => id !== elementId && known.has(id));
  return {
    elementId,
    joined,
    open,
    assets: placedIn(tara.assets, elementId).map((asset) => ({
      id: asset.id,
      damages: tara.damages.filter((damage) => damage.assetId === asset.id).map((damage) => damage.id),
      elsewhere: others(asset.elementIds),
    })),
    controls: placedIn(tara.controls, elementId).map((control) => ({ id: control.id, elsewhere: others(control.elementIds) })),
  };
}

/** The view of an element, drawn: joined elements to the left, its assets with their damage to the right, its controls below. */
export function drawElementView(view: ElementView, node: Size = NODE, heights?: Heights): Drawing {
  const sheet = new Sheet(node, heights);
  const width = sheet.width;
  sheet.put(view.elementId, -width / 2, 0);

  const feeds = view.joined.map((pair) => ({
    id: pair.id,
    lines: pair.flows.map((flow) => ({
      key: `flow|${flow.id}`,
      recordId: flow.id,
      into: flow.into,
      out: flow.out,
      faint: false,
    })),
  }));
  const fed = feedFromLeft(sheet, view.elementId, feeds);
  // the controls hang in up to three columns; the lines to the assets then first run level until they are past them
  const hung = hang(sheet, { parent: view.elementId, key: "acts", ids: view.controls.map((control) => control.id), columns: 3 });
  const assetX = width / 2 + hung.clear + AWAY;
  const damageX = assetX + width + TO_DAMAGE;
  pileWithDamages(sheet, view.assets, assetX, damageX);

  const lines: DrawnLine[] = [...fed.lines, ...hung.lines];
  for (const asset of view.assets) {
    const middle = sheet.middleOf(asset.id);
    const holds = curveAfterRun(width / 2, 0, width / 2 + hung.clear, assetX, middle);
    lines.push({ key: `holds|${asset.id}`, d: holds, arrow: false, joins: [view.elementId, asset.id], faint: false });
    for (const damageId of asset.damages) {
      const d = curve(assetX + width, middle, damageX, sheet.middleOf(damageId));
      lines.push({ key: `of|${damageId}`, d, arrow: false, joins: [asset.id, damageId], faint: false });
    }
  }
  return { at: sheet.at, lines, labels: fed.labels, captions: [], box: sheet.frame(fed.reaches) };
}
