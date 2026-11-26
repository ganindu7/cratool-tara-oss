// What is laid over the architecture: nothing, the highest risk that reaches each element, the controls where
// they act, the gaps, or the route of one attack path. The same drawing is opened from four steps, and each
// brings something else forward. No screen code, so that it can be tested.

import { type AttackPath, type Coverage, coverage, type Tara } from "@tara/core";
import type { Inside } from "./held.ts";

/** The step the drawing is opened from. */
export type Emphasis = "architecture" | "assets" | "paths" | "controls";

/** What is laid over the drawing: one of `OVERLAYS`, or the ID of the attack path whose route is shown. */
export type Overlay = string;

/** What can be laid over besides a route, with the words the choice is offered in. */
export const OVERLAYS: { key: Overlay; name: string }[] = [
  { key: "none", name: "Nothing" },
  { key: "risk", name: "Highest risk that reaches each element" },
  { key: "controls", name: "Controls, where they act" },
  { key: "gaps", name: "Gaps: risk that no control meets" },
];

/**
 * What the drawing shows. The address may say (`asked`), and is followed where it names something that
 * exists. Where it says nothing, the step decides: from the attack paths the first route, from the controls
 * where they act, and from the architecture and the assets nothing, since the assets are in their elements anyway.
 */
export function overlayFor(asked: string | null, emphasis: Emphasis, tara: Tara): Overlay {
  const known = OVERLAYS.some((overlay) => overlay.key === asked) || tara.paths.some((path) => path.id === asked);
  if (asked !== null && known) return asked;
  if (emphasis === "controls") return "controls";
  if (emphasis !== "paths") return "none";
  return (tara.paths.find((path) => path.elementIds.length > 0) ?? tara.paths[0])?.id ?? "none";
}

/** The rows inside an element: its assets, or with the controls or the gaps laid over, the controls that act in it. */
export const rowsOf = (overlay: Overlay): Inside => (overlay === "controls" || overlay === "gaps" ? "controls" : "assets");

/** The value of each risk, by the ID of its threat scenario, as the gap view and the risk layer need it. */
export const riskValues = (scores: Map<string, { value: number | null }>): Map<string, number | null> =>
  new Map([...scores].map(([threatId, score]) => [threatId, score.value]));

/**
 * The highest value among the risks that reach an element: through an asset it holds that can be damaged, or
 * through an attack path that passes through it. A risk without a value yet still reaches: its element is named, with null.
 */
export function highestRiskAt(tara: Tara, values: Map<string, number | null>): Map<string, number | null> {
  const highest = new Map<string, number | null>();
  const raise = (elementId: string, value: number | null) => {
    if (!highest.has(elementId) || (value ?? -1) > (highest.get(elementId) ?? -1)) highest.set(elementId, value);
  };
  for (const risk of tara.risks) {
    const threat = tara.threats.find((candidate) => candidate.id === risk.threatId);
    if (!threat) continue;
    const value = values.get(threat.id) ?? null;
    const damaged = tara.damages.filter((damage) => threat.damageIds.includes(damage.id)).map((damage) => damage.assetId);
    for (const asset of tara.assets.filter((candidate) => damaged.includes(candidate.id))) {
      for (const elementId of asset.elementIds) raise(elementId, value);
    }
    for (const path of tara.paths.filter((candidate) => candidate.threatIds.includes(threat.id))) {
      for (const elementId of path.elementIds) raise(elementId, value);
    }
  }
  return highest;
}

/** The gap view: how each component and data store that a risk reaches stands, by its ID. */
export const gapsAt = (tara: Tara, values: Map<string, number | null>): Map<string, Coverage> =>
  new Map(coverage(tara, values).map((place) => [place.elementId, place]));

/** The route of an attack path: the path, and the place of each element and data flow on it, counted from 1 at the entry point. */
export interface Route {
  path: AttackPath;
  steps: Map<string, number>;
}

/** The route that is laid over the drawing, if the overlay names an attack path. */
export function routeOf(tara: Tara, overlay: Overlay): Route | null {
  const path = tara.paths.find((candidate) => candidate.id === overlay);
  return path ? { path, steps: new Map(path.elementIds.map((id, index) => [id, index + 1])) } : null;
}

/** An element or data flow chosen while a route is recorded: one that is not on the route goes to its end, and one that is comes off. */
export function routeWith(route: string[], ids: string[]): string[] {
  const missing = ids.filter((id) => !route.includes(id));
  return missing.length > 0 ? [...route, ...missing] : route.filter((id) => !ids.includes(id));
}
