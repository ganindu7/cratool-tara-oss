// The TARA document: one assessment as one value.
//
// This is the whole data model of the tool, and the file format (docs/data-format.md): what is stored on disk,
// what the API sends, what the rule engine reads and what an export contains are all this one shape.
//
// Three rules keep it simple:
//   1. One ID per record. The ID people see ("TS003") is the ID the links use. It is given once and never
//      changes, so a TARA file can be read, compared and written by hand.
//   2. Only what a person entered is stored. Everything that follows from it (impact, feasibility, risk values,
//      statuses) is worked out by the rule engine each time and is never written down.
//   3. An empty field is null. "Not entered yet" is allowed everywhere; the checks say what is still missing.

import type { FactorKey, FeasibilityKey, ImpactCategoryKey, ImpactLevel, Method, TreatmentKey } from "./method.ts";

/**
 * The name and version of the document format. The number before the point changes when a document of the
 * old form can no longer be read as it is; the number after it when something is added that an earlier
 * version of the tool can do without. `upgrade` and `takeKnown` (validate.ts) say what is done with each.
 */
export const FORMAT_NAME = "open-tara";
export const FORMAT_VERSION = { major: 1, minor: 0 };
export const FORMAT = "open-tara/1.0";

/**
 * The program that wrote a document: a fact about the file, for a person or a program that needs to know
 * what made it. It says nothing about what the file is compatible with: that is for the reader to know.
 */
export interface Writer {
  /** The name of the program: "TARA workbench". */
  tool: string;
  /** Its version, and the version of its rules. */
  version: string;
  rules: string;
}

// ---------------------------------------------------------------------------------------------- the document

export interface Tara {
  format: typeof FORMAT;
  /** The program that last stored the document. Absent in a document that was written by hand. */
  writtenBy?: Writer;
  /** Names the TARA in addresses and on disk. Small letters, digits and hyphens. */
  id: string;
  /**
   * The number of the last change. It goes up by one with every change that is stored, and lets the store
   * notice when two people changed the same thing (docs/architecture.md, "How a change is stored").
   */
  seq: number;
  meta: TaraMeta;
  /** This TARA's own copy of the scoring method. */
  method: Method;
  /** The scope and evidence rows. Every key of SCOPE_KEYS is present. */
  scope: Record<ScopeKey, ScopeEntry>;
  items: Item[];
  elements: Element[];
  assets: Asset[];
  damages: Damage[];
  threats: Threat[];
  paths: AttackPath[];
  /** One risk per threat scenario, created and removed with it. */
  risks: Risk[];
  controls: Control[];
  evidence: Evidence[];
  goalClaims: GoalClaim[];
  /** One decision per essential requirement of CRA Annex I. Always the same 21 entries. */
  craDecisions: CraDecision[];
  references: Reference[];
  /** The reviews recorded, each with the fingerprint of what it covered. */
  reviews: Review[];
  /** How many reviews have been confirmed so far. The next one confirmed gets the next number. */
  reviewCount: number;
  signoffs: Signoff[];
  /** The revision history of the document, as printed in the report. */
  changeLog: ChangeLogEntry[];
  /** The highest number given so far for each ID prefix, so that an ID is never given twice. */
  counters: Record<string, number>;
}

export interface TaraMeta {
  title: string;
  /** The product the assessment is of. TARAs of the same product are listed together. */
  product: string | null;
  /** The organisation named in the report. */
  organisation: string | null;
  documentNumber: string | null;
  /** The revision this TARA is, or will be released as: "0.1", "1.0". */
  revision: string;
  /** A released TARA is frozen: no change is accepted. Work continues in a new revision. */
  status: "draft" | "released";
  /** A training example. Marked as such on screen and in the report. */
  example: boolean;
  /** Where the released document is kept, and who receives it. Printed in the report. */
  storageLocation: string | null;
  distribution: string | null;
  createdAt: string;
  updatedAt: string;
  releasedAt: string | null;
  /** The released TARA this one is the next revision of, and why it was opened. */
  basedOn: { id: string; revision: string } | null;
  revisionReason: string | null;
}

// ------------------------------------------------------------------------------------------------- the records

/** What the assessment is about: a system or function of the product. */
export interface Item {
  id: string;
  name: string | null;
  /** The controlled configuration, drawing or release this definition describes. */
  configurationRef: string | null;
  boundaryFunctions: string | null;
  architectureInterfaces: string | null;
  environmentUse: string | null;
}

export const ELEMENT_KINDS = ["component", "external_interactor", "data_store", "data_flow", "trust_boundary"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** A part of an item's architecture. Together the elements are the data flow diagram. */
export interface Element {
  id: string;
  itemId: string;
  kind: ElementKind;
  name: string | null;
  description: string | null;
  /** The two ends of a data flow. Null for every other kind, and while an end is still open. */
  sourceId: string | null;
  targetId: string | null;
  /** Which way a data flow runs between its ends. */
  direction: "forward" | "backward" | "both" | null;
  /** The trust boundary that contains the element. */
  boundaryId: string | null;
  /** Where the element sits on the diagram, and for a boundary how large it is. Null until it is placed. */
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
}

/** Something of the item worth protecting. */
export interface Asset {
  id: string;
  name: string | null;
  itemId: string | null;
  /** The elements the asset lives in or travels over. */
  elementIds: string[];
  variant: string | null;
  /** Why no damage scenario applies. Needed only for an asset without one. */
  coverageRationale: string | null;
}

/** Who is harmed and how, when an asset loses confidentiality, integrity or availability. */
export interface Damage {
  id: string;
  assetId: string | null;
  confidentiality: boolean;
  integrity: boolean;
  availability: boolean;
  description: string | null;
  ratings: Record<ImpactCategoryKey, ImpactLevel | null>;
  impactRationale: string | null;
}

/** A way an asset could be compromised that leads to damage. */
export interface Threat {
  id: string;
  /** Key of a threat category of the method. */
  category: string | null;
  description: string | null;
  damageIds: string[];
}

/** A concrete way to carry out a threat, rated by how hard it is, or screened out with a reason. */
export interface AttackPath {
  id: string;
  threatIds: string[];
  /** The route through the architecture, in order. The first element is where the attacker gets in. */
  elementIds: string[];
  description: string | null;
  /** Each factor holds the key of an option of the method. */
  factors: Record<FactorKey, string | null>;
  feasibilityBasis: string | null;
  disposition: "included" | "screened_out" | null;
}

/** The risk of one threat scenario: what is done about it, and what remains. Its value is worked out, not stored. */
export interface Risk {
  id: string;
  threatId: string;
  treatment: TreatmentKey | null;
  /** Controls already in the product. Only these can count, once verified. A control is in one list only. */
  existingControlIds: string[];
  /** Controls planned and not yet in the product. */
  proposedControlIds: string[];
  /** Why this treatment, who owns the decision, and the risk that remains once the controls are in place. */
  rationale: string | null;
  owner: string | null;
  reviewDate: string | null;
  residualImpact: ImpactLevel | null;
  residualFeasibility: FeasibilityKey | null;
  residualBasis: string | null;
}

export const CONTROL_TYPES = ["technical", "organisational", "process"] as const;

/** A security measure the product has or will get. */
export interface Control {
  id: string;
  name: string | null;
  description: string | null;
  type: (typeof CONTROL_TYPES)[number] | null;
  /** The requirements of CRA Annex I Part I(2) it may support: letters a to m. */
  craTags: string[];
  coveredPathIds: string[];
  /** Where it acts in the architecture. */
  elementIds: string[];
  /** Where the work on the control is tracked: the address of a ticket, a commit or a pull request. */
  workLink: string | null;
}

/** built: in the code and tested, but not yet in the product in use. It counts for nothing until it is live. */
export const EVIDENCE_STATES = ["planned", "built", "implemented", "verified", "failed"] as const;

/** What one control achieves for one risk, where it is implemented, and the test that showed it. */
export interface Evidence {
  id: string;
  riskId: string;
  controlId: string;
  /** Must be the configuration ID given in the scope. */
  configurationId: string | null;
  state: (typeof EVIDENCE_STATES)[number];
  effect: string | null;
  implementationRef: string | null;
  verificationRef: string | null;
  result: "pass" | "fail" | null;
  verifiedCraTags: string[];
}

/** A goal says what must be achieved to reduce a risk; a claim says why a retained or shared risk is acceptable. */
export interface GoalClaim {
  id: string;
  kind: "goal" | "claim";
  statement: string | null;
  riskIds: string[];
}

export interface CraDecision {
  id: string;
  /** "a" to "m" for Annex I Part I(2); "II(1)" to "II(8)" for Part II. */
  requirementKey: string;
  applicability: "applies" | "does_not_apply" | null;
  justification: string | null;
  implementationRef: string | null;
  verificationRef: string | null;
}

/** A document the assessment relies on. Text fields cite it by its ID. */
export interface Reference {
  id: string;
  title: string | null;
  revision: string | null;
  date: string | null;
  /** A document number, a folder, or a link that opens it. */
  location: string | null;
  /** The text itself, where it is short enough to keep here. */
  content: string | null;
}

// ----------------------------------------------------------------------------------------- scope and evidence

/** Scope fields whose evidence reference is required. */
export const SCOPE_FIELDS_EVIDENCE_REQUIRED = ["configuration_id", "scoring_method"] as const;
/** Scope fields whose evidence reference is welcome but not required. */
export const SCOPE_FIELDS_EVIDENCE_OPTIONAL = [
  "variant_boundary",
  "intended_use",
  "architecture_trust_boundaries",
  "lifecycle_support",
  "product_market_context",
  "assumptions_exclusions",
  "reassessment_triggers",
] as const;
/** Scope fields that decide whether a regulation or standard applies: "in_scope" or "out_of_scope". */
export const SCOPE_FIELDS_APPLICABILITY = ["cra_applicability", "iso21434_applicability", "r155_applicability"] as const;
export const SCOPE_FIELD_KEYS = [
  ...SCOPE_FIELDS_EVIDENCE_REQUIRED,
  ...SCOPE_FIELDS_EVIDENCE_OPTIONAL,
  ...SCOPE_FIELDS_APPLICABILITY,
] as const;
/** The evidence the assessment hands over at release: one row per obligation. */
export const EVIDENCE_ROW_KEYS = [
  "cra_annex_i_part_i_1",
  "cra_annex_i_part_ii",
  "cra_annex_vii",
  "iso_work_products",
  "vehicle_supplier_evidence",
] as const;
export type ScopeFieldKey = (typeof SCOPE_FIELD_KEYS)[number];
export type EvidenceRowKey = (typeof EVIDENCE_ROW_KEYS)[number];
/** scope_review and release_review hold the outcome of that review; its reference is the review record. */
export type ScopeKey = ScopeFieldKey | EvidenceRowKey | "scope_review" | "release_review";
export const SCOPE_KEYS: readonly ScopeKey[] = [...SCOPE_FIELD_KEYS, "scope_review", ...EVIDENCE_ROW_KEYS, "release_review"];

export interface ScopeEntry {
  decision: string | null;
  evidence: string | null;
}

// ------------------------------------------------------------------------------------- reviews and sign-off

export const REVIEW_KINDS = [
  "scope",
  "release",
  "attack_path",
  "risk_rating",
  "goal_claim",
  "control_evidence",
  "treatment",
  "cra_requirement",
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/**
 * A review of one record. The reference names the record of the review (minutes, an approval number).
 * Once confirmed it carries the fingerprint of everything the review covered; when that content changes,
 * the fingerprint no longer matches and the review has to be confirmed again (rules/reviews.ts).
 */
export interface Review {
  kind: ReviewKind;
  /** The reviewed record. Null for the scope and release reviews, which cover the whole TARA. */
  subjectId: string | null;
  reference: string;
  fingerprint: string | null;
  /** The order in which reviews were confirmed, from one counter per TARA. Part of what later reviews cover. */
  revision: number | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export const SIGNOFF_ROLES = ["author", "reviewer", "approver"] as const;
export type SignoffRole = (typeof SIGNOFF_ROLES)[number];

export interface Signoff {
  role: SignoffRole;
  name: string;
  roleTitle: string | null;
  evidenceRef: string | null;
  signedAt: string;
  /** The fingerprint of the assessment as it stood when signed. A later change asks for a new signature. */
  fingerprint: string | null;
}

export interface ChangeLogEntry {
  version: string | null;
  date: string | null;
  author: string | null;
  description: string | null;
  approvedBy: string | null;
}

// ----------------------------------------------------------------------------------------------- collections

/** The lists of records in a TARA. A record's kind is the name of its list. */
export const RECORD_KINDS = [
  "items",
  "elements",
  "assets",
  "damages",
  "threats",
  "paths",
  "risks",
  "controls",
  "evidence",
  "goalClaims",
  "craDecisions",
  "references",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** Any record: all of them have an ID. */
export type AnyRecord = { id: string } & Record<string, unknown>;

/** The list of one kind, typed loosely for code that treats every kind alike. */
export const recordsOf = (tara: Tara, kind: RecordKind): AnyRecord[] => tara[kind] as unknown as AnyRecord[];

/** Finds a record of any kind by its ID. IDs are unique across the whole TARA. */
export function findRecord(tara: Tara, id: string): { kind: RecordKind; record: AnyRecord } | null {
  for (const kind of RECORD_KINDS) {
    const record = recordsOf(tara, kind).find((r) => r.id === id);
    if (record) return { kind, record };
  }
  return null;
}
