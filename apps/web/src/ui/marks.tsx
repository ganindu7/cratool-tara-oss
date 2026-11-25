// The small signs that recur on every screen: a status, a risk value, the state of a control, and the ID of a
// record as a link to it. One colour means one thing wherever it shows.

import { CONTROL_STATE_LABELS, type ControlState, findRecord, type RecordKind, type Status, type Tara } from "@tara/core";
import type { ReactNode } from "react";

/** The step on which each kind of record is listed. */
export const STEP_OF_KIND: Record<RecordKind, string> = {
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

/** What a status means for the person: done, waiting for a review, or something to enter. */
export function StatusMark({ status }: { status: Status | null | undefined }) {
  if (!status) return <span className="status status-todo">Not started</span>;
  return <span className={`status status-${status.kind}`}>{status.message}</span>;
}

/** A risk value, 1 to 5, on its colour. */
export function ValueChip({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined)
    return (
      <span className="value value-none" title="No value yet">
        –
      </span>
    );
  return (
    <span className={`value value-${value}`} title={`Risk value ${value} of 5`}>
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
export const stateMeaning = (state: ControlState): string => STATE_MEANS[state];

/** Where a control stands in the product. */
export function StateChip({ state }: { state: ControlState }) {
  return (
    <span className={`state state-${state}`} title={STATE_MEANS[state]}>
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

/** The ID of a record, as a link to it. */
export function RecordLink({ tara, id }: { tara: Tara; id: string | null | undefined }) {
  if (!id) return <span className="muted">–</span>;
  const href = hrefOf(tara, id);
  if (!href) return <span className="id id-gone">{id}</span>;
  return (
    <a className="id" href={href} title={describe(tara, id)} onClick={(e) => e.stopPropagation()}>
      {id}
    </a>
  );
}

/** Several IDs, each a link. */
export function RecordLinks({ tara, ids }: { tara: Tara; ids: string[] }) {
  if (ids.length === 0) return <span className="muted">–</span>;
  return (
    <span className="ids">
      {ids.map((id) => (
        <RecordLink key={id} tara={tara} id={id} />
      ))}
    </span>
  );
}

/** A text in which every mention of a record's ID leads to that record. */
export function Linked({ tara, text }: { tara: Tara; text: string | null | undefined }): ReactNode {
  if (!text) return <span className="muted">–</span>;
  // An ID counts only where it stands alone, not inside a longer word or number.
  const parts = text.split(/([A-Za-z][A-Za-z0-9._-]*[0-9][A-Za-z0-9._-]*)/);
  return parts.map((part, index) => {
    const id = part.replace(/[.-]+$/, "");
    const href = index % 2 === 1 ? hrefOf(tara, id) : null;
    if (!href) return part;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one text never change places
      <span key={index}>
        <a className="id" href={href} title={describe(tara, id)}>
          {id}
        </a>
        {part.slice(id.length)}
      </span>
    );
  });
}
