// The ratings of a record, as they are drawn: what is lost and how hard it hits, how feasible an attack is, and
// how the value of a risk comes about. More ink is more risk; what is not rated yet is left open.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bandName, check, IMPACT_PENDING_TEXT, levelName, type Tara } from "@tara/core";
import type { GraphKind } from "../src/views/graph.ts";
import {
  type Composition,
  compositionOf,
  damageRatings,
  pathRatings,
  riskRatings,
  type Strip,
  stripOf,
} from "../src/views/ratings.ts";
import { changed, element, flow, nth } from "./helpers.ts";

const made = (change: (tara: Tara) => void = () => {}) => {
  const tara = changed(change);
  return { tara, scores: check(tara).scores };
};
const metersOf = (strip: Strip | null) =>
  (strip?.meters ?? []).map((meter) => [meter.label, meter.steps, meter.filled, meter.sets === true]);

// ------------------------------------------------------------------------------------------- the ratings, drawn

test("a damage scenario shows the properties it loses, and its level in each category, the highest standing out", () => {
  // d1 loses integrity and availability, and is rated safety 2, financial 1, operational 3, privacy 0
  const { tara, scores } = made();
  const strip = stripOf(tara, scores, "damages", "d1");
  assert.deepEqual(
    strip?.lost?.map((property) => [property.letter, property.on]),
    [
      ["C", false],
      ["I", true],
      ["A", true],
    ],
  );
  assert.equal(strip?.lostSays, "Lost: integrity, availability");
  assert.deepEqual(metersOf(strip), [
    ["S", 3, 2, false],
    ["F", 3, 1, false],
    ["O", 3, 3, true],
    ["P", 3, 0, false],
  ]);
  assert.match(strip?.meters[2]?.says ?? "", /^Operational: /);
  assert.equal(damageRatings(tara, scores, "d1")?.impact, 3);
  assert.equal(levelName(tara.method, 3), "Severe");
});

test("a category that is not rated yet is left open, and the highest so far still stands out; nothing lost says so", () => {
  const { tara, scores } = made((changing) => {
    const damage = nth(changing.damages, 0);
    damage.ratings.operational = null;
    damage.integrity = false;
    damage.availability = false;
  });
  const strip = stripOf(tara, scores, "damages", "d1");
  assert.deepEqual(metersOf(strip), [
    ["S", 3, 2, true],
    ["F", 3, 1, false],
    ["O", 3, null, false],
    ["P", 3, 0, false],
  ]);
  assert.equal(strip?.meters[2]?.says, "Operational: not rated yet");
  assert.equal(strip?.lostSays, "No security property is marked as lost");
  // the rules give the impact only once every category is rated
  assert.equal(damageRatings(tara, scores, "d1")?.impact, null);
});

test("two categories at the same highest level both stand out; a scenario rated negligible throughout has none that does", () => {
  const { tara, scores } = made((changing) => {
    nth(changing.damages, 0).ratings = { safety: 2, financial: 2, operational: 1, privacy: 0 };
    nth(changing.damages, 1).ratings = { safety: 0, financial: 0, operational: 0, privacy: 0 };
  });
  const standsOut = (id: string) => metersOf(stripOf(tara, scores, "damages", id)).map((meter) => meter[3]);
  assert.deepEqual(standsOut("d1"), [true, true, false, false]);
  assert.deepEqual(standsOut("d2"), [false, false, false, false]);
});

test("an attack path is the fuller the more feasible it is, with its points; a screened-out one has no ratings to show", () => {
  const { tara, scores } = made();
  const bands = tara.method.feasibility_bands;
  for (const id of ["p1", "p2"]) {
    const score = scores.paths.get(id);
    const strip = stripOf(tara, scores, "paths", id);
    const filled = bands.length - bands.findIndex((band) => band.key === score?.feasibility);
    assert.deepEqual(metersOf(strip), [["Feasibility", bands.length, filled, false]]);
    assert.equal(strip?.note, `${score?.totalPoints} points`);
  }
  // p2 needs nothing an attacker would not have: the most feasible band, which fills the meter
  assert.equal(stripOf(tara, scores, "paths", "p2")?.meters[0]?.filled, bands.length);

  const p1 = pathRatings(tara, scores, "p1");
  assert.ok(p1);
  // each factor with the option chosen
  assert.deepEqual(
    p1.factors.map((factor) => factor.key),
    tara.method.feasibility_factors.map((factor) => factor.key),
  );
  assert.equal(
    p1.factors.reduce((total, factor) => total + (factor.points ?? 0), 0),
    p1.points,
  );
  assert.deepEqual(
    p1.bands.filter((band) => band.on).map((band) => band.key),
    [p1.feasibility],
  );
  assert.equal(p1.says, `Feasibility: ${bandName(tara.method, p1.feasibility)}, ${p1.points} points`);
  assert.equal(pathRatings(tara, scores, "p3")?.screened, true);
  assert.equal(stripOf(tara, scores, "paths", "p3"), null);
});

test("a path whose factors are not all chosen is not rated yet", () => {
  const { tara, scores } = made((changing) => {
    nth(changing.paths, 0).factors.expertise = null;
  });
  const strip = stripOf(tara, scores, "paths", "p1");
  assert.deepEqual([strip?.meters[0]?.filled, strip?.meters[0]?.says], [null, "Feasibility: not rated yet"]);
  assert.equal(strip?.note, undefined);
  const expertise = pathRatings(tara, scores, "p1")?.factors.find((factor) => factor.key === "expertise");
  assert.deepEqual([expertise?.option, expertise?.points], [null, null]);
});

test("a risk shows its impact and its feasibility, and its place in the matrix of the method, where its value stands", () => {
  const { tara, scores } = made();
  const ratings = riskRatings(tara, scores, "r1");
  const score = scores.risks.get("t1");
  assert.ok(ratings && score);
  assert.deepEqual(metersOf(stripOf(tara, scores, "risks", "r1")), [
    ["Impact", 3, 3, false],
    ["Feasibility", 4, 4, false],
  ]);
  assert.deepEqual(ratings.impact, { filled: 3, words: "Severe", says: "Impact: Severe" });
  const points = "points" in score.minAttackPotential ? score.minAttackPotential.points : "?";
  assert.equal(ratings.feasibility.words, `${bandName(tara.method, score.feasibility)}, ${points} points`);
  assert.equal(ratings.value, 5);

  // the feasibility grows to the right and the impact upwards: the place of this risk is the upper right corner
  const across = [...tara.method.feasibility_bands].reverse();
  assert.deepEqual(
    ratings.matrix.columns,
    across.map((band) => band.label),
  );
  assert.deepEqual(
    ratings.matrix.rows.map((row) => row.name),
    ["Severe", "Major", "Moderate", "Negligible"],
  );
  const here = ratings.matrix.rows.flatMap((row, y) => row.cells.flatMap((cell, x) => (cell.here ? [[y, x, cell.value]] : [])));
  assert.deepEqual(here, [[0, 3, 5]]);
  ratings.matrix.rows.forEach((row, y) => {
    row.cells.forEach((cell, x) => {
      assert.equal(cell.value, tara.method.risk_matrix[String(3 - y)]?.[nth(across, x).key]);
    });
  });
});

test("a risk that cannot be rated yet is left open and says what is missing; it has no place in the matrix", () => {
  const { tara, scores } = made((changing) => {
    nth(changing.damages, 0).ratings.safety = null;
  });
  const ratings = riskRatings(tara, scores, "r1");
  const waitingFor = IMPACT_PENDING_TEXT.damage_ratings;
  assert.deepEqual(ratings?.impact, { filled: null, words: waitingFor, says: `Impact: ${waitingFor}` });
  assert.equal(
    ratings?.matrix.rows.some((row) => row.cells.some((cell) => cell.here)),
    false,
  );
  assert.deepEqual(metersOf(stripOf(tara, scores, "risks", "r1"))[0], ["Impact", 3, null, false]);
});

test("only a damage scenario, an attack path and a risk have ratings to draw; a record that is not there has none", () => {
  const { tara, scores } = made();
  const without: [GraphKind, string][] = [
    ["assets", "a1"],
    ["threats", "t1"],
    ["controls", "c1"],
    ["goalClaims", "g1"],
    ["elements", "x"],
    ["items", "i1"],
    ["damages", "nothing"],
    ["paths", "nothing"],
    ["risks", "nothing"],
  ];
  for (const [kind, id] of without) assert.equal(stripOf(tara, scores, kind, id), null, `${kind} ${id}`);
});

// ----------------------------------------------------------------------------------------- what a record is made of

// What the block in the middle of an ego view shows: the fields of a record's form that say what it is.
const withElements = (tara: Tara) => {
  tara.elements = [
    element("cm1", "component", { name: "Controller", boundaryId: "bd1" }),
    element("bd1", "trust_boundary", { name: "Cabinet" }),
    element("ex1", "external_interactor", { name: "Laptop" }),
    { ...flow("fl1", "ex1", "cm1", "backward"), name: "Service" },
    { ...flow("fl2", "cm1", null, "forward"), name: "Open" },
  ];
};
const madeOf = (kind: GraphKind, id: string, change: (tara: Tara) => void = () => {}): Composition => {
  const { tara, scores } = made((changing) => {
    withElements(changing);
    change(changing);
  });
  return compositionOf(tara, scores, kind, id);
};
const linesOf = (composition: Composition) =>
  composition.parts.map((part) => [
    part.name,
    part.meter ? part.meter.filled : undefined,
    part.words,
    ...(part.points !== undefined ? [part.points] : []),
  ]);

test("a damage scenario is made of what is lost, then each category with its level drawn and named; the highest shows", () => {
  const composition = madeOf("damages", "d1");
  assert.deepEqual(composition.parts[0], {
    name: "Lost",
    lost: [
      { letter: "C", on: false },
      { letter: "I", on: true },
      { letter: "A", on: true },
    ],
    words: "Integrity, Availability",
  });
  assert.deepEqual(
    composition.parts.slice(1).map((part) => [part.name, part.meter?.steps, part.meter?.filled, part.sets === true]),
    [
      ["Safety", 3, 2, false],
      ["Financial", 3, 1, false],
      ["Operational", 3, 3, true],
      ["Privacy", 3, 0, false],
    ],
  );
  // the code and level of the rating, without its criteria
  for (const part of composition.parts.slice(1)) assert.match(part.words ?? "", /^[SFOP][0-3] \w+$/);

  const unfinished = madeOf("damages", "d1", (tara) => {
    const damage = nth(tara.damages, 0);
    damage.ratings.privacy = null;
    damage.integrity = false;
    damage.availability = false;
  });
  assert.equal(unfinished.parts[0]?.words, "Nothing marked yet");
  assert.equal(unfinished.parts[4]?.words, "Not rated yet");
});

test("an attack path is made of each factor with its option and points, and its feasibility; a screened-out one says so", () => {
  const composition = madeOf("paths", "p1");
  const { tara, scores } = made();
  const score = scores.paths.get("p1");
  assert.deepEqual(
    composition.parts.slice(0, 5).map((part) => part.name),
    tara.method.feasibility_factors.map((factor) => factor.label),
  );
  assert.equal(
    composition.parts.slice(0, 5).reduce((total, part) => total + (part.points ?? 0), 0),
    score?.totalPoints,
  );
  const feasibility = composition.parts[5];
  assert.deepEqual(
    [feasibility?.name, feasibility?.sets, feasibility?.words],
    ["Feasibility", true, `${bandName(tara.method, score?.feasibility ?? null)}, ${score?.totalPoints} points`],
  );
  assert.deepEqual(linesOf(madeOf("paths", "p3")), [["Counted", undefined, "No: it is screened out"]]);
  const unchosen = madeOf("paths", "p1", (changing) => {
    nth(changing.paths, 0).factors.expertise = null;
  });
  assert.deepEqual(linesOf(unchosen)[1], ["Expertise", undefined, "Not chosen yet", null]);
  assert.equal(unchosen.parts[5]?.words, "Not rated yet");
});

test("a risk is made of its impact, its feasibility and its treatment, with the matrix of the method and its place in it", () => {
  const composition = madeOf("risks", "r1");
  assert.deepEqual(
    composition.parts.map((part) => [part.name, part.meter?.filled, part.words?.split(",")[0]]),
    [
      ["Impact", 3, "Severe"],
      ["Feasibility", 4, "High"],
      ["Treatment", undefined, "Reduce"],
    ],
  );
  assert.deepEqual(
    composition.matrix?.rows.flatMap((row) => row.cells.filter((cell) => cell.here).map((cell) => cell.value)),
    [5],
  );
  const undecided = madeOf("risks", "r1", (tara) => {
    nth(tara.risks, 0).treatment = null;
  });
  assert.equal(undecided.parts[2]?.words, "Not decided yet");
});

test("a threat is made of its category and highest impact; a control of its state, type and CRA requirements", () => {
  assert.deepEqual(linesOf(madeOf("threats", "t1")), [
    ["Category", undefined, "Tampering"],
    ["Highest impact", 3, "Severe"],
  ]);
  const unlinked = madeOf("threats", "t1", (tara) => {
    nth(tara.threats, 0).damageIds = [];
  });
  assert.deepEqual(
    [unlinked.parts[1]?.name, unlinked.parts[1]?.meter?.filled, unlinked.parts[1]?.words],
    ["Highest impact", null, IMPACT_PENDING_TEXT.damage_links],
  );
  assert.deepEqual(linesOf(madeOf("controls", "c1")), [
    ["State", undefined, "Verified"],
    ["Type", undefined, "Technical"],
    ["CRA Annex I", undefined, "(a), (b)"],
  ]);
  assert.deepEqual(linesOf(madeOf("controls", "c2")), [["State", undefined, "Proposed"]]);
});

test("an asset is made of its item and variant; an element of its item and boundary; a data flow of which way it carries", () => {
  assert.deepEqual(linesOf(madeOf("assets", "a1")), [["Item", undefined, "i1 Example product"]]);
  const withVariant = madeOf("assets", "a1", (tara) => {
    nth(tara.assets, 0).variant = "Mains powered only";
  });
  assert.deepEqual(linesOf(withVariant)[1], ["Variant", undefined, "Mains powered only"]);
  assert.deepEqual(linesOf(madeOf("elements", "cm1")), [
    ["Item", undefined, "i1 Example product"],
    ["Inside", undefined, "bd1 Cabinet"],
  ]);
  // fl1 is recorded from the laptop to the controller, and carries backward
  assert.deepEqual(linesOf(madeOf("elements", "fl1"))[0], ["Carries", undefined, "From cm1 to ex1"]);
  assert.deepEqual(linesOf(madeOf("elements", "fl2"))[0], ["Carries", undefined, "From cm1 to an open end"]);
});

test("a goal or claim is made of which of the two it is", () => {
  assert.match(String(linesOf(madeOf("goalClaims", "g1"))[0]?.[2]), /^Goal: /);
  assert.match(String(linesOf(madeOf("goalClaims", "g2"))[0]?.[2]), /^Claim: /);
});

test("what is not there, and an item, are made of nothing that is shown", () => {
  const nothing: [GraphKind, string][] = [
    ["damages", "nothing"],
    ["paths", "nothing"],
    ["risks", "nothing"],
    ["threats", "nothing"],
    ["controls", "nothing"],
    ["assets", "nothing"],
    ["elements", "nothing"],
    ["goalClaims", "nothing"],
    ["items", "i1"],
  ];
  for (const [kind, id] of nothing) assert.deepEqual(madeOf(kind, id), { parts: [] }, `${kind} ${id}`);
});
