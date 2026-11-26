// The one way a TARA changes.
//
// `applyChanges` takes a TARA and a list of changes and gives back the next TARA. The TARA it was given is
// never touched: the changes are made on a copy, the copy is validated as a whole, and only a valid copy is
// returned. A change that does not fit is refused with a reason a person can act on, and then nothing at all
// has changed, however many changes were sent together.
//
// Everything that edits a TARA goes through here: the screens, an import, the examples, the tests. That is
// what makes the data safe to edit: there is one place to read to know what can happen to it.
//
// What a change may do follows from the schema (model/schema.ts). The rules written out below are the ones
// a table cannot express: what goes with what when a record is added or removed.

import { riskIdFor, takeNextId } from "../model/ids.ts";
import { validateMethod } from "../model/method.ts";
import { emptyRecord, type FieldSpec, getField, ID_PATTERN, KINDS, setField, withArticle } from "../model/schema.ts";
import {
  type AnyRecord,
  type Evidence,
  findRecord,
  RECORD_KINDS,
  type RecordKind,
  type Review,
  type ReviewKind,
  type Risk,
  recordsOf,
  SCOPE_FIELDS_APPLICABILITY,
  SCOPE_KEYS,
  SIGNOFF_ROLES,
  type Tara,
} from "../model/tara.ts";
import { checkFieldValue, REVIEW_SUBJECT, validateTara } from "../model/validate.ts";
import { reviewKey } from "../rules/checks.ts";
import { CONTROL_STATE_LABELS, CONTROL_STATES, risksUsingControl } from "../rules/controls.ts";
import { releaseNeeds } from "../rules/release.ts";
import { AWAITING_CONFIRMATION, assess, assessmentFingerprint, statusOfReview } from "../rules/reviews.ts";
import { type Change, type ChangeContext, EDITABLE_META, Refusal, UNNAMED_AUTHOR } from "./change.ts";

/** The outcome of changes that were made: the next TARA, with a line for the history and notes for the person. */
export interface Applied {
  /** The TARA after the changes. A new value: the one passed in is unchanged. */
  tara: Tara;
  /** What was done, in one line, for the history. */
  summary: string;
  /** What the person should know about the outcome that is not a refusal. */
  notes: string[];
}

/** Applies changes to a TARA, all or none. Throws a Refusal when one of them cannot be made. */
export function applyChanges(current: Tara, changes: Change[], context: ChangeContext): Applied {
  if (current.meta.status === "released") {
    throw new Refusal("This TARA is released and cannot be changed. Open a new revision to continue.", "frozen");
  }
  if (!Array.isArray(changes) || changes.length === 0) throw new Refusal("No change was given.");

  const draft = structuredClone(current);
  const notes: string[] = [];
  const done = changes.map((change) => applyOne(draft, change, context, notes));

  // The backstop: whatever the code above allowed, a TARA that is not valid is never returned.
  const problems = validateTara(draft);
  if (problems.length > 0) throw new Refusal(problems.slice(0, 3).join(" "));

  return { tara: draft, summary: summarise(done), notes };
}

// ------------------------------------------------------------------------------------------- one change

function applyOne(draft: Tara, change: Change, context: ChangeContext, notes: string[]): string {
  if (typeof change !== "object" || change === null) throw new Refusal("A change is an object that names what to do in `op`.");
  // A release is the last change there is. What is listed after one would alter a TARA that is already released,
  // with nothing checked, reviewed or signed for it.
  if (draft.meta.status === "released") {
    throw new Refusal("A release is the last change of a request: nothing may follow it. Nothing was changed.", "frozen");
  }
  switch (change.op) {
    case "add":
      return addRecord(draft, change.kind, change.values ?? {}, change.id);
    case "set":
      return setRecord(draft, change.kind, change.id, change.values);
    case "remove": {
      const spec = kindSpec(change.kind);
      if (!spec.id) throw new Refusal(`${withArticle(spec.noun).replace(/^a/, "A")} is not removed by hand.`);
      removeRecord(draft, change.kind, change.id);
      return `Removed ${spec.noun} ${change.id}`;
    }
    case "setMeta":
      return setMeta(draft, change.values);
    case "setScope":
      return setScope(draft, change.key, change.values);
    case "setMethod":
      return setMethod(draft, change.method, notes);
    case "setControlState":
      return setControlState(draft, change.id, change.state);
    case "review":
      return recordReview(draft, change, context, notes);
    case "clearReview": {
      const before = draft.reviews.length;
      const subjectId = REVIEW_SUBJECT[change.kind] === null ? null : change.subjectId;
      draft.reviews = draft.reviews.filter((r) => !(r.kind === change.kind && r.subjectId === subjectId));
      if (draft.reviews.length === before) throw new Refusal("There is no such review.", "not_found");
      return `Removed the review of ${subjectName(change.kind, subjectId)}`;
    }
    case "sign":
      return sign(draft, change, context);
    case "unsign": {
      const before = draft.signoffs.length;
      draft.signoffs = draft.signoffs.filter((s) => s.role !== change.role);
      if (draft.signoffs.length === before) throw new Refusal(`Nobody has signed as ${change.role}.`, "not_found");
      return `Withdrew the signature of the ${change.role}`;
    }
    case "release":
      return release(draft, context);
    default:
      throw new Refusal(`Unknown kind of change: ${JSON.stringify((change as { op?: unknown }).op)}.`);
  }
}

// ---------------------------------------------------------------------------------- records: add and change

function kindSpec(kind: RecordKind) {
  // Only a name of the table itself: "constructor" is a name every object answers to, and no kind of record.
  if (!Object.hasOwn(KINDS, kind)) throw new Refusal(`There is no kind of record called "${String(kind)}".`, "not_found");
  return KINDS[kind];
}

/** "feasibilityBasis" as "feasibility basis"; "ratings.safety" as "ratings: safety". */
const fieldLabel = (name: string): string =>
  name
    .replace(/\./g, ": ")
    .replace(/Ids?$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();

/** A value as it is stored: text without spaces around it, an empty text as null, a list without repeats. */
function normalise(spec: FieldSpec, value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (Array.isArray(value) && (spec.type === "refs" || spec.type === "tags")) return [...new Set(value)];
  return value;
}

/** The keys a field of type "method" may hold, in this TARA's own method. */
function methodKeys(tara: Tara, list: Extract<FieldSpec, { type: "method" }>["list"]): string[] {
  if (list === "threat_categories") return tara.method.threat_categories.map((c) => c.key);
  if (list === "treatments") return tara.method.treatments.map((t) => t.key);
  return tara.method.feasibility_factors.find((f) => f.key === list)?.options.map((o) => o.key) ?? [];
}

/** Writes values into a record of the draft, after checking each against the schema. */
function assign(draft: Tara, kind: RecordKind, record: AnyRecord, values: Record<string, unknown>, creating: boolean): string[] {
  const spec = kindSpec(kind);
  const has = (otherKind: RecordKind, id: string) => recordsOf(draft, otherKind).some((r) => r.id === id);
  if (typeof values !== "object" || values === null) throw new Refusal("The values of a change are given by field name.");
  for (const [name, raw] of Object.entries(values)) {
    const field = spec.fields[name];
    if (!field) throw new Refusal(`"${name}" is not a field of ${withArticle(spec.noun)}.`);
    if (field.fixed && !creating) {
      throw new Refusal(
        `The ${fieldLabel(name)} of ${withArticle(spec.noun)} is set when it is added and cannot be changed afterwards.`,
      );
    }
    const value = normalise(field, raw);
    const problem = checkFieldValue(field, value, has);
    if (problem) throw new Refusal(`The ${fieldLabel(name)} ${problem}.`);
    if (field.type === "method" && value !== null && !methodKeys(draft, field.list).includes(value as string)) {
      throw new Refusal(`The ${fieldLabel(name)} "${String(value)}" is not an option of this TARA's scoring method.`);
    }
    setField(record, name, value);
  }
  return Object.keys(values);
}

function addRecord(draft: Tara, kind: RecordKind, values: Record<string, unknown>, ownId?: string): string {
  const spec = kindSpec(kind);
  if (!spec.id) throw new Refusal(`${withArticle(spec.noun).replace(/^a/, "A")} is not added by hand.`);
  for (const [name, field] of Object.entries(spec.fields)) {
    if (
      field.required &&
      field.initial === undefined &&
      (values[name] === undefined || values[name] === null || values[name] === "")
    ) {
      throw new Refusal(`Choose the ${fieldLabel(name)} of the new ${spec.noun}.`);
    }
  }

  let id: string | null;
  if (ownId !== undefined && String(ownId).trim() !== "") {
    id = String(ownId).trim();
    if (!spec.ownId) throw new Refusal(`The ID of ${withArticle(spec.noun)} is given by the tool.`);
    if (!ID_PATTERN.test(id)) {
      throw new Refusal(
        "An ID starts with a letter and holds letters, digits, dots, hyphens and underscores, at most 40 characters.",
      );
    }
    if (findRecord(draft, id)) throw new Refusal(`The ID ${id} is already in use in this TARA.`, "conflict");
  } else {
    id = takeNextId(draft, kind, values);
    if (id === null) throw new Refusal(`Choose what kind of ${spec.noun} this is.`);
  }

  const record = emptyRecord(kind, id);
  if (kind === "evidence" && values.configurationId === undefined) {
    // New evidence is for the configuration the TARA assesses, unless said otherwise.
    record.configurationId = draft.scope.configuration_id.decision;
  }
  assign(draft, kind, record, values, true);
  recordsOf(draft, kind).push(record);
  afterChange(draft, kind, record, Object.keys(values));

  // Every threat scenario has its risk, from the moment it exists.
  if (kind === "threats") {
    const risk = emptyRecord("risks", riskIdFor(id));
    risk.threatId = id;
    if (findRecord(draft, risk.id)) throw new Refusal(`The ID ${risk.id} is already in use in this TARA.`, "conflict");
    recordsOf(draft, "risks").push(risk);
  }
  return `Added ${spec.noun} ${id}`;
}

function setRecord(draft: Tara, kind: RecordKind, id: string, values: Record<string, unknown>): string {
  const spec = kindSpec(kind);
  const record = recordsOf(draft, kind).find((r) => r.id === id);
  if (!record) throw new Refusal(`There is no ${spec.noun} ${id}. Someone may have removed it.`, "not_found");
  const names = assign(draft, kind, record, values, false);
  afterChange(draft, kind, record, names);
  const layoutOnly = names.length > 0 && names.every((name) => spec.fields[name]?.layout);
  return layoutOnly ? LAYOUT_SUMMARY : `Changed ${id}: ${names.map(fieldLabel).join(", ")}`;
}

/** What follows from a change to a record, beyond the fields that were named. */
function afterChange(draft: Tara, kind: RecordKind, record: AnyRecord, names: string[]): void {
  if (kind === "risks") {
    const risk = record as unknown as Risk;
    // A control is existing or proposed, never both: listing it in one takes it out of the other.
    if (names.includes("existingControlIds") && names.includes("proposedControlIds")) {
      const both = risk.existingControlIds.filter((id) => risk.proposedControlIds.includes(id));
      if (both.length > 0) throw new Refusal(`A control is existing or proposed, not both: ${both.join(", ")}.`);
    } else if (names.includes("existingControlIds")) {
      risk.proposedControlIds = risk.proposedControlIds.filter((id) => !risk.existingControlIds.includes(id));
    } else if (names.includes("proposedControlIds")) {
      risk.existingControlIds = risk.existingControlIds.filter((id) => !risk.proposedControlIds.includes(id));
    }
    // Evidence is about a control the risk has selected. The control cannot leave while its evidence stays.
    const orphaned = draft.evidence.filter(
      (e) =>
        e.riskId === risk.id && !risk.existingControlIds.includes(e.controlId) && !risk.proposedControlIds.includes(e.controlId),
    );
    if (orphaned.length > 0) {
      const first = orphaned[0] as Evidence;
      throw new Refusal(
        `${first.id} is the evidence for ${first.controlId} on ${risk.id}. Remove the evidence before taking the control off the risk.`,
        "conflict",
      );
    }
  }
  if (kind === "evidence") {
    const evidence = record as unknown as Evidence;
    const risk = draft.risks.find((r) => r.id === evidence.riskId);
    if (risk && !risk.existingControlIds.includes(evidence.controlId) && !risk.proposedControlIds.includes(evidence.controlId)) {
      throw new Refusal(
        `${evidence.controlId} is not selected on ${evidence.riskId}. Select it under Risk treatment first.`,
        "conflict",
      );
    }
    const twin = draft.evidence.find(
      (e) =>
        e.id !== evidence.id &&
        e.riskId === evidence.riskId &&
        e.controlId === evidence.controlId &&
        (e.configurationId ?? "") === (evidence.configurationId ?? ""),
    );
    if (twin) {
      throw new Refusal(
        `${twin.id} already is the evidence for ${evidence.controlId} on ${evidence.riskId} in this configuration.`,
        "conflict",
      );
    }
  }
}

// ------------------------------------------------------------------------------------------ records: remove

/**
 * Removes a record.
 *
 * Two rules decide what happens to the records that mention it:
 *   - A record that cannot exist without it (its field is marked `owned` in the schema) blocks the removal.
 *     The person removes that one first, knowingly. The one exception is the risk of a threat scenario,
 *     which is made and removed with its threat.
 *   - Every other mention is a plain link, and is taken away with the record.
 */
function removeRecord(draft: Tara, kind: RecordKind, id: string): void {
  const spec = kindSpec(kind);
  const list = recordsOf(draft, kind);
  const index = list.findIndex((r) => r.id === id);
  if (index < 0) throw new Refusal(`There is no ${spec.noun} ${id}. Someone may have removed it already.`, "not_found");

  const dependents: { kind: RecordKind; id: string }[] = [];
  for (const otherKind of RECORD_KINDS) {
    for (const [name, field] of Object.entries(KINDS[otherKind].fields)) {
      if (field.type !== "ref" || field.to !== kind || !field.owned) continue;
      for (const other of recordsOf(draft, otherKind)) {
        if (getField(other, name) === id) dependents.push({ kind: otherKind, id: other.id });
      }
    }
  }
  const blocking = dependents.filter((d) => !(kind === "threats" && d.kind === "risks"));
  if (blocking.length > 0) {
    const named = blocking.map((d) => d.id).join(", ");
    throw new Refusal(
      `${id} cannot be removed while ${KINDS[(blocking[0] as { kind: RecordKind }).kind].noun} ${named} ${blocking.length === 1 ? "depends" : "depend"} on it. Remove ${blocking.length === 1 ? "that" : "those"} first.`,
      "conflict",
    );
  }
  for (const dependent of dependents) removeRecord(draft, dependent.kind, dependent.id);

  // Take the record out of every link that names it.
  for (const otherKind of RECORD_KINDS) {
    for (const [name, field] of Object.entries(KINDS[otherKind].fields)) {
      if ((field.type !== "ref" && field.type !== "refs") || field.to !== kind) continue;
      for (const other of recordsOf(draft, otherKind)) {
        const value = getField(other, name);
        if (field.type === "ref" && value === id) setField(other, name, null);
        if (field.type === "refs" && Array.isArray(value) && value.includes(id)) {
          setField(
            other,
            name,
            value.filter((linked) => linked !== id),
          );
        }
      }
    }
  }
  draft.reviews = draft.reviews.filter((r) => !(REVIEW_SUBJECT[r.kind] === kind && r.subjectId === id));
  recordsOf(draft, kind).splice(
    recordsOf(draft, kind).findIndex((r) => r.id === id),
    1,
  );
}

// ---------------------------------------------------------------------------- the document, scope and method

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

function setMeta(draft: Tara, values: Record<string, unknown>): string {
  if (typeof values !== "object" || values === null) throw new Refusal("The values of a change are given by field name.");
  const names = Object.keys(values);
  for (const name of names) {
    if (!(EDITABLE_META as readonly string[]).includes(name)) throw new Refusal(`"${name}" cannot be changed here.`);
    const value = textOrNull(values[name]);
    if (name === "title" && value === null) throw new Refusal("A TARA needs a title.");
    if (name === "revision" && value === null)
      throw new Refusal("Give the revision this TARA will be released as, for example 1.0.");
    (draft.meta as unknown as Record<string, unknown>)[name] = value;
  }
  return `Changed the document details: ${names.map(fieldLabel).join(", ")}`;
}

function setScope(draft: Tara, key: string, values: Record<string, unknown>): string {
  const entry = (SCOPE_KEYS as readonly string[]).includes(key) ? draft.scope[key as keyof Tara["scope"]] : undefined;
  if (!entry) throw new Refusal(`There is no scope field "${key}".`, "not_found");
  if (typeof values !== "object" || values === null) throw new Refusal("The values of a change are given by field name.");
  for (const name of Object.keys(values)) {
    if (name !== "decision" && name !== "evidence")
      throw new Refusal(`A scope field holds a decision and its evidence, not "${name}".`);
  }
  if ("decision" in values) {
    const decision = textOrNull(values.decision);
    const isApplicability = (SCOPE_FIELDS_APPLICABILITY as readonly string[]).includes(key);
    if (isApplicability && decision !== null && decision !== "in_scope" && decision !== "out_of_scope") {
      throw new Refusal("Choose in scope or out of scope.");
    }
    entry.decision = decision;
  }
  if ("evidence" in values) entry.evidence = textOrNull(values.evidence);
  return `Changed the scope: ${fieldLabel(key)}`;
}

function setMethod(draft: Tara, method: unknown, notes: string[]): string {
  const problems = validateMethod(method);
  if (problems.length > 0) throw new Refusal(`This scoring method cannot be used. ${problems.slice(0, 5).join(" ")}`);
  draft.method = structuredClone(method) as Tara["method"];

  // Ratings made with options the new method does not have are not lost, but they no longer count.
  const affected: string[] = [];
  for (const kind of RECORD_KINDS) {
    for (const [name, field] of Object.entries(KINDS[kind].fields)) {
      if (field.type !== "method") continue;
      const known = methodKeys(draft, field.list);
      for (const record of recordsOf(draft, kind)) {
        const value = getField(record, name);
        if (typeof value === "string" && !known.includes(value) && !affected.includes(record.id)) affected.push(record.id);
      }
    }
  }
  if (affected.length > 0) {
    notes.push(`These records use options the new method does not have, and ask to be rated again: ${affected.join(", ")}.`);
  }
  return `Replaced the scoring method${draft.method.source ? ` with ${draft.method.source}` : ""}`;
}

// --------------------------------------------------------------------------------- the state of a control

/**
 * Sets where a control stands in the product, on every risk that uses it.
 *
 * Proposed: the risks list it as proposed. From "under way" on, they list it as existing, each with an
 * evidence entry in that state. What a state still needs (where it is implemented, the test) is then asked
 * for by the checks on the evidence.
 */
function setControlState(draft: Tara, controlId: string, state: string): string {
  if (!(CONTROL_STATES as readonly string[]).includes(state)) {
    throw new Refusal(`Choose one of: ${CONTROL_STATES.map((s) => CONTROL_STATE_LABELS[s].toLowerCase()).join(", ")}.`);
  }
  if (!draft.controls.some((c) => c.id === controlId)) throw new Refusal(`There is no control ${controlId}.`, "not_found");
  const risks = risksUsingControl(draft, controlId);
  if (risks.length === 0) {
    throw new Refusal(
      "No risk uses this control yet. Choose it for a risk under Risk treatment first: the state of a control is kept with the risks it serves.",
      "conflict",
    );
  }
  const without = (ids: string[]) => ids.filter((id) => id !== controlId);
  const evidenceState = (state === "proposed" ? "planned" : state) as Evidence["state"];
  for (const risk of risks) {
    if (state === "proposed") {
      risk.existingControlIds = without(risk.existingControlIds);
      if (!risk.proposedControlIds.includes(controlId)) risk.proposedControlIds.push(controlId);
    } else {
      risk.proposedControlIds = without(risk.proposedControlIds);
      if (!risk.existingControlIds.includes(controlId)) risk.existingControlIds.push(controlId);
    }
  }
  for (const evidence of draft.evidence) if (evidence.controlId === controlId) evidence.state = evidenceState;
  if (state !== "proposed") {
    for (const risk of risks) {
      if (draft.evidence.some((e) => e.controlId === controlId && e.riskId === risk.id)) continue;
      const evidence = emptyRecord("evidence", takeNextId(draft, "evidence", {}) as string);
      Object.assign(evidence, {
        riskId: risk.id,
        controlId,
        state: evidenceState,
        configurationId: draft.scope.configuration_id.decision,
      });
      recordsOf(draft, "evidence").push(evidence);
    }
  }
  return `Set ${controlId} to ${CONTROL_STATE_LABELS[state as keyof typeof CONTROL_STATE_LABELS].toLowerCase()}`;
}

// ----------------------------------------------------------------------------- reviews, sign-off and release

const subjectName = (kind: ReviewKind, subjectId: string | null): string =>
  kind === "scope"
    ? "the scope"
    : kind === "release"
      ? "the release"
      : `${subjectId}${kind === "risk_rating" ? " (rating)" : kind === "treatment" ? " (treatment)" : ""}`;

/**
 * Records a review and confirms it if the record is ready.
 *
 * The reference is always kept. The review is confirmed, and from then on counts, only when the record's
 * every other check has passed: a review of something unfinished would be a review of something else.
 * Confirming stores the fingerprint of everything the review covers (rules/reviews.ts).
 */
function recordReview(draft: Tara, change: Extract<Change, { op: "review" }>, context: ChangeContext, notes: string[]): string {
  if (!Object.hasOwn(REVIEW_SUBJECT, change.kind)) throw new Refusal("Unknown kind of review.", "not_found");
  const subjectKind = REVIEW_SUBJECT[change.kind];
  const subjectId = subjectKind === null ? null : change.subjectId;
  if (subjectKind !== null && !recordsOf(draft, subjectKind).some((r) => r.id === subjectId)) {
    throw new Refusal(`There is no ${KINDS[subjectKind].noun} ${String(subjectId)} to review.`, "not_found");
  }
  const reference = textOrNull(change.reference);
  if (reference === null) {
    throw new Refusal(
      "Name the record of the review: the number of the minutes or the approval, or the ID of a document in the references.",
    );
  }
  if (change.decision !== undefined) {
    if (subjectKind !== null) throw new Refusal("Only the scope review and the release review record an outcome.");
    draft.scope[change.kind === "scope" ? "scope_review" : "release_review"].decision = textOrNull(change.decision);
  }

  let review = draft.reviews.find((r) => r.kind === change.kind && r.subjectId === subjectId);
  if (review) review.reference = reference;
  else {
    review = { kind: change.kind, subjectId, reference, fingerprint: null, revision: null, confirmedBy: null, confirmedAt: null };
    draft.reviews.push(review);
  }

  const name = subjectName(change.kind, subjectId);
  const key = reviewKey(change.kind, subjectId);
  const assessment = assess(draft);
  if (assessment.currentReviews.has(key)) return `Recorded the review of ${name}`;

  const status = statusOfReview(change.kind, subjectId, assessment.checks);
  const print = assessment.fingerprints.get(key);
  if (!print || status?.code !== AWAITING_CONFIRMATION[change.kind]) {
    notes.push(`The reference is kept, but the review does not count yet. First: ${status?.message ?? "complete the record"}.`);
    return `Recorded a review reference for ${name}`;
  }
  confirm(draft, review, print, context);
  return `Confirmed the review of ${name}`;
}

function confirm(draft: Tara, review: Review, print: string, context: ChangeContext): void {
  draft.reviewCount += 1;
  review.fingerprint = print;
  review.revision = draft.reviewCount;
  review.confirmedBy = context.author;
  review.confirmedAt = context.now;
}

/**
 * Confirms every recorded review for the content as it stands, in one step. A new TARA is given back.
 *
 * This is for taking in an assessment whose reviews were held elsewhere, and for the training examples.
 * In daily work a review is confirmed one at a time, by the `review` change, by the person who held it.
 */
export function confirmAllReviews(current: Tara, context: ChangeContext): Tara {
  const draft = structuredClone(current);
  const all = new Set(draft.reviews.map((r) => reviewKey(r.kind, r.subjectId)));
  // First pass: which reviews have something to cover. They get their numbers.
  const first = assess(draft, all);
  draft.reviewCount = 0;
  for (const review of draft.reviews) {
    const reviewable = first.fingerprints.has(reviewKey(review.kind, review.subjectId));
    if (reviewable) confirm(draft, review, "", context);
    else Object.assign(review, { fingerprint: null, revision: null, confirmedBy: null, confirmedAt: null });
  }
  // Second pass: the fingerprints, now that the numbers the later reviews rest on exist.
  const second = assess(draft, all);
  for (const review of draft.reviews) {
    if (review.revision !== null) review.fingerprint = second.fingerprints.get(reviewKey(review.kind, review.subjectId)) ?? null;
  }
  return draft;
}

function sign(draft: Tara, change: Extract<Change, { op: "sign" }>, context: ChangeContext): string {
  if (!(SIGNOFF_ROLES as readonly string[]).includes(change.role))
    throw new Refusal("Sign as author, reviewer or approver.", "not_found");
  if (context.author.trim() === "" || context.author === UNNAMED_AUTHOR) {
    throw new Refusal("Say who you are before signing: a signature names a person.");
  }
  const assessment = assess(draft);
  const review = assessment.checks.releaseReview;
  if (review.code !== "release.reviewed") {
    throw new Refusal(
      `Sign when the assessment is complete and the release review is confirmed. At present: ${review.message}.`,
      "conflict",
    );
  }
  draft.signoffs = draft.signoffs.filter((s) => s.role !== change.role);
  draft.signoffs.push({
    role: change.role,
    name: context.author,
    roleTitle: textOrNull(change.roleTitle),
    evidenceRef: textOrNull(change.evidenceRef),
    signedAt: context.now,
    fingerprint: assessmentFingerprint(assessment),
  });
  return `Signed as ${change.role}`;
}

/** Releases the TARA: from then on it is frozen. The change log gets its line first. */
function release(draft: Tara, context: ChangeContext): string {
  const needs = releaseNeeds(draft, assess(draft));
  if (needs.length > 0) throw new Refusal(`The TARA cannot be released yet. ${needs.join(" ")}`, "conflict");
  const signedBy = (role: string) => draft.signoffs.find((s) => s.role === role)?.name ?? null;
  draft.changeLog.push({
    version: draft.meta.revision,
    date: context.now.slice(0, 10),
    author: signedBy("author"),
    description: `Revision ${draft.meta.revision} released.`,
    approvedBy: signedBy("approver"),
  });
  draft.meta.status = "released";
  draft.meta.releasedAt = context.now;
  return `Released revision ${draft.meta.revision}`;
}

// ------------------------------------------------------------------------------------------------- summary

const LAYOUT_SUMMARY = "Arranged the diagram";

/** One line for several changes: the first few in words, the rest counted. */
function summarise(done: string[]): string {
  const distinct = [...new Set(done)];
  if (distinct.length <= 3) return distinct.join("; ");
  return `${distinct.slice(0, 3).join("; ")}; and ${distinct.length - 3} more`;
}
