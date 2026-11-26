// How the data flows of an architecture are drawn: which sides of its two elements a line joins, and the
// shape of the line between them in each of the ways a person can choose.
//
// The diagram on screen and the one in the report draw their lines from this, so a diagram that is looked at
// with curved lines is printed with curved lines. How a person looks at a drawing is not part of the TARA: the
// choice is kept where the drawing is shown, and is told to whatever draws it.

import type { Place } from "./arrange.ts";

/** How data flows are drawn. */
export type LineStyle = "straight" | "curved" | "stepped";
/** The ways to draw a line, with what each is called. */
export const LINE_STYLES: { key: LineStyle; name: string }[] = [
  { key: "straight", name: "Straight" },
  { key: "curved", name: "Curved" },
  { key: "stepped", name: "Stepped" },
];
/**
 * How data flows are drawn until a person chooses another way: curved, where a line leaves and arrives at a right
 * angle to the sides it joins. The screens and the report both begin here, so that they agree.
 */
export const FIRST_LINE_STYLE: LineStyle = "curved";
/** Whether a word names one of the ways to draw a line. */
export const isLineStyle = (value: unknown): value is LineStyle => LINE_STYLES.some((style) => style.key === value);

/** A side of an element, where a line leaves or arrives. */
export type Side = "left" | "right" | "top" | "bottom";

/** A point on a drawing: an end of a line, or where its label stands. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The sides a line joins: each end takes the side that faces the other element. Two elements that stand
 * clearly beside one another are joined across; otherwise from the bottom of the upper to the top of the lower.
 */
export function facingSides(from: Place, to: Place): [Side, Side] {
  const across = to.x - from.x;
  const down = to.y + to.h / 2 - (from.y + from.h / 2);
  if (Math.abs(across) > from.w * 0.75) return across > 0 ? ["right", "left"] : ["left", "right"];
  return down > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** The middle of a side of an element, moved along the side by `shift`: several lines to one side stand apart. */
export function sidePoint(place: Place, side: Side, shift = 0): Point {
  const upright = side === "left" || side === "right";
  return {
    x: upright ? place.x + (side === "right" ? place.w : 0) : place.x + place.w / 2 + shift,
    y: upright ? place.y + place.h / 2 + shift : place.y + (side === "bottom" ? place.h : 0),
  };
}

/** The direction a line leaves a side in. */
const OUT: Record<Side, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
/** How far a curved line runs straight out of a side before it turns, at the least. */
const LEAST_REACH = 24;
/** How round the corners of a stepped line are. */
const CORNER = 6;

const round = (value: number): number => Math.round(value * 10) / 10;
const at = (point: Point): string => `${round(point.x)} ${round(point.y)}`;

/** A line as it is drawn: the path of an SVG, and the point its label stands at. */
export interface DrawnFlow {
  d: string;
  label: Point;
}

/** A curve that leaves each side at a right angle, and reaches further out the further apart the two ends are. */
function curved(from: Point, fromSide: Side, to: Point, toSide: Side): DrawnFlow {
  const apart = Math.abs(OUT[fromSide].x !== 0 ? to.x - from.x : to.y - from.y);
  const reach = Math.max(LEAST_REACH, apart / 2);
  const first = { x: from.x + OUT[fromSide].x * reach, y: from.y + OUT[fromSide].y * reach };
  const second = { x: to.x + OUT[toSide].x * reach, y: to.y + OUT[toSide].y * reach };
  // the point halfway along a curve of this kind
  const label = { x: (from.x + 3 * first.x + 3 * second.x + to.x) / 8, y: (from.y + 3 * first.y + 3 * second.y + to.y) / 8 };
  return { d: `M ${at(from)} C ${at(first)} ${at(second)} ${at(to)}`, label };
}

/**
 * A line of straight pieces at right angles: out of the one side, across in the middle, into the other.
 * lane: moves the piece in the middle aside, so that several stepped lines between the same two elements do not
 * lie on one another.
 */
function stepped(from: Point, fromSide: Side, to: Point, lane: number): DrawnFlow {
  const across = OUT[fromSide].x !== 0;
  const turnAt = across ? (from.x + to.x) / 2 + lane : (from.y + to.y) / 2 + lane;
  const corners: Point[] = across
    ? [
        { x: turnAt, y: from.y },
        { x: turnAt, y: to.y },
      ]
    : [
        { x: from.x, y: turnAt },
        { x: to.x, y: turnAt },
      ];
  const points = [from, ...corners, to];
  // each corner is rounded, by no more than half of the shorter piece that meets it
  const pieces = [`M ${at(from)}`];
  for (let n = 1; n < points.length - 1; n++) {
    const [before, corner, after] = [points[n - 1], points[n], points[n + 1]] as [Point, Point, Point];
    const into = Math.hypot(corner.x - before.x, corner.y - before.y);
    const out = Math.hypot(after.x - corner.x, after.y - corner.y);
    const radius = Math.min(CORNER, into / 2, out / 2);
    if (radius < 0.5) {
      pieces.push(`L ${at(corner)}`);
      continue;
    }
    const start = {
      x: corner.x - ((corner.x - before.x) / into) * radius,
      y: corner.y - ((corner.y - before.y) / into) * radius,
    };
    const end = { x: corner.x + ((after.x - corner.x) / out) * radius, y: corner.y + ((after.y - corner.y) / out) * radius };
    pieces.push(`L ${at(start)} Q ${at(corner)} ${at(end)}`);
  }
  pieces.push(`L ${at(to)}`);
  const [first, second] = corners as [Point, Point];
  return { d: pieces.join(" "), label: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } };
}

/**
 * The line of a data flow between a point on a side of one element and a point on a side of another.
 * The sides say in which direction the line leaves and arrives; a straight line needs only the two points.
 */
export function flowLine(from: Point, fromSide: Side, to: Point, toSide: Side, style: LineStyle, lane = 0): DrawnFlow {
  if (style === "curved") return curved(from, fromSide, to, toSide);
  if (style === "stepped") return stepped(from, fromSide, to, lane);
  return { d: `M ${at(from)} L ${at(to)}`, label: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } };
}
