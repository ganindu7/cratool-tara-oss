// The scoring method of one TARA: how impact, attack feasibility and risk are rated.
//
// A method is data, never code. Every TARA carries its own copy (tara.method), so an assessment made today
// gives the same values in ten years, whatever the tool's default method has become by then.
// The method shipped with the tool is methods/open-tara-1.0.json.
//
// Records refer to the method by stable keys and levels ("expert", 2), never by the words shown to people,
// so a method can be reworded without touching a single record.

/** Impact level: 0 negligible, 1 moderate, 2 major, 3 severe. */
export type ImpactLevel = 0 | 1 | 2 | 3;
/** Attack feasibility, from most to least feasible. */
export type FeasibilityKey = "high" | "medium" | "low" | "very_low";
/** The four kinds of harm a damage scenario is rated for. */
export type ImpactCategoryKey = "safety" | "financial" | "operational" | "privacy";
/** The five factors of attack potential. */
export type FactorKey = "elapsed_time" | "expertise" | "knowledge" | "window_of_opportunity" | "equipment";
/** What is done about a risk. */
export type TreatmentKey = "avoid" | "reduce" | "share" | "retain";

export const IMPACT_LEVELS: readonly ImpactLevel[] = [0, 1, 2, 3];
export const IMPACT_CATEGORY_KEYS: readonly ImpactCategoryKey[] = ["safety", "financial", "operational", "privacy"];
export const FACTOR_KEYS: readonly FactorKey[] = ["elapsed_time", "expertise", "knowledge", "window_of_opportunity", "equipment"];
export const FEASIBILITY_KEYS: readonly FeasibilityKey[] = ["high", "medium", "low", "very_low"];
export const TREATMENT_KEYS: readonly TreatmentKey[] = ["avoid", "reduce", "share", "retain"];

export interface Method {
  /** The name and version of the method, as shown to people. */
  source?: string;
  /** Where each part of the method comes from, and on what terms it is used. */
  sources?: { part: string; source: string; terms: string }[];
  impact_levels: { level: ImpactLevel; name: string }[];
  impact_categories: {
    key: ImpactCategoryKey;
    label: string;
    /** Whom or what the category is about. */
    heading?: string;
    ratings: { level: ImpactLevel; label: string; criteria: string }[];
  }[];
  feasibility_factors: {
    key: FactorKey;
    label: string;
    description?: string;
    /** The choices of the factor. The more points, the harder the attack. */
    options: { key: string; label: string; points: number; description?: string }[];
  }[];
  /** Ordered from most to least feasible. `min` is the lowest total of points in the band. */
  feasibility_bands: {
    key: FeasibilityKey;
    label: string;
    min: number;
    max?: number;
    /** The attack potential the band stands for, in words. */
    potential?: string;
  }[];
  /** Impact level, then feasibility, to the risk value (1 to 5). */
  risk_matrix: Record<string, Record<FeasibilityKey, number>>;
  threat_categories: { key: string; label: string; description: string }[];
  treatments: { key: TreatmentKey; label: string; description: string }[];
}

const KEY_PATTERN = /^[a-z0-9_]+$/;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const asList = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

/**
 * Says what is wrong with a scoring method, in words; an empty list means it can be used.
 *
 * The shape is fixed by what a TARA records: four impact categories at four levels, five attack potential
 * factors, four feasibility ratings and risk values from 1 to 5. The wording, the options of each factor
 * with their points, the bands and the matrix belong to the method and can be changed freely.
 */
export function validateMethod(candidate: unknown): string[] {
  const problems: string[] = [];
  const method = (candidate ?? {}) as Partial<Method>;

  // Impact: every category rated at every level, with a label and criteria.
  for (const key of IMPACT_CATEGORY_KEYS) {
    const category = asList(method.impact_categories).find((c) => c?.key === key);
    if (!category) {
      problems.push(`The impact category "${key}" is missing.`);
      continue;
    }
    const name = isText(category.label) ? category.label : key;
    if (!isText(category.label)) problems.push(`The impact category "${key}" has no name.`);
    for (const level of IMPACT_LEVELS) {
      const rating = asList(category.ratings).find((r) => r?.level === level);
      if (!rating || !isText(rating.label) || !isText(rating.criteria)) {
        problems.push(`${name}, level ${level}: give a label and the criteria.`);
      }
    }
  }
  if (asList(method.impact_categories).length > IMPACT_CATEGORY_KEYS.length) {
    problems.push("A TARA records four impact categories: safety, financial, operational, privacy. Others cannot be added.");
  }
  for (const level of IMPACT_LEVELS) {
    if (!isText(asList(method.impact_levels).find((l) => l?.level === level)?.name)) {
      problems.push(`Impact level ${level} has no name.`);
    }
  }

  // Attack potential: five factors, each with at least two options that carry points.
  for (const key of FACTOR_KEYS) {
    const factor = asList(method.feasibility_factors).find((f) => f?.key === key);
    if (!factor) {
      problems.push(`The factor "${key}" is missing.`);
      continue;
    }
    const name = isText(factor.label) ? factor.label : key;
    const options = asList(factor.options);
    if (!isText(factor.label)) problems.push(`The factor "${key}" has no name.`);
    if (options.length < 2) problems.push(`${name}: a factor needs at least two options.`);
    const keys = options.map((o) => o?.key);
    if (new Set(keys).size !== keys.length || keys.some((k) => !isText(k) || !KEY_PATTERN.test(k))) {
      problems.push(`${name}: every option needs a key of its own, in small letters, digits and underscores.`);
    }
    for (const option of options) {
      const optionName = isText(option?.label) ? option.label : "an option";
      if (!isText(option?.label)) problems.push(`${name}: an option has no label.`);
      if (!Number.isInteger(option?.points) || option.points < 0 || option.points > 99) {
        problems.push(`${name}, ${optionName}: points are a whole number from 0 to 99.`);
      }
    }
  }

  // Feasibility bands: the four ratings in order, covering every total without gap or overlap.
  const bands = asList(method.feasibility_bands);
  if (bands.length !== 4 || FEASIBILITY_KEYS.some((key, i) => bands[i]?.key !== key)) {
    problems.push("The feasibility ratings are High, Medium, Low and Very low, in that order.");
  } else {
    if (bands[0]?.min !== 0) problems.push("The band High begins at 0 points.");
    bands.forEach((band, i) => {
      if (!isText(band.label)) problems.push("A feasibility rating has no name.");
      const next = bands[i + 1];
      if (!next) {
        if (band.max !== undefined && band.max !== null) {
          problems.push(`${band.label} is the last band and has no upper end.`);
        }
      } else if (band.max === undefined || !Number.isInteger(band.max) || band.max < band.min) {
        problems.push(`${band.label}: the band ends at or after the points it begins at.`);
      } else if (next.min !== band.max + 1) {
        problems.push(`${next.label} begins one point after ${band.label} ends, with no gap and no overlap.`);
      }
    });
  }

  // Risk matrix: a value in every cell, never lower for a worse impact or an easier attack.
  const cell = (impact: number, feasibility: FeasibilityKey) => method.risk_matrix?.[String(impact)]?.[feasibility];
  const isValue = (value: unknown): value is number =>
    Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
  const complete = IMPACT_LEVELS.every((impact) => FEASIBILITY_KEYS.every((f) => isValue(cell(impact, f))));
  if (!complete) {
    problems.push("Every cell of the risk matrix holds a risk value from 1 to 5.");
  } else {
    const value = (impact: number, feasibility: FeasibilityKey) => cell(impact, feasibility) as number;
    const fromHardToEasy = [...FEASIBILITY_KEYS].reverse();
    for (const impact of IMPACT_LEVELS) {
      for (let i = 1; i < fromHardToEasy.length; i++) {
        if (value(impact, fromHardToEasy[i] as FeasibilityKey) < value(impact, fromHardToEasy[i - 1] as FeasibilityKey)) {
          problems.push(
            "In the risk matrix an easier attack must not give a lower value than a harder one with the same impact.",
          );
        }
      }
    }
    for (const feasibility of FEASIBILITY_KEYS) {
      for (const impact of [1, 2, 3]) {
        if (value(impact, feasibility) < value(impact - 1, feasibility)) {
          problems.push(
            "In the risk matrix a worse impact must not give a lower value than a milder one with the same feasibility.",
          );
        }
      }
    }
  }

  // Treatments and threat categories.
  for (const key of TREATMENT_KEYS) {
    const treatment = asList(method.treatments).find((t) => t?.key === key);
    if (!treatment || !isText(treatment.label) || !isText(treatment.description)) {
      problems.push(`The treatment "${key}" needs a name and a description.`);
    }
  }
  const categories = asList(method.threat_categories);
  if (categories.length === 0) problems.push("At least one threat category is needed.");
  const categoryKeys = categories.map((c) => c?.key);
  const categoriesWellFormed = categories.every((c) => isText(c?.key) && KEY_PATTERN.test(c.key) && isText(c.label));
  if (new Set(categoryKeys).size !== categoryKeys.length || !categoriesWellFormed) {
    problems.push("Every threat category needs a name and a key of its own, in small letters, digits and underscores.");
  }

  return [...new Set(problems)];
}
