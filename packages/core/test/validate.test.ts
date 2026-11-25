import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidTara, parseTara, type Tara, validateTara } from "../src/index.ts";
import { EXAMPLES, emptyTara, example } from "./helpers.ts";

/** A copy of the kettle example with one thing changed, without going through applyChanges. */
const broken = (damage: (tara: Tara) => void): Tara => {
  const tara = example("kettle");
  damage(tara);
  return tara;
};

test("a new TARA and every example are valid documents", () => {
  assert.deepEqual(validateTara(emptyTara()), []);
  for (const name of EXAMPLES) assert.deepEqual(validateTara(example(name)), [], name);
});

test("a document of another format is refused before anything else is looked at", () => {
  assert.match(validateTara({ format: "something/9" }).join(" "), /This version of the tool reads "open-tara\/1\.0"/);
  assert.deepEqual(validateTara("text"), ["The document is not an object."]);
  assert.throws(() => parseTara({ format: "open-tara/1.0" }), InvalidTara);
});

test("a link to a record that does not exist is found", () => {
  const problems = validateTara(broken((t) => (t.threats[0] as { damageIds: string[] }).damageIds.push("DS-9999")));
  assert.match(problems.join(" "), /threats\[TS001\]\.damageIds: names a damage scenario that does not exist: DS-9999/);
});

test("an ID belongs to one record in the whole TARA", () => {
  const problems = validateTara(broken((t) => ((t.assets[1] as { id: string }).id = "A01")));
  assert.match(problems.join(" "), /the ID is used twice/);
});

test("a field the format does not know, a missing field and a wrong kind of value are found", () => {
  assert.match(
    validateTara(broken((t) => ((t.assets[0] as unknown as Record<string, unknown>).colour = "red"))).join(" "),
    /assets\[A01\]\.colour: is not a field/,
  );
  assert.match(
    validateTara(broken((t) => delete (t.assets[0] as unknown as Record<string, unknown>).variant)).join(" "),
    /assets\[A01\]\.variant: is missing/,
  );
  assert.match(
    validateTara(broken((t) => ((t.damages[0] as unknown as { ratings: Record<string, unknown> }).ratings.safety = 7))).join(" "),
    /ratings\.safety: must be an impact level/,
  );
});

test("every threat scenario has exactly one risk", () => {
  // the risk of TS005 is pointed at TS004 instead: one threat now has two risks and the other none
  const problems = validateTara(broken((t) => ((t.risks[4] as { threatId: string }).threatId = "TS004")));
  assert.match(problems.join(" "), /threats\[TS004\]: must have exactly one risk, and has 2/);
  assert.match(problems.join(" "), /threats\[TS005\]: must have exactly one risk, and has 0/);
});

test("a data flow runs between things, and only a data flow has ends", () => {
  assert.match(
    validateTara(broken((t) => ((t.elements.find((e) => e.id === "DF01") as { targetId: string }).targetId = "TB01"))).join(" "),
    /a data flow runs between/,
  );
  assert.match(
    validateTara(broken((t) => ((t.elements.find((e) => e.id === "C01") as { sourceId: string }).sourceId = "EX01"))).join(" "),
    /only a data flow has ends/,
  );
});

test("evidence must be about a control its risk has selected", () => {
  const problems = validateTara(broken((t) => ((t.risks[0] as { existingControlIds: string[] }).existingControlIds = [])));
  assert.match(problems.join(" "), /CTL-001 is not selected on R001/);
});
