// What is still open in a TARA, named for a person: in which step, on which record, and where it is settled.
// The ribbon counts these, the list of what is left shows them, and the release waits for them.

import { openFindings, type Status } from "@tara/core";
import { SCOPE_LABELS } from "./scopeLabels.ts";
import { type Ctx, STEPS, type StepDef } from "./steps.tsx";

/** One thing that is still open in a TARA: a check that is not settled, with the step it belongs to and where to settle it. */
export interface OpenPoint {
  /** Tells one point from another in a list. */
  key: string;
  step: StepDef;
  /** The record's ID, the scope question, or the step itself where the point is about the TARA as a whole. */
  name: string;
  /** Whether the name is the ID of a record. */
  isRecord: boolean;
  /** Where the point is settled. */
  href: string;
  status: Status;
}

/** Every check that is not settled, in the order of the steps. */
export function openPoints(ctx: Ctx): OpenPoint[] {
  const points: OpenPoint[] = [];
  for (const finding of openFindings(ctx.assessment.checks)) {
    const step = STEPS.find((candidate) => candidate.checked === finding.step);
    if (!step) continue;
    const place = `#/tara/${ctx.tara.id}/${step.key}`;
    points.push({
      key: `${finding.step}-${finding.recordId ?? finding.scopeKey ?? ""}`,
      step,
      name: finding.recordId ?? (finding.scopeKey ? SCOPE_LABELS[finding.scopeKey].label : step.title),
      isRecord: finding.recordId !== null,
      href: finding.recordId ? `${place}/${encodeURIComponent(finding.recordId)}` : place,
      status: finding.status,
    });
  }
  return points.sort((a, b) => STEPS.indexOf(a.step) - STEPS.indexOf(b.step));
}
