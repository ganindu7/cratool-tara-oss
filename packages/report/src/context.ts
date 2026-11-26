// What every section of the report needs: the TARA, everything the rule engine says about it, and the words
// for its values. Made once per report (build.ts) and passed to each section.

import {
  type Assessment,
  assess,
  bandName,
  type CheckedStep,
  type Checks,
  EVIDENCE_ROW_KEYS,
  type Finding,
  findings,
  IMPACT_PENDING_TEXT,
  levelName,
  type Method,
  POTENTIAL_PENDING_TEXT,
  type ReviewKind,
  type Risk,
  type RiskScore,
  riskValue,
  SCOPE_NAMES,
  type ScopeKey,
  type Scores,
  type Status,
  type Tara,
} from "@tara/core";
import type { Block, Column, Figure, ReportOptions } from "./model.ts";

/** The sections, in order. A section's number in the report is its position here. */
export const ORDER = [
  "summary",
  "cra_reference",
  "document_control",
  "scope",
  "method",
  "items",
  "damages",
  "impact",
  "threats",
  "paths",
  "feasibility",
  "risks",
  "treatment",
  "goals",
  "controls",
  "reviews",
  "cra",
  "open",
  "references",
  "trace",
] as const;
/** The key of one section of the report. `sec` turns it into the number of the section, for sentences that point at one. */
export type SectionKey = (typeof ORDER)[number];

/** What stands in a cell that has nothing to say. */
export const NONE = "-";

/** What each row of the scope is called in the report: in the tables of the scope, and in the list of open points. */
export const SCOPE_LABELS: Record<ScopeKey, string> = SCOPE_NAMES;

/** What each kind of review is called in the report: the subject of a row in the table of reviews recorded. */
export const REVIEW_KIND_TEXT: Record<ReviewKind, string> = {
  scope: "Scope and scoring method",
  release: "Product release",
  attack_path: "Attack path",
  risk_rating: "Risk rating",
  goal_claim: "Goal or claim",
  control_evidence: "Control evidence",
  treatment: "Treatment decision",
  cra_requirement: "CRA requirement",
};

const APPLICABILITY_TEXT: Record<string, string> = { in_scope: "In scope", out_of_scope: "Out of scope", pending: "Pending" };

/** The areas the open points and the progress figure are counted by, in the order of the work. */
const AREA_OF_STEP: Record<CheckedStep, string> = {
  scope: "Scope",
  items: "Items",
  architecture: "Architecture",
  assets: "Assets",
  damages: "Damage scenarios",
  threats: "Threat scenarios",
  paths: "Attack paths",
  risks: "Risk ratings",
  controls: "Controls",
  treatment: "Risk treatment",
  goals: "Goals and claims",
  evidence: "Control evidence",
  cra: "CRA requirements",
  release: "Release",
};

// ------------------------------------------------------------------------------------------ building blocks

/** A column of a table. Unless a width is given, it shares the width that the other columns leave. */
export const col = (header: string, width: Column["width"] = "wrap"): Column => ({ header, width });
/** A paragraph. The text is given plain: the layout escapes it, and makes links of the record IDs and web addresses in it. */
export const p = (text: string): Block => ({ kind: "paragraph", text });
/** A paragraph that must not be overlooked, such as the one that says the document is a draft. */
export const notice = (text: string): Block => ({ kind: "notice", text });
/** A figure with its caption. note: what is said under it, such as how the figure is read. */
export const figure = (caption: string, content: Figure, note?: string): Block => ({
  kind: "figure",
  caption,
  figure: content,
  ...(note ? { note } : {}),
});

/** A table. defines: its first column holds IDs that are defined here. */
export function table(
  caption: string,
  columns: Column[],
  rows: string[][],
  more: { empty?: string; defines?: boolean; anchor?: string; rowIds?: string[] } = {},
): Block {
  return {
    kind: "table",
    caption,
    columns,
    rows,
    empty: more.empty ?? "None recorded.",
    ...(more.defines ? { definesRows: true } : {}),
    ...(more.anchor ? { anchor: more.anchor } : {}),
    ...(more.rowIds ? { rowIds: more.rowIds } : {}),
  };
}

/** A moment given as an ISO date and time, as it is printed: "2026-11-25 18:00 UTC". Anything else is printed as it is. */
export function moment(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : `${time.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** A value as text; a dash for nothing. */
export const show = (value: string | number | null | undefined): string =>
  value == null || String(value).trim() === "" ? NONE : String(value);

// ------------------------------------------------------------------------------------------------- context

/** The checks that are not done, as the report lists them, with the count of every check by area for the figure of progress. */
export interface OpenPoints {
  /** Area, records, status, kind: records of one area with the same status share a row. */
  rows: string[][];
  count: number;
  /** For each area: how many of its checks are done, wait, or need input. */
  tally: Map<string, { done: number; waiting: number; todo: number }>;
}

/**
 * What a section is given to write itself from: the TARA, what the rule engine says about it, and helpers that
 * put its values into the words of the report. `reportContext` makes one for each report.
 */
export interface ReportContext {
  tara: Tara;
  options: ReportOptions;
  assessment: Assessment;
  checks: Checks;
  scores: Scores;
  method: Method;
  /** Not released. */
  draft: boolean;
  /** The configuration assessed, or a dash. */
  configuration: string;
  /** The numbers of sections, for sentences that point at them: "6, 7". */
  sec: (...keys: SectionKey[]) => string;
  ids: (recordIds: string[]) => string;
  levelName: (level: number | null | undefined) => string;
  feasibilityName: (key: string | null | undefined) => string;
  treatmentName: (key: string | null) => string;
  categoryName: (key: string | null) => string;
  /** The decision of a scope row, with an applicability decision in words. */
  decisionText: (key: ScopeKey) => string;
  /** The score of the risk of a threat scenario. */
  riskScore: (threatId: string) => RiskScore;
  /** The impact of a risk in words, or why it has none yet. */
  riskImpact: (threatId: string) => string;
  /** The lowest attack potential of a risk, or why it has none yet. */
  riskPoints: (threatId: string) => string;
  /** The value that remains after treatment, where both residual ratings are given. */
  residualValue: (risk: Risk) => number | null;
  message: (status: Status | null | undefined) => string;
  /** The reference of a recorded review. */
  reviewReference: (kind: ReviewKind, subjectId: string | null) => string;
  open: OpenPoints;
  /** The risks whose rating is reviewed. */
  reviewedRiskIds: Set<string>;
}

/** The name of the record a finding is about, as the open points list it. */
function findingName(tara: Tara, finding: Finding): string {
  if (finding.scopeKey) return SCOPE_LABELS[finding.scopeKey];
  const id = finding.recordId ?? NONE;
  if (finding.step === "evidence") {
    const evidence = tara.evidence.find((e) => e.id === id);
    return evidence ? `${id} (${evidence.riskId} / ${evidence.controlId})` : id;
  }
  if (finding.step === "cra") return tara.craDecisions.find((d) => d.id === id)?.requirementKey ?? id;
  return id;
}

function openPoints(tara: Tara, checks: Checks): OpenPoints {
  const rows: string[][] = [];
  const tally: OpenPoints["tally"] = new Map();
  let count = 0;
  for (const finding of findings(checks)) {
    const isHandover = finding.scopeKey !== undefined && (EVIDENCE_ROW_KEYS as readonly string[]).includes(finding.scopeKey);
    const area = isHandover ? "Evidence" : AREA_OF_STEP[finding.step];
    const counted = tally.get(area) ?? { done: 0, waiting: 0, todo: 0 };
    counted[finding.status.kind] += 1;
    tally.set(area, counted);
    if (finding.status.kind === "done") continue;
    count += 1;
    const name = findingName(tara, finding);
    const row = rows.find((r) => r[0] === area && r[2] === finding.status.message);
    if (row) row[1] += `, ${name}`;
    else rows.push([area, name, finding.status.message, finding.status.kind === "todo" ? "Input needed" : "Awaiting review"]);
  }
  return { rows, count, tally };
}

/** Works out everything the sections share. */
export function reportContext(tara: Tara, options: ReportOptions): ReportContext {
  const assessment = assess(tara);
  const { checks } = assessment;
  const scores = checks.scores;
  const method = tara.method;
  const riskScore = (threatId: string): RiskScore =>
    scores.risks.get(threatId) ?? {
      impact: { pending: "threat_definition" },
      linkedPathIds: [],
      includedPathIds: [],
      minAttackPotential: { pending: "no_paths" },
      feasibility: null,
      value: null,
    };
  return {
    tara,
    options,
    assessment,
    checks,
    scores,
    method,
    draft: tara.meta.status !== "released",
    configuration: show(tara.scope.configuration_id.decision),
    sec: (...keys) => keys.map((key) => String(ORDER.indexOf(key) + 1)).join(", "),
    ids: (recordIds) => (recordIds.length > 0 ? recordIds.join(", ") : NONE),
    levelName: (level) => levelName(method, level) ?? NONE,
    feasibilityName: (key) => bandName(method, key) ?? NONE,
    treatmentName: (key) => (key == null ? NONE : (method.treatments.find((t) => t.key === key)?.label ?? key)),
    categoryName: (key) => (key == null ? NONE : (method.threat_categories.find((c) => c.key === key)?.label ?? key)),
    decisionText: (key) => {
      const decision = tara.scope[key].decision;
      return key.endsWith("_applicability") ? (APPLICABILITY_TEXT[decision ?? "pending"] ?? show(decision)) : show(decision);
    },
    riskScore,
    riskImpact: (threatId) => {
      const impact = riskScore(threatId).impact;
      const level = "level" in impact ? impact.level : null;
      if (level !== null) return method.impact_levels.find((l) => l.level === level)?.name ?? String(level);
      return "pending" in impact ? IMPACT_PENDING_TEXT[impact.pending] : NONE;
    },
    riskPoints: (threatId) => {
      const potential = riskScore(threatId).minAttackPotential;
      return "points" in potential ? String(potential.points) : POTENTIAL_PENDING_TEXT[potential.pending];
    },
    residualValue: (risk) => riskValue(method, risk.residualImpact, risk.residualFeasibility),
    message: (status) => status?.message ?? NONE,
    reviewReference: (kind, subjectId) => show(tara.reviews.find((r) => r.kind === kind && r.subjectId === subjectId)?.reference),
    open: openPoints(tara, checks),
    reviewedRiskIds: new Set(tara.risks.filter((r) => checks.riskRating.get(r.id)?.code === "rating.reviewed").map((r) => r.id)),
  };
}
