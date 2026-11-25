// Says whether a value is a well-formed TARA document, and if not, what is wrong with it.
//
// Every document is validated when it is read from disk, when it is imported, and after every change before
// it is stored. A file edited by hand, or written by another program, is held to exactly the same standard
// as one changed on screen: it is either a valid TARA or it is refused with the reasons.
//
// "Valid" is about structure only: the right fields, the right kinds of value, and links that point at
// records that exist. Whether the assessment is complete is a different question, answered by the checks
// (rules/checks.ts). A valid TARA can be nearly empty.

import { CRA_REQUIREMENTS, craDecisionId } from "./cra.ts";
import { validateMethod } from "./method.ts";
import { type FieldSpec, getField, ID_PATTERN, KINDS, withArticle } from "./schema.ts";
import {
  type AnyRecord,
  FORMAT,
  FORMAT_NAME,
  FORMAT_VERSION,
  RECORD_KINDS,
  REVIEW_KINDS,
  type RecordKind,
  type ReviewKind,
  recordsOf,
  SCOPE_FIELDS_APPLICABILITY,
  SCOPE_KEYS,
  SIGNOFF_ROLES,
  type Tara,
} from "./tara.ts";

/** The form of a TARA's own ID: it names a folder on disk and appears in addresses. */
export const TARA_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The kind of record each kind of review is about. Scope and release reviews cover the whole TARA. */
export const REVIEW_SUBJECT: Record<ReviewKind, RecordKind | null> = {
  scope: null,
  release: null,
  attack_path: "paths",
  risk_rating: "risks",
  goal_claim: "goalClaims",
  control_evidence: "evidence",
  treatment: "risks",
  cra_requirement: "craDecisions",
};

/** A document that is not a valid TARA, with everything that is wrong with it. */
export class InvalidTara extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`This is not a valid TARA document:\n- ${problems.join("\n- ")}`);
    this.name = "InvalidTara";
    this.problems = problems;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTextOrNull = (value: unknown): boolean => value === null || (typeof value === "string" && value.trim() !== "");
const isDay = (value: unknown): boolean =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const isMoment = (value: unknown): boolean => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((x) => typeof x === "string") && new Set(value).size === value.length;

/**
 * Says what is wrong with one value for a field, or null when it is fine.
 * `has` answers whether a record of a kind with an ID exists; links are checked against it.
 */
export function checkFieldValue(spec: FieldSpec, value: unknown, has: (kind: RecordKind, id: string) => boolean): string | null {
  if (value === null || value === undefined) return spec.required ? "must not be empty" : null;
  switch (spec.type) {
    case "text":
      return typeof value === "string" && value.trim() !== "" ? null : "must be text";
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "date":
      return isDay(value) ? null : "must be a date written YYYY-MM-DD";
    case "url":
      return typeof value === "string" && /^https?:\/\/\S+$/i.test(value)
        ? null
        : "must be an address that starts with https:// and has no spaces";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a number";
    case "level":
      return value === 0 || value === 1 || value === 2 || value === 3 ? null : "must be an impact level from 0 to 3";
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? null : `must be one of: ${spec.values.join(", ")}`;
    case "method":
      // Whether the key is known to the method is a check, not a matter of form: a TARA stays readable
      // when its method is replaced by one with other options.
      return typeof value === "string" && /^[a-z0-9_]+$/.test(value) ? null : "must be the key of an entry of the scoring method";
    case "tags":
      return isIdList(value) && value.every((tag) => spec.values.includes(tag))
        ? null
        : `must be a list, without repeats, of: ${spec.values.join(", ")}`;
    case "ref":
      return typeof value === "string" && has(spec.to, value)
        ? null
        : `names ${withArticle(KINDS[spec.to].noun)} that does not exist`;
    case "refs": {
      if (!isIdList(value)) return "must be a list of IDs without repeats";
      const missing = value.filter((id) => !has(spec.to, id));
      return missing.length === 0 ? null : `names ${withArticle(KINDS[spec.to].noun)} that does not exist: ${missing.join(", ")}`;
    }
  }
}

/** Says what is wrong with a document, in words. An empty list means it is a valid TARA. */
export function validateTara(value: unknown): string[] {
  if (!isObject(value)) return ["The document is not an object."];
  if (value.format !== FORMAT) return [formatProblem(value)];
  const problems: string[] = [];
  const tara = value as unknown as Tara;

  if (typeof tara.id !== "string" || !TARA_ID_PATTERN.test(tara.id)) {
    problems.push("id: must be small letters, digits and hyphens, at most 63 characters.");
  }
  if (!Number.isInteger(tara.seq) || tara.seq < 0) problems.push("seq: must be a whole number, 0 or more.");
  const writer = (value as Record<string, unknown>).writtenBy;
  if (
    writer !== undefined &&
    !(isObject(writer) && ["tool", "version", "rules"].every((key) => typeof writer[key] === "string"))
  ) {
    problems.push("writtenBy: must name the tool, its version and the version of its rules, or be left out.");
  }

  problems.push(...metaProblems(tara.meta));
  problems.push(...validateMethod(tara.method).map((problem) => `method: ${problem}`));
  problems.push(...scopeProblems(tara.scope));

  // Every list must be there before the records in it can be judged.
  const missingLists = RECORD_KINDS.filter((kind) => !Array.isArray(tara[kind]));
  for (const kind of missingLists) problems.push(`${kind}: must be a list.`);
  if (missingLists.length > 0) return problems;

  problems.push(...recordProblems(tara));
  // The rules about how records fit together only make sense once each record is well formed.
  if (problems.length === 0) problems.push(...consistencyProblems(tara));
  problems.push(...reviewProblems(tara));
  problems.push(...signoffProblems(tara));

  if (!isObject(tara.counters) || Object.values(tara.counters).some((n) => !Number.isInteger(n) || (n as number) < 0)) {
    problems.push("counters: must give a whole number for each ID prefix.");
  }
  return problems;
}

/** The document as a TARA, or an InvalidTara that lists what is wrong. */
export function parseTara(value: unknown): Tara {
  const problems = validateTara(value);
  if (problems.length > 0) throw new InvalidTara(problems);
  return value as Tara;
}

function metaProblems(meta: unknown): string[] {
  if (!isObject(meta)) return ["meta: is missing."];
  const problems: string[] = [];
  if (typeof meta.title !== "string" || meta.title.trim() === "") problems.push("meta.title: a TARA needs a title.");
  if (typeof meta.revision !== "string" || meta.revision.trim() === "")
    problems.push("meta.revision: must be given, for example 0.1.");
  if (meta.status !== "draft" && meta.status !== "released") problems.push("meta.status: must be draft or released.");
  if (typeof meta.example !== "boolean") problems.push("meta.example: must be true or false.");
  for (const key of ["product", "organisation", "documentNumber", "storageLocation", "distribution", "revisionReason"]) {
    if (!isTextOrNull(meta[key])) problems.push(`meta.${key}: must be text or null.`);
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (!isMoment(meta[key])) problems.push(`meta.${key}: must be a date and time.`);
  }
  if (meta.releasedAt !== null && !isMoment(meta.releasedAt)) problems.push("meta.releasedAt: must be a date and time, or null.");
  const basedOn = meta.basedOn;
  if (basedOn !== null && !(isObject(basedOn) && typeof basedOn.id === "string" && typeof basedOn.revision === "string")) {
    problems.push("meta.basedOn: must name a TARA and its revision, or be null.");
  }
  return problems;
}

function scopeProblems(scope: unknown): string[] {
  if (!isObject(scope)) return ["scope: is missing."];
  const problems: string[] = [];
  for (const key of SCOPE_KEYS) {
    const entry = scope[key];
    if (!isObject(entry) || !isTextOrNull(entry.decision) || !isTextOrNull(entry.evidence)) {
      problems.push(`scope.${key}: must hold a decision and an evidence reference, each text or null.`);
      continue;
    }
    const isApplicability = (SCOPE_FIELDS_APPLICABILITY as readonly string[]).includes(key);
    if (isApplicability && entry.decision !== null && entry.decision !== "in_scope" && entry.decision !== "out_of_scope") {
      problems.push(`scope.${key}: the decision must be in_scope, out_of_scope or null.`);
    }
  }
  for (const key of Object.keys(scope)) {
    if (!(SCOPE_KEYS as readonly string[]).includes(key)) problems.push(`scope.${key}: is not a scope field of this format.`);
  }
  return problems;
}

/** Each record on its own: a unique ID, the fields of its kind and nothing else, and values of the right kind. */
function recordProblems(tara: Tara): string[] {
  const problems: string[] = [];
  const idsByKind = new Map<RecordKind, Set<string>>();
  const seen = new Map<string, RecordKind>();
  for (const kind of RECORD_KINDS) {
    idsByKind.set(kind, new Set());
    for (const record of recordsOf(tara, kind)) {
      if (!isObject(record) || typeof record.id !== "string" || !ID_PATTERN.test(record.id)) {
        problems.push(
          `${kind}: a record has no usable ID. An ID starts with a letter and holds letters, digits, dots, hyphens and underscores.`,
        );
        continue;
      }
      const earlier = seen.get(record.id);
      if (earlier)
        problems.push(`${kind}[${record.id}]: the ID is used twice (also in ${earlier}). An ID belongs to one record.`);
      seen.set(record.id, kind);
      idsByKind.get(kind)?.add(record.id);
    }
  }
  const has = (kind: RecordKind, id: string) => idsByKind.get(kind)?.has(id) ?? false;

  for (const kind of RECORD_KINDS) {
    const fields = KINDS[kind].fields;
    const groups = new Set(Object.keys(fields).map((name) => name.split(".")[0] as string));
    for (const record of recordsOf(tara, kind)) {
      if (!isObject(record) || typeof record.id !== "string") continue;
      for (const key of Object.keys(record)) {
        if (key !== "id" && !groups.has(key))
          problems.push(`${kind}[${record.id}].${key}: is not a field of ${withArticle(KINDS[kind].noun)}.`);
      }
      for (const [name, spec] of Object.entries(fields)) {
        const value = getField(record as AnyRecord, name);
        if (value === undefined) {
          problems.push(`${kind}[${record.id}].${name}: is missing (use null for "not entered yet").`);
          continue;
        }
        const problem = checkFieldValue(spec, value, has);
        if (problem) problems.push(`${kind}[${record.id}].${name}: ${problem}.`);
      }
    }
  }
  return problems;
}

/** How records fit together, beyond single fields. */
function consistencyProblems(tara: Tara): string[] {
  const problems: string[] = [];

  // Architecture: only a data flow has ends, and it runs between things, not between flows or boundaries.
  const elementById = new Map(tara.elements.map((e) => [e.id, e]));
  for (const element of tara.elements) {
    const at = `elements[${element.id}]`;
    if (element.kind !== "data_flow" && (element.sourceId !== null || element.targetId !== null || element.direction !== null)) {
      problems.push(`${at}: only a data flow has ends and a direction.`);
    }
    for (const endId of [element.sourceId, element.targetId]) {
      const end = endId === null ? undefined : elementById.get(endId);
      if (end && (end.kind === "data_flow" || end.kind === "trust_boundary")) {
        problems.push(`${at}: a data flow runs between components, external interactors and data stores, not to ${end.id}.`);
      }
    }
    if (element.boundaryId !== null) {
      if (elementById.get(element.boundaryId)?.kind !== "trust_boundary")
        problems.push(`${at}.boundaryId: must name a trust boundary.`);
      if (element.kind === "trust_boundary" || element.kind === "data_flow") {
        problems.push(
          `${at}: a ${element.kind === "data_flow" ? "data flow" : "trust boundary"} is not placed inside a boundary.`,
        );
      }
    }
  }

  // Exactly one risk per threat scenario, numbered after it.
  for (const threat of tara.threats) {
    const risks = tara.risks.filter((r) => r.threatId === threat.id);
    if (risks.length !== 1) problems.push(`threats[${threat.id}]: must have exactly one risk, and has ${risks.length}.`);
  }
  for (const risk of tara.risks) {
    const both = risk.existingControlIds.filter((id) => risk.proposedControlIds.includes(id));
    if (both.length > 0) problems.push(`risks[${risk.id}]: a control is existing or proposed, not both: ${both.join(", ")}.`);
  }

  // Evidence is about a control that its risk has selected, once per configuration.
  const evidenceKeys = new Set<string>();
  for (const evidence of tara.evidence) {
    const risk = tara.risks.find((r) => r.id === evidence.riskId);
    if (risk && !risk.existingControlIds.includes(evidence.controlId) && !risk.proposedControlIds.includes(evidence.controlId)) {
      problems.push(`evidence[${evidence.id}]: ${evidence.controlId} is not selected on ${evidence.riskId}.`);
    }
    const key = `${evidence.riskId}|${evidence.controlId}|${evidence.configurationId ?? ""}`;
    if (evidenceKeys.has(key)) {
      problems.push(`evidence[${evidence.id}]: there is already evidence for this risk, control and configuration.`);
    }
    evidenceKeys.add(key);
  }

  // The CRA decisions are always the same 21, one per requirement.
  const expected = CRA_REQUIREMENTS.map((r) => `${r.id}:${r.key}`).join(",");
  const actual = tara.craDecisions.map((d) => `${d.id}:${d.requirementKey}`).join(",");
  if (expected !== actual) {
    problems.push(
      `craDecisions: must hold one decision for each requirement of CRA Annex I, in order (${craDecisionId("a")} to ${craDecisionId("II(8)")}).`,
    );
  }
  return problems;
}

function reviewProblems(tara: Tara): string[] {
  if (!Array.isArray(tara.reviews)) return ["reviews: must be a list."];
  const problems: string[] = [];
  if (!Number.isInteger(tara.reviewCount) || tara.reviewCount < 0)
    problems.push("reviewCount: must be a whole number, 0 or more.");
  const seen = new Set<string>();
  for (const review of tara.reviews) {
    if (!isObject(review) || !(REVIEW_KINDS as readonly string[]).includes(review.kind as string)) {
      problems.push("reviews: an entry has no known kind.");
      continue;
    }
    const at = `reviews[${review.kind}:${review.subjectId ?? ""}]`;
    const subjectKind = REVIEW_SUBJECT[review.kind];
    if (subjectKind === null && review.subjectId !== null)
      problems.push(`${at}: this review covers the whole TARA and names no record.`);
    if (subjectKind !== null && !recordsOf(tara, subjectKind).some((r) => r.id === review.subjectId)) {
      problems.push(`${at}: the reviewed record does not exist.`);
    }
    if (typeof review.reference !== "string") problems.push(`${at}.reference: must be text.`);
    if (review.fingerprint !== null && typeof review.fingerprint !== "string")
      problems.push(`${at}.fingerprint: must be text or null.`);
    if (review.revision !== null && !Number.isInteger(review.revision))
      problems.push(`${at}.revision: must be a whole number or null.`);
    if (!isTextOrNull(review.confirmedBy)) problems.push(`${at}.confirmedBy: must be text or null.`);
    if (review.confirmedAt !== null && !isMoment(review.confirmedAt))
      problems.push(`${at}.confirmedAt: must be a date and time, or null.`);
    if (seen.has(at)) problems.push(`${at}: a record has one review of each kind.`);
    seen.add(at);
  }
  return problems;
}

function signoffProblems(tara: Tara): string[] {
  if (!Array.isArray(tara.signoffs)) return ["signoffs: must be a list."];
  if (!Array.isArray(tara.changeLog)) return ["changeLog: must be a list."];
  const problems: string[] = [];
  const roles = new Set<string>();
  for (const signoff of tara.signoffs) {
    if (!isObject(signoff) || !(SIGNOFF_ROLES as readonly string[]).includes(signoff.role as string)) {
      problems.push("signoffs: a signature is as author, reviewer or approver.");
      continue;
    }
    if (roles.has(signoff.role)) problems.push(`signoffs[${signoff.role}]: there is one signature per role.`);
    roles.add(signoff.role);
    if (typeof signoff.name !== "string" || signoff.name.trim() === "")
      problems.push(`signoffs[${signoff.role}].name: a signature names a person.`);
    if (!isMoment(signoff.signedAt)) problems.push(`signoffs[${signoff.role}].signedAt: must be a date and time.`);
  }
  return problems;
}

// ------------------------------------------------------------------------------------ versions of the format
//
// A file says what it is: its format, and the program that wrote it. The tool knows what it reads. A file
// carries no statement of what it is compatible with, because a file cannot know the readers that come after it.
//
//   The format of the document                          What this version does
//   the one it writes, or an earlier one of the same    reads it whole (`upgrade` brings it up to the present form)
//     number before the point
//   a later one of the same number before the point     stored here: refuses it, and says to update the tool
//     (written by a later version of the tool)          taken in from a file: takes all it knows, and says what
//                                                         the later version added that is not taken (`takeKnown`)
//   another number before the point, or another name    refuses it

/** The version a document says it is in, or null if it does not name this format. "open-tara/1" is 1.0. */
export function readFormat(document: unknown): { major: number; minor: number } | null {
  const pattern = new RegExp(`^${FORMAT_NAME}/(\\d+)(?:\\.(\\d+))?$`);
  const named = isObject(document) && typeof document.format === "string" ? pattern.exec(document.format) : null;
  if (!named) return null;
  return { major: Number(named[1]), minor: Number(named[2] ?? 0) };
}

/** Why a document's format cannot be read, in words. */
function formatProblem(document: Record<string, unknown>): string {
  const version = readFormat(document);
  if (version && version.major === FORMAT_VERSION.major && version.minor > FORMAT_VERSION.minor) {
    const writer = isObject(document.writtenBy)
      ? ` (${String(document.writtenBy.tool)} ${String(document.writtenBy.version)})`
      : "";
    return `The document is in the format "${String(document.format)}", written by a later version of the tool${writer}. This version reads "${FORMAT}". Update the tool to open it.`;
  }
  return `The document's format is ${JSON.stringify(document.format)}. This version of the tool reads "${FORMAT}".`;
}

/**
 * Brings a document of an earlier form of the format up to the present one, so that old files stay readable
 * for good. Every document is passed through this before it is validated, wherever it comes from. A document
 * of another format, or of a later form, is given back as it is; validation then says why it is not read.
 *
 * When the format changes, add a step here that turns a document of the form before into the new one.
 */
export function upgrade(document: unknown): unknown {
  const version = readFormat(document);
  if (!version || version.major !== FORMAT_VERSION.major || version.minor > FORMAT_VERSION.minor) return document;
  // "open-tara/1", as the format was first written, is 1.0 by another name. There is nothing else to convert yet.
  return { ...(document as Record<string, unknown>), format: FORMAT };
}

/** The parts of a document this version knows, beside the lists of records. */
const KNOWN_PARTS = [
  "format",
  "writtenBy",
  "id",
  "seq",
  "meta",
  "method",
  "scope",
  "reviews",
  "reviewCount",
  "signoffs",
  "changeLog",
  "counters",
];

/**
 * For a document written by a later version of the tool, in a later form of the same format: the document
 * with everything this version does not know left out, and what was left out, in words. So a file from a
 * colleague with a newer tool can be taken in for what this version understands, and the person is told
 * what did not come. A document of this version's form, or an earlier one, is given back whole.
 */
export function takeKnown(document: unknown): { document: unknown; notTaken: string[] } {
  const version = readFormat(document);
  const later = version !== null && version.major === FORMAT_VERSION.major && version.minor > FORMAT_VERSION.minor;
  if (!later || !isObject(document)) return { document, notTaken: [] };

  const left = new Set<string>();
  const known: Record<string, unknown> = {};
  for (const [part, value] of Object.entries(document)) {
    const kind = (RECORD_KINDS as readonly string[]).includes(part) ? (part as RecordKind) : null;
    if (!kind && !KNOWN_PARTS.includes(part)) {
      left.add(part);
    } else if (kind && Array.isArray(value)) {
      const fields = new Set(["id", ...Object.keys(KINDS[kind].fields).map((name) => name.split(".")[0] as string)]);
      known[part] = value.map((record) => {
        if (!isObject(record)) return record;
        for (const name of Object.keys(record)) if (!fields.has(name)) left.add(`${KINDS[kind].noun}: ${name}`);
        return Object.fromEntries(Object.entries(record).filter(([name]) => fields.has(name)));
      });
    } else {
      known[part] = value;
    }
  }
  known.format = FORMAT;
  const writer = isObject(document.writtenBy)
    ? `${String(document.writtenBy.tool)} ${String(document.writtenBy.version)}`
    : "a later version of the tool";
  const notTaken = [
    left.size > 0
      ? `The file was written by ${writer}, in the format ${String(document.format)}. What that version added is not taken: ${[...left].join("; ")}.`
      : `The file was written by ${writer}, in the format ${String(document.format)}. Everything in it is known to this version.`,
  ];
  return { document: known, notTaken };
}
