// Sign-off and release: what still stands between a TARA and its release.
//
// A release is the point at which the assessment becomes part of the product's technical documentation.
// It needs the release review, and three signatures given for the assessment exactly as it stands.

import { SIGNOFF_ROLES, type Signoff, type SignoffRole, type Tara } from "../model/tara.ts";
import { type Assessment, assessmentFingerprint } from "./reviews.ts";

export interface SignoffState {
  role: SignoffRole;
  signoff: Signoff | null;
  /** The signature was given for the assessment as it stands now. */
  current: boolean;
}

/** Each role with its signature, and whether that signature still covers the assessment. */
export function signoffStates(tara: Tara, assessment: Assessment): SignoffState[] {
  const print = assessmentFingerprint(assessment);
  const released = tara.meta.status === "released";
  return SIGNOFF_ROLES.map((role) => {
    const signoff = tara.signoffs.find((s) => s.role === role) ?? null;
    const current = signoff !== null && (released || (signoff.fingerprint !== null && signoff.fingerprint === print));
    return { role, signoff, current };
  });
}

/** What still stands between this TARA and its release, in words. Empty when it can be released. */
export function releaseNeeds(tara: Tara, assessment: Assessment): string[] {
  if (tara.meta.status === "released") return [];
  const needs: string[] = [];
  const review = assessment.checks.releaseReview;
  if (review.code !== "release.reviewed") needs.push(`The release review is not confirmed: ${review.message}.`);

  const states = signoffStates(tara, assessment);
  for (const state of states) {
    if (!state.signoff) needs.push(`The ${state.role} has not signed.`);
    else if (!state.current) needs.push(`The ${state.role} signed before the assessment last changed and has to sign again.`);
  }
  // An approval of one's own work is no approval.
  const nameOf = (role: SignoffRole) =>
    states
      .find((s) => s.role === role)
      ?.signoff?.name.trim()
      .toLowerCase() ?? null;
  if (nameOf("author") !== null && nameOf("author") === nameOf("approver")) {
    needs.push("The approver must be a different person from the author.");
  }
  return needs;
}
