// The ratings of a record, as they are drawn: what a damage scenario loses and how hard it hits in each of
// the four categories, how feasible an attack path is, and how the value of a risk comes about from its impact
// and feasibility. Here is what the ratings are; a screen draws them.
//
// Only ratings are drawn. A field of a form that is a link is already a line of a drawing, and a text stays a
// text. A rating is so many steps, so many of them filled, and more ink is more risk: a higher impact, a more
// feasible attack. One that is not rated yet is left open.
//
// No screen code here, so that this can be tested.

import {
  bandName,
  CONTROL_STATE_LABELS,
  controlState,
  type Element,
  IMPACT_PENDING_TEXT,
  levelName,
  type Method,
  POTENTIAL_PENDING_TEXT,
  type RiskScore,
  type Scores,
  type Tara,
} from "@tara/core";
import type { GraphKind } from "./graph.ts";

// ------------------------------------------------------------------------------------------------ the meters

/** The steps an impact has above none: moderate, major, severe. */
export const IMPACT_STEPS = 3;

/**
 * A rating as so many steps, so many of them filled.
 * filled null: not rated yet. says: the same in words. sets: among several, the one that decides the result.
 */
export interface Meter {
  label: string;
  steps: number;
  filled: number | null;
  says: string;
  sets?: boolean;
}
/** A meter without its label, for a line that names it otherwise. */
export type Gauge = Pick<Meter, "steps" | "filled" | "says">;

/** How far a feasibility fills its meter. The bands of a method stand from the most to the least feasible: the first fills it. */
function bandFill(method: Method, key: string | null): number | null {
  const position = method.feasibility_bands.findIndex((band) => band.key === key);
  return position < 0 ? null : method.feasibility_bands.length - position;
}

const impactGauge = (filled: number | null, says: string): Gauge => ({ steps: IMPACT_STEPS, filled, says });
const feasibilityGauge = (method: Method, filled: number | null, says: string): Gauge => ({
  steps: method.feasibility_bands.length,
  filled,
  says,
});

// ----------------------------------------------------------------------------------------- a damage scenario

/** A security property, and whether the scenario loses it. */
export interface LostProperty {
  letter: string;
  name: string;
  on: boolean;
}

/** A damage scenario: the security properties it loses, and its level in each impact category. */
export function damageRatings(tara: Tara, scores: Scores, id: string) {
  const damage = tara.damages.find((candidate) => candidate.id === id);
  if (!damage) return null;
  const lost: LostProperty[] = [
    { letter: "C", name: "Confidentiality", on: damage.confidentiality },
    { letter: "I", name: "Integrity", on: damage.integrity },
    { letter: "A", name: "Availability", on: damage.availability },
  ];
  const named = lost.filter((property) => property.on).map((property) => property.name.toLowerCase());
  // the category that stands out is the highest one rated so far, so that it shows before every category is rated
  const highest = Math.max(0, ...tara.method.impact_categories.map((category) => damage.ratings[category.key] ?? 0));
  const rated = tara.method.impact_categories.map((category) => {
    const level = damage.ratings[category.key] ?? null;
    const label = category.ratings.find((rating) => rating.level === level)?.label ?? null;
    return {
      key: category.key,
      name: category.label,
      level,
      label,
      says: `${category.label}: ${label ?? "not rated yet"}`,
      sets: level !== null && level > 0 && level === highest,
    };
  });
  return {
    lost,
    lostSays: named.length > 0 ? `Lost: ${named.join(", ")}` : "No security property is marked as lost",
    rated,
    /** The impact of the scenario, once the rules can give it. */
    impact: scores.damages.get(id)?.score ?? null,
    rationale: (damage.impactRationale ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------------------------- an attack path

/** An attack path: the option chosen for each factor with its points, their sum, and the band of the method the sum falls in. */
export function pathRatings(tara: Tara, scores: Scores, id: string) {
  const path = tara.paths.find((candidate) => candidate.id === id);
  if (!path) return null;
  const method = tara.method;
  const score = scores.paths.get(id);
  const points = score?.totalPoints ?? null;
  const feasibility = score?.feasibility ?? null;
  return {
    /** It does not count towards the risk, and is not rated. */
    screened: path.disposition === "screened_out",
    points,
    feasibility,
    filled: bandFill(method, feasibility),
    says: feasibility ? `Feasibility: ${bandName(method, feasibility)}, ${points} points` : "Feasibility: not rated yet",
    factors: method.feasibility_factors.map((factor) => {
      const option = factor.options.find((candidate) => candidate.key === path.factors[factor.key]);
      return { key: factor.key, name: factor.label, option: option?.label ?? null, points: option?.points ?? null };
    }),
    bands: method.feasibility_bands.map((band) => ({
      key: band.key,
      name: band.label,
      range: band.max === undefined ? `from ${band.min}` : `${band.min} to ${band.max}`,
      on: band.key === feasibility,
    })),
    rationale: (path.feasibilityBasis ?? "").trim(),
  };
}

// ------------------------------------------------------------------------------------------------------ a risk

/** The matrix of the method, as it is drawn: the feasibility grows to the right and the impact upwards. */
export interface DrawnMatrix {
  columns: string[];
  rows: { name: string; cells: { value: number | null; here: boolean; says: string }[] }[];
}

/** The feasibility of a risk in words: its band with the fewest points among its paths, or what is still missing. */
function feasibilityInWords(method: Method, band: string | null, potential: RiskScore["minAttackPotential"]): string {
  if (!band) return "pending" in potential ? POTENTIAL_PENDING_TEXT[potential.pending] : "not rated yet";
  return `${bandName(method, band)}${"points" in potential ? `, ${potential.points} points` : ""}`;
}

/** A risk: its impact, its feasibility, and the matrix of the method with its place in it. */
export function riskRatings(tara: Tara, scores: Scores, id: string) {
  const risk = tara.risks.find((candidate) => candidate.id === id);
  const score = risk && scores.risks.get(risk.threatId);
  if (!risk || !score) return null;
  const method = tara.method;
  const level = "level" in score.impact ? score.impact.level : null;
  const band = score.feasibility;
  const impact =
    "level" in score.impact ? (levelName(method, score.impact.level) ?? "") : IMPACT_PENDING_TEXT[score.impact.pending];
  const feasibility = feasibilityInWords(method, band, score.minAttackPotential);
  // so that the risk grows towards the upper right corner
  const across = [...method.feasibility_bands].reverse();
  const down = [...method.impact_levels].sort((a, b) => b.level - a.level);
  const matrix: DrawnMatrix = {
    columns: across.map((each) => each.label),
    rows: down.map((row) => ({
      name: row.name,
      cells: across.map((each) => {
        const value = method.risk_matrix[String(row.level)]?.[each.key] ?? null;
        const says = `${row.name} impact, ${each.label.toLowerCase()} feasibility: ${value}`;
        return { value, here: row.level === level && each.key === band, says };
      }),
    })),
  };
  return {
    value: score.value,
    impact: { filled: level, words: impact, says: `Impact: ${impact}` },
    feasibility: { filled: bandFill(method, band), words: feasibility, says: `Feasibility: ${feasibility}` },
    matrix,
  };
}

// --------------------------------------------------------------------------------- the ratings on the record itself

/** The ratings of a record as one line on the record itself. */
export interface Strip {
  /** The security properties, the lost ones on. */
  lost?: LostProperty[];
  lostSays?: string;
  meters: Meter[];
  /** A few words after the meters. */
  note?: string;
}

/** null: a record of this kind has no ratings, or this one has none to show (an attack path that is screened out). */
export function stripOf(tara: Tara, scores: Scores, kind: GraphKind, id: string): Strip | null {
  if (kind === "damages") {
    const ratings = damageRatings(tara, scores, id);
    if (!ratings) return null;
    const meters = ratings.rated.map((category) => ({
      label: category.name[0] ?? "",
      ...impactGauge(category.level, category.says),
      sets: category.sets,
    }));
    return { lost: ratings.lost, lostSays: ratings.lostSays, meters };
  }
  if (kind === "paths") {
    const ratings = pathRatings(tara, scores, id);
    if (!ratings || ratings.screened) return null;
    const meter = { label: "Feasibility", ...feasibilityGauge(tara.method, ratings.filled, ratings.says) };
    return { meters: [meter], ...(ratings.points !== null ? { note: `${ratings.points} points` } : {}) };
  }
  if (kind === "risks") {
    const ratings = riskRatings(tara, scores, id);
    if (!ratings) return null;
    return {
      meters: [
        { label: "Impact", ...impactGauge(ratings.impact.filled, ratings.impact.says) },
        { label: "Feasibility", ...feasibilityGauge(tara.method, ratings.feasibility.filled, ratings.feasibility.says) },
      ],
    };
  }
  return null;
}

// ----------------------------------------------------------------------------------------- what a record is made of

/** One line of what a record is made of: a name, and its value drawn, in words, or both. */
export interface Part {
  name: string;
  meter?: Gauge;
  /** The security properties, the lost ones on. */
  lost?: { letter: string; on: boolean }[];
  words?: string;
  /** A number at the end of the line: the points of a factor. */
  points?: number | null;
  /** Among several, the one that decides the result. */
  sets?: boolean;
}

/** What a record is made of. matrix: for a risk, the matrix of the method with its place in it. */
export interface Composition {
  parts: Part[];
  matrix?: DrawnMatrix;
}

const NOTHING: Composition = { parts: [] };

/** A line, or none where there is nothing to say. */
const part = (name: string, words: string | null | undefined, more: Partial<Part> = {}): Part[] =>
  words ? [{ name, words, ...more }] : [];

/** A record by its ID and name: "IT01 Kettle". */
const named = (id: string | null, name: string | null | undefined): string | null => (id ? `${id} ${name ?? ""}`.trim() : null);

function damageParts(tara: Tara, scores: Scores, id: string): Composition {
  const ratings = damageRatings(tara, scores, id);
  if (!ratings) return NOTHING;
  const lostNames = ratings.lost.filter((property) => property.on).map((property) => property.name);
  const lost: Part = {
    name: "Lost",
    lost: ratings.lost.map((property) => ({ letter: property.letter, on: property.on })),
    words: lostNames.join(", ") || "Nothing marked yet",
  };
  // of the words of a rating only its code and level are shown ("S2 Major"), without its criteria
  const categories = ratings.rated.map((category) => ({
    name: category.name,
    meter: impactGauge(category.level, category.says),
    words: category.label ? (category.label.split(": ")[0] ?? category.label) : "Not rated yet",
    sets: category.sets,
  }));
  return { parts: [lost, ...categories] };
}

function pathParts(tara: Tara, scores: Scores, id: string): Composition {
  const ratings = pathRatings(tara, scores, id);
  if (!ratings) return NOTHING;
  if (ratings.screened) return { parts: part("Counted", "No: it is screened out") };
  const factors = ratings.factors.map((factor) => ({
    name: factor.name,
    words: factor.option ?? "Not chosen yet",
    points: factor.points,
  }));
  const words = ratings.feasibility ? `${bandName(tara.method, ratings.feasibility)}, ${ratings.points} points` : "Not rated yet";
  const feasibility: Part = {
    name: "Feasibility",
    meter: feasibilityGauge(tara.method, ratings.filled, ratings.says),
    words,
    sets: true,
  };
  return { parts: [...factors, feasibility] };
}

function riskParts(tara: Tara, scores: Scores, id: string): Composition {
  const ratings = riskRatings(tara, scores, id);
  if (!ratings) return NOTHING;
  const { impact, feasibility } = ratings;
  const treatment = tara.risks.find((risk) => risk.id === id)?.treatment;
  return {
    matrix: ratings.matrix,
    parts: [
      { name: "Impact", meter: impactGauge(impact.filled, impact.says), words: impact.words },
      {
        name: "Feasibility",
        meter: feasibilityGauge(tara.method, feasibility.filled, feasibility.says),
        words: feasibility.words,
      },
      { name: "Treatment", words: tara.method.treatments.find((each) => each.key === treatment)?.label ?? "Not decided yet" },
    ],
  };
}

function threatParts(tara: Tara, scores: Scores, id: string): Composition {
  const threat = tara.threats.find((candidate) => candidate.id === id);
  if (!threat) return NOTHING;
  const highest = scores.threats.get(id)?.maxImpact;
  const level = highest && "level" in highest ? highest.level : null;
  const pending = highest && "pending" in highest ? IMPACT_PENDING_TEXT[highest.pending] : null;
  const words = level !== null ? levelName(tara.method, level) : pending;
  const category = tara.method.threat_categories.find((each) => each.key === threat.category)?.label ?? "Not chosen yet";
  return {
    parts: [
      ...part("Category", category),
      ...part("Highest impact", words, { meter: impactGauge(level, `Highest impact: ${words}`) }),
    ],
  };
}

function controlParts(tara: Tara, id: string): Composition {
  const control = tara.controls.find((candidate) => candidate.id === id);
  if (!control) return NOTHING;
  const type = control.type && control.type.charAt(0).toUpperCase() + control.type.slice(1);
  const requirements = control.craTags.map((key) => `(${key})`).join(", ");
  return {
    parts: [
      ...part("State", CONTROL_STATE_LABELS[controlState(tara, id)]),
      ...part("Type", type),
      ...part("CRA Annex I", requirements),
    ],
  };
}

function assetParts(tara: Tara, id: string): Composition {
  const asset = tara.assets.find((candidate) => candidate.id === id);
  if (!asset) return NOTHING;
  const item = tara.items.find((candidate) => candidate.id === asset.itemId);
  return { parts: [...part("Item", named(asset.itemId, item?.name)), ...part("Variant", asset.variant)] };
}

/** Which way a data flow carries, in words. null: the element is not a data flow. */
function carries(element: Element): string | null {
  if (element.kind !== "data_flow") return null;
  const end = (id: string | null) => id ?? "an open end";
  if (element.direction === "both") return "Both ways";
  if (element.direction === "forward") return `From ${end(element.sourceId)} to ${end(element.targetId)}`;
  if (element.direction === "backward") return `From ${end(element.targetId)} to ${end(element.sourceId)}`;
  return "The direction is not recorded";
}

function elementParts(tara: Tara, id: string): Composition {
  const element = tara.elements.find((candidate) => candidate.id === id);
  if (!element) return NOTHING;
  const item = tara.items.find((candidate) => candidate.id === element.itemId);
  const boundary = tara.elements.find((candidate) => candidate.id === element.boundaryId);
  return {
    parts: [
      ...part("Carries", carries(element)),
      ...part("Item", named(element.itemId, item?.name)),
      ...part("Inside", named(element.boundaryId, boundary?.name)),
    ],
  };
}

function goalParts(tara: Tara, id: string): Composition {
  const goal = tara.goalClaims.find((candidate) => candidate.id === id);
  if (!goal) return NOTHING;
  const isClaim = goal.kind === "claim";
  return {
    parts: part(
      "Kind",
      isClaim ? "Claim: why a retained or shared risk is acceptable" : "Goal: what must be achieved to reduce a risk",
    ),
  };
}

/**
 * What a record is made of, as the block in the middle of its ego view shows it: the fields of its form that
 * say what it is, with the ratings drawn. What it is linked to is not among them: that stands around the
 * block. Nor is the record's own wording: the block shows that above.
 */
export function compositionOf(tara: Tara, scores: Scores, kind: GraphKind, id: string): Composition {
  switch (kind) {
    case "damages":
      return damageParts(tara, scores, id);
    case "paths":
      return pathParts(tara, scores, id);
    case "risks":
      return riskParts(tara, scores, id);
    case "threats":
      return threatParts(tara, scores, id);
    case "controls":
      return controlParts(tara, id);
    case "assets":
      return assetParts(tara, id);
    case "elements":
      return elementParts(tara, id);
    case "goalClaims":
      return goalParts(tara, id);
    case "items":
      return NOTHING;
  }
}
