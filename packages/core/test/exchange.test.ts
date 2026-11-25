// Taking in a TARA from a file, and drawing an architecture that nobody arranged.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrangeElements,
  asImported,
  assess,
  confirmAllReviews,
  ELEMENT_SIZE,
  openFindings,
  riskIdFor,
  validateTara,
} from "../src/index.ts";
import { example } from "./helpers.ts";

const into = { id: "taken-in", now: "2026-11-25T10:00:00.000Z" };

test("a TARA that is taken in is a new draft with every record, and the file it came from is untouched", () => {
  const file = example("gateway");
  const before = JSON.stringify(file);
  const { tara } = asImported(file, into);
  assert.equal(JSON.stringify(file), before);
  assert.deepEqual(validateTara(tara), []);
  assert.deepEqual([tara.id, tara.seq, tara.meta.status, tara.meta.createdAt], ["taken-in", 0, "draft", into.now]);
  for (const kind of [
    "items",
    "assets",
    "damages",
    "threats",
    "paths",
    "risks",
    "controls",
    "evidence",
    "goalClaims",
    "craDecisions",
    "references",
  ] as const) {
    assert.deepEqual(tara[kind], file[kind], kind);
  }
  assert.deepEqual(tara.method, file.method);
  assert.deepEqual(tara.scope, file.scope);
});

test("its risk values are the same, worked out anew; its reviews ask to be confirmed again", () => {
  const file = example("kettle");
  const { tara, notTaken } = asImported(file, into);
  const values = (of: typeof file) => of.threats.map((t) => [riskIdFor(t.id), assess(of).checks.scores.risks.get(t.id)?.value]);
  assert.deepEqual(values(tara), values(file));
  assert.ok(tara.reviews.every((r) => r.reference === "KT-REV-01" && r.fingerprint === null && r.confirmedBy === null));
  assert.equal(tara.reviewCount, 0);
  // The file had no check open. What is taken in is open again, and only for want of its reviews:
  // confirm them, and it is as complete as the file was.
  assert.deepEqual(openFindings(assess(file).checks), []);
  assert.ok(openFindings(assess(tara).checks).length > 0);
  const confirmed = confirmAllReviews(tara, { author: "Ada", now: into.now });
  assert.deepEqual(openFindings(assess(confirmed).checks), []);
  assert.match(notTaken.join(" "), /reviews keep their references and ask to be confirmed again/);
});

test("signatures, a release and the arrangement of the diagram do not come with a file, and that is said", () => {
  const file = example("kettle");
  file.meta.status = "released";
  file.meta.releasedAt = "2026-11-21T09:00:00.000Z";
  file.signoffs = [
    { role: "author", name: "Ada", roleTitle: null, evidenceRef: null, signedAt: "2026-11-21T09:00:00.000Z", fingerprint: "x" },
  ];
  const { tara, notTaken } = asImported(file, into);
  assert.deepEqual([tara.meta.status, tara.meta.releasedAt, tara.signoffs.length], ["draft", null, 0]);
  assert.ok(tara.elements.every((e) => e.x === null && e.y === null && e.w === null && e.h === null));
  const said = notTaken.join(" ");
  assert.match(said, /was released as revision 1\.0/);
  assert.match(said, /signature is not taken/);
  assert.match(said, /arrangement of its diagram is not taken/);
  // a file with none of these has nothing to say
  const plain = asImported({ ...example("kettle"), reviews: [], reviewCount: 0, elements: [] }, into);
  assert.deepEqual(plain.notTaken, []);
});

test("an architecture nobody arranged is still drawn: every element has a place, and a boundary frames its members", () => {
  const { tara } = asImported(example("gateway"), into);
  const places = arrangeElements(tara.elements);
  const drawn = tara.elements.filter((e) => e.kind !== "data_flow");
  assert.equal(places.size, drawn.length);
  assert.ok(tara.elements.filter((e) => e.kind === "data_flow").every((flow) => !places.has(flow.id)));

  // nothing lies on top of anything else, apart from a boundary and what is in it
  const things = drawn.filter((e) => e.kind !== "trust_boundary");
  for (const a of things) {
    for (const b of things) {
      if (a.id >= b.id) continue;
      const [p, q] = [places.get(a.id), places.get(b.id)];
      assert.ok(p && q);
      const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
      assert.ok(apart, `${a.id} and ${b.id} overlap`);
    }
  }
  for (const member of things.filter((e) => e.boundaryId !== null)) {
    const frame = places.get(member.boundaryId as string);
    const at = places.get(member.id);
    assert.ok(frame && at);
    assert.ok(
      at.x >= frame.x && at.y >= frame.y && at.x + at.w <= frame.x + frame.w && at.y + at.h <= frame.y + frame.h,
      `${member.id} is inside its boundary`,
    );
  }
});

test("an element that a person placed keeps its place", () => {
  const tara = example("gateway");
  const places = arrangeElements(tara.elements);
  for (const element of tara.elements.filter((e) => e.kind !== "data_flow")) {
    assert.deepEqual([places.get(element.id)?.x, places.get(element.id)?.y], [element.x, element.y], element.id);
  }
  const controller = tara.elements.find((e) => e.kind === "component");
  assert.deepEqual([places.get(controller?.id ?? "")?.w, places.get(controller?.id ?? "")?.h], [ELEMENT_SIZE.w, ELEMENT_SIZE.h]);
});
