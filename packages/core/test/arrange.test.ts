// Where the elements of an architecture are drawn when nobody placed them, or placed only some; the columns
// both the architecture and the graph are set out in; and the shapes of the lines between elements.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrangeElements,
  ELEMENT_SIZE,
  type Element,
  facingSides,
  flowLine,
  isLineStyle,
  LINE_STYLES,
  type Place,
  settleColumns,
  sidePoint,
} from "../src/index.ts";
import { EXAMPLES, example } from "./helpers.ts";

// ------------------------------------------------------------------------------------------ what is checked

const isFlow = (element: Element) => element.kind === "data_flow";
const isFrame = (element: Element) => element.kind === "trust_boundary";
const isBox = (element: Element) => !isFlow(element) && !isFrame(element);
const unplaced = (elements: Element[]): Element[] =>
  elements.map((element) => ({ ...element, x: null, y: null, w: null, h: null }));
const apart = (p: Place, q: Place) => p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
const within = (p: Place, frame: Place) =>
  p.x >= frame.x && p.y >= frame.y && p.x + p.w <= frame.x + frame.w && p.y + p.h <= frame.y + frame.h;
const placeOf = (places: Map<string, Place>, id: string): Place => {
  const place = places.get(id);
  assert.ok(place, `${id} has a place`);
  return place;
};

/** A drawing is sound when nothing lies on anything else, and a frame holds what belongs to it and nothing more. */
function isSound(elements: Element[], places: Map<string, Place>, about: string): void {
  const drawn = elements.filter((element) => !isFlow(element));
  assert.equal(places.size, drawn.length, `${about}: every box and frame has a place, and nothing else has`);
  const boxes = drawn.filter(isBox);
  const frames = drawn.filter(isFrame);
  /** Whether a frame holds an element, directly or through a frame it holds. */
  const holds = (frame: Element, element: Element): boolean => {
    for (let above = element.boundaryId; above !== null; above = drawn.find((each) => each.id === above)?.boundaryId ?? null) {
      if (above === frame.id) return true;
    }
    return false;
  };
  for (const a of boxes) {
    for (const b of boxes) {
      if (a.id < b.id) assert.ok(apart(placeOf(places, a.id), placeOf(places, b.id)), `${about}: ${a.id} and ${b.id} overlap`);
    }
  }
  for (const frame of frames) {
    for (const other of drawn.filter((each) => each.id !== frame.id)) {
      const place = placeOf(places, other.id);
      if (holds(frame, other)) assert.ok(within(place, placeOf(places, frame.id)), `${about}: ${other.id} is inside ${frame.id}`);
      else if (!holds(other, frame))
        assert.ok(apart(place, placeOf(places, frame.id)), `${about}: ${other.id} is clear of ${frame.id}`);
    }
  }
}

/** How often the straight lines between the middles of joined elements cross one another. */
function crossings(elements: Element[], places: Map<string, Place>): number {
  const middle = (id: string | null) => {
    const place = placeOf(places, id ?? "");
    return { x: place.x + place.w / 2, y: place.y + place.h / 2 };
  };
  const lines = elements
    .filter(isFlow)
    .map((flow) => ({ ends: [flow.sourceId, flow.targetId], a: middle(flow.sourceId), b: middle(flow.targetId) }));
  const turn = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  let count = 0;
  for (const [n, first] of lines.entries()) {
    for (const second of lines.slice(n + 1)) {
      // two lines that share an element meet there, and do not cross
      if (first.ends.some((end) => second.ends.includes(end))) continue;
      const crosses =
        turn(first.a, first.b, second.a) !== turn(first.a, first.b, second.b) &&
        turn(second.a, second.b, first.a) !== turn(second.a, second.b, first.b);
      if (crosses) count++;
    }
  }
  return count;
}

const box = (id: string, more: Partial<Element> = {}): Element => ({
  id,
  itemId: "IT01",
  kind: "component",
  name: id,
  description: null,
  sourceId: null,
  targetId: null,
  direction: null,
  boundaryId: null,
  x: null,
  y: null,
  w: null,
  h: null,
  ...more,
});
const frame = (id: string, more: Partial<Element> = {}): Element => box(id, { kind: "trust_boundary", ...more });
const flow = (id: string, sourceId: string | null, targetId: string | null): Element =>
  box(id, { kind: "data_flow", sourceId, targetId, direction: "forward" });

// ------------------------------------------------------------------------------- worked out from the records

for (const name of EXAMPLES) {
  const elements = unplaced(example(name).elements);

  test(`${name}: an architecture nobody arranged is drawn soundly, the same way each time`, () => {
    const places = arrangeElements(elements);
    isSound(elements, places, name);
    assert.deepEqual([...arrangeElements([...elements])], [...places]);
    for (const element of elements.filter(isBox)) {
      assert.deepEqual([placeOf(places, element.id).w, placeOf(places, element.id).h], [ELEMENT_SIZE.w, ELEMENT_SIZE.h]);
    }
  });

  test(`${name}: it reads from the outside in, and its lines do not cross`, () => {
    const places = arrangeElements(elements);
    const outside = elements.filter((element) => element.kind === "external_interactor" && element.boundaryId === null);
    const furthestLeft = Math.min(...elements.filter((each) => !isFlow(each)).map((each) => placeOf(places, each.id).x));
    for (const party of outside) assert.equal(placeOf(places, party.id).x, furthestLeft, `${party.id} stands at the left`);
    // what an outside party talks to stands to its right
    for (const line of elements.filter(isFlow)) {
      const [a, b] = [line.sourceId, line.targetId].map((id) => elements.find((each) => each.id === id));
      if (!a || !b) continue;
      const [party, other] = outside.includes(a) ? [a, b] : [b, a];
      if (outside.includes(party) && !outside.includes(other)) {
        assert.ok(placeOf(places, other.id).x > placeOf(places, party.id).x, `${other.id} stands right of ${party.id}`);
      }
    }
    assert.equal(crossings(elements, places), 0);
  });

  test(`${name}: elements of any size have the room they need`, () => {
    // every second element tall, every third wide: as when some hold many assets
    const sizeOf = (element: Element) => {
      const n = elements.filter(isBox).indexOf(element);
      return { w: n % 3 === 0 ? 260 : 176, h: n % 2 === 0 ? 58 + 9 + 12 * 19 : 58 };
    };
    const places = arrangeElements(elements, sizeOf);
    isSound(elements, places, `${name}, with tall and wide elements`);
    for (const element of elements.filter(isBox)) {
      assert.deepEqual({ w: placeOf(places, element.id).w, h: placeOf(places, element.id).h }, sizeOf(element), element.id);
    }
  });

  test(`${name}: what a person placed stays where it was put`, () => {
    const asShipped = example(name).elements;
    const places = arrangeElements(asShipped, () => ({ w: 176, h: 58 }));
    for (const element of asShipped.filter((each) => !isFlow(each))) {
      const place = placeOf(places, element.id);
      assert.deepEqual([place.x, place.y], [element.x, element.y], element.id);
      if (isFrame(element)) assert.deepEqual([place.w, place.h], [element.w, element.h], `${element.id} keeps its size`);
      else assert.deepEqual([place.w, place.h], [176, 58], `${element.id} has the size it is drawn at`);
    }
  });
}

test("elements joined by a data flow stand level with one another where they can", () => {
  // three outside parties, each talking to one component: each component stands level with its party
  const elements = [
    ...["P1", "P2", "P3"].map((id) => box(id, { kind: "external_interactor" })),
    ...["C3", "C1", "C2"].map((id) => box(id)),
    flow("F1", "P1", "C1"),
    flow("F2", "P2", "C2"),
    flow("F3", "P3", "C3"),
  ];
  const places = arrangeElements(elements);
  for (const n of [1, 2, 3]) assert.equal(placeOf(places, `C${n}`).y, placeOf(places, `P${n}`).y, `C${n} is level with P${n}`);
  assert.equal(crossings(elements, places), 0, "although the list names the components in another order");
});

test("a frame holds what names it, also a frame within a frame, and stands as one block among its neighbours", () => {
  const elements = [
    box("P1", { kind: "external_interactor" }),
    frame("OUTER"),
    frame("INNER", { boundaryId: "OUTER" }),
    box("A", { boundaryId: "OUTER" }),
    box("B", { boundaryId: "INNER" }),
    box("C", { boundaryId: "INNER" }),
    box("D"),
    flow("F1", "P1", "A"),
    flow("F2", "A", "B"),
    flow("F3", "B", "C"),
    flow("F4", "C", "D"),
  ];
  const places = arrangeElements(elements);
  isSound(elements, places, "nested frames");
  assert.ok(within(placeOf(places, "INNER"), placeOf(places, "OUTER")));
  // the chain runs from left to right through the frames
  const lefts = ["P1", "A", "B", "C", "D"].map((id) => placeOf(places, id).x);
  assert.deepEqual(
    lefts,
    [...lefts].sort((a, b) => a - b),
  );
  assert.equal(new Set(lefts).size, lefts.length);
});

test("an empty frame has a size of its own, and an architecture without elements has no places", () => {
  assert.equal(arrangeElements([]).size, 0);
  assert.equal(arrangeElements([flow("F1", null, null)]).size, 0);
  const places = arrangeElements([frame("TB"), box("A")]);
  assert.ok(placeOf(places, "TB").w > 0 && placeOf(places, "TB").h > 0);
  isSound([frame("TB"), box("A")], places, "an empty frame beside an element");
});

test("records that do not fit together are still drawn: a boundary that is missing, frames in a circle, a flow with open ends", () => {
  const elements = [
    box("A", { boundaryId: "GONE" }),
    frame("X", { boundaryId: "Y" }),
    frame("Y", { boundaryId: "X" }),
    box("B", { boundaryId: "X" }),
    box("C", { boundaryId: "A" }),
    flow("F1", "A", null),
    flow("F2", "A", "A"),
    flow("F3", "A", "X"),
  ];
  const places = arrangeElements(elements);
  assert.deepEqual([...places.keys()].sort(), ["A", "B", "C", "X", "Y"]);
  assert.ok(within(placeOf(places, "B"), placeOf(places, "X")));
  for (const place of places.values()) assert.ok([place.x, place.y, place.w, place.h].every(Number.isFinite));
});

test("a large architecture is arranged in the blink of an eye", () => {
  const elements: Element[] = [];
  for (let f = 0; f < 12; f++) {
    elements.push(frame(`TB${f}`));
    for (let n = 0; n < 20; n++) {
      elements.push(box(`C${f}-${n}`, { boundaryId: `TB${f}` }));
      if (n > 0) elements.push(flow(`F${f}-${n}`, `C${f}-${n - 1}`, `C${f}-${n}`));
    }
    if (f > 0) elements.push(flow(`F${f}`, `C${f - 1}-0`, `C${f}-0`));
  }
  const before = performance.now();
  const places = arrangeElements(elements);
  assert.ok(performance.now() - before < 1500, "252 elements and frames, with 239 data flows");
  isSound(elements, places, "a large architecture");
});

// ------------------------------------------------------------------------------- some placed, and some not

test("an element that is added to an arranged drawing stands beneath it, clear of everything", () => {
  const shipped = example("gateway").elements;
  const added = [...shipped, box("NEW", { kind: "external_interactor" }), box("NEW2")];
  const places = arrangeElements(added);
  isSound(added, places, "the gateway with two new elements");
  const lowest = Math.max(
    ...shipped.filter((each) => !isFlow(each)).map((each) => placeOf(places, each.id).y + placeOf(places, each.id).h),
  );
  for (const id of ["NEW", "NEW2"]) assert.ok(placeOf(places, id).y > lowest, `${id} stands beneath the drawing`);
  for (const element of shipped.filter((each) => !isFlow(each))) {
    assert.deepEqual(
      [placeOf(places, element.id).x, placeOf(places, element.id).y],
      [element.x, element.y],
      `${element.id} is not moved`,
    );
  }
});

test("an element that is added to a placed frame stands in that frame's column, beneath what the frame holds", () => {
  const shipped = example("gateway").elements;
  const added = [...shipped, box("NEW", { boundaryId: "TB01" })];
  const places = arrangeElements(added);
  const members = shipped.filter((each) => each.boundaryId === "TB01").map((each) => placeOf(places, each.id));
  const place = placeOf(places, "NEW");
  assert.equal(place.x, Math.min(...members.map((member) => member.x)));
  assert.ok(place.y >= Math.max(...members.map((member) => member.y + member.h)), "beneath the lowest of them");
  for (const other of shipped.filter(isBox)) assert.ok(apart(place, placeOf(places, other.id)), `clear of ${other.id}`);
  // the frame was sized by a person, and keeps its size
  const stored = shipped.find((each) => each.id === "TB01");
  assert.deepEqual([placeOf(places, "TB01").w, placeOf(places, "TB01").h], [stored?.w, stored?.h]);
});

test("a frame that nobody placed stands around what it holds, wherever a person put that", () => {
  const elements = [
    frame("TB"),
    box("A", { boundaryId: "TB", x: 400, y: 300 }),
    box("B", { boundaryId: "TB", x: 700, y: 520 }),
    box("C", { boundaryId: "TB" }),
  ];
  const places = arrangeElements(elements);
  isSound(elements, places, "a frame around placed elements");
  assert.deepEqual([placeOf(places, "A").x, placeOf(places, "A").y], [400, 300]);
  assert.ok(placeOf(places, "C").y >= 520 + ELEMENT_SIZE.h, "the one that was not placed stands beneath the two that were");
});

test("a placed frame without a size is as large as what it holds; one that holds nothing placed takes new elements at its corner", () => {
  const sized = arrangeElements([frame("TB", { x: 100, y: 100 }), box("A", { boundaryId: "TB", x: 200, y: 200 })]);
  assert.ok(within(placeOf(sized, "A"), placeOf(sized, "TB")));
  const fresh = arrangeElements([
    frame("TB", { x: 100, y: 100, w: 600, h: 400 }),
    box("A", { boundaryId: "TB" }),
    box("OUT", { x: 0, y: 0 }),
  ]);
  assert.ok(within(placeOf(fresh, "A"), placeOf(fresh, "TB")));
  assert.deepEqual([placeOf(fresh, "TB").w, placeOf(fresh, "TB").h], [600, 400]);
});

test("a frame that nobody placed, with everything in it, moves as one block beneath an arranged drawing", () => {
  const elements = [
    box("OLD", { x: 0, y: 0 }),
    frame("TB"),
    box("A", { boundaryId: "TB" }),
    box("B", { boundaryId: "TB" }),
    flow("F", "A", "B"),
  ];
  const places = arrangeElements(elements);
  isSound(elements, places, "a new frame beneath an old element");
  assert.ok(placeOf(places, "TB").y >= ELEMENT_SIZE.h, "beneath the element that was there");
});

// --------------------------------------------------------------------------------------------- the columns

test("things in a column stand one below the other, the gap apart, in the order of their list", () => {
  const top = settleColumns([["a", "b", "c"]], [], { heightOf: (id) => (id === "b" ? 100 : 40), gap: 10 });
  assert.deepEqual(
    [...top],
    [
      ["a", 0],
      ["b", 50],
      ["c", 160],
    ],
  );
  assert.equal(settleColumns([], [], { heightOf: () => 40, gap: 10 }).size, 0);
});

test("a thing stands level with what it is linked to, and columns are put in the order that keeps links short", () => {
  const options = { heightOf: () => 40, gap: 10 };
  // one thing linked to the last of three: its middle is level with that one's
  const one = settleColumns([["a", "b", "c"], ["x"]], [["c", "x"]], options);
  assert.equal(one.get("x"), one.get("c"));
  // two columns listed in opposite orders are brought into the same order
  const two = settleColumns(
    [
      ["a", "b", "c"],
      ["z", "y", "x"],
    ],
    [
      ["a", "x"],
      ["b", "y"],
      ["c", "z"],
    ],
    options,
  );
  for (const [left, right] of [
    ["a", "x"],
    ["b", "y"],
    ["c", "z"],
  ] as const)
    assert.equal(two.get(left), two.get(right));
  assert.equal(Math.min(...two.values()), 0, "the highest stands at the top");
});

test("things of different heights never overlap, and links to things that are not set out are left out of account", () => {
  const heights: Record<string, number> = { a: 200, b: 30, c: 90, x: 300, y: 20 };
  const columns = [
    ["a", "b", "c"],
    ["x", "y"],
  ];
  const top = settleColumns(
    columns,
    [
      ["a", "x"],
      ["b", "x"],
      ["c", "x"],
      ["c", "y"],
      ["a", "elsewhere"],
      ["a", "a"],
    ],
    { heightOf: (id) => heights[id] ?? 0, gap: 12 },
  );
  for (const column of columns) {
    const inOrder = [...column].sort((p, q) => (top.get(p) ?? 0) - (top.get(q) ?? 0));
    for (const [n, id] of inOrder.entries()) {
      const next = inOrder[n + 1];
      if (next) assert.ok((top.get(next) ?? 0) >= (top.get(id) ?? 0) + (heights[id] ?? 0) + 12, `${id} and ${next}`);
    }
  }
});

// ----------------------------------------------------------------------------------------------- the lines

const at = (x: number, y: number, w = 176, h = 58): Place => ({ x, y, w, h });

test("a line joins the sides of two elements that face each other", () => {
  assert.deepEqual(facingSides(at(0, 0), at(400, 30)), ["right", "left"]);
  assert.deepEqual(facingSides(at(400, 30), at(0, 0)), ["left", "right"]);
  assert.deepEqual(facingSides(at(0, 0), at(40, 300)), ["bottom", "top"]);
  assert.deepEqual(facingSides(at(40, 300), at(0, 0)), ["top", "bottom"]);
  assert.deepEqual(sidePoint(at(100, 100), "right"), { x: 276, y: 129 });
  assert.deepEqual(sidePoint(at(100, 100), "left", 10), { x: 100, y: 139 });
  assert.deepEqual(sidePoint(at(100, 100), "top"), { x: 188, y: 100 });
  assert.deepEqual(sidePoint(at(100, 100), "bottom", -8), { x: 180, y: 158 });
});

/** The points a path names, in order. */
const pointsOf = (d: string): { x: number; y: number }[] => {
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return numbers.flatMap((x, n) => (n % 2 === 0 ? [{ x, y: numbers[n + 1] ?? 0 }] : []));
};

test("there are three ways to draw a line, and a word that names none of them is not one", () => {
  assert.deepEqual(
    LINE_STYLES.map((style) => style.key),
    ["straight", "curved", "stepped"],
  );
  assert.ok(isLineStyle("curved"));
  for (const not of ["wavy", "", null, undefined, 3]) assert.equal(isLineStyle(not), false);
});

test("each way to draw a line starts and ends where it is asked to, and carries its label on itself", () => {
  const from = { x: 100, y: 50 };
  const to = { x: 400, y: 250 };
  for (const { key } of LINE_STYLES) {
    const line = flowLine(from, "right", to, "left", key);
    const points = pointsOf(line.d);
    assert.deepEqual(points[0], from, `${key} starts at its first end`);
    assert.deepEqual(points.at(-1), to, `${key} ends at its second end`);
    assert.ok(
      line.label.x > from.x && line.label.x < to.x && line.label.y >= from.y && line.label.y <= to.y,
      `${key}: the label is between the ends`,
    );
  }
  assert.equal(flowLine(from, "right", to, "left", "straight").d, "M 100 50 L 400 250");
  assert.deepEqual(flowLine(from, "right", to, "left", "straight").label, { x: 250, y: 150 });
});

test("a curved line leaves and arrives at a right angle to the sides it joins", () => {
  const across = pointsOf(flowLine({ x: 100, y: 50 }, "right", { x: 400, y: 250 }, "left", "curved").d);
  assert.equal(across[1]?.y, 50, "it leaves the right side level");
  assert.ok((across[1]?.x ?? 0) > 100);
  assert.equal(across[2]?.y, 250, "and arrives at the left side level");
  assert.ok((across[2]?.x ?? 0) < 400);
  const down = pointsOf(flowLine({ x: 100, y: 50 }, "bottom", { x: 160, y: 300 }, "top", "curved").d);
  assert.equal(down[1]?.x, 100, "it leaves the bottom side straight down");
  assert.equal(down[2]?.x, 160);
});

test("a stepped line is made of pieces at right angles, and several between the same two elements stand apart", () => {
  const from = { x: 100, y: 50 };
  const to = { x: 400, y: 250 };
  const line = flowLine(from, "right", to, "left", "stepped");
  // without its rounded corners, every piece runs across or up and down
  const corners = line.d.replace(/Q [-\d. ]+? ([-\d.]+ [-\d.]+)(?= L)/g, "");
  assert.match(line.d, /^M 100 50 L .* Q 250 50 .* Q 250 250 .* L 400 250$/);
  assert.ok(corners.length < line.d.length, "its corners are rounded");
  assert.deepEqual(line.label, { x: 250, y: 150 }, "the label stands on the piece in the middle");
  const beside = flowLine(from, "right", to, "left", "stepped", 22);
  assert.deepEqual(beside.label, { x: 272, y: 150 });
  // between elements one below the other, the middle piece runs across
  const down = flowLine({ x: 100, y: 50 }, "bottom", { x: 160, y: 300 }, "top", "stepped");
  assert.deepEqual(down.label, { x: 130, y: 175 });
  // two ends on one level need no corner at all
  assert.doesNotMatch(flowLine({ x: 0, y: 10 }, "right", { x: 90, y: 10 }, "left", "stepped").d, /Q/);
});
