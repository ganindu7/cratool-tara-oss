// Giving records their IDs.
//
// An ID is given once and means one thing for good. A new record takes one more than the highest number ever
// given for its prefix; the number of a removed record is never given again. This is what lets a report, a
// review or a ticket written last year still point at the right record today.

import { KINDS } from "./schema.ts";
import { findRecord, RECORD_KINDS, type RecordKind, recordsOf, type Tara } from "./tara.ts";

/** The number at the end of an ID with a given prefix, or null if the ID is not of that form. */
function numberOf(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const digits = id.slice(prefix.length);
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** The highest number in use or ever given for a prefix. */
export function highestNumber(tara: Tara, prefix: string): number {
  let highest = tara.counters[prefix] ?? 0;
  for (const kind of RECORD_KINDS) {
    for (const record of recordsOf(tara, kind)) {
      const n = numberOf(record.id, prefix);
      if (n !== null && n > highest) highest = n;
    }
  }
  return highest;
}

/**
 * The ID for a new record of a kind, or null when the kind's IDs follow from the new record's values and
 * those do not say enough yet (an element without a kind).
 *
 * Records the number as given: `tara.counters` is changed. Call it only on a copy that is being changed.
 */
export function takeNextId(tara: Tara, kind: RecordKind, values: Record<string, unknown>): string | null {
  const format = KINDS[kind].id;
  if (!format) return null;
  const prefix = typeof format.prefix === "function" ? format.prefix(values) : format.prefix;
  if (prefix === null) return null;
  const next = highestNumber(tara, prefix) + 1;
  tara.counters[prefix] = next;
  return prefix + String(next).padStart(format.digits, "0");
}

/** The ID of the risk of a threat scenario: TS003 gives R003. */
export const riskIdFor = (threatId: string): string => `R${threatId.replace(/^TS/, "")}`;

/** The IDs that were given in this TARA and belong to no record any more. They are never given again. */
export function withdrawnIds(tara: Tara): string[] {
  const withdrawn: string[] = [];
  for (const [prefix, last] of Object.entries(tara.counters)) {
    const digits =
      Object.values(KINDS).find((k) => k.id && typeof k.id.prefix === "string" && k.id.prefix === prefix)?.id?.digits ?? 2;
    for (let n = 1; n <= last; n++) {
      const id = prefix + String(n).padStart(digits, "0");
      if (!findRecord(tara, id)) withdrawn.push(id);
    }
  }
  return withdrawn;
}
