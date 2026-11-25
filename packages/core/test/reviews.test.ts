// Reviews, sign-off and release.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChanges, assess, nextRevision, Refusal, releaseNeeds, type Tara } from "../src/index.ts";
import { change, context, example } from "./helpers.ts";

const code = (tara: Tara, map: "paths" | "riskRating" | "riskTreatment" | "goalClaims" | "evidence", id: string) =>
  assess(tara).checks[map].get(id)?.code;
const as = (author: string) => ({ author, now: context.now });

test("changing something that was reviewed asks for its review again, and for those that rest on it", () => {
  const tara = change(example("kettle"), {
    op: "set",
    kind: "paths",
    id: "AP002",
    values: { "factors.expertise": "proficient" },
  });
  assert.equal(code(tara, "paths", "AP002"), "path.review-stale");
  assert.equal(code(tara, "riskRating", "R002"), "rating.path-review");
  assert.equal(code(tara, "riskTreatment", "R002"), "treatment.rating-review");
  // what does not rest on AP002 is untouched
  assert.equal(code(tara, "paths", "AP001"), "path.included");
  assert.equal(code(tara, "riskRating", "R001"), "rating.reviewed");
});

test("a damage rating behind a reviewed risk outdates that risk's review", () => {
  const tara = change(example("kettle"), { op: "set", kind: "damages", id: "DS-0004", values: { "ratings.privacy": 1 } });
  assert.equal(code(tara, "riskRating", "R004"), "rating.review-stale");
  assert.equal(code(tara, "riskRating", "R003"), "rating.reviewed");
});

test("reviews are confirmed again from the bottom up, each with the name of who confirmed it", () => {
  let tara = change(example("kettle"), { op: "set", kind: "paths", id: "AP002", values: { "factors.expertise": "proficient" } });
  // the rating cannot be confirmed while its attack path waits for its review
  const early = applyChanges(tara, [{ op: "review", kind: "risk_rating", subjectId: "R002", reference: "REV-2" }], context);
  assert.match(early.notes.join(" "), /does not count yet/);
  assert.equal(code(early.tara, "riskRating", "R002"), "rating.path-review");

  tara = change(tara, { op: "review", kind: "attack_path", subjectId: "AP002", reference: "REV-2" });
  assert.equal(code(tara, "paths", "AP002"), "path.included");
  tara = change(tara, { op: "review", kind: "risk_rating", subjectId: "R002", reference: "REV-2" });
  assert.equal(code(tara, "riskRating", "R002"), "rating.reviewed");
  // the goal and the treatment rest on the rating, which has a new review
  assert.equal(code(tara, "goalClaims", "CG02"), "goal.review-stale");
  tara = change(tara, { op: "review", kind: "goal_claim", subjectId: "CG02", reference: "REV-2" });
  tara = change(tara, { op: "review", kind: "treatment", subjectId: "R002", reference: "REV-2" });
  assert.equal(code(tara, "riskTreatment", "R002"), "treatment.approved");
  const review = tara.reviews.find((r) => r.kind === "treatment" && r.subjectId === "R002");
  assert.equal(review?.confirmedBy, "Ada Example");
  assert.equal(review?.revision, tara.reviewCount);
});

test("a review needs a reference, and removing it removes the review", () => {
  const tara = example("kettle");
  assert.throws(() => change(tara, { op: "review", kind: "attack_path", subjectId: "AP001", reference: " " }), Refusal);
  assert.throws(() => change(tara, { op: "review", kind: "attack_path", subjectId: "AP999", reference: "x" }), Refusal);
  const cleared = change(tara, { op: "clearReview", kind: "attack_path", subjectId: "AP001" });
  assert.equal(code(cleared, "paths", "AP001"), "path.review-missing");
});

test("a TARA is released when the release review stands and three people have signed", () => {
  let tara = example("kettle");
  assert.deepEqual(releaseNeeds(tara, assess(tara)), [
    "The author has not signed.",
    "The reviewer has not signed.",
    "The approver has not signed.",
  ]);
  assert.throws(() => applyChanges(tara, [{ op: "sign", role: "author" }], as("Unnamed")), /Say who you are/);

  tara = applyChanges(tara, [{ op: "sign", role: "author", roleTitle: "Security engineer" }], as("Ada")).tara;
  tara = applyChanges(tara, [{ op: "sign", role: "reviewer" }], as("Grace")).tara;
  tara = applyChanges(tara, [{ op: "sign", role: "approver" }], as("Ada")).tara;
  assert.deepEqual(releaseNeeds(tara, assess(tara)), ["The approver must be a different person from the author."]);
  assert.throws(() => applyChanges(tara, [{ op: "release" }], as("Ada")), /cannot be released yet/);

  tara = applyChanges(tara, [{ op: "sign", role: "approver" }], as("Linus")).tara;
  assert.deepEqual(releaseNeeds(tara, assess(tara)), []);
  tara = applyChanges(tara, [{ op: "release" }], as("Linus")).tara;
  assert.equal(tara.meta.status, "released");
  assert.equal(tara.changeLog.at(-1)?.approvedBy, "Linus");
  // a released TARA is frozen, and still shows everything as reviewed
  assert.throws(
    () => applyChanges(tara, [{ op: "setMeta", values: { title: "x" } }], as("Ada")),
    /released and cannot be changed/,
  );
  assert.equal(assess(tara).checks.releaseReview.code, "release.reviewed");
});

test("a signature covers the assessment as it stood: a later change asks for it again", () => {
  let tara = applyChanges(example("kettle"), [{ op: "sign", role: "author" }], as("Ada")).tara;
  tara = change(tara, { op: "setScope", key: "cra_annex_vii", values: { decision: "Reworded" } });
  tara = change(tara, { op: "review", kind: "release", subjectId: null, reference: "KT-REV-02" });
  assert.ok(
    releaseNeeds(tara, assess(tara)).includes("The author signed before the assessment last changed and has to sign again."),
  );
});

test("the next revision keeps every record and ID, drops the signatures, and asks for every review again", () => {
  const released = example("kettle");
  released.meta.status = "released";
  const next = nextRevision(released, {
    id: "example-kettle-1-1",
    revision: "1.1",
    reason: "New software release",
    now: context.now,
  });
  assert.equal(next.meta.status, "draft");
  assert.deepEqual(next.meta.basedOn, { id: "example-kettle", revision: "1.0" });
  assert.deepEqual(next.threats, released.threats);
  assert.deepEqual(next.signoffs, []);
  // the revision of the document is part of what every review covers
  assert.equal(assess(next).checks.scopeReview.code, "scope-review.stale");
  assert.equal(code(next, "paths", "AP001"), "path.review-stale");
});
