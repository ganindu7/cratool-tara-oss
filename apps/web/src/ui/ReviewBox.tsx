// Where a review is recorded and its standing shown. A review is confirmed against the content it covered;
// when that content changes, this box says so and asks for the review again (docs/method.md, "Reviews").

import { type ReviewKind, reviewKey, type Status } from "@tara/core";
import { useEffect, useState } from "react";
import type { OpenTara } from "../useTara.ts";

interface Props {
  open: OpenTara;
  kind: ReviewKind;
  /** The reviewed record. Null for the scope and release reviews. */
  subjectId: string | null;
  label: string;
  help: string;
  /** The status of the record the review is about: it says what is still missing before a review can count. */
  status: Status | undefined;
  /** The scope and release reviews also record their outcome. */
  decision?: { value: string | null; label: string; example: string };
}

const day = (moment: string | null) =>
  moment ? new Date(moment).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

/** The box of one review: how the review stands, the reference to where it was held, and confirming it or removing it. */
export function ReviewBox({ open, kind, subjectId, label, help, status, decision }: Props) {
  const { tara, assessment } = open;
  const stored = tara?.reviews.find((r) => r.kind === kind && r.subjectId === subjectId);
  const [reference, setReference] = useState(stored?.reference ?? "");
  const [outcome, setOutcome] = useState(decision?.value ?? "");
  useEffect(() => setReference(stored?.reference ?? ""), [stored?.reference]);
  useEffect(() => setOutcome(decision?.value ?? ""), [decision?.value]);
  if (!tara || !assessment) return null;

  const frozen = tara.meta.status === "released";
  const current = assessment.currentReviews.has(reviewKey(kind, subjectId));
  const standing = !stored ? "none" : current ? "current" : stored.fingerprint ? "stale" : "kept";
  // A review that is current and was not touched has nothing to confirm.
  const unchanged = reference === (stored?.reference ?? "") && outcome === (decision?.value ?? "");
  const record = () => open.send({ op: "review", kind, subjectId, reference, ...(decision ? { decision: outcome } : {}) });

  return (
    <section className={`review review-${standing}`} aria-label={label}>
      <h3>Review</h3>
      {standing === "current" && (
        <p className="review-state">
          Confirmed by {stored?.confirmedBy ?? "someone"}
          {stored?.confirmedAt ? `, ${day(stored.confirmedAt)}` : ""}. It stays valid until this record or something it rests on
          changes.
        </p>
      )}
      {standing === "stale" && (
        <p className="review-state" role="status">
          What this review covered has changed since it was confirmed. Look at it again, then confirm.
        </p>
      )}
      {standing === "kept" && (
        <p className="review-state" role="status">
          The reference is kept. The review does not count yet: <b>{status?.message ?? "complete the record"}</b>. Complete that,
          then confirm again.
        </p>
      )}
      {decision && (
        <label className="field">
          <span className="field-label">{decision.label}</span>
          <input
            value={outcome}
            disabled={frozen}
            placeholder={`e.g. ${decision.example}`}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </label>
      )}
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          value={reference}
          disabled={frozen}
          placeholder="e.g. minutes of the review, 12 March, or REV-01"
          onChange={(e) => setReference(e.target.value)}
        />
        <span className="help">{help}</span>
      </label>
      {!frozen && (
        <div className="actions">
          <button type="button" className="primary" disabled={reference.trim() === "" || (current && unchanged)} onClick={record}>
            {standing === "stale" || standing === "kept" ? "Confirm review again" : "Confirm review"}
          </button>
          {stored && (
            <button type="button" className="link" onClick={() => open.send({ op: "clearReview", kind, subjectId })}>
              Remove the review
            </button>
          )}
        </div>
      )}
    </section>
  );
}
