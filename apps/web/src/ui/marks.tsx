// The small signs that recur on every screen: a status, a risk value, the state of a control, and the ID of a
// record as a link to it. One colour means one thing wherever it shows.

import {
  CONTROL_STATE_LABELS,
  type ControlState,
  findRecord,
  mentionFinder,
  type RecordKind,
  recordIds,
  type Status,
  type Tara,
} from "@tara/core";
import type { ReactNode } from "react";

/** The step on which each kind of record is listed. */
const STEP_OF_KIND: Record<RecordKind, string> = {
  items: "items",
  elements: "architecture",
  assets: "assets",
  damages: "damages",
  threats: "threats",
  paths: "paths",
  risks: "risks",
  controls: "controls",
  evidence: "evidence",
  goalClaims: "goals",
  craDecisions: "cra",
  references: "references",
};

/** How a record stands, in the words of its next step: in the last column of its list. */
export function StatusChip({ status }: { status: Status | null | undefined }) {
  if (!status) return <span className="chip chip-empty">Not started</span>;
  return <span className={`chip chip-${status.kind}`}>{status.message}</span>;
}

/** What a record needs next, as a band at the top of its panel and of its card. */
export function NextAction({ status }: { status: Status | null | undefined }) {
  if (!status) return <p className="next next-empty">Nothing entered yet.</p>;
  if (status.kind === "done") return <p className="next next-done">{status.message}</p>;
  return (
    <p className={`next next-${status.kind}`}>
      <span>{status.kind === "todo" ? "To complete" : "Waiting for review"}</span>
      {status.message}
    </p>
  );
}

const NONE = <span className="muted">-</span>;

/** A risk value, 1 to 5, on its colour. */
export function ValueChip({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return NONE;
  return (
    <span className={`risk risk-${value}`} title={`Risk value ${value} of 5`}>
      {value}
    </span>
  );
}

const STATE_MEANS: Record<ControlState, string> = {
  proposed: "Recommended; nothing decided yet",
  planned: "Decided, and being built",
  built: "In the code and tested, not yet in the product in use",
  implemented: "In the product in use",
  verified: "In the product in use, and shown by a test",
  failed: "Its test failed",
};
/** What a state of a control means, in a few words: shown when the pointer rests on the state, where it is chosen. */
export const stateMeaning = (state: ControlState): string => STATE_MEANS[state];

/** Where a control stands in the product: one colour per state, the same wherever it shows. */
export function StateChip({ state, small }: { state: ControlState; small?: boolean }) {
  return (
    <span className={`state-chip state-${state}${small ? " state-small" : ""}`} title={STATE_MEANS[state]}>
      {CONTROL_STATE_LABELS[state]}
    </span>
  );
}

/** What a record is, in a few words, for the text that shows when the pointer rests on its ID. */
export function describe(tara: Tara, id: string): string {
  const found = findRecord(tara, id);
  if (!found) return "This record no longer exists";
  const record = found.record as Record<string, unknown>;
  if (found.kind === "risks") return `Risk of: ${describe(tara, String(record.threatId))}`;
  if (found.kind === "evidence") return `Evidence for ${String(record.controlId)} on ${String(record.riskId)}`;
  if (found.kind === "craDecisions") return `CRA Annex I, ${String(record.requirementKey)}`;
  const text = record.name ?? record.description ?? record.statement ?? record.title;
  return typeof text === "string" && text.trim() !== "" ? text : "Nothing entered yet";
}

/** The address of a record inside its TARA. */
export function hrefOf(tara: Tara, id: string): string | null {
  const found = findRecord(tara, id);
  return found ? `#/tara/${tara.id}/${STEP_OF_KIND[found.kind]}/${encodeURIComponent(id)}` : null;
}

/** The ID of a record, as a link to it. Resting on it says what the record is. */
export function RecordLink({ tara, id }: { tara: Tara; id: string | null | undefined }) {
  if (!id) return NONE;
  const href = hrefOf(tara, id);
  if (!href) return <span className="ref-gone">{id}</span>;
  const tip = describe(tara, id);
  return (
    <a className="ref" href={href} data-tip={tip} aria-label={`${id}: ${tip}`} onClick={(e) => e.stopPropagation()}>
      {id}
    </a>
  );
}

/** Several IDs, each a link, as a list in a sentence. */
export function RecordLinks({ tara, ids }: { tara: Tara; ids: string[] }) {
  if (ids.length === 0) return NONE;
  return ids.map((id, index) => (
    <span key={id}>
      {index > 0 && ", "}
      <RecordLink tara={tara} id={id} />
    </span>
  ));
}

/** A text in which every mention of a record's ID leads to that record. */
export function Linked({ tara, text }: { tara: Tara; text: string | null | undefined }): ReactNode {
  if (!text) return NONE;
  return piecesOf(tara)(text).map((piece, index) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one text never change places
    piece.id ? <RecordLink key={index} tara={tara} id={piece.id} /> : piece.text,
  );
}

/** The finder of the IDs in a text, kept for each state of a TARA: it is asked for by every text on a page. */
const finders = new WeakMap<Tara, ReturnType<typeof mentionFinder>>();
function piecesOf(tara: Tara): ReturnType<typeof mentionFinder> {
  const known = finders.get(tara);
  if (known) return known;
  const finder = mentionFinder(recordIds(tara));
  finders.set(tara, finder);
  return finder;
}
