# The checks

This page is written by `npm run docs:checks` from the rule engine (`packages/core/src/rules/catalogue.ts`), version 1.0.0. Do not edit it by hand.

Every record of a TARA has exactly one status at any time. It comes from a ladder: an ordered list of conditions, read from the top, where the first that is true decides. So the status is always the next thing to do, and when nothing on the ladder applies the record is done. The ladders themselves are in `packages/core/src/rules/checks.ts`, and are short enough to read.

A status is one of three kinds:

| Kind | Meaning | Colour |
|---|---|---|
| To do | An entry of this record is missing or does not fit. | Red |
| Waiting | The record is complete and waits for something else, usually a review. Work can go on. | Amber |
| Done | Nothing to do. | Green |

The code of a status is its stable name. It never changes meaning, so it can be used in tests and by other programs. The words can be improved.

A TARA can be released when no status is "to do" or "waiting", it has at least one risk, the release review is recorded, and three people have signed.

## Scope fields

Shown on the step **Scope**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `scope.input-needed` | To do | Input needed |
| `scope.evidence-needed` | To do | Evidence needed |
| `scope.recorded` | Done | Recorded |

## The scope review

Shown on the step **Scope**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `scope-review.inputs` | To do | Complete the scope first |
| `scope-review.missing` | Waiting | Record the scope review |
| `scope-review.stale` | Waiting | Changed since its review. Confirm the review again. |
| `scope-review.reviewed` | Done | Reviewed |

## Assessed items

Shown on the step **Assessed items**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `item.name` | To do | Name the item |
| `item.configuration` | To do | Give the configuration this definition describes |
| `item.boundary` | To do | Describe the item's boundary and functions |
| `item.architecture` | To do | Describe the architecture and interfaces |
| `item.environment` | To do | Describe the operating environment and use |
| `item.ok` | Done | Complete |

## Architecture elements

Shown on the step **Architecture**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `element.name` | To do | Name the element |
| `element.flow-ends` | To do | Join both ends of the data flow |
| `element.ok` | Done | Complete |

## Assets

Shown on the step **Assets**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `asset.name` | To do | Name the asset |
| `asset.item` | To do | Link the asset to an item |
| `asset.coverage` | To do | Add a damage scenario, or say why none applies |
| `asset.ok` | Done | Complete |

## Damage scenarios

Shown on the step **Damage scenarios**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `damage.asset` | To do | Choose the affected asset |
| `damage.property` | To do | Mark the security property that is lost |
| `damage.description` | To do | Describe the damage |
| `damage.ratings` | To do | Rate all four impact categories |
| `damage.rationale` | To do | Give the rationale for the ratings |
| `damage.no-threat` | To do | Link a threat scenario that leads to this damage |
| `damage.ok` | Done | Complete |

## Threat scenarios

Shown on the step **Threat scenarios**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `threat.description` | To do | Describe the threat |
| `threat.category` | To do | Choose a threat category |
| `threat.no-damage` | To do | Link the damage scenarios it leads to |
| `threat.damage-incomplete` | To do | Complete the linked damage scenarios |
| `threat.no-path` | To do | Link an attack path |
| `threat.path-incomplete` | To do | Complete the linked attack paths |
| `threat.path-review` | Waiting | Waiting for the review of its attack paths |
| `threat.ok` | Done | Complete |

## Attack paths

Shown on the step **Attack paths**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `path.no-threat` | To do | Link the threat this path carries out |
| `path.description` | To do | Describe the attack path |
| `path.rationale` | To do | Give the rationale for the rating, or for screening the path out |
| `path.disposition` | To do | Choose whether the path counts towards the risk |
| `path.factors` | To do | Rate all five attack potential factors |
| `path.review-missing` | Waiting | Record the review of this attack path |
| `path.review-stale` | Waiting | Changed since its review. Confirm the review again. |
| `path.included` | Done | Included |
| `path.screened-out` | Done | Screened out |

## Risks: does the value stand?

Shown on the step **Risks**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `rating.no-included-path` | To do | Every attack path is screened out. Include one, or reconsider the threat. |
| `rating.incomplete` | To do | Complete the impact and the feasibility |
| `rating.path-review` | Waiting | Waiting for the review of its attack paths |
| `rating.scope-review` | Waiting | Waiting for the scope review |
| `rating.controls-unverified` | To do | Verify the existing controls this risk relies on |
| `rating.review-missing` | Waiting | Record the review of this rating |
| `rating.review-stale` | Waiting | Changed since its review. Confirm the review again. |
| `rating.reviewed` | Done | Reviewed |

## Controls

Shown on the step **Controls**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `control.name` | To do | Name the control |
| `control.covered-path` | To do | A covered attack path must belong to a risk that uses this control |
| `control.ok` | Done | Complete |

## Risks: does the decision stand?

Shown on the step **Risk treatment**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `treatment.rating-incomplete` | To do | Complete the risk's rating first |
| `treatment.choice` | To do | Choose the treatment |
| `treatment.rationale` | To do | Give the rationale, and who owns the decision |
| `treatment.residual` | To do | Rate the risk that remains: impact and feasibility |
| `treatment.residual-basis` | To do | Give the basis for the risk that remains |
| `treatment.no-goal` | To do | A reduced risk needs a cybersecurity goal |
| `treatment.no-claim` | To do | A retained or shared risk needs a cybersecurity claim |
| `treatment.controls-unverified` | To do | Verify each existing control this risk relies on |
| `treatment.review-missing` | Waiting | Record the approval of this treatment |
| `treatment.rating-review` | Waiting | Waiting for the review of the rating |
| `treatment.goal-review` | Waiting | Waiting for the review of its goal |
| `treatment.claim-review` | Waiting | Waiting for the review of its claim |
| `treatment.review-stale` | Waiting | Changed since its approval. Confirm the approval again. |
| `treatment.approved` | Done | Approved |

## Goals and claims

Shown on the step **Goals and claims**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `goal.statement` | To do | Write the statement |
| `goal.no-risk` | To do | Link the risks it answers |
| `goal.review-missing` | Waiting | Record the review of this statement |
| `goal.rating-review` | Waiting | Waiting for the review of its risks' ratings |
| `goal.review-stale` | Waiting | Changed since its review. Confirm the review again. |
| `goal.ok` | Done | Reviewed |

## Control evidence

Shown on the step **Control evidence**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `evidence.configuration` | To do | The configuration ID must be the one given in the scope |
| `evidence.control-incomplete` | To do | Complete the control first |
| `evidence.failed` | To do | Verification failed |
| `evidence.planned` | Done | Planned |
| `evidence.built` | To do | Built, not yet in the product in use |
| `evidence.effect` | To do | Say what it achieves and where it is implemented |
| `evidence.unverified` | To do | In the product, not yet verified |
| `evidence.test` | To do | Give the passed test: its result and where it is recorded |
| `evidence.not-existing` | To do | List the control as existing on the risk |
| `evidence.scope-review` | Waiting | Waiting for the scope review |
| `evidence.threat-incomplete` | To do | Complete the threat scenario of this risk |
| `evidence.tags` | To do | A verified CRA requirement must be one the control is tagged with |
| `evidence.review-missing` | Waiting | Record the review of this evidence |
| `evidence.review-stale` | Waiting | Changed since its review. Confirm the review again. |
| `evidence.verified` | Done | Verified |

## CRA essential requirements

Shown on the step **CRA requirements**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `cra.scope-undecided` | To do | Decide first whether the CRA applies to the product (Scope) |
| `cra.out-of-scope` | Done | Product out of scope |
| `cra.applicability` | To do | Decide whether it applies |
| `cra.justification` | To do | Justify the decision |
| `cra.references` | To do | Say where it is implemented and how it was verified |
| `cra.review-missing` | Waiting | Record the review of this decision |
| `cra.review-stale` | Waiting | Changed since its review. Confirm the review again. |
| `cra.not-applicable` | Done | Does not apply, justified |
| `cra.reviewed` | Done | Applies, evidence reviewed |

## Evidence handed over at release

Shown on the step **Report and release**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `handover.scope-review` | Waiting | Waiting for the scope review |
| `handover.needed` | To do | Evidence needed |
| `handover.out-of-scope` | Done | Out of scope |
| `handover.recorded` | Done | Evidence recorded |

## The release review

Shown on the step **Report and release**. Listed in the order they are tested: the first that applies is the status.

| Code | Kind | What the tool says |
|---|---|---|
| `release.scope-review` | Waiting | Waiting for the scope review |
| `release.checks-open` | Waiting | Waiting for the open checks of the assessment |
| `release.review-missing` | Waiting | Record the release review |
| `release.review-stale` | Waiting | Changed since its review. Confirm the review again. |
| `release.reviewed` | Done | Reviewed |
