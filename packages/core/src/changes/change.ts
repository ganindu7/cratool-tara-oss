// The changes that can be made to a TARA.
//
// A change is a plain value: it can be sent over the network, written to a log, and applied by `applyChanges`
// (apply.ts), which is the only code that turns one TARA into the next. Nothing else writes to a TARA.

import type { Method } from "../model/method.ts";
import type { RecordKind, ReviewKind, ScopeEntry, ScopeKey, SignoffRole, TaraMeta } from "../model/tara.ts";
import type { CONTROL_STATES } from "../rules/controls.ts";

/** The details of the document a person can change. The rest of `meta` follows from what happens to the TARA. */
export const EDITABLE_META = [
  "title",
  "product",
  "organisation",
  "documentNumber",
  "revision",
  "storageLocation",
  "distribution",
] as const satisfies readonly (keyof TaraMeta)[];

/** One change to a TARA, told apart by its `op`. These are all there are: `applyChanges` refuses any other. */
export type Change =
  /** Adds a record. The tool gives it its ID; `id` is for the kinds where a person may choose it. */
  | { op: "add"; kind: RecordKind; values?: Record<string, unknown>; id?: string }
  /** Changes fields of a record. Only the named fields change. */
  | { op: "set"; kind: RecordKind; id: string; values: Record<string, unknown> }
  /** Removes a record and takes it out of every link. Refused while other records depend on it. */
  | { op: "remove"; kind: RecordKind; id: string }
  | { op: "setMeta"; values: Partial<Pick<TaraMeta, (typeof EDITABLE_META)[number]>> }
  | { op: "setScope"; key: ScopeKey; values: Partial<ScopeEntry> }
  /** Replaces the TARA's scoring method. */
  | { op: "setMethod"; method: Method }
  /** Says where a control stands in the product, on every risk that uses it. */
  | { op: "setControlState"; id: string; state: (typeof CONTROL_STATES)[number] }
  /**
   * Records a review, and confirms it if the record is ready. `decision` is the outcome, for the scope and
   * release reviews. subjectId is null for those two, which cover the whole TARA.
   */
  | { op: "review"; kind: ReviewKind; subjectId: string | null; reference: string; decision?: string }
  | { op: "clearReview"; kind: ReviewKind; subjectId: string | null }
  /** The person making the change signs in a role, for the assessment as it stands. */
  | { op: "sign"; role: SignoffRole; roleTitle?: string | null; evidenceRef?: string | null }
  | { op: "unsign"; role: SignoffRole }
  /** Releases the TARA. From then on it cannot be changed. */
  | { op: "release" };

/** Who makes a change, and when. */
export interface ChangeContext {
  /** The name of the person, as it will stand in the history, on reviews and under signatures. */
  author: string;
  /** The moment of the change, as an ISO date and time. */
  now: string;
}

/** What the author is called when the tool was not told a name. Such a person can work, but cannot sign. */
export const UNNAMED_AUTHOR = "Unnamed";

/**
 * Why a change was refused. The server turns it into an HTTP status.
 *
 * invalid:   the change itself is wrong.         not_found: it names something that does not exist.
 * conflict:  it does not fit the TARA as it is.  frozen:    the TARA is released.
 */
export type RefusalReason = "invalid" | "not_found" | "conflict" | "frozen";

/** A change that was not made, with the reason in words a person can act on. Nothing was changed. */
export class Refusal extends Error {
  readonly reason: RefusalReason;
  constructor(message: string, reason: RefusalReason = "invalid") {
    super(message);
    this.name = "Refusal";
    this.reason = reason;
  }
}
