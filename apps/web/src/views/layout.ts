// What every drawing of one record is made of: where its records stand, the lines between them, and the
// tools that place them. The four views that follow the chain (asset-view.ts and its siblings) and the ego
// view (ego.ts) all draw with what is here, so the rules of the lines are kept once:
//
//   - a line meets an upright side level, never at a slant;
//   - an arrowhead sits on a straight stretch;
//   - arrowheads on one side have room beside each other, or their lines arrive as one.
//
// No screen code here, so that every place and every line can be tested.

// ---------------------------------------------------------------------------------------------- what is drawn

/** The width and height a record is drawn with. */
export interface Size {
  w: number;
  h: number;
}
/** A place on a drawing. x grows to the right and y downwards, as on the screen. */
export interface Point {
  x: number;
  y: number;
}
/** The top left corner of each record that is drawn, by its ID. */
export type Places = Map<string, Point>;
/** The height of each record that needs more or less than the usual for its words, by its ID. */
export type Heights = ReadonlyMap<string, number>;

/** The size of a record as the graph draws it, with its words on one line. */
export const NODE: Size = { w: 184, h: 48 };
/** The size of a record that is drawn large enough to read its words. */
export const NODE_READABLE: Size = { w: 280, h: 92 };

/** One line of a drawing, worked out in full: its shape, its arrowheads, and the records it is lit with. */
export interface DrawnLine {
  key: string;
  /** The line itself, as the path data of an SVG path. */
  d: string;
  /** The line ends in an arrowhead. */
  arrow: boolean;
  /** An arrowhead where the line starts as well, or there only. */
  arrowStart?: boolean;
  /** The records it runs between or stands for. It is lit when all of them are. */
  joins: string[];
  /** It stands for something that does not count: a path that is screened out, a control that is only proposed. */
  faint: boolean;
}

/** What stands on a line: the ID of the record the line stands for, or words where it stands for none. */
export interface LineLabel {
  key: string;
  x: number;
  y: number;
  recordId: string | null;
  text?: string;
  /** The record the line leaves. */
  of: string;
  /** What it stands for does not count. */
  faint: boolean;
}

/** Words above a group of records that say how they are linked to the one in the middle. x, y: where they begin. */
export interface Caption {
  key: string;
  x: number;
  y: number;
  text: string;
}

/** A rectangle on a drawing, by its top left corner and its size. The frame around everything that is drawn is one. */
export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A view, drawn. The middle of the record the view is about is at 0, 0. */
export interface Drawing {
  at: Places;
  lines: DrawnLine[];
  labels: LineLabel[];
  captions: Caption[];
  /** The frame around everything that is drawn. */
  box: Frame;
}

// --------------------------------------------------------------------------------------------- the distances

/** The room one line takes among several that run beside each other, each with the ID of what it stands for. */
export const LANE = 20;
/** Between two threats that stand one above the other, and between two records that feed the one in the middle. */
export const BETWEEN_THREATS = 16;
/** Between the damage scenarios on one side of an asset, each with its threats. */
export const BETWEEN_DAMAGES = 30;
/** From an asset to its damage scenarios. */
export const TO_DAMAGE = 58;
/** How far a line that carries an ID bends before it runs level. */
export const LEAVE = 26;
/** The level stretch of a line on which the ID of what it stands for is written. */
export const RUN = 84;
/** The stretch over which such a line closes in on the record it leads to. */
export const CLOSE = 100;
/** The straight stretch on which an arrowhead sits before it meets a side. */
export const STRAIGHT = 18;
/** From the record in the middle to what is joined to it by a line that bends: room to bend and to run in straight. */
export const AWAY = 92;
/** From an attack path to the controls that cover it, at the least. */
export const TO_CONTROL = 54;
/** The most: a control that stands far above or below a path it covers is set further off, so that its line bends gently. */
export const TO_CONTROL_MOST = 150;
/** Between two records piled one above the other. */
export const BETWEEN = 14;
/** Between two groups of records in one column. */
export const BETWEEN_GROUPS = 30;
/** From a threat down to its risk. */
export const TO_RISK = 24;
/** How far before a control the line from the risk leaves its level to bend towards it. */
export const RUN_IN = 46;
/** The least distance between two arrowheads on one side. With less room the lines join and arrive as one. */
export const BETWEEN_ARROWS = 12;

// What hangs beneath a record stands one under the other, set in to the right. Each is joined to a stem that
// leaves the lower side of the record and turns level into the side of what hangs. Up to six hang in one
// column; more are shared out over columns, whose stems leave a rail that runs beneath the record.

/** From the lower side of a record to the first that hangs beneath it. */
export const HANG = 22;
/** Between two records that hang one under the other. */
export const BETWEEN_HUNG = 10;
/** How far in from the left side of a record its stem leaves. */
export const STEM = 14;
/** How far what hangs is set in from the left side of the record it hangs from. */
export const SET_IN = 28;
/** The radius of the turn a stem takes into what hangs, and into and out of the rail. */
export const TURN = 9;
/** How far beneath a record the rail runs, where what hangs stands in several columns. */
export const RAIL = 12;
/** How many records hang in one column before a second is begun. */
export const IN_ONE_COLUMN = 6;
/** How far past what hangs a line from the side of the record runs level before it bends. */
export const PAST = 8;

// ------------------------------------------------------------------------------------------------ arithmetic

/** To a tenth: what a place and a line are written with. */
export const round = (value: number): number => Math.round(value * 10) / 10;

/** So many lengths one after the other, with a gap between each two. */
export const sum = (values: number[], between: number): number =>
  values.reduce((total, value) => total + value, 0) + between * Math.max(0, values.length - 1);

/**
 * How far apart so many lines stand where they meet one side of a record of this height. Each has a place of
 * its own as long as arrowheads have room beside each other. 0: there is no room, and they meet at one place.
 */
export function apartOn(height: number, count: number, most = BETWEEN_ARROWS + 2): number {
  const step = count > 1 ? Math.min(most, (height - 16) / (count - 1)) : 0;
  return step >= BETWEEN_ARROWS ? step : 0;
}

/** How far the k-th of so many stands from the middle, when they are spread evenly about it. */
export const off = (k: number, count: number, step: number): number => (k - (count - 1) / 2) * step;

// ----------------------------------------------------------------------------------------- the pieces of a line

/** Where a line starts. */
export const startAt = (x: number, y: number): string => `M ${round(x)} ${round(y)}`;

/** A straight stretch to a point. */
export const lineTo = (x: number, y: number): string => `L ${round(x)} ${round(y)}`;

/** A bend that leaves its start level and reaches its end level, so that no line meets an upright side at a slant. */
export function bend(x0: number, y0: number, x1: number, y1: number): string {
  const half = (x1 - x0) / 2;
  return `C ${round(x0 + half)} ${round(y0)} ${round(x1 - half)} ${round(y1)} ${round(x1)} ${round(y1)}`;
}

/** A quarter turn through a corner. */
const turn = (cornerX: number, cornerY: number, x: number, y: number): string =>
  `Q ${round(cornerX)} ${round(cornerY)} ${round(x)} ${round(y)}`;

/** The pieces of a line, one after the other. */
export const pieces = (...parts: string[]): string => parts.join(" ");

/** A whole line between two upright sides: one bend. */
export const curve = (x0: number, y0: number, x1: number, y1: number): string => pieces(startAt(x0, y0), bend(x0, y0, x1, y1));

/**
 * A whole line that first runs level as far as `runTo`, and bends from there: for a line that has to be clear
 * of something before it may turn. Where there is nothing to be clear of (runTo is where it starts) it only bends.
 */
export function curveAfterRun(x0: number, y0: number, runTo: number, x1: number, y1: number): string {
  if (runTo === x0) return curve(x0, y0, x1, y1);
  return pieces(startAt(x0, y0), lineTo(runTo, y0), bend(runTo, y0, x1, y1));
}

/** The end of a line that carries an arrowhead: it bends towards the side, and meets it square after a straight stretch. */
export function arriveSquare(x0: number, y0: number, x1: number, y1: number): string {
  const towards = Math.sign(x1 - x0);
  return pieces(bend(x0, y0, x1 - towards * STRAIGHT, y1), lineTo(x1, y1));
}

// ----------------------------------------------------------------------------------------------- the sheet

/**
 * The sheet a view is placed on: it knows the height of every record, keeps where each one stands, and gives
 * the frame around all of them at the end. Every view makes one, puts its records, and hands back `at`.
 */
export class Sheet {
  /** The width of a record. */
  readonly width: number;
  readonly at: Places = new Map();
  private readonly usual: number;
  private readonly heights: Heights | undefined;
  private readonly middles = new Map<string, number>();

  /** node: the size of a record. heights: the height of each record that needs another one for its words. */
  constructor(node: Size, heights?: Heights) {
    this.width = node.w;
    this.usual = node.h;
    this.heights = heights;
  }

  heightOf = (id: string): number => this.heights?.get(id) ?? this.usual;

  /** How high the middle of a placed record stands. */
  middleOf = (id: string): number => this.middles.get(id) ?? 0;

  /** The top left corner of a placed record. */
  cornerOf = (id: string): Point => this.at.get(id) ?? { x: 0, y: 0 };

  /** The height of records piled one above the other. */
  stackHeight = (ids: string[]): number => sum(ids.map(this.heightOf), BETWEEN);

  /** Puts a record with its left side at x and its middle at a height. */
  put(id: string, x: number, middle: number): void {
    this.at.set(id, { x, y: middle - this.heightOf(id) / 2 });
    this.middles.set(id, middle);
  }

  /** Puts a record with its left side at x and its upper side at a height. */
  putBelow(id: string, x: number, top: number): void {
    this.at.set(id, { x, y: top });
    this.middles.set(id, top + this.heightOf(id) / 2);
  }

  /** Moves a placed record sideways. */
  moveTo(id: string, x: number): void {
    const corner = this.at.get(id);
    if (corner) corner.x = x;
  }

  /** Piles records one above the other, the whole of them centred on a height. */
  pile(ids: string[], x: number, middle: number): void {
    let top = middle - this.stackHeight(ids) / 2;
    for (const id of ids) {
      this.put(id, x, top + this.heightOf(id) / 2);
      top += this.heightOf(id) + BETWEEN;
    }
  }

  /**
   * The frame around every record that is placed.
   * reaches: heights that something else of the drawing reaches (a lane, a caption).
   * widthOf: for a view in which one record is wider than the others.
   */
  frame(reaches: number[] = [], widthOf: (id: string) => number = () => this.width): Frame {
    const boxes = [...this.at].map(([id, corner]) => ({
      left: corner.x,
      right: corner.x + widthOf(id),
      top: corner.y,
      bottom: corner.y + this.heightOf(id),
    }));
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top), ...reaches);
    return {
      left,
      top,
      width: Math.max(...boxes.map((box) => box.right)) - left,
      height: Math.max(...boxes.map((box) => box.bottom), ...reaches) - top,
    };
  }
}

/** An asset with the damage scenarios that are drawn beside it. id null: damage scenarios that have no asset. */
export interface AssetWithDamages {
  id: string | null;
  damages: string[];
}

/** Puts assets one above the other about the middle, each with its damage scenarios piled beside it. */
export function pileWithDamages(sheet: Sheet, assets: AssetWithDamages[], assetX: number, damageX: number): void {
  const rooms = assets.map((asset) => Math.max(asset.id ? sheet.heightOf(asset.id) : 0, sheet.stackHeight(asset.damages)));
  let top = -sum(rooms, BETWEEN_GROUPS) / 2;
  assets.forEach((asset, k) => {
    const room = rooms[k] ?? 0;
    const middle = top + room / 2;
    sheet.pile(asset.damages, damageX, middle);
    if (asset.id) sheet.put(asset.id, assetX, middle);
    top += room + BETWEEN_GROUPS;
  });
}

// ------------------------------------------------------------------------------------- what hangs beneath a record

/** How to hang records beneath one. columns: how many they may stand in. parentWidth: where that record is wider than others. */
export interface Hanging {
  parent: string;
  /** The first part of the key of each line: the line to a record is keyed "<key>|<id>". */
  key: string;
  ids: string[];
  columns?: number;
  parentWidth?: number;
}

/**
 * Hangs records beneath one that has its place already, and gives the line to each.
 * clear: how far a line that leaves the right side of the record has to run level to be past what hangs.
 */
export function hang(sheet: Sheet, hanging: Hanging): { lines: DrawnLine[]; clear: number } {
  const { parent, key, ids, columns = 1, parentWidth = sheet.width } = hanging;
  const width = sheet.width;
  const below = sheet.cornerOf(parent).y + sheet.heightOf(parent);
  const count = Math.max(1, Math.min(columns, Math.ceil(ids.length / IN_ONE_COLUMN)));
  const perColumn = Math.ceil(ids.length / count);
  const firstStem = sheet.cornerOf(parent).x + STEM;
  const rail = below + RAIL;
  const firstTop = below + (count > 1 ? RAIL : 0) + HANG;
  const lines: DrawnLine[] = [];

  for (let column = 0; column < count; column++) {
    const stem = firstStem + column * (width + SET_IN);
    const x = stem + SET_IN - STEM;
    const down = stemFrom(firstStem, below, rail, stem, column > 0);
    let top = firstTop;
    for (const id of ids.slice(column * perColumn, (column + 1) * perColumn)) {
      sheet.putBelow(id, x, top);
      const middle = sheet.middleOf(id);
      const into = pieces(lineTo(stem, middle - TURN), turn(stem, middle, stem + TURN, middle), lineTo(x, middle));
      lines.push({ key: `${key}|${id}`, d: pieces(down, into), arrow: false, joins: [parent, id], faint: false });
      top += sheet.heightOf(id) + BETWEEN_HUNG;
    }
  }
  const beyond = Math.max(0, SET_IN + (count - 1) * (width + SET_IN) + width - parentWidth);
  return { lines, clear: ids.length > 0 ? beyond + PAST : 0 };
}

/** Where a stem begins: the first leaves the record; a further one leaves the rail, which the first stem turns into. */
function stemFrom(firstStem: number, below: number, rail: number, stem: number, viaRail: boolean): string {
  const leave = startAt(firstStem, below);
  if (!viaRail) return leave;
  return pieces(
    leave,
    lineTo(firstStem, rail - TURN),
    turn(firstStem, rail, firstStem + TURN, rail),
    lineTo(stem - TURN, rail),
    turn(stem, rail, stem, rail + TURN),
  );
}

// ------------------------------------------------------------------------- records that feed the one in the middle

// Records to the left of the one in the middle, joined to it by lines that may carry an ID. A line leaves its
// record, runs level for a stretch on which the ID of what it stands for is written, closes in on the record
// in the middle and meets its side square. Several lines of one record run beside each other.

/** One line from such a record to the one in the middle: what it stands for, and where it carries an arrowhead. */
export interface FeedLine {
  key: string;
  /** The record the line stands for, whose ID it carries. null: it carries no ID. */
  recordId: string | null;
  /** An arrowhead where it meets the record in the middle, and one where it leaves its own. */
  into: boolean;
  out: boolean;
  faint: boolean;
  /** What it stands for does not count, whatever the line is. */
  faintLabel?: boolean;
}
/** A record to the left of the one in the middle, with the lines that join the two. */
export interface Feed {
  id: string;
  lines: FeedLine[];
}

/** Places records one above the other to the left of the one in the middle (at 0, 0), and draws their lines to it. */
export function feedFromLeft(
  sheet: Sheet,
  target: string,
  feeds: Feed[],
): { lines: DrawnLine[]; labels: LineLabel[]; reaches: number[] } {
  const width = sheet.width;
  const room = (feed: Feed) => Math.max(sheet.heightOf(feed.id), feed.lines.length * LANE);
  const x = -width / 2 - CLOSE - RUN - LEAVE - STRAIGHT - width;
  const edge = x + width;
  const runFrom = edge + STRAIGHT + LEAVE;
  const runTo = runFrom + RUN;
  // Each record has a place of its own on the side of the one in the middle while arrowheads have room there.
  // Otherwise the lines that end in an arrowhead arrive as one and those that do not as another, so that no
  // line borrows a head.
  const step = apartOn(sheet.heightOf(target), feeds.length);
  const all = feeds.flatMap((feed) => feed.lines);
  const mixed = all.some((line) => line.into) && all.some((line) => !line.into);
  const arriveAt = (k: number, line: FeedLine): number => {
    if (step) return off(k, feeds.length, step);
    return mixed ? ((line.into ? -1 : 1) * (BETWEEN_ARROWS + 2)) / 2 : 0;
  };

  const lines: DrawnLine[] = [];
  const labels: LineLabel[] = [];
  const reaches: number[] = [];
  let top = -sum(feeds.map(room), BETWEEN_THREATS) / 2;
  feeds.forEach((feed, k) => {
    const middle = top + room(feed) / 2;
    const count = feed.lines.length;
    sheet.put(feed.id, x, middle);
    feed.lines.forEach((line, j) => {
      const lane = middle + off(j, count, LANE);
      // where the line leaves its record: apart from the others as far as the side allows, or from one place
      const leave = middle + off(j, count, apartOn(sheet.heightOf(feed.id), count, LANE));
      const arrive = arriveAt(k, line);
      lines.push({
        key: line.key,
        d: pieces(
          startAt(edge, leave),
          lineTo(edge + STRAIGHT, leave),
          bend(edge + STRAIGHT, leave, runFrom, lane),
          lineTo(runTo, lane),
          arriveSquare(runTo, lane, -width / 2, arrive),
        ),
        arrow: line.into,
        arrowStart: line.out,
        joins: [feed.id, target, ...(line.recordId ? [line.recordId] : [])],
        faint: line.faint,
      });
      if (line.recordId) {
        const at = { x: round((runFrom + runTo) / 2), y: round(lane) };
        labels.push({ key: line.key, ...at, recordId: line.recordId, of: feed.id, faint: line.faintLabel === true });
      }
      reaches.push(lane - LANE / 2, lane + LANE / 2);
    });
    top += room(feed) + BETWEEN_THREATS;
  });
  return { lines, labels, reaches };
}
