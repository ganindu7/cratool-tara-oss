// The scope of the assessment: what is assessed, which rules apply, and the review that every rating waits for.
// It is a table that is filled in: the question, the decision, where the decision is written down, and how
// the row stands. The evidence handed over at release is the same kind of table (pages/ReportStep.tsx).

import { SCOPE_FIELD_KEYS, SCOPE_FIELDS_APPLICABILITY, type ScopeKey, type Status } from "@tara/core";
import type { ReactNode } from "react";
import { SCOPE_LABELS } from "../scopeLabels.ts";
import type { Ctx, StepDef } from "../steps.tsx";
import { SelectField, TextField } from "../ui/fields.tsx";
import { StatusChip } from "../ui/marks.tsx";
import { ReviewBox } from "../ui/ReviewBox.tsx";
import { StepHead } from "../ui/StepHead.tsx";
import type { OpenTara } from "../useTara.ts";

const APPLICABILITY = [
  { value: "in_scope", label: "In scope" },
  { value: "out_of_scope", label: "Out of scope" },
];

/** How a row of the scope or of the hand-over evidence stands. */
function statusOf(ctx: Ctx, key: ScopeKey): Status | undefined {
  const { scopeFields, handover } = ctx.assessment.checks;
  return { ...scopeFields, ...handover }[key as keyof typeof scopeFields & keyof typeof handover];
}

/** One row: what is asked, the decision, the evidence for it, and its status. */
function ScopeRow({ scopeKey, ctx, open }: { scopeKey: ScopeKey; ctx: Ctx; open: OpenTara }) {
  const entry = ctx.tara.scope[scopeKey];
  const { label, help, example } = SCOPE_LABELS[scopeKey];
  const frozen = ctx.tara.meta.status === "released";
  const set = (values: { decision?: string | null; evidence?: string | null }) =>
    open.send({ op: "setScope", key: scopeKey, values });
  return (
    <tr>
      <td className="grow">
        <b>{label}</b>
        <span className="help">{help}</span>
      </td>
      <td className="grow">
        {(SCOPE_FIELDS_APPLICABILITY as readonly string[]).includes(scopeKey) ? (
          <SelectField
            quiet
            label={label}
            value={entry.decision}
            options={APPLICABILITY}
            empty="Pending"
            disabled={frozen}
            onCommit={(decision) => set({ decision })}
          />
        ) : (
          <TextField
            quiet
            label={label}
            value={entry.decision}
            example={example}
            multiline
            disabled={frozen}
            onCommit={(decision) => set({ decision })}
          />
        )}
      </td>
      <td>
        <TextField
          quiet
          label={`Evidence for: ${label}`}
          value={entry.evidence}
          example="RF-01, section 2"
          multiline
          disabled={frozen}
          onCommit={(evidence) => set({ evidence })}
        />
      </td>
      <td>
        <StatusChip status={statusOf(ctx, scopeKey)} />
      </td>
    </tr>
  );
}

interface TableProps {
  /** What the first column holds: "Question" for the scope, "Evidence" for what is handed over at release. */
  heading: string;
  keys: readonly ScopeKey[];
  ctx: Ctx;
  open: OpenTara;
  /** A last row, such as the review of the scope. */
  children?: ReactNode;
}

/** A table that is filled in. Its columns are fixed, so a long answer cannot squeeze the question or the status. */
export function ScopeTable({ heading, keys, ctx, open, children }: TableProps) {
  return (
    <div className="table-wrap">
      <table className="scope">
        <thead>
          <tr>
            <th className="grow">{heading}</th>
            <th className="grow">Decision</th>
            <th>Evidence: where it is written down</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <ScopeRow key={key} scopeKey={key} ctx={ctx} open={open} />
          ))}
          {children}
        </tbody>
      </table>
    </div>
  );
}

/** The screen of the Scope step: the table of the scope questions, with the review of the scope as its last row. */
export function ScopeStep({ step, ctx, open }: { step: StepDef; ctx: Ctx; open: OpenTara }) {
  return (
    <>
      <StepHead title={step.title} intro={step.intro} />
      <ScopeTable heading="Question" keys={SCOPE_FIELD_KEYS} ctx={ctx} open={open}>
        <tr>
          <td className="grow">
            <b>{SCOPE_LABELS.scope_review.label}</b>
            <span className="help">Confirms the scope and the scoring method. Risk ratings cannot be reviewed before it.</span>
          </td>
          <td className="grow" colSpan={2}>
            <ReviewBox
              open={open}
              kind="scope"
              subjectId={null}
              label="Scope review reference"
              help={SCOPE_LABELS.scope_review.help}
              status={ctx.assessment.checks.scopeReview}
              decision={{ value: ctx.tara.scope.scope_review.decision, label: "Outcome of the review", example: "Approved" }}
            />
          </td>
          <td>
            <StatusChip status={ctx.assessment.checks.scopeReview} />
          </td>
        </tr>
      </ScopeTable>
    </>
  );
}
