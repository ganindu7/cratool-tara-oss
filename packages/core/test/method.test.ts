import assert from "node:assert/strict";
import { test } from "node:test";
import { feasibilityForPoints, riskValue, validateMethod } from "../src/index.ts";
import { defaultMethod } from "./helpers.ts";

test("the method shipped with the tool is valid", () => {
  assert.deepEqual(validateMethod(defaultMethod()), []);
});

test("a method with a part missing is refused with the reason", () => {
  const method = defaultMethod();
  method.impact_categories = method.impact_categories.filter((c) => c.key !== "privacy");
  assert.match(validateMethod(method).join(" "), /impact category "privacy" is missing/);
  assert.notDeepEqual(validateMethod({}), []);
  assert.notDeepEqual(validateMethod(null), []);
});

test("feasibility bands must cover every total without gap or overlap", () => {
  const method = defaultMethod();
  (method.feasibility_bands[1] as { min: number }).min = 16;
  assert.match(validateMethod(method).join(" "), /no gap and no overlap/);
});

test("the risk matrix must never give less for a worse impact or an easier attack", () => {
  const method = defaultMethod();
  (method.risk_matrix["3"] as Record<string, number>).high = 1;
  assert.match(validateMethod(method).join(" "), /easier attack must not give a lower value/);
});

test("the default method: points fall into bands, and the matrix gives the risk value", () => {
  const method = defaultMethod();
  assert.equal(feasibilityForPoints(method, 0), "high");
  assert.equal(feasibilityForPoints(method, 13), "high");
  assert.equal(feasibilityForPoints(method, 14), "medium");
  assert.equal(feasibilityForPoints(method, 24), "low");
  assert.equal(feasibilityForPoints(method, 25), "very_low");
  assert.equal(riskValue(method, 3, "high"), 5);
  assert.equal(riskValue(method, 0, "very_low"), 1);
  assert.equal(riskValue(method, null, "high"), null);
});
