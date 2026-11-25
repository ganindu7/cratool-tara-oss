// The scope of the assessment: what is assessed, which rules apply, and the review that every rating waits for.

import { SCOPE_FIELD_KEYS, SCOPE_FIELDS_APPLICABILITY, type ScopeKey } from "@tara/core";
import { SCOPE_LABELS } from "../scopeLabels.ts";
import type { Ctx } from "../steps.tsx";
import { SelectField, TextField } from "../ui/fields.tsx";
import { StatusMark } from "../ui/marks.tsx";
import { ReviewBox } from "../ui/ReviewBox.tsx";
import type { OpenTara } from "../useTara.ts";

const APPLICABILITY = [
  { value: "in_scope", label: "In scope" },
  { value: "out_of_scope", label: "Out of scope" },
];

/** One scope field or row of evidence: the decision, the evidence for it, and its status. */
export function ScopeRow({ scopeKey, ctx, open }: { scopeKey: ScopeKey; ctx: Ctx; open: OpenTara }) {
  const entry = ctx.tara.scope[scopeKey];
  const label = SCOPE_LABELS[scopeKey];
  const frozen = ctx.tara.meta.status === "released";
  const status =
    scopeKey in ctx.assessment.checks.scopeFields
      ? ctx.assessment.checks.scopeFields[scopeKey as keyof typeof ctx.assessment.checks.scopeFields]
      : ctx.assessment.checks.handover[scopeKey as keyof typeof ctx.assessment.checks.handover];
  const isApplicability = (SCOPE_FIELDS_APPLICABILITY as readonly string[]).includes(scopeKey);
  const set = (values: { decision?: string | null; evidence?: string | null }) =>
    open.send({ op: "setScope", key: scopeKey, values });
  return (
    <section className={`scope-row row-${status?.kind ?? "todo"}`}>
      <header>
        <h2>{label.label}</h2>
        <StatusMark status={status} />
      </header>
      <p className="help">{label.help}</p>
      <div className="scope-fields">
        {isApplicability ? (
          <SelectField
            label="Decision"
            value={entry.decision}
            options={APPLICABILITY}
            empty="Not decided"
            disabled={frozen}
            onCommit={(decision) => set({ decision })}
          />
        ) : (
          <TextField
            label="Decision"
            value={entry.decision}
            example={label.example}
            multiline
            disabled={frozen}
            onCommit={(decision) => set({ decision })}
          />
        )}
        <TextField
          label="Evidence"
          value={entry.evidence}
          help="Where this is written down. Name a document of the references by its ID."
          disabled={frozen}
          onCommit={(evidence) => set({ evidence })}
        />
      </div>
    </section>
  );
}

export function ScopeStep({ ctx, open, intro }: { ctx: Ctx; open: OpenTara; intro: string }) {
  return (
    <div className="step">
      <div className="step-main narrow">
        <header className="step-head">
          <div>
            <h1>Scope</h1>
            <p className="lede">{intro}</p>
          </div>
        </header>
        {SCOPE_FIELD_KEYS.map((key) => (
          <ScopeRow key={key} scopeKey={key} ctx={ctx} open={open} />
        ))}
        <ReviewBox
          open={open}
          kind="scope"
          subjectId={null}
          label="Scope review"
          help={SCOPE_LABELS.scope_review.help}
          status={ctx.assessment.checks.scopeReview}
          decision={{ value: ctx.tara.scope.scope_review.decision, label: "Outcome", example: "Approved" }}
        />
      </div>
    </div>
  );
}
