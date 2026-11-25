// Scoring: how impact, attack feasibility and the risk value follow from what was entered.
//
// These are pure functions of a TARA. The same code runs in the browser, for an immediate answer while
// typing, and on the server, for the report. Nothing here is ever stored: change an input and every value
// that depends on it is simply different the next time it is asked for.
//
//   damage scenario   impact = the highest of its four ratings
//   threat scenario   impact = the highest impact of its damage scenarios
//   attack path       points = the sum of its five factors; feasibility = the band the points fall in
//   risk              feasibility = that of its easiest included attack path
//                     value = the cell of the risk matrix for (impact, feasibility)
//
// docs/method.md explains the method with a worked example.

import {
  FACTOR_KEYS,
  type FactorKey,
  type FeasibilityKey,
  IMPACT_CATEGORY_KEYS,
  type ImpactLevel,
  type Method,
} from "../model/method.ts";
import type { AttackPath, Damage, Tara, Threat } from "../model/tara.ts";

export const isBlank = (value: string | null | undefined): boolean => value == null || value.trim() === "";

/** Why a threat has no impact yet, in the order the reasons are tested. */
export type ImpactPending = "threat_definition" | "damage_links" | "damage_ratings";
/** Why a risk has no attack potential yet. */
export type PotentialPending = "no_paths" | "incomplete_paths" | "no_included_path";
/** Whether an attack path can be used: its inputs are incomplete, it is included, or it is screened out. */
export type PathState = "incomplete" | "included" | "screened_out";

export interface DamageScore {
  /** The security properties lost, for example "I + A". */
  ciaLabel: string;
  /** The highest of the four ratings. Null until the scenario is described and fully rated. */
  score: ImpactLevel | null;
  /** True when the scenario is complete enough to be used by threats. */
  rated: boolean;
}
export interface ThreatScore {
  damageCount: number;
  ratedCount: number;
  /** Linked damage scenarios that are not rated yet. */
  unratedLinks: number;
  maxImpact: { level: ImpactLevel } | { pending: ImpactPending };
}
export interface PathScore {
  points: Record<FactorKey, number | null>;
  totalPoints: number | null;
  feasibility: FeasibilityKey | null;
  state: PathState;
}
export interface RiskScore {
  impact: ThreatScore["maxImpact"];
  linkedPathIds: string[];
  includedPathIds: string[];
  /** The fewest points among the included paths: the easiest way in decides. */
  minAttackPotential: { points: number } | { pending: PotentialPending };
  feasibility: FeasibilityKey | null;
  value: number | null;
}
export interface Scores {
  damages: Map<string, DamageScore>;
  threats: Map<string, ThreatScore>;
  paths: Map<string, PathScore>;
  /** Keyed by threat ID: there is exactly one risk per threat scenario. */
  risks: Map<string, RiskScore>;
}

/** The feasibility for a total of attack potential points: the last band whose lower end the total reaches. */
export function feasibilityForPoints(method: Method, points: number): FeasibilityKey {
  let key: FeasibilityKey = method.feasibility_bands[0]?.key ?? "high";
  for (const band of method.feasibility_bands) if (points >= band.min) key = band.key;
  return key;
}

/** The cell of the risk matrix. Null while either side is unknown. */
export function riskValue(method: Method, impact: ImpactLevel | null, feasibility: FeasibilityKey | null): number | null {
  if (impact === null || feasibility === null) return null;
  return method.risk_matrix[String(impact)]?.[feasibility] ?? null;
}

export function scoreDamage(tara: Tara, damage: Damage): DamageScore {
  const ciaLabel = [damage.confidentiality && "C", damage.integrity && "I", damage.availability && "A"]
    .filter(Boolean)
    .join(" + ");
  const levels = IMPACT_CATEGORY_KEYS.map((key) => damage.ratings[key]);
  const fullyRated = levels.every((level): level is ImpactLevel => level !== null);
  const score = fullyRated && !isBlank(damage.description) ? (Math.max(...(levels as ImpactLevel[])) as ImpactLevel) : null;
  const assetName = damage.assetId === null ? null : (tara.assets.find((a) => a.id === damage.assetId)?.name ?? null);
  const rated = score !== null && !isBlank(assetName) && ciaLabel !== "" && !isBlank(damage.impactRationale);
  return { ciaLabel, score, rated };
}

export function scoreThreat(tara: Tara, threat: Threat, damages: Map<string, DamageScore>): ThreatScore {
  const linked = threat.damageIds.map((id) => damages.get(id)).filter((d): d is DamageScore => d !== undefined);
  const rated = linked.filter((d) => d.rated);
  const damageCount = linked.length;
  const ratedCount = rated.length;
  const unratedLinks = damageCount - ratedCount;
  const categoryKnown = tara.method.threat_categories.some((c) => c.key === threat.category);

  let maxImpact: ThreatScore["maxImpact"];
  if (!categoryKnown || isBlank(threat.description)) maxImpact = { pending: "threat_definition" };
  else if (damageCount === 0) maxImpact = { pending: "damage_links" };
  else if (unratedLinks > 0) maxImpact = { pending: "damage_ratings" };
  else maxImpact = { level: Math.max(...rated.map((d) => d.score as ImpactLevel)) as ImpactLevel };
  return { damageCount, ratedCount, unratedLinks, maxImpact };
}

export function scorePath(tara: Tara, path: AttackPath): PathScore {
  const linked = path.threatIds.length > 0;
  const points = {} as PathScore["points"];
  for (const key of FACTOR_KEYS) {
    const options = tara.method.feasibility_factors.find((f) => f.key === key)?.options ?? [];
    points[key] = linked ? (options.find((o) => o.key === path.factors[key])?.points ?? null) : null;
  }
  const chosen = FACTOR_KEYS.map((key) => points[key]);
  const allChosen = chosen.every((p): p is number => p !== null);
  // A screened-out path is not rated: it has a reason instead of points.
  const totalPoints =
    linked && path.disposition === "included" && allChosen ? (chosen as number[]).reduce((sum, p) => sum + p, 0) : null;
  const feasibility = totalPoints === null ? null : feasibilityForPoints(tara.method, totalPoints);

  const inputsComplete =
    linked &&
    !isBlank(path.description) &&
    !isBlank(path.feasibilityBasis) &&
    (path.disposition === "screened_out" || totalPoints !== null);
  const state: PathState = !inputsComplete ? "incomplete" : path.disposition === "screened_out" ? "screened_out" : "included";
  return { points, totalPoints, feasibility, state };
}

/** The risk of one threat scenario. */
export function scoreRisk(tara: Tara, threat: Threat, threatScore: ThreatScore, paths: Map<string, PathScore>): RiskScore {
  const linked = tara.paths.filter((p) => p.threatIds.includes(threat.id));
  const ready = linked.filter((p) => paths.get(p.id)?.state !== "incomplete");
  const included = linked.filter((p) => paths.get(p.id)?.state === "included");

  let minAttackPotential: RiskScore["minAttackPotential"];
  if (linked.length === 0) minAttackPotential = { pending: "no_paths" };
  else if (ready.length < linked.length) minAttackPotential = { pending: "incomplete_paths" };
  else if (included.length === 0) minAttackPotential = { pending: "no_included_path" };
  else minAttackPotential = { points: Math.min(...included.map((p) => paths.get(p.id)?.totalPoints as number)) };

  const feasibility = "points" in minAttackPotential ? feasibilityForPoints(tara.method, minAttackPotential.points) : null;
  const impactLevel = "level" in threatScore.maxImpact ? threatScore.maxImpact.level : null;
  return {
    impact: threatScore.maxImpact,
    linkedPathIds: linked.map((p) => p.id),
    includedPathIds: included.map((p) => p.id),
    minAttackPotential,
    feasibility,
    value: riskValue(tara.method, impactLevel, feasibility),
  };
}

/** Scores a whole TARA. */
export function score(tara: Tara): Scores {
  const damages = new Map(tara.damages.map((d) => [d.id, scoreDamage(tara, d)]));
  const threats = new Map(tara.threats.map((t) => [t.id, scoreThreat(tara, t, damages)]));
  const paths = new Map(tara.paths.map((p) => [p.id, scorePath(tara, p)]));
  const risks = new Map(tara.threats.map((t) => [t.id, scoreRisk(tara, t, threats.get(t.id) as ThreatScore, paths)]));
  return { damages, threats, paths, risks };
}

/** The words for why a threat has no impact yet. */
export const IMPACT_PENDING_TEXT: Record<ImpactPending, string> = {
  threat_definition: "Waiting for the threat's category and description",
  damage_links: "Waiting for a linked damage scenario",
  damage_ratings: "Waiting for damage ratings and rationale",
};

/** The words for why a risk has no attack feasibility yet. */
export const POTENTIAL_PENDING_TEXT: Record<PotentialPending, string> = {
  no_paths: "Link an attack path",
  incomplete_paths: "Complete the linked attack paths",
  no_included_path: "No included attack path",
};
