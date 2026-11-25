// Reviews, and what each one covers.
//
// A review is more than a tick. When a review is confirmed, the tool takes everything the review covered,
// the record itself and every input its result depends on, and stores a fingerprint of it with the review.
// The review is current for as long as the same content still gives the same fingerprint. Change a damage
// rating, and the review of every risk that rests on it asks to be confirmed again. Nothing that was reviewed
// can change quietly.
//
// What each kind of review covers is written out in `contentOf` below. That function is the definition:
// to make a review sensitive to something, put it into the content.

import { fingerprint } from "../model/hash.ts";
import { EVIDENCE_ROW_KEYS, type ReviewKind, SCOPE_FIELD_KEYS, type ScopeKey, type Tara } from "../model/tara.ts";
import type { CheckCode, Status } from "./catalogue.ts";
import { type Checks, check, reviewKey } from "./checks.ts";

/** The status a record shows when everything is in place except a current review. Only then can a review be confirmed. */
export const AWAITING_CONFIRMATION: Record<ReviewKind, CheckCode> = {
  scope: "scope-review.stale",
  release: "release.review-stale",
  attack_path: "path.review-stale",
  risk_rating: "rating.review-stale",
  goal_claim: "goal.review-stale",
  control_evidence: "evidence.review-stale",
  treatment: "treatment.review-stale",
  cra_requirement: "cra.review-stale",
};

/**
 * Reviews are settled in this order, because the content of a later one includes the result of an earlier
 * one: a rating rests on its paths and on verified evidence, a goal on its ratings, a treatment on goals and
 * evidence, and the release on all of them.
 */
const ORDER: ReviewKind[][] = [
  ["scope"],
  ["attack_path", "cra_requirement"],
  ["control_evidence"],
  ["risk_rating"],
  ["goal_claim"],
  ["treatment"],
  ["release"],
];

/** The status a review is judged by: the check of the record it is about. */
export function statusOfReview(kind: ReviewKind, subjectId: string | null, checks: Checks): Status | null {
  const id = subjectId ?? "";
  switch (kind) {
    case "scope":
      return checks.scopeReview;
    case "release":
      return checks.releaseReview;
    case "attack_path":
      return checks.paths.get(id) ?? null;
    case "risk_rating":
      return checks.riskRating.get(id) ?? null;
    case "goal_claim":
      return checks.goalClaims.get(id) ?? null;
    case "control_evidence":
      return checks.evidence.get(id) ?? null;
    case "treatment":
      return checks.riskTreatment.get(id) ?? null;
    case "cra_requirement":
      return checks.cra.get(id) ?? null;
  }
}

/**
 * Everything one review covers, as a plain value. Null when there is nothing to review yet.
 * Lists whose order means nothing are sorted, so that reordering records does not outdate a review.
 */
function contentOf(kind: ReviewKind, id: string | null, tara: Tara, checks: Checks): unknown | null {
  const sorted = <T>(rows: T[]): T[] => [...rows].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const stored = (k: ReviewKind, subjectId: string | null) => tara.reviews.find((r) => r.kind === k && r.subjectId === subjectId);
  /** The number of an earlier review: confirming that review again outdates the ones that rest on it. */
  const revisionOf = (k: ReviewKind, subjectId: string | null) => stored(k, subjectId)?.revision ?? null;
  const reference = stored(kind, id)?.reference ?? null;
  const entry = (key: ScopeKey) => [key, tara.scope[key].decision, tara.scope[key].evidence];
  const scores = checks.scores;

  // The scope: every scope field, the identification of the document, and the items it is about.
  const scopeContent = () => [
    [...SCOPE_FIELD_KEYS, "scope_review" as const].map(entry),
    tara.meta.documentNumber,
    tara.meta.revision,
    sorted(
      tara.items.map((i) => [i.id, i.name, i.configurationRef, i.boundaryFunctions, i.architectureInterfaces, i.environmentUse]),
    ),
  ];
  const damageContent = (damageId: string) => {
    const damage = tara.damages.find((d) => d.id === damageId);
    if (!damage) return [damageId];
    const asset = tara.assets.find((a) => a.id === damage.assetId);
    return [
      damage.id,
      damage.assetId,
      asset?.name ?? null,
      damage.confidentiality,
      damage.integrity,
      damage.availability,
      damage.description,
      damage.ratings,
      damage.impactRationale,
      asset?.itemId ?? null,
      asset?.variant ?? null,
    ];
  };
  const threatContent = (threatId: string) => {
    const threat = tara.threats.find((t) => t.id === threatId);
    return threat ? [threat.id, threat.category, threat.description, sorted(threat.damageIds.map(damageContent))] : [threatId];
  };
  const riskOf = (riskId: string | null) => tara.risks.find((r) => r.id === riskId);

  switch (kind) {
    case "scope":
      return [scopeContent(), tara.method];

    case "attack_path": {
      const path = tara.paths.find((p) => p.id === id);
      const pathScore = path && scores.paths.get(path.id);
      if (!path || !pathScore || path.threatIds.length === 0) return null;
      const threats = path.threatIds.map((threatId) => {
        const threat = tara.threats.find((t) => t.id === threatId);
        return [threatId, threat?.category ?? null, threat?.description ?? null];
      });
      return [
        path.id,
        path.description,
        path.factors,
        pathScore.points,
        path.feasibilityBasis,
        pathScore.totalPoints,
        pathScore.feasibility,
        path.disposition,
        reference,
        sorted(threats),
        scopeContent(),
        tara.method,
      ];
    }

    case "risk_rating": {
      const risk = riskOf(id);
      const riskScore = risk && scores.risks.get(risk.threatId);
      if (!risk || !riskScore || riskScore.value === null) return null;
      const verified = tara.evidence
        .filter((e) => e.riskId === risk.id && checks.evidence.get(e.id)?.code === "evidence.verified")
        .map((e) => [e.controlId, revisionOf("control_evidence", e.id)]);
      return [
        risk.id,
        risk.threatId,
        riskScore.impact,
        riskScore.minAttackPotential,
        riskScore.feasibility,
        riskScore.value,
        reference,
        [...risk.existingControlIds].sort(),
        scopeContent(),
        tara.method,
        threatContent(risk.threatId),
        sorted(riskScore.linkedPathIds.map((p) => [p, revisionOf("attack_path", p), checks.paths.get(p)?.code ?? null])),
        sorted(verified),
      ];
    }

    case "goal_claim": {
      const goal = tara.goalClaims.find((g) => g.id === id);
      if (!goal) return null;
      return [
        goal.id,
        goal.kind,
        goal.statement,
        [...goal.riskIds].sort(),
        reference,
        scopeContent(),
        sorted(goal.riskIds.map((r) => [r, revisionOf("risk_rating", r), checks.riskRating.get(r)?.code ?? null])),
      ];
    }

    case "cra_requirement": {
      const decision = tara.craDecisions.find((d) => d.id === id);
      if (!decision) return null;
      return [
        decision.requirementKey,
        decision.applicability,
        decision.justification,
        decision.implementationRef,
        decision.verificationRef,
        reference,
        scopeContent(),
      ];
    }

    case "control_evidence": {
      const evidence = tara.evidence.find((e) => e.id === id);
      const risk = evidence && riskOf(evidence.riskId);
      if (!evidence || !risk) return null;
      const control = tara.controls.find((c) => c.id === evidence.controlId);
      const coveredHere = (control?.coveredPathIds ?? []).filter((pathId) =>
        tara.paths.find((p) => p.id === pathId)?.threatIds.includes(risk.threatId),
      );
      return [
        evidence.riskId,
        evidence.controlId,
        evidence.configurationId,
        evidence.state,
        evidence.effect,
        evidence.implementationRef,
        evidence.verificationRef,
        evidence.result,
        [...evidence.verifiedCraTags].sort(),
        reference,
        scopeContent(),
        threatContent(risk.threatId),
        control ? [control.id, control.name, control.description, control.type, [...control.craTags].sort()] : null,
        coveredHere.sort(),
      ];
    }

    case "treatment": {
      const risk = riskOf(id);
      if (!risk) return null;
      const goals = tara.goalClaims
        .filter((g) => g.riskIds.includes(risk.id))
        .map((g) => [g.id, checks.goalClaims.get(g.id)?.code ?? null, revisionOf("goal_claim", g.id)]);
      const evidence = tara.evidence
        .filter((e) => e.riskId === risk.id)
        .map((e) => [
          e.controlId,
          e.configurationId,
          checks.evidence.get(e.id)?.code ?? null,
          revisionOf("control_evidence", e.id),
        ]);
      return [
        risk.id,
        risk.treatment,
        risk.rationale,
        risk.owner,
        risk.reviewDate,
        risk.residualImpact,
        risk.residualFeasibility,
        risk.residualBasis,
        reference,
        scopeContent(),
        tara.method,
        revisionOf("risk_rating", risk.id),
        [...risk.existingControlIds].sort(),
        [...risk.proposedControlIds].sort(),
        sorted(goals),
        sorted(evidence),
      ];
    }

    case "release":
      // The whole assessment as it stands: the scope, the method, the evidence handed over, and the number
      // of every review it rests on.
      return [
        scopeContent(),
        tara.method,
        [...EVIDENCE_ROW_KEYS, "release_review" as const].map(entry),
        sorted(tara.risks.map((r) => [r.id, r.treatment, revisionOf("treatment", r.id)])),
        sorted(tara.evidence.map((e) => [e.riskId, e.controlId, e.configurationId, revisionOf("control_evidence", e.id)])),
        tara.craDecisions.map((d) => [d.requirementKey, revisionOf("cra_requirement", d.id)]),
      ];
  }
}

/** A TARA with every review judged against the present content, and every check that follows. */
export interface Assessment {
  checks: Checks;
  /** The keys of the reviews whose content is unchanged since they were confirmed. */
  currentReviews: Set<string>;
  /** The fingerprint of the present content of each recorded review. Absent where there is nothing to review yet. */
  fingerprints: Map<string, string>;
}

/**
 * Works out everything that follows from a TARA: which reviews are current, and from that every status and value.
 *
 * accept: reviews named here count as confirmed for the present content, whatever is stored. Used at the
 * moment a review is confirmed, to learn the fingerprint it will get.
 */
export function assess(tara: Tara, accept: ReadonlySet<string> = new Set()): Assessment {
  const currentReviews = new Set<string>();
  const fingerprints = new Map<string, string>();
  for (const kinds of ORDER) {
    // The checks so far decide the content of this stage's reviews.
    const checks = check(tara, currentReviews);
    for (const review of tara.reviews.filter((r) => kinds.includes(r.kind))) {
      const key = reviewKey(review.kind, review.subjectId);
      const content = contentOf(review.kind, review.subjectId, tara, checks);
      if (content === null) continue;
      const print = fingerprint(content);
      fingerprints.set(key, print);
      if (accept.has(key) || (review.fingerprint !== null && review.fingerprint === print)) currentReviews.add(key);
    }
  }
  return { checks: check(tara, currentReviews), currentReviews, fingerprints };
}

/** The fingerprint of the assessment as a whole: what a signature is given for. Null until the release review is recorded. */
export const assessmentFingerprint = (assessment: Assessment): string | null =>
  assessment.fingerprints.get(reviewKey("release", null)) ?? null;
