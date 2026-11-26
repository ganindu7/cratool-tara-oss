// What is done about the risks: the treatment of each, the goals and claims, the controls with their
// evidence, the reviews, and the decisions on the essential requirements of the Cyber Resilience Act.

import { CONTROL_STATE_LABELS, controlState, craSummary, craTrace, type Review, reviewKey, risksUsingControl } from "@tara/core";
import { col, NONE, p, REVIEW_KIND_TEXT, type ReportContext, show, table } from "../context.ts";
import type { Section } from "../model.ts";

type Body = Omit<Section, "key">;

/** The treatment of each risk: the decision with its controls, goals and claims, then its rationale and the risk that remains. */
export function treatment(c: ReportContext): Body {
  const { tara, checks } = c;
  return {
    title: "Risk treatment decisions",
    answers: "ISO/SAE 21434 clause 15.9, work product WP-15-08",
    blocks: [
      table(
        "Treatment of each risk",
        [
          col("Risk", "fit"),
          col("Value", "fit"),
          col("Treatment", 12),
          col("Existing controls"),
          col("Proposed controls"),
          col("Goals / claims", 16),
          col("Treatment check", 22),
        ],
        tara.risks.map((risk) => [
          risk.id,
          show(c.riskScore(risk.threatId).value),
          c.treatmentName(risk.treatment),
          c.ids(risk.existingControlIds),
          c.ids(risk.proposedControlIds),
          c.ids(tara.goalClaims.filter((g) => g.riskIds.includes(risk.id)).map((g) => g.id)),
          c.message(checks.riskTreatment.get(risk.id)),
        ]),
      ),
      table(
        "Decision rationale and residual risk",
        [
          col("Risk", "fit"),
          col("Decision rationale"),
          col("Owner / review date", 16),
          col("Residual impact", 10),
          col("Residual feasibility", 10),
          col("Residual value", "fit"),
          col("Residual basis", 20),
          col("Approval", 12),
        ],
        tara.risks
          .filter((risk) => risk.treatment !== null || risk.rationale !== null)
          .map((risk) => [
            risk.id,
            show(risk.rationale),
            [risk.owner, risk.reviewDate].filter(Boolean).join(" / ") || NONE,
            c.levelName(risk.residualImpact),
            c.feasibilityName(risk.residualFeasibility),
            show(c.residualValue(risk)),
            show(risk.residualBasis),
            c.reviewReference("treatment", risk.id),
          ]),
        { empty: "No treatment is decided yet." },
      ),
      p(
        "The residual value is what remains once the existing controls are counted. A risk that is avoided has none: the exposure is removed, and the basis says how.",
      ),
    ],
  };
}

/** The cybersecurity goals and claims, each with the risks it answers and its review. */
export function goals(c: ReportContext): Body {
  const { tara, checks } = c;
  return {
    title: "Cybersecurity goals and claims",
    answers: "ISO/SAE 21434 clause 9.4, work products WP-09-03, WP-09-04",
    blocks: [
      p(
        "A risk that is reduced has a cybersecurity goal. A risk that is retained or shared has a cybersecurity claim stating why that is acceptable.",
      ),
      table(
        "Goals and claims",
        [col("ID", "fit"), col("Kind", "fit"), col("Statement"), col("Risks", 14), col("Review reference", 16), col("Check", 18)],
        tara.goalClaims.map((goal) => [
          goal.id,
          goal.kind === "goal" ? "Goal" : "Claim",
          show(goal.statement),
          c.ids(goal.riskIds),
          c.reviewReference("goal_claim", goal.id),
          c.message(checks.goalClaims.get(goal.id)),
        ]),
        { defines: true },
      ),
    ],
  };
}

/** The controls, each with where it stands in the product, and the evidence recorded: each entry for one control on one risk. */
export function controls(c: ReportContext): Body {
  const { tara, checks } = c;
  const capital = (word: string | null) => (word ? word[0]?.toUpperCase() + word.slice(1) : null);
  return {
    title: "Controls and control evidence",
    answers: "ISO/SAE 21434 clauses 9.5, 10.4; CRA Annex VII point 6",
    blocks: [
      table(
        "Controls",
        [
          col("ID", "fit"),
          col("Control"),
          col("Type and state", 13),
          col("Acts in", 9),
          col("CRA Annex I Part I(2)", 8),
          col("Attack paths covered", 11),
          col("Used by risks", 9),
        ],
        tara.controls.map((control) => [
          control.id,
          [control.name, control.description].filter(Boolean).join(": ") || NONE,
          [capital(control.type), CONTROL_STATE_LABELS[controlState(tara, control.id)], control.workLink]
            .filter(Boolean)
            .join(". "),
          c.ids(control.elementIds),
          control.craTags.join(", ") || NONE,
          c.ids(control.coveredPathIds),
          c.ids(risksUsingControl(tara, control.id).map((r) => r.id)),
        ]),
        { defines: true },
      ),
      p(
        "The state of a control says where it stands in the product. Proposed: recommended, nothing decided. Under way: decided and being built. " +
          "Built: implemented and tested, not yet in the product in use. Live: in the product in use. Verified: in the product in use, and shown to work by a test.",
      ),
      table(
        "Control evidence",
        [
          col("ID", "fit"),
          col("Risk", "fit"),
          col("Control", "fit"),
          col("Configuration", 10),
          col("Effect"),
          col("Implementation"),
          col("Verification"),
          col("Result", "fit"),
          col("Verified for", 6),
          col("Status", 9),
        ],
        tara.evidence.map((evidence) => [
          evidence.id,
          evidence.riskId,
          evidence.controlId,
          show(evidence.configurationId),
          show(evidence.effect),
          show(evidence.implementationRef),
          show(evidence.verificationRef),
          evidence.result === "pass" ? "Pass" : evidence.result === "fail" ? "Fail" : NONE,
          evidence.verifiedCraTags.join(", ") || NONE,
          c.message(checks.evidence.get(evidence.id)),
        ]),
        { defines: true },
      ),
      p(
        'A control counts towards a risk only when its evidence has status "Verified": implemented in the stated configuration, tested with a passed result, and reviewed.',
      ),
    ],
  };
}

/** The reviews recorded: what each is about, its reference, who confirmed it and when, and whether it still holds. */
export function reviews(c: ReportContext): Body {
  const { tara } = c;
  const recordOf = (review: Review): string => {
    if (review.kind === "cra_requirement") return show(tara.craDecisions.find((d) => d.id === review.subjectId)?.requirementKey);
    if (review.kind === "control_evidence") {
      const evidence = tara.evidence.find((e) => e.id === review.subjectId);
      return evidence ? `${evidence.id} (${evidence.riskId} / ${evidence.controlId})` : NONE;
    }
    return review.subjectId ?? "The whole assessment";
  };
  const current = (review: Review) => c.assessment.currentReviews.has(reviewKey(review.kind, review.subjectId));
  return {
    title: "Review and verification record",
    answers: "ISO/SAE 21434 clause 9.4.2 [RQ-09-07], work product WP-09-05",
    blocks: [
      p(
        "A review is valid for the content that was reviewed. If that content, or anything it depends on, changes afterwards, the status of the record asks for the review to be confirmed again.",
      ),
      table(
        "Reviews recorded",
        [
          col("Subject", 18),
          col("Record", 18),
          col("Review reference"),
          col("Confirmed", 24),
          col("Still covers the content", 14),
        ],
        tara.reviews.map((review) => [
          REVIEW_KIND_TEXT[review.kind],
          recordOf(review),
          review.reference,
          review.confirmedAt
            ? `${review.confirmedAt.slice(0, 10)}${review.confirmedBy ? ` by ${review.confirmedBy}` : ""}`
            : "Not confirmed",
          current(review) ? "Yes" : review.confirmedAt ? "No: changed since" : NONE,
        ]),
      ),
    ],
  };
}

/**
 * The decision on each essential requirement of CRA Annex I, and for those of Part I(2) the controls tagged to
 * each, the risks those controls treat, and the evidence verified for it.
 */
export function cra(c: ReportContext): Body {
  const { tara, checks } = c;
  const part = (caption: string, partTwo: boolean) => {
    const decisions = tara.craDecisions.filter((d) => d.requirementKey.startsWith("II(") === partTwo);
    return table(
      caption,
      [
        col("Req.", "fit"),
        col("Requirement"),
        col("Applies", 9),
        col("Justification"),
        col("Implementation", 15),
        col("Verification", 15),
        col("Status", 14),
      ],
      decisions.map((decision) => [
        decision.requirementKey,
        show(craSummary(decision.requirementKey)),
        decision.applicability === "applies"
          ? "Applies"
          : decision.applicability === "does_not_apply"
            ? "Does not apply"
            : "Pending",
        show(decision.justification),
        show(decision.implementationRef),
        show(decision.verificationRef),
        c.message(checks.cra.get(decision.id)),
      ]),
      { rowIds: decisions.map((d) => d.id) },
    );
  };
  return {
    title: "CRA essential requirements",
    answers: "CRA Art. 13(3) and 13(4); Annex I; Annex VII point 3",
    blocks: [
      p(
        `CRA applicability for this product: ${c.decisionText("cra_applicability")} (evidence: ${show(tara.scope.cra_applicability.evidence)}). ` +
          "For each essential requirement the tables state whether it applies, the justification, how it is implemented and how that was verified. " +
          "A requirement that does not apply carries its justification, as Article 13(4) requires. The requirement column is a one-line reminder; the regulation itself is authoritative.",
      ),
      part("Annex I Part I(2): security requirements relating to the properties of the product", false),
      part("Annex I Part II: vulnerability handling requirements", true),
      p(
        "The next table shows how each Part I(2) requirement is informed by the risk assessment: the controls tagged to it, the risks those controls treat, and the controls whose evidence is verified for that requirement.",
      ),
      table(
        "Annex I Part I(2) requirements traced to risks and verified controls",
        [col("Req.", "fit"), col("Controls tagged"), col("Risks treated"), col("Verified for this requirement")],
        tara.craDecisions.flatMap((decision) => {
          const trace = craTrace(tara, checks, decision.requirementKey);
          if (trace === null) return [];
          const verified =
            trace.verified.length > 0 ? trace.verified.map((e) => `${e.controlId} (${e.riskId})`).join(", ") : NONE;
          return [[decision.requirementKey, c.ids(trace.controlIds), c.ids(trace.riskIds), verified]];
        }),
      ),
    ],
  };
}
