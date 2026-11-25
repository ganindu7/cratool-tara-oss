// What changed between two states of a TARA, in a form that can be kept, read and undone.
//
// A delta is a list of entries, each naming one place in the document by a path, with what was there before
// and what is there now:
//
//   assets/A03                 a record added (no `before`) or removed (no `after`)
//   assets/A03/name            one field of a record
//   damages/DS-0002/ratings.safety
//   scope/intended_use/decision
//   meta/title    method    reviews/attack_path:AP001/fingerprint    signoffs/author
//
// The delta is worked out by comparing the two documents, so it is right whatever made the change. The
// history of a TARA is a list of deltas (the store keeps it), and that gives three things at once: a record
// of who changed what from what to what, undo (apply a delta backwards), and the means to notice that two
// people changed the same place (their deltas name the same path).

import { getField, setField } from "../model/schema.ts";
import { type AnyRecord, RECORD_KINDS, SCOPE_KEYS, type Tara } from "../model/tara.ts";
import { reviewKey } from "../rules/checks.ts";
import { Refusal } from "./change.ts";

export interface DeltaEntry {
  path: string;
  /** Absent: the place did not exist before (a record was added). */
  before?: unknown;
  /** Absent: the place no longer exists (a record was removed). */
  after?: unknown;
  /** For a record added or removed: its position in its list. */
  index?: number;
}
export type Delta = DeltaEntry[];

/** The lists of a TARA whose entries have a key, with how the key is read. */
const KEYED_LISTS: { name: string; key: (entry: AnyRecord) => string }[] = [
  ...RECORD_KINDS.map((kind) => ({ name: kind as string, key: (record: AnyRecord) => record.id })),
  { name: "reviews", key: (review) => reviewKey(review.kind as never, review.subjectId as string | null) },
  { name: "signoffs", key: (signoff) => String(signoff.role) },
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** True when two JSON values hold the same thing. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => sameValue(value, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameValue(a[key], b[key]));
  }
  return false;
}

/** The fields of a record by name. A group of values ("ratings") is listed value by value ("ratings.safety"). */
function fieldsOf(record: AnyRecord): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  for (const [name, value] of Object.entries(record)) {
    if (isPlainObject(value)) for (const [key, inner] of Object.entries(value)) fields.set(`${name}.${key}`, inner);
    else fields.set(name, value);
  }
  return fields;
}

/** Compares two states of a TARA. `seq` and `meta.updatedAt` are left out: they change with every change. */
export function diffTara(before: Tara, after: Tara): Delta {
  const delta: Delta = [];
  const compare = (path: string, a: unknown, b: unknown) => {
    if (!sameValue(a, b)) delta.push({ path, before: a, after: b });
  };

  for (const key of new Set([...Object.keys(before.meta), ...Object.keys(after.meta)])) {
    if (key === "updatedAt") continue;
    compare(
      `meta/${key}`,
      (before.meta as unknown as Record<string, unknown>)[key],
      (after.meta as unknown as Record<string, unknown>)[key],
    );
  }
  for (const key of SCOPE_KEYS) {
    compare(`scope/${key}/decision`, before.scope[key]?.decision, after.scope[key]?.decision);
    compare(`scope/${key}/evidence`, before.scope[key]?.evidence, after.scope[key]?.evidence);
  }
  compare("method", before.method, after.method);
  compare("changeLog", before.changeLog, after.changeLog);
  compare("reviewCount", before.reviewCount, after.reviewCount);
  for (const prefix of new Set([...Object.keys(before.counters), ...Object.keys(after.counters)])) {
    compare(`counters/${prefix}`, before.counters[prefix], after.counters[prefix]);
  }

  for (const list of KEYED_LISTS) {
    const was = (before as unknown as Record<string, AnyRecord[]>)[list.name] ?? [];
    const is = (after as unknown as Record<string, AnyRecord[]>)[list.name] ?? [];
    const wasByKey = new Map(was.map((entry, index) => [list.key(entry), { entry, index }]));
    const isByKey = new Map(is.map((entry, index) => [list.key(entry), { entry, index }]));
    for (const [key, { entry, index }] of wasByKey) {
      if (!isByKey.has(key)) delta.push({ path: `${list.name}/${key}`, before: entry, index });
    }
    for (const [key, { entry, index }] of isByKey) {
      const earlier = wasByKey.get(key);
      if (!earlier) {
        delta.push({ path: `${list.name}/${key}`, after: entry, index });
        continue;
      }
      const wasFields = fieldsOf(earlier.entry);
      const isFields = fieldsOf(entry);
      for (const name of new Set([...wasFields.keys(), ...isFields.keys()])) {
        compare(`${list.name}/${key}/${name}`, wasFields.get(name), isFields.get(name));
      }
    }
  }
  return delta;
}

/** A delta that undoes another: the same places, each with before and after exchanged. */
export function invertDelta(delta: Delta): Delta {
  return delta.map((entry) => {
    const inverse: DeltaEntry = { path: entry.path };
    if ("after" in entry) inverse.before = entry.after;
    if ("before" in entry) inverse.after = entry.before;
    if (entry.index !== undefined) inverse.index = entry.index;
    return inverse;
  });
}

/**
 * Applies a delta to a TARA and gives back the result; the TARA passed in is unchanged.
 *
 * A delta applies only to the state it was made from. Where a place does not hold what the delta says was
 * there before, the delta is refused: the TARA has changed in between.
 */
export function applyDelta(current: Tara, delta: Delta): Tara {
  const draft = structuredClone(current) as Tara & Record<string, unknown>;
  const changedSince = () =>
    new Refusal("This cannot be undone as it stands: the same place was changed again afterwards.", "conflict");
  const parts = (entry: DeltaEntry) => entry.path.split("/") as [string, string | undefined, string | undefined];
  const listOf = (entry: DeltaEntry) => KEYED_LISTS.find((list) => list.name === parts(entry)[0]);
  const isWholeEntry = (entry: DeltaEntry) => listOf(entry) !== undefined && parts(entry)[2] === undefined;

  // 1. Entries that go. They are found by their key, so their order does not matter.
  for (const entry of delta.filter((e) => isWholeEntry(e) && "before" in e && e.before !== undefined)) {
    const [head, key] = parts(entry);
    const entries = draft[head] as AnyRecord[];
    const index = entries.findIndex((e) => listOf(entry)?.key(e) === key);
    if (index < 0 || !sameValue(entries[index], entry.before)) throw changedSince();
    entries.splice(index, 1);
  }

  // 2. Entries that come, each at its place. From the front of the list, so that every place is already there.
  const coming = delta.filter((e) => isWholeEntry(e) && !("before" in e && e.before !== undefined));
  for (const entry of coming.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const [head, key] = parts(entry);
    const entries = draft[head] as AnyRecord[];
    if (entries.some((e) => listOf(entry)?.key(e) === key)) throw changedSince();
    entries.splice(Math.min(entry.index ?? entries.length, entries.length), 0, structuredClone(entry.after) as AnyRecord);
  }

  // 3. Single values: a field of an entry, or a plain value of the document.
  for (const entry of delta.filter((e) => !isWholeEntry(e))) {
    const [head, key, field] = parts(entry);
    const list = listOf(entry);
    if (list && field !== undefined) {
      const record = (draft[head] as AnyRecord[]).find((e) => list.key(e) === key);
      if (!record || !sameValue(getField(record, field), entry.before)) throw changedSince();
      setField(record, field, structuredClone(entry.after));
      continue;
    }
    const holder =
      head === "meta"
        ? draft.meta
        : head === "counters"
          ? draft.counters
          : head === "scope"
            ? draft.scope[key as keyof Tara["scope"]]
            : draft;
    const name = head === "scope" ? field : head === "meta" || head === "counters" ? key : head;
    const values = holder as unknown as Record<string, unknown>;
    if (holder === undefined || name === undefined || !sameValue(values[name], entry.before)) throw changedSince();
    if (entry.after === undefined) delete values[name];
    else values[name] = structuredClone(entry.after);
  }
  return draft;
}

/** Places that are the tool's own bookkeeping. Two people adding records both move a counter, and that is no conflict. */
const isBookkeeping = (path: string): boolean => path.startsWith("counters/") || path === "reviewCount";

/** True when two deltas change the same place, or one changes a record the other adds or removes. */
export function deltasOverlap(a: Delta, b: Delta): boolean {
  const within = (inner: string, outer: string) => inner === outer || inner.startsWith(`${outer}/`);
  const places = (delta: Delta) => delta.map((entry) => entry.path).filter((path) => !isBookkeeping(path));
  return places(a).some((x) => places(b).some((y) => within(x, y) || within(y, x)));
}

/** The records a delta touches, as IDs, for showing what a change was about. */
export function touchedRecords(delta: Delta): string[] {
  const ids = new Set<string>();
  for (const entry of delta) {
    const [head, key] = entry.path.split("/");
    if ((RECORD_KINDS as readonly string[]).includes(head as string) && key) ids.add(key);
  }
  return [...ids];
}
