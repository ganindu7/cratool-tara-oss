// The changes a TARA can take: adding, setting and removing records, the scope, the method, and every refusal.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChanges, type Change, controlState, Refusal, validateTara, withdrawnIds } from "../src/index.ts";
import { change, context, emptyTara, example, last } from "./helpers.ts";

/** Asserts that a change is refused, and gives the refusal. */
function refused(run: () => unknown, pattern: RegExp, reason?: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Refusal, `expected a Refusal, got ${String(error)}`);
    assert.match(error.message, pattern);
    if (reason) assert.equal(error.reason, reason);
    return true;
  });
}

test("a change gives back a new TARA and leaves the one it was given untouched", () => {
  const before = emptyTara();
  const snapshot = JSON.stringify(before);
  const after = change(before, { op: "add", kind: "items", values: { name: "Thermostat" } });
  assert.equal(JSON.stringify(before), snapshot);
  assert.equal(after.items.length, 1);
  assert.deepEqual(validateTara(after), []);
});

test("records get their IDs from the tool, by kind, and a threat scenario gets its risk", () => {
  let tara = change(emptyTara(), { op: "add", kind: "items", values: { name: "Thermostat" } });
  assert.equal(last(tara.items).id, "IT01");
  tara = change(
    tara,
    { op: "add", kind: "elements", values: { kind: "component", itemId: "IT01", name: "Controller" } },
    { op: "add", kind: "elements", values: { kind: "data_store", itemId: "IT01", name: "Settings" } },
    {
      op: "add",
      kind: "elements",
      values: { kind: "data_flow", itemId: "IT01", name: "Read and write", sourceId: "C01", targetId: "ST01" },
    },
    { op: "add", kind: "assets", values: { name: "Schedule", itemId: "IT01", elementIds: ["ST01"] } },
    { op: "add", kind: "damages", values: { assetId: "A01", integrity: true, "ratings.safety": 1 } },
    { op: "add", kind: "threats", values: { category: "tampering", damageIds: ["DS-0001"] } },
    { op: "add", kind: "goalClaims", values: { kind: "claim" } },
  );
  assert.deepEqual(
    tara.elements.map((e) => e.id),
    ["C01", "ST01", "DF01"],
  );
  assert.equal(tara.damages[0]?.ratings.safety, 1);
  assert.equal(tara.threats[0]?.id, "TS001");
  assert.deepEqual(
    tara.risks.map((r) => [r.id, r.threatId]),
    [["R001", "TS001"]],
  );
  assert.equal(tara.goalClaims[0]?.id, "CC01");
});

test("an ID is never given twice: the number of a removed record stays used", () => {
  let tara = change(emptyTara(), { op: "add", kind: "assets" }, { op: "add", kind: "assets" });
  tara = change(tara, { op: "remove", kind: "assets", id: "A02" });
  tara = change(tara, { op: "add", kind: "assets" });
  assert.deepEqual(
    tara.assets.map((a) => a.id),
    ["A01", "A03"],
  );
  assert.deepEqual(withdrawnIds(tara), ["A02"]);
});

test("a person may choose the ID of an item or a document, once", () => {
  const tara = change(emptyTara(), { op: "add", kind: "references", id: "DOC-7", values: { title: "Test report" } });
  assert.equal(tara.references[0]?.id, "DOC-7");
  refused(() => change(tara, { op: "add", kind: "references", id: "DOC-7" }), /already in use/, "conflict");
  refused(() => change(tara, { op: "add", kind: "references", id: "7 up" }), /An ID starts with a letter/);
  refused(() => change(tara, { op: "add", kind: "assets", id: "MINE" }), /given by the tool/);
});

test("only fields of the kind can be set, with values of the right kind", () => {
  const tara = example("kettle");
  refused(
    () => change(tara, { op: "set", kind: "assets", id: "A01", values: { colour: "red" } }),
    /"colour" is not a field of an asset/,
  );
  refused(
    () => change(tara, { op: "set", kind: "damages", id: "DS-0001", values: { "ratings.safety": 9 } }),
    /impact level from 0 to 3/,
  );
  refused(
    () => change(tara, { op: "set", kind: "threats", id: "TS001", values: { damageIds: ["DS-0001", "NOPE"] } }),
    /does not exist: NOPE/,
  );
  refused(
    () => change(tara, { op: "set", kind: "paths", id: "AP001", values: { "factors.expertise": "wizard" } }),
    /not an option of this TARA's scoring method/,
  );
  refused(
    () => change(tara, { op: "set", kind: "controls", id: "CTL-001", values: { workLink: "see the wiki" } }),
    /starts with https/,
  );
  refused(
    () => change(tara, { op: "set", kind: "goalClaims", id: "CG01", values: { kind: "claim" } }),
    /cannot be changed afterwards/,
  );
  refused(
    () => change(tara, { op: "set", kind: "assets", id: "A99", values: { name: "x" } }),
    /There is no asset A99/,
    "not_found",
  );
});

test("text is stored trimmed, and an empty text as null", () => {
  const tara = change(example("kettle"), {
    op: "set",
    kind: "assets",
    id: "A01",
    values: { name: "  Switch-on command ", variant: "   " },
  });
  assert.equal(tara.assets[0]?.name, "Switch-on command");
  assert.equal(tara.assets[0]?.variant, null);
});

test("several changes sent together are made together or not at all", () => {
  const before = example("kettle");
  const changes: Change[] = [
    { op: "set", kind: "assets", id: "A01", values: { name: "Renamed" } },
    { op: "set", kind: "assets", id: "A02", values: { nonsense: true } },
  ];
  refused(() => applyChanges(before, changes, context), /not a field/);
  assert.equal(before.assets[0]?.name, "Switch-on command");
});

test("removing a record takes it out of every link", () => {
  const tara = change(example("kettle"), { op: "remove", kind: "damages", id: "DS-0004" });
  assert.equal(
    tara.damages.some((d) => d.id === "DS-0004"),
    false,
  );
  assert.deepEqual(tara.threats.find((t) => t.id === "TS004")?.damageIds, []);
  assert.deepEqual(validateTara(tara), []);
});

test("a record that others depend on is not removed until they are", () => {
  const tara = example("kettle");
  refused(
    () => change(tara, { op: "remove", kind: "controls", id: "CTL-001" }),
    /CTL-001 cannot be removed while control evidence EV-001 depends on it/,
    "conflict",
  );
  refused(
    () => change(tara, { op: "remove", kind: "items", id: "IT01" }),
    /cannot be removed while architecture element/,
    "conflict",
  );
  // the risk of a threat goes with its threat, but not while there is evidence for it
  refused(
    () => change(tara, { op: "remove", kind: "threats", id: "TS001" }),
    /R001 cannot be removed while control evidence EV-001/,
    "conflict",
  );
  refused(() => change(tara, { op: "remove", kind: "risks", id: "R001" }), /not removed by hand/);
});

test("removing a threat scenario removes its risk, the links to it and its reviews", () => {
  const tara = change(example("kettle"), { op: "remove", kind: "threats", id: "TS004" });
  assert.equal(
    tara.risks.some((r) => r.id === "R004"),
    false,
  );
  assert.deepEqual(tara.paths.find((p) => p.id === "AP004")?.threatIds, []);
  assert.deepEqual(tara.goalClaims.find((g) => g.id === "CC01")?.riskIds, []);
  assert.equal(
    tara.reviews.some((r) => r.subjectId === "R004"),
    false,
  );
  assert.deepEqual(validateTara(tara), []);
});

test("a control is existing or proposed on a risk, never both", () => {
  let tara = change(example("kettle"), { op: "set", kind: "risks", id: "R004", values: { proposedControlIds: ["CTL-001"] } });
  tara = change(tara, { op: "set", kind: "risks", id: "R004", values: { existingControlIds: ["CTL-001"] } });
  assert.deepEqual(tara.risks.find((r) => r.id === "R004")?.proposedControlIds, []);
  refused(
    () =>
      change(tara, {
        op: "set",
        kind: "risks",
        id: "R004",
        values: { existingControlIds: ["CTL-001"], proposedControlIds: ["CTL-001"] },
      }),
    /existing or proposed, not both/,
  );
});

test("a control cannot be taken off a risk while its evidence is kept, and evidence needs a selected control", () => {
  const tara = example("kettle");
  refused(
    () => change(tara, { op: "set", kind: "risks", id: "R001", values: { existingControlIds: [] } }),
    /Remove the evidence before taking the control off/,
    "conflict",
  );
  refused(
    () => change(tara, { op: "add", kind: "evidence", values: { riskId: "R004", controlId: "CTL-001" } }),
    /not selected on R004/,
    "conflict",
  );
  refused(
    () => change(tara, { op: "add", kind: "evidence", values: { riskId: "R001", controlId: "CTL-001" } }),
    /already is the evidence/,
    "conflict",
  );
});

test("the state of a control is set on every risk that uses it, with its evidence", () => {
  let tara = example("door-lock");
  const proposed = tara.controls.find((c) => controlState(tara, c.id) === "proposed");
  assert.ok(proposed, "the door lock has a proposed control");
  tara = change(tara, { op: "setControlState", id: proposed.id, state: "built" });
  assert.equal(controlState(tara, proposed.id), "built");
  const evidence = tara.evidence.filter((e) => e.controlId === proposed.id);
  assert.ok(evidence.length > 0 && evidence.every((e) => e.state === "built"));
  tara = change(tara, { op: "setControlState", id: proposed.id, state: "proposed" });
  assert.equal(controlState(tara, proposed.id), "proposed");
  const unused = change(tara, { op: "add", kind: "controls", values: { name: "Spare" } });
  refused(
    () => change(unused, { op: "setControlState", id: last(unused.controls).id, state: "built" }),
    /No risk uses this control yet/,
  );
});

test("document details and scope fields change through their own operations", () => {
  let tara = change(emptyTara(), { op: "setMeta", values: { title: "New title", documentNumber: " D-1 " } });
  assert.equal(tara.meta.title, "New title");
  assert.equal(tara.meta.documentNumber, "D-1");
  refused(() => change(tara, { op: "setMeta", values: { title: " " } }), /needs a title/);
  refused(() => change(tara, { op: "setMeta", values: { status: "released" } as never }), /cannot be changed here/);
  tara = change(tara, { op: "setScope", key: "cra_applicability", values: { decision: "in_scope", evidence: "Product note" } });
  assert.deepEqual(tara.scope.cra_applicability, { decision: "in_scope", evidence: "Product note" });
  refused(
    () => change(tara, { op: "setScope", key: "cra_applicability", values: { decision: "maybe" } }),
    /in scope or out of scope/,
  );
});

test("a scoring method is replaced only by a valid one", () => {
  const tara = example("kettle");
  refused(() => change(tara, { op: "setMethod", method: {} as never }), /cannot be used/);
  const method = structuredClone(tara.method);
  const expertise = method.feasibility_factors.find((f) => f.key === "expertise");
  if (expertise) expertise.options = expertise.options.filter((o) => o.key !== "expert");
  const applied = applyChanges(tara, [{ op: "setMethod", method }], context);
  assert.match(applied.notes.join(" "), /ask to be rated again: AP002/);
});

test("a released TARA cannot be changed", () => {
  const tara = example("kettle");
  tara.meta.status = "released";
  refused(
    () => change(tara, { op: "set", kind: "assets", id: "A01", values: { name: "x" } }),
    /released and cannot be changed/,
    "frozen",
  );
});
