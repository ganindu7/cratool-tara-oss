// The checks: for every record, what it still needs.
//
// Each kind of record has a ladder: an ordered list of conditions, each with the status it gives. A ladder is
// read from the top and the first condition that is true decides. So a record always shows exactly one
// status, and it is the next thing to do. When nothing on the ladder is true the record is done.
//
// The order within a ladder matters: what a person has to enter comes before what the record has to wait
// for. The statuses themselves, with their words, are in catalogue.ts.
//
// A check never changes anything and is never stored. It is a pure function of the TARA and of which
// reviews are current (reviews.ts).

import { IMPACT_CATEGORY_KEYS } from "../model/method.ts";
import {
  EVIDENCE_ROW_KEYS,
  type EvidenceRowKey,
  type ReviewKind,
  type Risk,
  SCOPE_FIELD_KEYS,
  SCOPE_FIELDS_APPLICABILITY,
  SCOPE_FIELDS_EVIDENCE_REQUIRED,
  type ScopeEntry,
  type ScopeFieldKey,
  type ScopeKey,
  type Tara,
} from "../model/tara.ts";
import { type CheckCode, type Status, statusFor } from "./catalogue.ts";
import { IMPACT_PENDING_TEXT, isBlank, POTENTIAL_PENDING_TEXT, riskValue, type Scores, score } from "./scoring.ts";

/** The version of the rules. A release records the version it was made with. Raise it when a rule changes a result. */
export const RULES_VERSION = "1.0.0";

/**
 * What checking a whole TARA gives: the scores, and a status for each record, each scope field and row of
 * evidence, and the two reviews of the whole. A map is keyed by the ID of the record. Two kinds differ: a risk
 * has two statuses, one for its rating and one for its treatment, and a document has none.
 */
export interface Checks {
  scores: Scores;
  items: Map<string, Status>;
  elements: Map<string, Status>;
  assets: Map<string, Status>;
  damages: Map<string, Status>;
  threats: Map<string, Status>;
  paths: Map<string, Status>;
  controls: Map<string, Status>;
  evidence: Map<string, Status>;
  goalClaims: Map<string, Status>;
  /** Whether the risk's value stands. Keyed by risk ID. */
  riskRating: Map<string, Status>;
  /** Whether the decision about the risk stands. Keyed by risk ID. */
  riskTreatment: Map<string, Status>;
  /** Keyed by the ID of the requirement's decision. */
  cra: Map<string, Status>;
  scopeFields: Record<ScopeFieldKey, Status>;
  scopeReview: Status;
  /** The evidence handed over at release, one row per obligation. */
  handover: Record<EvidenceRowKey, Status>;
  releaseReview: Status;
}

/** The key of a review: its kind and the record it is about. */
export const reviewKey = (kind: ReviewKind, subjectId: string | null): string => `${kind}:${subjectId ?? ""}`;

/** The status of the first rung whose condition is true, or the final status. */
function ladder(rungs: [condition: boolean, code: CheckCode][], final: CheckCode): Status {
  return statusFor(rungs.find(([condition]) => condition)?.[1] ?? final);
}

const is = (status: Status | undefined, ...codes: CheckCode[]): boolean => status !== undefined && codes.includes(status.code);

/**
 * Checks a whole TARA.
 * currentReviews: the keys of the reviews whose content is unchanged since they were confirmed (reviews.ts).
 * Without it every recorded review counts as outdated.
 */
export function check(tara: Tara, currentReviews: ReadonlySet<string> = new Set()): Checks {
  const scores = score(tara);
  const scope = (key: ScopeKey): ScopeEntry => tara.scope[key];
  const review = (kind: ReviewKind, id: string | null): "none" | "stale" | "current" => {
    if (!tara.reviews.some((r) => r.kind === kind && r.subjectId === id)) return "none";
    return currentReviews.has(reviewKey(kind, id)) ? "current" : "stale";
  };

  // ---- Items, architecture elements, assets, damage scenarios
  const items = new Map(
    tara.items.map((item) => [
      item.id,
      ladder(
        [
          [isBlank(item.name), "item.name"],
          [isBlank(item.configurationRef), "item.configuration"],
          [isBlank(item.boundaryFunctions), "item.boundary"],
          [isBlank(item.architectureInterfaces), "item.architecture"],
          [isBlank(item.environmentUse), "item.environment"],
        ],
        "item.ok",
      ),
    ]),
  );

  const elements = new Map(
    tara.elements.map((element) => [
      element.id,
      ladder(
        [
          [isBlank(element.name), "element.name"],
          [element.kind === "data_flow" && (element.sourceId === null || element.targetId === null), "element.flow-ends"],
        ],
        "element.ok",
      ),
    ]),
  );

  const assets = new Map(
    tara.assets.map((asset) => [
      asset.id,
      ladder(
        [
          [isBlank(asset.name), "asset.name"],
          [asset.itemId === null, "asset.item"],
          [isBlank(asset.coverageRationale) && !tara.damages.some((d) => d.assetId === asset.id), "asset.coverage"],
        ],
        "asset.ok",
      ),
    ]),
  );

  const damages = new Map(
    tara.damages.map((damage) => [
      damage.id,
      ladder(
        [
          [damage.assetId === null, "damage.asset"],
          [!(damage.confidentiality || damage.integrity || damage.availability), "damage.property"],
          [isBlank(damage.description), "damage.description"],
          [IMPACT_CATEGORY_KEYS.some((key) => damage.ratings[key] === null), "damage.ratings"],
          [isBlank(damage.impactRationale), "damage.rationale"],
          [!tara.threats.some((t) => t.damageIds.includes(damage.id)), "damage.no-threat"],
        ],
        "damage.ok",
      ),
    ]),
  );

  // ---- Scope: each field, then the review of the scope as a whole
  const scopeFields = {} as Record<ScopeFieldKey, Status>;
  for (const key of SCOPE_FIELD_KEYS) {
    const { decision, evidence } = scope(key);
    const isApplicability = (SCOPE_FIELDS_APPLICABILITY as readonly string[]).includes(key);
    const needsEvidence = isApplicability || (SCOPE_FIELDS_EVIDENCE_REQUIRED as readonly string[]).includes(key);
    const decided = isApplicability ? decision === "in_scope" || decision === "out_of_scope" : !isBlank(decision);
    scopeFields[key] = statusFor(
      !decided ? "scope.input-needed" : needsEvidence && isBlank(evidence) ? "scope.evidence-needed" : "scope.recorded",
    );
  }
  const scopeReview = ladder(
    [
      [SCOPE_FIELD_KEYS.some((key) => scopeFields[key].code !== "scope.recorded"), "scope-review.inputs"],
      [isBlank(scope("scope_review").decision) || review("scope", null) === "none", "scope-review.missing"],
      [review("scope", null) === "stale", "scope-review.stale"],
    ],
    "scope-review.reviewed",
  );
  const scopeReviewed = scopeReview.code === "scope-review.reviewed";

  // ---- Attack paths
  const paths = new Map(
    tara.paths.map((path) => [
      path.id,
      ladder(
        [
          [path.threatIds.length === 0, "path.no-threat"],
          [isBlank(path.description), "path.description"],
          [isBlank(path.feasibilityBasis), "path.rationale"],
          [path.disposition === null, "path.disposition"],
          [path.disposition === "included" && scores.paths.get(path.id)?.totalPoints === null, "path.factors"],
          [review("attack_path", path.id) === "none", "path.review-missing"],
          [review("attack_path", path.id) === "stale", "path.review-stale"],
        ],
        path.disposition === "screened_out" ? "path.screened-out" : "path.included",
      ),
    ]),
  );
  const pathReviewed = (id: string) => is(paths.get(id), "path.included", "path.screened-out");

  // ---- Threat scenarios
  const threats = new Map(
    tara.threats.map((threat) => {
      const threatScore = scores.threats.get(threat.id);
      const linkedPaths = scores.risks.get(threat.id)?.linkedPathIds ?? [];
      return [
        threat.id,
        ladder(
          [
            [isBlank(threat.description), "threat.description"],
            [!tara.method.threat_categories.some((c) => c.key === threat.category), "threat.category"],
            [threatScore?.damageCount === 0, "threat.no-damage"],
            [(threatScore?.unratedLinks ?? 0) > 0, "threat.damage-incomplete"],
            [linkedPaths.length === 0, "threat.no-path"],
            [linkedPaths.some((id) => scores.paths.get(id)?.state === "incomplete"), "threat.path-incomplete"],
            [!linkedPaths.every(pathReviewed), "threat.path-review"],
          ],
          "threat.ok",
        ),
      ];
    }),
  );

  // ---- Controls
  const risksUsing = (controlId: string) =>
    tara.risks.filter((r) => r.existingControlIds.includes(controlId) || r.proposedControlIds.includes(controlId));
  const controls = new Map(
    tara.controls.map((control) => {
      const threatIds = risksUsing(control.id).map((r) => r.threatId);
      // A control covers an attack path only where it treats the risk of a threat that path carries out.
      const coveredPathsFit = control.coveredPathIds.every(
        (pathId) => tara.paths.find((p) => p.id === pathId)?.threatIds.some((t) => threatIds.includes(t)) ?? false,
      );
      return [
        control.id,
        ladder(
          [
            [isBlank(control.name), "control.name"],
            [!coveredPathsFit, "control.covered-path"],
          ],
          "control.ok",
        ),
      ];
    }),
  );

  // ---- Control evidence
  const riskById = new Map(tara.risks.map((r) => [r.id, r]));
  const configurationId = scope("configuration_id").decision;
  const hasImpact = (risk: Risk | undefined): boolean => {
    const impact = risk ? scores.risks.get(risk.threatId)?.impact : undefined;
    return impact !== undefined && "level" in impact;
  };
  const evidence = new Map(
    tara.evidence.map((entry) => {
      const risk = riskById.get(entry.riskId);
      const control = tara.controls.find((c) => c.id === entry.controlId);
      return [
        entry.id,
        ladder(
          [
            [
              isBlank(entry.configurationId) || isBlank(configurationId) || entry.configurationId !== configurationId,
              "evidence.configuration",
            ],
            [!is(controls.get(entry.controlId), "control.ok"), "evidence.control-incomplete"],
            [entry.state === "failed" || entry.result === "fail", "evidence.failed"],
            [entry.state === "planned", "evidence.planned"],
            [entry.state === "built", "evidence.built"],
            [isBlank(entry.effect) || isBlank(entry.implementationRef), "evidence.effect"],
            [entry.state === "implemented", "evidence.unverified"],
            [entry.result !== "pass" || isBlank(entry.verificationRef), "evidence.test"],
            [!risk?.existingControlIds.includes(entry.controlId), "evidence.not-existing"],
            [!scopeReviewed, "evidence.scope-review"],
            [!hasImpact(risk), "evidence.threat-incomplete"],
            [!entry.verifiedCraTags.every((tag) => control?.craTags.includes(tag)), "evidence.tags"],
            [review("control_evidence", entry.id) === "none", "evidence.review-missing"],
            [review("control_evidence", entry.id) === "stale", "evidence.review-stale"],
          ],
          "evidence.verified",
        ),
      ];
    }),
  );
  /** The existing controls of a risk that have verified evidence for it. Only these count. */
  const verifiedControls = (risk: Risk): string[] =>
    risk.existingControlIds.filter((controlId) =>
      tara.evidence.some((e) => e.riskId === risk.id && e.controlId === controlId && is(evidence.get(e.id), "evidence.verified")),
    );
  const allExistingVerified = (risk: Risk) => verifiedControls(risk).length === risk.existingControlIds.length;

  // ---- Risks: does the value stand?
  const riskRating = new Map(
    tara.risks.map((risk) => {
      const riskScore = scores.risks.get(risk.threatId);
      const potential = riskScore?.minAttackPotential;
      const pending = potential && "pending" in potential ? potential.pending : null;
      if (pending === "no_included_path") return [risk.id, statusFor("rating.no-included-path")];
      if (!riskScore || riskScore.value === null) {
        const impactPending = riskScore && "pending" in riskScore.impact ? IMPACT_PENDING_TEXT[riskScore.impact.pending] : null;
        return [
          risk.id,
          statusFor("rating.incomplete", impactPending ?? (pending ? POTENTIAL_PENDING_TEXT[pending] : undefined)),
        ];
      }
      return [
        risk.id,
        ladder(
          [
            [!riskScore.linkedPathIds.every(pathReviewed), "rating.path-review"],
            [!scopeReviewed, "rating.scope-review"],
            [!allExistingVerified(risk), "rating.controls-unverified"],
            [review("risk_rating", risk.id) === "none", "rating.review-missing"],
            [review("risk_rating", risk.id) === "stale", "rating.review-stale"],
          ],
          "rating.reviewed",
        ),
      ];
    }),
  );
  const ratingReviewed = (riskId: string) => is(riskRating.get(riskId), "rating.reviewed");

  // ---- Goals and claims
  const goalClaims = new Map(
    tara.goalClaims.map((goal) => [
      goal.id,
      ladder(
        [
          [isBlank(goal.statement), "goal.statement"],
          [goal.riskIds.length === 0, "goal.no-risk"],
          [review("goal_claim", goal.id) === "none", "goal.review-missing"],
          [!goal.riskIds.every(ratingReviewed), "goal.rating-review"],
          [review("goal_claim", goal.id) === "stale", "goal.review-stale"],
        ],
        "goal.ok",
      ),
    ]),
  );

  // ---- Risks: does the decision stand?
  const riskTreatment = new Map(
    tara.risks.map((risk) => {
      const linked = (kind: "goal" | "claim") => tara.goalClaims.filter((g) => g.kind === kind && g.riskIds.includes(risk.id));
      const reviewed = (kind: "goal" | "claim") => linked(kind).some((g) => is(goalClaims.get(g.id), "goal.ok"));
      const reduce = risk.treatment === "reduce";
      const retainOrShare = risk.treatment === "retain" || risk.treatment === "share";
      // A risk that is avoided has no residual risk to rate: the exposure is gone, and the basis says how.
      const residualRated =
        risk.treatment === "avoid" || riskValue(tara.method, risk.residualImpact, risk.residualFeasibility) !== null;
      return [
        risk.id,
        ladder(
          [
            [(scores.risks.get(risk.threatId)?.value ?? null) === null, "treatment.rating-incomplete"],
            [risk.treatment === null, "treatment.choice"],
            [isBlank(risk.rationale) || (isBlank(risk.owner) && risk.reviewDate === null), "treatment.rationale"],
            [!residualRated, "treatment.residual"],
            [isBlank(risk.residualBasis), "treatment.residual-basis"],
            [reduce && linked("goal").length === 0, "treatment.no-goal"],
            [retainOrShare && linked("claim").length === 0, "treatment.no-claim"],
            // Reducing a risk means something in the product does the reducing, and that it was shown to work.
            [(reduce && verifiedControls(risk).length === 0) || !allExistingVerified(risk), "treatment.controls-unverified"],
            [review("treatment", risk.id) === "none", "treatment.review-missing"],
            [!ratingReviewed(risk.id), "treatment.rating-review"],
            [reduce && !reviewed("goal"), "treatment.goal-review"],
            [retainOrShare && !reviewed("claim"), "treatment.claim-review"],
            [review("treatment", risk.id) === "stale", "treatment.review-stale"],
          ],
          "treatment.approved",
        ),
      ];
    }),
  );

  // ---- CRA essential requirements
  const craScope = scope("cra_applicability").decision;
  const cra = new Map(
    tara.craDecisions.map((decision) => [
      decision.id,
      ladder(
        [
          [craScope !== "in_scope" && craScope !== "out_of_scope", "cra.scope-undecided"],
          [craScope === "out_of_scope", "cra.out-of-scope"],
          [decision.applicability === null, "cra.applicability"],
          [isBlank(decision.justification), "cra.justification"],
          [
            decision.applicability === "applies" && (isBlank(decision.implementationRef) || isBlank(decision.verificationRef)),
            "cra.references",
          ],
          [review("cra_requirement", decision.id) === "none", "cra.review-missing"],
          [review("cra_requirement", decision.id) === "stale", "cra.review-stale"],
        ],
        decision.applicability === "does_not_apply" ? "cra.not-applicable" : "cra.reviewed",
      ),
    ]),
  );

  // ---- The evidence handed over at release
  const handoverRow = (key: EvidenceRowKey): Status => {
    if (!scopeReviewed) return statusFor("handover.scope-review");
    const { decision, evidence: reference } = scope(key);
    const recorded = statusFor(isBlank(decision) || isBlank(reference) ? "handover.needed" : "handover.recorded");
    const outOfScope = statusFor("handover.out-of-scope");
    switch (key) {
      case "cra_annex_i_part_i_1":
      case "cra_annex_vii":
        return craScope === "out_of_scope" ? outOfScope : recorded;
      case "cra_annex_i_part_ii": {
        if (craScope === "out_of_scope") return outOfScope;
        // Vulnerability handling is shown by the decisions on the requirements of Part II themselves.
        const partTwo = tara.craDecisions.filter((d) => d.requirementKey.startsWith("II("));
        const allReviewed = partTwo.length > 0 && partTwo.every((d) => is(cra.get(d.id), "cra.reviewed"));
        return statusFor(allReviewed ? "handover.recorded" : "handover.needed");
      }
      case "iso_work_products":
        return scope("iso21434_applicability").decision === "out_of_scope" ? outOfScope : recorded;
      case "vehicle_supplier_evidence":
        // Asked for only where UN R155 is in scope, or where something was entered anyway.
        return scope("r155_applicability").decision !== "in_scope" && isBlank(decision) && isBlank(reference)
          ? outOfScope
          : recorded;
    }
  };
  const handover = {} as Record<EvidenceRowKey, Status>;
  for (const key of EVIDENCE_ROW_KEYS) handover[key] = handoverRow(key);

  // ---- The release review: the last check, which waits for all the others
  const everythingElse: Status[] = [
    ...[items, elements, assets, damages, threats, paths, controls, evidence, goalClaims, riskRating, riskTreatment, cra].flatMap(
      (statuses) => [...statuses.values()],
    ),
    ...Object.values(scopeFields),
    scopeReview,
    ...Object.values(handover),
  ];
  const checksOpen = tara.risks.length === 0 || everythingElse.some((status) => status.kind !== "done");
  const releaseReview = ladder(
    [
      [!scopeReviewed, "release.scope-review"],
      [checksOpen, "release.checks-open"],
      [isBlank(scope("release_review").decision) || review("release", null) === "none", "release.review-missing"],
      [review("release", null) === "stale", "release.review-stale"],
    ],
    "release.reviewed",
  );

  return {
    scores,
    items,
    elements,
    assets,
    damages,
    threats,
    paths,
    controls,
    evidence,
    goalClaims,
    riskRating,
    riskTreatment,
    cra,
    scopeFields,
    scopeReview,
    handover,
    releaseReview,
  };
}

/** A place in the tool where checks show: the steps of the method, in working order. */
export const CHECKED_STEPS = [
  "scope",
  "items",
  "architecture",
  "assets",
  "damages",
  "threats",
  "paths",
  "risks",
  "controls",
  "treatment",
  "goals",
  "evidence",
  "cra",
  "release",
] as const;
/** One of the steps where checks show. Every finding belongs to one. */
export type CheckedStep = (typeof CHECKED_STEPS)[number];

/** One status with where it belongs. */
export interface Finding {
  step: CheckedStep;
  /** The record the status is about. Null for a status of the TARA as a whole. */
  recordId: string | null;
  /** For a scope field or a row of evidence: its key. */
  scopeKey?: ScopeKey;
  status: Status;
}

/** Every status of a TARA as one list, in the order of the steps. */
export function findings(checks: Checks): Finding[] {
  const of = (step: CheckedStep, statuses: Map<string, Status>): Finding[] =>
    [...statuses].map(([recordId, status]) => ({ step, recordId, status }));
  return [
    ...SCOPE_FIELD_KEYS.map(
      (key): Finding => ({ step: "scope", recordId: null, scopeKey: key, status: checks.scopeFields[key] }),
    ),
    { step: "scope", recordId: null, scopeKey: "scope_review", status: checks.scopeReview },
    ...of("items", checks.items),
    ...of("architecture", checks.elements),
    ...of("assets", checks.assets),
    ...of("damages", checks.damages),
    ...of("threats", checks.threats),
    ...of("paths", checks.paths),
    ...of("risks", checks.riskRating),
    ...of("controls", checks.controls),
    ...of("treatment", checks.riskTreatment),
    ...of("goals", checks.goalClaims),
    ...of("evidence", checks.evidence),
    ...of("cra", checks.cra),
    ...EVIDENCE_ROW_KEYS.map(
      (key): Finding => ({ step: "release", recordId: null, scopeKey: key, status: checks.handover[key] }),
    ),
    { step: "release", recordId: null, scopeKey: "release_review", status: checks.releaseReview },
  ];
}

/** What is still open: every status that is not done. */
export const openFindings = (checks: Checks): Finding[] => findings(checks).filter((f) => f.status.kind !== "done");
