// Every status a check can give: its code, what it says, and what kind of status it is.
//
// The code is the stable name of a status. Tests, the documentation and other programs refer to it, so a
// code is never reused for something else. The words can be improved freely.
//
// docs/reference/checks.md is written from this table (npm run docs:checks).

/**
 * done:    nothing to do.
 * waiting: the record is complete and waits for something else, usually a review. Work can go on.
 * todo:    an input of this record is missing or wrong.
 */
export type StatusKind = "done" | "waiting" | "todo";

export interface CheckDef {
  kind: StatusKind;
  message: string;
}

const todo = (message: string): CheckDef => ({ kind: "todo", message });
const waiting = (message: string): CheckDef => ({ kind: "waiting", message });
const done = (message: string): CheckDef => ({ kind: "done", message });

const REVIEW_STALE = "Changed since its review. Confirm the review again.";

export const CHECKS = {
  // Items
  "item.name": todo("Name the item"),
  "item.configuration": todo("Give the configuration this definition describes"),
  "item.boundary": todo("Describe the item's boundary and functions"),
  "item.architecture": todo("Describe the architecture and interfaces"),
  "item.environment": todo("Describe the operating environment and use"),
  "item.ok": done("Complete"),

  // Architecture elements
  "element.name": todo("Name the element"),
  "element.flow-ends": todo("Join both ends of the data flow"),
  "element.ok": done("Complete"),

  // Assets
  "asset.name": todo("Name the asset"),
  "asset.item": todo("Link the asset to an item"),
  "asset.coverage": todo("Add a damage scenario, or say why none applies"),
  "asset.ok": done("Complete"),

  // Damage scenarios
  "damage.asset": todo("Choose the affected asset"),
  "damage.property": todo("Mark the security property that is lost"),
  "damage.description": todo("Describe the damage"),
  "damage.ratings": todo("Rate all four impact categories"),
  "damage.rationale": todo("Give the rationale for the ratings"),
  "damage.no-threat": todo("Link a threat scenario that leads to this damage"),
  "damage.ok": done("Complete"),

  // Threat scenarios
  "threat.description": todo("Describe the threat"),
  "threat.category": todo("Choose a threat category"),
  "threat.no-damage": todo("Link the damage scenarios it leads to"),
  "threat.damage-incomplete": todo("Complete the linked damage scenarios"),
  "threat.no-path": todo("Link an attack path"),
  "threat.path-incomplete": todo("Complete the linked attack paths"),
  "threat.path-review": waiting("Waiting for the review of its attack paths"),
  "threat.ok": done("Complete"),

  // Attack paths
  "path.no-threat": todo("Link the threat this path carries out"),
  "path.description": todo("Describe the attack path"),
  "path.rationale": todo("Give the rationale for the rating, or for screening the path out"),
  "path.disposition": todo("Choose whether the path counts towards the risk"),
  "path.factors": todo("Rate all five attack potential factors"),
  "path.review-missing": waiting("Record the review of this attack path"),
  "path.review-stale": waiting(REVIEW_STALE),
  "path.included": done("Included"),
  "path.screened-out": done("Screened out"),

  // Risks: the rating
  "rating.no-included-path": todo("Every attack path is screened out. Include one, or reconsider the threat."),
  "rating.incomplete": todo("Complete the impact and the feasibility"),
  "rating.path-review": waiting("Waiting for the review of its attack paths"),
  "rating.scope-review": waiting("Waiting for the scope review"),
  "rating.controls-unverified": todo("Verify the existing controls this risk relies on"),
  "rating.review-missing": waiting("Record the review of this rating"),
  "rating.review-stale": waiting(REVIEW_STALE),
  "rating.reviewed": done("Reviewed"),

  // Risks: the treatment
  "treatment.rating-incomplete": todo("Complete the risk's rating first"),
  "treatment.choice": todo("Choose the treatment"),
  "treatment.rationale": todo("Give the rationale, and who owns the decision"),
  "treatment.residual": todo("Rate the risk that remains: impact and feasibility"),
  "treatment.residual-basis": todo("Give the basis for the risk that remains"),
  "treatment.no-goal": todo("A reduced risk needs a cybersecurity goal"),
  "treatment.no-claim": todo("A retained or shared risk needs a cybersecurity claim"),
  "treatment.controls-unverified": todo("Verify each existing control this risk relies on"),
  "treatment.review-missing": waiting("Record the approval of this treatment"),
  "treatment.rating-review": waiting("Waiting for the review of the rating"),
  "treatment.goal-review": waiting("Waiting for the review of its goal"),
  "treatment.claim-review": waiting("Waiting for the review of its claim"),
  "treatment.review-stale": waiting("Changed since its approval. Confirm the approval again."),
  "treatment.approved": done("Approved"),

  // Controls
  "control.name": todo("Name the control"),
  "control.covered-path": todo("A covered attack path must belong to a risk that uses this control"),
  "control.ok": done("Complete"),

  // Control evidence
  "evidence.configuration": todo("The configuration ID must be the one given in the scope"),
  "evidence.control-incomplete": todo("Complete the control first"),
  "evidence.failed": todo("Verification failed"),
  "evidence.planned": done("Planned"),
  "evidence.built": todo("Built, not yet in the product in use"),
  "evidence.effect": todo("Say what it achieves and where it is implemented"),
  "evidence.unverified": todo("In the product, not yet verified"),
  "evidence.test": todo("Give the passed test: its result and where it is recorded"),
  "evidence.not-existing": todo("List the control as existing on the risk"),
  "evidence.scope-review": waiting("Waiting for the scope review"),
  "evidence.threat-incomplete": todo("Complete the threat scenario of this risk"),
  "evidence.tags": todo("A verified CRA requirement must be one the control is tagged with"),
  "evidence.review-missing": waiting("Record the review of this evidence"),
  "evidence.review-stale": waiting(REVIEW_STALE),
  "evidence.verified": done("Verified"),

  // Goals and claims
  "goal.statement": todo("Write the statement"),
  "goal.no-risk": todo("Link the risks it answers"),
  "goal.review-missing": waiting("Record the review of this statement"),
  "goal.rating-review": waiting("Waiting for the review of its risks' ratings"),
  "goal.review-stale": waiting(REVIEW_STALE),
  "goal.ok": done("Reviewed"),

  // Scope
  "scope.input-needed": todo("Input needed"),
  "scope.evidence-needed": todo("Evidence needed"),
  "scope.recorded": done("Recorded"),
  "scope-review.inputs": todo("Complete the scope first"),
  "scope-review.missing": waiting("Record the scope review"),
  "scope-review.stale": waiting(REVIEW_STALE),
  "scope-review.reviewed": done("Reviewed"),

  // Evidence handed over at release
  "handover.scope-review": waiting("Waiting for the scope review"),
  "handover.needed": todo("Evidence needed"),
  "handover.out-of-scope": done("Out of scope"),
  "handover.recorded": done("Evidence recorded"),

  // CRA essential requirements
  "cra.scope-undecided": todo("Decide first whether the CRA applies to the product (Scope)"),
  "cra.out-of-scope": done("Product out of scope"),
  "cra.applicability": todo("Decide whether it applies"),
  "cra.justification": todo("Justify the decision"),
  "cra.references": todo("Say where it is implemented and how it was verified"),
  "cra.review-missing": waiting("Record the review of this decision"),
  "cra.review-stale": waiting(REVIEW_STALE),
  "cra.not-applicable": done("Does not apply, justified"),
  "cra.reviewed": done("Applies, evidence reviewed"),

  // The release review
  "release.scope-review": waiting("Waiting for the scope review"),
  "release.checks-open": waiting("Waiting for the open checks of the assessment"),
  "release.review-missing": waiting("Record the release review"),
  "release.review-stale": waiting(REVIEW_STALE),
  "release.reviewed": done("Reviewed"),
} as const satisfies Record<string, CheckDef>;

export type CheckCode = keyof typeof CHECKS;

/** The result of a check on one record. */
export interface Status {
  code: CheckCode;
  kind: StatusKind;
  message: string;
}

/** The status for a code. `detail` replaces the catalogue's words where the check knows something more exact. */
export function statusFor(code: CheckCode, detail?: string): Status {
  const def: CheckDef = CHECKS[code];
  return { code, kind: def.kind, message: detail ?? def.message };
}
