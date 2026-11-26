// The rule engine, tested on the training examples. Their values are documented (docs/examples.md), so a
// rule that changes a result shows up here.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionPlan,
  actionPlanMarkdown,
  assess,
  CHECKS,
  check,
  controlState,
  coverage,
  craTrace,
  findings,
  openFindings,
  riskIdFor,
  score,
  type Tara,
} from "../src/index.ts";
import { change, EXAMPLES, emptyTara, example } from "./helpers.ts";

const values = (tara: Tara): Record<string, number | null> =>
  Object.fromEntries(tara.threats.map((t) => [riskIdFor(t.id), score(tara).risks.get(t.id)?.value ?? null]));

test("the kettle's five risks land on the five risk values", () => {
  assert.deepEqual(values(example("kettle")), { R001: 4, R002: 3, R003: 5, R004: 2, R005: 1 });
});

test("the door lock and the gateway give their documented values", () => {
  assert.deepEqual(values(example("door-lock")), { R001: 5, R002: 5, R003: 5, R004: 3, R005: 4, R006: 4, R007: 2 });
  assert.deepEqual(values(example("gateway")), { R001: 5, R002: 5, R003: 5, R004: 5, R005: 1, R006: 3, R007: 4 });
});

test("an attack path is rated by the sum of its five factors", () => {
  const scores = score(example("kettle"));
  assert.deepEqual(
    ["AP001", "AP002", "AP003", "AP004", "AP005"].map((id) => scores.paths.get(id)?.totalPoints),
    [7, 25, 8, 1, 27],
  );
  assert.equal(scores.paths.get("AP002")?.feasibility, "very_low");
});

test("an easier attack raises the risk: expertise from expert to proficient takes R002 from 3 to 4", () => {
  const tara = change(example("kettle"), {
    op: "set",
    kind: "paths",
    id: "AP002",
    values: { "factors.expertise": "proficient" },
  });
  const scores = score(tara);
  assert.equal(scores.paths.get("AP002")?.totalPoints, 22);
  assert.equal(scores.paths.get("AP002")?.feasibility, "low");
  assert.equal(values(tara).R002, 4);
});

test("a worse impact raises the risk: privacy 1 on DS-0004 takes R004 from 2 to 4", () => {
  const tara = change(example("kettle"), { op: "set", kind: "damages", id: "DS-0004", values: { "ratings.privacy": 1 } });
  assert.equal(values(tara).R004, 4);
});

test("the easiest included path decides; a screened-out path does not count", () => {
  let tara = example("kettle");
  tara = change(tara, {
    op: "add",
    kind: "paths",
    values: {
      threatIds: ["TS002"],
      description: "Easy way",
      feasibilityBasis: "Because",
      disposition: "included",
      "factors.elapsed_time": "lt_1_day",
      "factors.expertise": "layman",
      "factors.knowledge": "public",
      "factors.window_of_opportunity": "unlimited",
      "factors.equipment": "standard",
    },
  });
  assert.equal(values(tara).R002, 5);
  tara = change(tara, { op: "set", kind: "paths", id: "AP006", values: { disposition: "screened_out" } });
  assert.equal(values(tara).R002, 3);
});

test("a risk has no value until its threat has a rated damage scenario and a complete attack path", () => {
  let tara = change(emptyTara(), {
    op: "add",
    kind: "threats",
    values: { category: "spoofing", description: "Someone poses as the owner" },
  });
  let risk = score(tara).risks.get("TS001");
  assert.deepEqual(risk?.impact, { pending: "damage_links" });
  assert.deepEqual(risk?.minAttackPotential, { pending: "no_paths" });
  assert.equal(risk?.value, null);
  tara = change(tara, { op: "add", kind: "paths", values: { threatIds: ["TS001"] } });
  risk = score(tara).risks.get("TS001");
  assert.deepEqual(risk?.minAttackPotential, { pending: "incomplete_paths" });
});

test("every example is complete: no check is open", () => {
  for (const name of EXAMPLES) {
    const open = openFindings(assess(example(name)).checks);
    assert.deepEqual(
      open.map((f) => `${f.recordId ?? f.scopeKey}: ${f.status.code}`),
      [],
      name,
    );
  }
});

test("every record of a TARA has exactly one status, and each status is in the catalogue", () => {
  const tara = example("gateway");
  const all = findings(assess(tara).checks);
  for (const finding of all) assert.ok(finding.status.code in CHECKS, finding.status.code);
  const counted = (step: string) => all.filter((f) => f.step === step).length;
  assert.equal(counted("threats"), tara.threats.length);
  assert.equal(counted("risks"), tara.risks.length);
  assert.equal(counted("treatment"), tara.risks.length);
  assert.equal(counted("cra"), 21);
});

test("a new TARA says what to do first, and the release waits for everything else", () => {
  const checks = check(emptyTara());
  assert.equal(checks.scopeFields.configuration_id.code, "scope.input-needed");
  assert.equal(checks.scopeReview.code, "scope-review.inputs");
  assert.equal(checks.cra.get("CRA-a")?.code, "cra.scope-undecided");
  assert.equal(checks.releaseReview.code, "release.scope-review");
});

test("a ladder shows the first thing that is missing", () => {
  let tara = change(emptyTara(), { op: "add", kind: "items" });
  assert.equal(check(tara).items.get("IT01")?.code, "item.name");
  tara = change(tara, { op: "set", kind: "items", id: "IT01", values: { name: "Thermostat" } });
  assert.equal(check(tara).items.get("IT01")?.code, "item.configuration");
  tara = change(tara, { op: "add", kind: "assets", values: { name: "Schedule", itemId: "IT01" } });
  assert.equal(check(tara).assets.get("A01")?.code, "asset.coverage");
  tara = change(tara, { op: "set", kind: "assets", id: "A01", values: { coverageRationale: "Harmless if lost" } });
  assert.equal(check(tara).assets.get("A01")?.code, "asset.ok");
});

test("only verified existing controls count; a reduced risk needs one", () => {
  // the kettle's control on R001 goes back to being merely in the product
  const tara = change(example("kettle"), { op: "set", kind: "evidence", id: "EV-001", values: { state: "implemented" } });
  const { checks } = assess(tara);
  assert.equal(checks.evidence.get("EV-001")?.code, "evidence.unverified");
  assert.equal(checks.riskRating.get("R001")?.code, "rating.controls-unverified");
  assert.equal(checks.riskTreatment.get("R001")?.code, "treatment.controls-unverified");
  assert.equal(controlState(tara, "CTL-001"), "implemented");
});

test("the CRA trace of a requirement lists its controls, the risks they treat, and what was verified", () => {
  const tara = example("kettle");
  const trace = craTrace(tara, assess(tara).checks, "d");
  assert.deepEqual(trace, {
    controlIds: ["CTL-001"],
    riskIds: ["R001"],
    verified: [{ evidenceId: "EV-001", controlId: "CTL-001", riskId: "R001" }],
  });
  assert.equal(craTrace(tara, assess(tara).checks, "II(1)"), null);
});

test("the gap view: taking the control off a reduced risk opens a gap where the risk lands", () => {
  const tara = example("kettle");
  const before = coverage(tara, new Map(tara.threats.map((t) => [t.id, score(tara).risks.get(t.id)?.value ?? null])));
  assert.equal(
    before.some((c) => c.state === "gap"),
    false,
  );
  // the settings memory holds the Wi-Fi password; its control now acts nowhere
  const moved = change(tara, { op: "set", kind: "controls", id: "CTL-003", values: { elementIds: [] } });
  const after = coverage(moved, new Map(moved.threats.map((t) => [t.id, score(moved).risks.get(t.id)?.value ?? null])));
  const memory = after.find((c) => c.elementId === "ST01");
  assert.equal(memory?.state, "gap");
  assert.equal(memory?.value, 5);
});

test("the action plan: nothing for a finished assessment, one action per control still to come", () => {
  const kettle = example("kettle");
  assert.deepEqual(actionPlan(kettle, assess(kettle)), []);
  assert.match(actionPlanMarkdown(kettle, []), /Nothing is open/);

  const lock = example("door-lock");
  const plan = actionPlan(lock, assess(lock));
  const proposed = lock.controls.filter((c) => controlState(lock, c.id) === "proposed").map((c) => `ACT-${c.id}`);
  assert.deepEqual(
    plan.map((a) => a.id),
    proposed,
  );
  assert.equal(plan[0]?.kind, "implement");
  assert.match(actionPlanMarkdown(lock, plan), /## Technical controls to implement and verify/);
});
