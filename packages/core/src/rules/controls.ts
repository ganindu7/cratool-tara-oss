// What follows from the controls: where each stands in the product, and what the assessment says about
// each requirement of the Cyber Resilience Act.

import type { Tara } from "../model/tara.ts";
import type { Checks } from "./checks.ts";

/**
 * Where a control stands in the product, as one word.
 *
 * proposed:    recommended; nothing decided.
 * planned:     decided and under way.
 * built:       in the code and tested, not yet in the product in use.
 * implemented: in the product in use.
 * verified:    in the product in use, and shown to work by a test.
 * failed:      its test failed.
 */
export type ControlState = "proposed" | "planned" | "built" | "implemented" | "verified" | "failed";

/** The states a person can set, in the order a control goes through them. */
export const CONTROL_STATES = ["proposed", "planned", "built", "implemented", "verified"] as const;

/** What each state is called on screen and in the report. Two go by another word: planned is "Under way", implemented "Live". */
export const CONTROL_STATE_LABELS: Record<ControlState, string> = {
  proposed: "Proposed",
  planned: "Under way",
  built: "Built",
  implemented: "Live",
  verified: "Verified",
  failed: "Failed",
};

/**
 * The state of a control. It is not stored: it follows from where the risks list the control (existing or
 * proposed) and from the evidence kept for it, so the two can never disagree.
 */
export function controlState(tara: Tara, controlId: string): ControlState {
  const existingOn = new Set(tara.risks.filter((r) => r.existingControlIds.includes(controlId)).map((r) => r.id));
  if (existingOn.size === 0) return "proposed";
  const states = tara.evidence.filter((e) => e.controlId === controlId && existingOn.has(e.riskId)).map((e) => e.state);
  if (states.length === 0) return "planned";
  if (states.includes("failed")) return "failed";
  if (states.every((state) => state === "verified")) return "verified";
  if (states.some((state) => state === "implemented" || state === "verified")) return "implemented";
  return states.includes("built") ? "built" : "planned";
}

/** The risks that list a control, as existing or as proposed. */
export const risksUsingControl = (tara: Tara, controlId: string) =>
  tara.risks.filter((r) => r.existingControlIds.includes(controlId) || r.proposedControlIds.includes(controlId));

/** What the risk assessment says about one requirement of CRA Annex I Part I(2). */
export interface CraTrace {
  /** The controls tagged with the requirement. */
  controlIds: string[];
  /** The risks that have one of those controls, existing or proposed. */
  riskIds: string[];
  /** The evidence that is verified and names the requirement. */
  verified: { evidenceId: string; controlId: string; riskId: string }[];
}

/**
 * The trace of one requirement, (a) to (m): the controls tagged to it, the risks those controls treat, and
 * the evidence verified for it. It is what a person looks at when deciding whether the requirement is met.
 *
 * A requirement of Part II is about how vulnerabilities are handled, not about the product: no control is
 * tagged to it, and it has no trace (null).
 */
export function craTrace(tara: Tara, checks: Pick<Checks, "evidence">, requirementKey: string): CraTrace | null {
  if (requirementKey.startsWith("II(")) return null;
  const tagged = new Set(tara.controls.filter((c) => c.craTags.includes(requirementKey)).map((c) => c.id));
  const uses = (controlId: string) => tagged.has(controlId);
  return {
    controlIds: [...tagged],
    riskIds: tara.risks.filter((r) => r.existingControlIds.some(uses) || r.proposedControlIds.some(uses)).map((r) => r.id),
    verified: tara.evidence
      .filter((e) => checks.evidence.get(e.id)?.code === "evidence.verified" && e.verifiedCraTags.includes(requirementKey))
      .map((e) => ({ evidenceId: e.id, controlId: e.controlId, riskId: e.riskId })),
  };
}
