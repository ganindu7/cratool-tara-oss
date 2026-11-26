// What every kind of record is made of: its fields, what each field may hold, and how its IDs are formed.
//
// This table is the single description of the records. Validation (validate.ts), the change operations
// (changes/apply.ts) and the removal rules all read it, so a field is described once and cannot be validated
// one way and changed another. To add a field: add it to the interface in tara.ts and to the table here.
// docs/architecture.md, "Adding a field", walks through it.

import { CRA_TAGS } from "./cra.ts";
import { FACTOR_KEYS, type FactorKey, FEASIBILITY_KEYS, IMPACT_CATEGORY_KEYS } from "./method.ts";
import {
  type AnyRecord,
  CONTROL_TYPES,
  ELEMENT_KINDS,
  type ElementKind,
  EVIDENCE_STATES,
  type RecordKind,
  type ScopeKey,
} from "./tara.ts";

/** What a field may hold. Unless `required`, every field may also be null: "not entered yet". */
export type FieldType =
  | { type: "text" }
  | { type: "boolean" }
  /** A calendar day, written YYYY-MM-DD. */
  | { type: "date" }
  /** An address on the web: http:// or https://. */
  | { type: "url" }
  | { type: "number" }
  /** An impact level, 0 to 3. */
  | { type: "level" }
  | { type: "enum"; values: readonly string[] }
  /** The key of an entry of the TARA's own scoring method: a threat category, a treatment, or an option of a factor. */
  | { type: "method"; list: "threat_categories" | "treatments" | FactorKey }
  /** A set of values from a fixed list. */
  | { type: "tags"; values: readonly string[] }
  /** The ID of one record of another kind. */
  | { type: "ref"; to: RecordKind }
  /** The IDs of several records of another kind, without repeats. */
  | { type: "refs"; to: RecordKind };

/** One field of a kind of record: what it may hold, and how it behaves when a record is added, changed or removed. */
export type FieldSpec = FieldType & {
  /** Must be given when the record is added, and is never null. */
  required?: boolean;
  /** Given when the record is added and fixed from then on. */
  fixed?: boolean;
  /** The value a new record starts with, where that is not "empty". */
  initial?: unknown;
  /**
   * For a ref: this record cannot exist without the one it points to. The record pointed to cannot be removed
   * while this one exists. (An ordinary link is simply taken away when its target is removed.)
   */
  owned?: boolean;
  /** Where something is drawn, not what it is. Left out of reviews and shown apart in the history. */
  layout?: boolean;
};

/** What is known about one kind of record: what a record is called, how its IDs are formed, and its fields. */
export interface KindSpec {
  /** What one record is called in a sentence. */
  noun: string;
  /**
   * How IDs are formed: a prefix and a number padded to `digits`. The prefix can follow from the new record's
   * values (an element's from its kind). Null: records of this kind are not added by hand.
   */
  id: { prefix: string | ((values: Record<string, unknown>) => string | null); digits: number } | null;
  /** A person may choose the ID when adding the record (a document number, an item's short name). */
  ownId?: boolean;
  /** Field name to what it may hold. A dotted name ("ratings.safety") is a value inside a group. */
  fields: Record<string, FieldSpec>;
}

const text: FieldSpec = { type: "text" };
const flag: FieldSpec = { type: "boolean", required: true, initial: false };
const ref = (to: RecordKind): FieldSpec => ({ type: "ref", to });
const refs = (to: RecordKind): FieldSpec => ({ type: "refs", to });
const oneOf = (values: readonly string[]): FieldSpec => ({ type: "enum", values });

/** What each kind of element of the architecture is called. */
export const ELEMENT_KIND_NAMES: Record<ElementKind, string> = {
  component: "Component",
  external_interactor: "External interactor",
  data_store: "Data store",
  data_flow: "Data flow",
  trust_boundary: "Trust boundary",
};

/**
 * What each row of the scope and of the evidence handed over at release is called. The screens and the report
 * both take the name from here, so that an open point reads the same wherever it is listed.
 */
export const SCOPE_NAMES: Record<ScopeKey, string> = {
  configuration_id: "Configuration ID",
  scoring_method: "Scoring method",
  variant_boundary: "Variants covered",
  intended_use: "Intended and foreseeable use",
  architecture_trust_boundaries: "Architecture and trust boundaries",
  lifecycle_support: "Lifecycle and support",
  product_market_context: "Product and market",
  assumptions_exclusions: "Assumptions and exclusions",
  reassessment_triggers: "When this is assessed again",
  cra_applicability: "Cyber Resilience Act",
  iso21434_applicability: "ISO/SAE 21434",
  r155_applicability: "UN Regulation No. 155",
  scope_review: "Scope review",
  cra_annex_i_part_i_1: "CRA Annex I Part I(1): the risk assessment",
  cra_annex_i_part_ii: "CRA Annex I Part II: vulnerability handling",
  cra_annex_vii: "CRA Annex VII: technical documentation",
  iso_work_products: "ISO/SAE 21434 work products",
  vehicle_supplier_evidence: "Vehicle or supplier evidence",
  release_review: "Release review",
};

/** The prefix of an element's ID, by its kind. */
export const ELEMENT_PREFIX: Record<string, string> = {
  component: "C",
  external_interactor: "EX",
  data_store: "ST",
  data_flow: "DF",
  trust_boundary: "TB",
};

/**
 * Every kind of record with its fields: the table the top of this file speaks of. A field that is not here
 * cannot be stored, and a kind whose `id` is null is made and removed by the tool, never by hand.
 */
export const KINDS: Record<RecordKind, KindSpec> = {
  items: {
    noun: "item",
    id: { prefix: "IT", digits: 2 },
    ownId: true,
    fields: {
      name: text,
      configurationRef: text,
      boundaryFunctions: text,
      architectureInterfaces: text,
      environmentUse: text,
    },
  },
  elements: {
    noun: "architecture element",
    id: { prefix: (values) => ELEMENT_PREFIX[String(values.kind)] ?? null, digits: 2 },
    fields: {
      kind: { type: "enum", values: ELEMENT_KINDS, required: true, fixed: true },
      itemId: { type: "ref", to: "items", required: true, fixed: true, owned: true },
      name: text,
      description: text,
      sourceId: ref("elements"),
      targetId: ref("elements"),
      direction: oneOf(["forward", "backward", "both"]),
      boundaryId: ref("elements"),
      x: { type: "number", layout: true },
      y: { type: "number", layout: true },
      w: { type: "number", layout: true },
      h: { type: "number", layout: true },
    },
  },
  assets: {
    noun: "asset",
    id: { prefix: "A", digits: 2 },
    fields: {
      name: text,
      itemId: ref("items"),
      elementIds: refs("elements"),
      variant: text,
      coverageRationale: text,
    },
  },
  damages: {
    noun: "damage scenario",
    id: { prefix: "DS-", digits: 4 },
    fields: {
      assetId: ref("assets"),
      confidentiality: flag,
      integrity: flag,
      availability: flag,
      description: text,
      ...Object.fromEntries(IMPACT_CATEGORY_KEYS.map((key) => [`ratings.${key}`, { type: "level" } as FieldSpec])),
      impactRationale: text,
    },
  },
  threats: {
    noun: "threat scenario",
    id: { prefix: "TS", digits: 3 },
    fields: {
      category: { type: "method", list: "threat_categories" },
      description: text,
      damageIds: refs("damages"),
    },
  },
  paths: {
    noun: "attack path",
    id: { prefix: "AP", digits: 3 },
    fields: {
      threatIds: refs("threats"),
      elementIds: refs("elements"),
      description: text,
      ...Object.fromEntries(FACTOR_KEYS.map((key) => [`factors.${key}`, { type: "method", list: key } as FieldSpec])),
      feasibilityBasis: text,
      disposition: oneOf(["included", "screened_out"]),
    },
  },
  risks: {
    noun: "risk",
    // A risk is made with its threat scenario and takes its number: TS003 gives R003.
    id: null,
    fields: {
      threatId: { type: "ref", to: "threats", required: true, fixed: true, owned: true },
      treatment: { type: "method", list: "treatments" },
      existingControlIds: refs("controls"),
      proposedControlIds: refs("controls"),
      rationale: text,
      owner: text,
      reviewDate: { type: "date" },
      residualImpact: { type: "level" },
      residualFeasibility: oneOf(FEASIBILITY_KEYS),
      residualBasis: text,
    },
  },
  controls: {
    noun: "control",
    id: { prefix: "CTL-", digits: 3 },
    fields: {
      name: text,
      description: text,
      type: oneOf(CONTROL_TYPES),
      craTags: { type: "tags", values: CRA_TAGS },
      coveredPathIds: refs("paths"),
      elementIds: refs("elements"),
      workLink: { type: "url" },
    },
  },
  evidence: {
    noun: "control evidence",
    id: { prefix: "EV-", digits: 3 },
    fields: {
      riskId: { type: "ref", to: "risks", required: true, fixed: true, owned: true },
      controlId: { type: "ref", to: "controls", required: true, fixed: true, owned: true },
      configurationId: text,
      state: { type: "enum", values: EVIDENCE_STATES, required: true, initial: "planned" },
      effect: text,
      implementationRef: text,
      verificationRef: text,
      result: oneOf(["pass", "fail"]),
      verifiedCraTags: { type: "tags", values: CRA_TAGS },
    },
  },
  goalClaims: {
    noun: "goal or claim",
    id: { prefix: (values) => (values.kind === "goal" ? "CG" : values.kind === "claim" ? "CC" : null), digits: 2 },
    fields: {
      kind: { type: "enum", values: ["goal", "claim"], required: true, fixed: true },
      statement: text,
      riskIds: refs("risks"),
    },
  },
  craDecisions: {
    noun: "CRA requirement decision",
    // One per requirement of Annex I, made with the TARA.
    id: null,
    fields: {
      requirementKey: { type: "text", required: true, fixed: true },
      applicability: oneOf(["applies", "does_not_apply"]),
      justification: text,
      implementationRef: text,
      verificationRef: text,
    },
  },
  references: {
    noun: "document",
    id: { prefix: "REF-", digits: 2 },
    ownId: true,
    fields: {
      title: text,
      revision: text,
      date: { type: "date" },
      location: text,
      content: text,
    },
  },
};

/** A kind's noun with its article: "an asset", "a threat scenario". For messages. */
export const withArticle = (noun: string): string => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

/** The form an ID takes: a letter, then letters, digits, dots, hyphens and underscores. At most 40 characters. */
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,39}$/;

/** Reads a field. A dotted name looks inside a group: "ratings.safety" is record.ratings.safety. */
export function getField(record: AnyRecord, name: string): unknown {
  const [group, key] = name.split(".");
  if (key === undefined) return record[name];
  return (record[group as string] as Record<string, unknown> | undefined)?.[key];
}

/** Writes a field of a record. Only for records that are private to the caller: see changes/apply.ts. */
export function setField(record: AnyRecord, name: string, value: unknown): void {
  const [group, key] = name.split(".");
  if (key === undefined) {
    record[name] = value;
    return;
  }
  const values = (record[group as string] ?? {}) as Record<string, unknown>;
  values[key] = value;
  record[group as string] = values;
}

/** What a field holds before anything is entered. */
export function emptyValue(spec: FieldSpec): unknown {
  if (spec.initial !== undefined) return spec.initial;
  return spec.type === "refs" || spec.type === "tags" ? [] : null;
}

/** A new record of a kind with every field empty. */
export function emptyRecord(kind: RecordKind, id: string): AnyRecord {
  const record: AnyRecord = { id };
  for (const [name, spec] of Object.entries(KINDS[kind].fields)) setField(record, name, emptyValue(spec));
  return record;
}
