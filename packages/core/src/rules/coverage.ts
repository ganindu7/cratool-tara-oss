// Where on the architecture a risk lands that no control meets: the gap view.
//
// This is not a check. A TARA with gaps can be complete, and a gap holds nothing up. It is a question put
// to the person who placed the controls: a risk reaches this element; what stands there, or on the way to it?
//
// A risk reaches an element in two ways: an attack path passes through it, or an asset that can be damaged
// lives in it. A control meets the risk if it acts on that element, or on an element the attack has to pass
// first.

import type { Tara } from "../model/tara.ts";

/** How a risk is met at an element: by a control there, by one earlier on the route, only by a proposed one, or not at all. */
export type Met = "here" | "before" | "planned" | "no";

/** The gap view of one element: the risks that reach it, the controls that act on it, and whether that leaves a gap. */
export interface Coverage {
  elementId: string;
  /** The risks that reach the element. */
  risks: {
    riskId: string;
    threatId: string;
    value: number | null;
    treatment: string | null;
    /** A risk that is reduced, or not yet decided, asks for a control. One that is retained, shared or avoided does not. */
    asks: boolean;
    met: Met;
  }[];
  /**
   * The controls that act on the element: in it, on a data flow that ends at it, or at the boundary around it.
   * planned: no risk lists it as an existing control yet.
   */
  controls: { controlId: string; where: "here" | "flow" | "boundary"; planned: boolean }[];
  /**
   * gap:      a risk that asks for a control reaches the element, and none acts there or earlier on the route.
   * planned:  only controls that are still proposed stand in the way.
   * before:   nothing acts on the element itself, but every route to it meets a control first.
   * covered:  a control that exists acts there.
   * accepted: the risks that reach it are retained, shared or avoided, and no control that exists acts there.
   */
  state: "gap" | "planned" | "before" | "covered" | "accepted";
  /** The highest value among the risks that are not met. */
  value: number | null;
}

type ReachingRisk = Omit<Coverage["risks"][number], "met">;

/** The elements a risk can be met in. An outside party is not ours to protect, and a flow is covered through its ends. */
const PLACES = ["component", "data_store"];
/** From worst to best. When a risk reaches an element in two ways, the worse of the two counts. */
const WORST_FIRST: Met[] = ["no", "planned", "before", "here"];
const worse = (a: Met, b: Met): Met => (WORST_FIRST.indexOf(a) <= WORST_FIRST.indexOf(b) ? a : b);

/**
 * For every component and data store that a risk reaches: which risks, which controls, and whether it is a gap.
 * values: the risk value of each threat scenario, by threat ID (from the scores).
 */
export function coverage(tara: Tara, values: Map<string, number | null>): Coverage[] {
  const existing = new Set(tara.risks.flatMap((r) => r.existingControlIds));
  const elementById = new Map(tara.elements.map((e) => [e.id, e]));

  /** The controls that act on an element. */
  const acting = (elementId: string): Coverage["controls"] => {
    const element = elementById.get(elementId);
    const found: Coverage["controls"] = [];
    for (const control of tara.controls) {
      const homes = control.elementIds;
      const onFlowToIt =
        element !== undefined &&
        PLACES.includes(element.kind) &&
        homes.some((home) => {
          const flow = elementById.get(home);
          return flow?.kind === "data_flow" && (flow.sourceId === elementId || flow.targetId === elementId);
        });
      const where = homes.includes(elementId)
        ? "here"
        : onFlowToIt
          ? "flow"
          : element?.boundaryId && homes.includes(element.boundaryId)
            ? "boundary"
            : null;
      if (where) found.push({ controlId: control.id, where, planned: !existing.has(control.id) });
    }
    return found;
  };
  const metAt = (elementId: string): Met => {
    const controls = acting(elementId);
    return controls.some((c) => !c.planned) ? "here" : controls.length > 0 ? "planned" : "no";
  };

  // For each element: the risks that reach it, and how each is met there.
  const reached = new Map<string, Map<string, { risk: ReachingRisk; met: Met }>>();
  const reach = (elementId: string, risk: ReachingRisk, met: Met) => {
    const risksHere = reached.get(elementId) ?? new Map<string, { risk: ReachingRisk; met: Met }>();
    const earlier = risksHere.get(risk.riskId);
    risksHere.set(risk.riskId, { risk, met: earlier ? worse(earlier.met, met) : met });
    reached.set(elementId, risksHere);
  };

  for (const r of tara.risks) {
    const threat = tara.threats.find((t) => t.id === r.threatId);
    if (!threat) continue;
    const risk: ReachingRisk = {
      riskId: r.id,
      threatId: r.threatId,
      value: values.get(r.threatId) ?? null,
      treatment: r.treatment,
      asks: r.treatment === null || r.treatment === "reduce",
    };
    const routes = tara.paths
      .filter((p) => p.threatIds.includes(threat.id) && p.disposition !== "screened_out")
      .map((p) => p.elementIds)
      .filter((route) => route.length > 0);

    // Along a route: an element is met by a control on it, or by one the attack has to pass first.
    const routeEnds: Met[] = [];
    for (const route of routes) {
      // What the attack has met by the time it gets this far along the route.
      let soFar = "no" as Met;
      for (const step of route) {
        const own = metAt(step);
        const met: Met =
          own === "here" ? "here" : soFar === "here" ? "before" : own === "planned" || soFar === "planned" ? "planned" : "no";
        reach(step, risk, met);
        soFar = own === "here" || soFar === "here" ? "here" : own === "planned" ? "planned" : soFar;
      }
      routeEnds.push(soFar === "here" ? "before" : soFar);
    }

    // Where the damage is done: the homes of the assets. Met there, or on every route that leads to the damage.
    const onTheWay: Met = routeEnds.length > 0 ? routeEnds.reduce(worse) : "no";
    for (const damage of tara.damages.filter((d) => threat.damageIds.includes(d.id))) {
      const homes = tara.assets.find((a) => a.id === damage.assetId)?.elementIds ?? [];
      for (const home of homes) {
        if (routes.some((route) => route.includes(home))) continue; // already judged on its route
        const own = metAt(home);
        const met: Met =
          own === "here"
            ? "here"
            : onTheWay === "before"
              ? "before"
              : own === "planned" || onTheWay === "planned"
                ? "planned"
                : "no";
        reach(home, risk, met);
      }
    }
  }

  const result: Coverage[] = [];
  for (const element of tara.elements.filter((e) => PLACES.includes(e.kind))) {
    const risksHere = reached.get(element.id);
    if (!risksHere) continue;
    const risks = [...risksHere.values()].map(({ risk, met }) => ({ ...risk, met }));
    const controls = acting(element.id);
    const asking = risks.filter((r) => r.asks);
    const worstMet = asking.length > 0 ? asking.map((r) => r.met).reduce(worse) : null;
    const unmet = asking.filter((r) => r.met === "no" || r.met === "planned");
    const state: Coverage["state"] =
      worstMet === null
        ? controls.some((c) => !c.planned)
          ? "covered"
          : "accepted"
        : worstMet === "no"
          ? "gap"
          : worstMet === "planned"
            ? "planned"
            : worstMet === "before"
              ? "before"
              : "covered";
    const value = unmet.reduce<number | null>(
      (max, r) => (r.value !== null && (max === null || r.value > max) ? r.value : max),
      null,
    );
    result.push({ elementId: element.id, risks, controls, state, value });
  }
  return result;
}
