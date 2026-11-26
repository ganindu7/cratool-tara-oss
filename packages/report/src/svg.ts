// Draws the figures of the report as SVG that sits inside the page: bars, the risk matrix, the trace of a
// risk, and the data flow diagram. Nothing is loaded from elsewhere, and nothing here runs in the browser.
//
// Text that may hold record IDs is placed with <foreignObject>, so that it wraps like ordinary text and its
// IDs can be links. `rich` turns a text into such markup; the caller (html.ts) supplies it.

import { cutText, ELEMENT_SIZE, facingSides, flowLine, type Place, type Side, type Size, sidePoint } from "@tara/core";
import { escapeHtml } from "./escape.ts";
import type { ChainNode, Figure, Tone } from "./model.ts";

/** A figure as markup, with the width it is meant to be shown at most, in CSS pixels. */
export interface Drawn {
  svg: string;
  maxWidth: number;
  /** A text of the figure was cut for room. The report then says, under the figure, where the whole text stands. */
  cut: boolean;
}

/** Turns a text into markup. */
export type Rich = (text: string) => string;

// The colours and the face are those of the tool's tokens (apps/web/src/styles/tokens.css), where each is said to
// mean one thing. This package depends on nothing and a report is one self-contained page, so they are repeated here.
const INK = "#1d1c18";
/** A text of the second rank, and a rule that is stronger than a hairline. */
const GREY = "#5c5953";
/** What stands between grey and ink: a small numeral on a tint. */
const DEEP = "#3f3d38";
/** The lines of a drawing. */
const LINE = "#8f8c85";
/** The edge of a box that is not the subject of its drawing. */
const EDGE = "#a4a19b";
/** What steps back: an axis, a box that is only context. */
const FAINT = "#c6c4bf";
/** A hairline. */
const HAIR = "#dad9d5";
/** The ground inside a trust boundary. */
const GROUND = "#f9f9f8";
const ACCENT = "#1d5d8c";
const FONT = 'Lato, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const TONES: Record<Tone, { fill: string; text: string }> = {
  strong: { fill: DEEP, text: "#fff" },
  mid: { fill: FAINT, text: INK },
  done: { fill: "#2f6b3a", text: "#fff" },
  waiting: { fill: "#c79a00", text: INK },
  todo: { fill: "#b3261e", text: "#fff" },
};
/** The risk values 1 to 5 have colours of their own, from green to red, the same as on the screens of the tool. */
const RISK = ["#3d7d46", "#7a9a2e", "#c79a00", "#d9661a", "#b3261e"];
const riskColour = (position: number): string => RISK[Math.min(4, Math.max(0, position))] as string;
/** The colour of a numeral on a risk colour: ink on 2, 3 and 4, white on 1 and 5, so that each can be read. */
const onRisk = (position: number): string => (position >= 1 && position <= 3 ? INK : "#fff");

/** A colour mixed with white: share 1 is the colour itself, 0 is white. */
function tint(hex: string, share: number): string {
  const channel = (at: number) => Math.round(Number.parseInt(hex.slice(at, at + 2), 16) * share + 255 * (1 - share));
  return `#${[1, 3, 5].map((at) => channel(at).toString(16).padStart(2, "0")).join("")}`;
}

const n = (value: number): string => String(Math.round(value * 10) / 10);
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
/** The width of a text in pixels, near enough to make room for it. */
const widthOf = (text: string, size = 12): number => text.length * size * 0.56;

const open = (width: number, height: number, title: string): string =>
  `<svg viewBox="0 0 ${n(width)} ${n(height)}" role="img" aria-label="${escapeHtml(title)}" font-family='${FONT}'>`;

/** A line of plain text. */
function label(
  x: number,
  y: number,
  text: string,
  more: { anchor?: "start" | "middle" | "end"; size?: number; bold?: boolean; fill?: string } = {},
): string {
  return (
    `<text x="${n(x)}" y="${n(y)}" font-size="${more.size ?? 12}" text-anchor="${more.anchor ?? "start"}" dominant-baseline="central"` +
    `${more.bold ? ' font-weight="700"' : ""} fill="${more.fill ?? INK}">${escapeHtml(text)}</text>`
  );
}

/** A rectangle. `more` holds its other attributes, as written. */
const rect = (x: number, y: number, w: number, h: number, more: string): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${more}/>`;

/** A straight line. */
const line = (x1: number, y1: number, x2: number, y2: number, more: string): string =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${more}/>`;

/** Text that wraps inside a box, given as markup. */
function wrapped(x: number, y: number, w: number, h: number, css: string, inner: string): string {
  // A text is never hidden by the box it is set in: where it needs more room than was reckoned, it shows.
  const box = `width:${n(w)}px;min-height:${n(h)}px;box-sizing:border-box;`;
  return `<foreignObject x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" style="overflow:visible"><div style="${box}${css}">${inner}</div></foreignObject>`;
}

// ---------------------------------------------------------------------------------------------------- bars

function bars(figure: Extract<Figure, { type: "bars" }>, title: string): Drawn {
  const width = 760;
  const labelWidth = Math.min(230, Math.max(...figure.rows.map((row) => widthOf(row.label))) + 14);
  const scale = width - labelWidth - 48;
  const most = Math.max(1, ...figure.rows.map((row) => sum(row.values)));
  const pitch = 24;
  const thick = 15;
  const stacked = figure.series.length > 1;
  const top = stacked ? 28 : 2;
  const out: string[] = [];

  if (stacked) {
    let x = labelWidth;
    for (const series of figure.series) {
      out.push(rect(x, 5, 13, 11, `rx="2" fill="${TONES[series.tone].fill}"`), label(x + 18, 11, series.label));
      x += widthOf(series.label) + 48;
    }
  }
  figure.rows.forEach((row, i) => {
    const y = top + i * pitch;
    const middle = y + pitch / 2;
    out.push(label(labelWidth - 8, middle, row.label, { anchor: "end" }));
    let x = labelWidth;
    const shown = row.values.filter((value) => value > 0).length;
    row.values.forEach((value, k) => {
      if (value <= 0) return;
      const w = (value / most) * scale;
      const colour = row.risk ? riskColour(row.risk - 1) : null;
      // A row with a risk value takes that value's colour: in full for the first series, paler for the others.
      const tone = colour
        ? { fill: k === 0 ? colour : tint(colour, 0.38), text: k === 0 ? onRisk((row.risk ?? 1) - 1) : INK }
        : TONES[(figure.series[k] ?? figure.series[0])?.tone ?? "mid"];
      out.push(rect(x, middle - thick / 2, Math.max(2.5, w - 2), thick, `rx="2.5" fill="${tone.fill}"`));
      if (shown > 1 && w >= 22)
        out.push(label(x + (w - 2) / 2, middle, String(value), { anchor: "middle", size: 10.5, fill: tone.text }));
      x += w;
    });
    const total = sum(row.values);
    out.push(label(x + 6, middle, String(total), total > 0 ? { bold: true } : { fill: GREY }));
  });
  const height = top + figure.rows.length * pitch + 2;
  out.push(line(labelWidth, top - 2, labelWidth, height, `stroke="${FAINT}" stroke-width="1"`));
  return { svg: `${open(width, height, title)}${out.join("")}</svg>`, maxWidth: width, cut: false };
}

// -------------------------------------------------------------------------------------------------- matrix

function matrix(figure: Extract<Figure, { type: "matrix" }>, title: string, rich: Rich): Drawn {
  const rowLabel = Math.max(...figure.rows.map((row) => widthOf(row))) + 18;
  const left = 26 + rowLabel;
  const cell = 132;
  const top = 46;
  const width = left + cell * figure.columns.length;
  const out: string[] = [
    label(left + (cell * figure.columns.length) / 2, 11, figure.columnTitle, { anchor: "middle", fill: GREY }),
  ];
  figure.columns.forEach((column, j) => {
    out.push(label(left + j * cell + cell / 2, 33, column, { anchor: "middle", bold: true }));
  });

  let y = top;
  figure.rows.forEach((row, i) => {
    const cells = figure.cells[i] ?? [];
    const longest = Math.max(0, ...cells.map((c) => c.entries.join(", ").length));
    const lines = Math.ceil((longest * 7.2) / (cell - 22));
    const h = Math.max(48, 22 + lines * 17);
    out.push(label(left - 10, y + h / 2, row, { anchor: "end", bold: true }));
    cells.forEach((c, j) => {
      const x = left + j * cell;
      // A cell is washed in the colour of its risk value; the number is always written too.
      const fill = c.value === null ? "#fff" : tint(riskColour(figure.scale.indexOf(c.value)), 0.3);
      out.push(rect(x + 1.5, y + 1.5, cell - 3, h - 3, `rx="4" fill="${fill}"${c.value === null ? ` stroke="${HAIR}"` : ""}`));
      if (c.value !== null) out.push(label(x + 9, y + 12, String(c.value), { size: 10.5, fill: DEEP }));
      if (c.entries.length > 0) {
        const css =
          "display:flex;align-items:center;justify-content:center;text-align:center;padding:10px 8px 4px;" +
          `font-size:12px;line-height:1.35;font-weight:700;color:${INK};`;
        out.push(wrapped(x, y, cell, h, css, `<span>${rich(c.entries.join(", "))}</span>`));
      }
    });
    y += h;
  });
  const turned = `transform="rotate(-90 11 ${n((top + y) / 2)})"`;
  out.push(
    `<text x="11" y="${n((top + y) / 2)}" font-size="12" text-anchor="middle" dominant-baseline="central" fill="${GREY}" ${turned}>` +
      `${escapeHtml(figure.rowTitle)}</text>`,
  );

  // The scale, so that the shade is never the only carrier of the value.
  const scaleTitle = widthOf(figure.scaleTitle) + 12;
  out.push(label(left, y + 22, figure.scaleTitle, { fill: GREY }));
  figure.scale.forEach((value, k) => {
    const x = left + scaleTitle + k * 38;
    out.push(rect(x, y + 13, 34, 18, `rx="3" fill="${riskColour(k)}"`));
    out.push(label(x + 17, y + 22, String(value), { anchor: "middle", size: 11, bold: true, fill: onRisk(k) }));
  });
  const height = y + 36;
  return { svg: `${open(width, height, title)}${out.join("")}</svg>`, maxWidth: width, cut: false };
}

// --------------------------------------------------------------------------------------------------- chain

/**
 * Shortens texts for the boxes of one figure, and remembers whether it had to. A box that has no room for the
 * whole text of its record shows it cut after a whole word, with a mark, and carries the ID of the record,
 * which leads to the text in full.
 */
function cutter(): { clip: (text: string, max: number) => string; wasCut: () => boolean } {
  let cut = false;
  return {
    clip: (text, max) => {
      const shown = cutText(text, max);
      if (shown !== text.replace(/\s+/g, " ").trim()) cut = true;
      return shown;
    },
    wasCut: () => cut,
  };
}

/** How much text a box of a trace has room for: four lines under its ID. A longer text is cut, and marked. */
const CHAIN_TEXT = 84;

function chain(figure: Extract<Figure, { type: "chain" }>, title: string, rich: Rich): Drawn {
  const { clip, wasCut } = cutter();
  const width = 1080;
  const pitch = width / figure.columns.length;
  const w = pitch - 26;
  const boxHeight = 74;
  const rowPitch = 84;
  const top = 26;
  const most = Math.max(1, ...figure.columns.map((column) => column.nodes.length));
  const middle = top + (most * rowPitch) / 2;
  const at = new Map<string, { x: number; y: number }>();
  const cards: string[] = [];

  figure.columns.forEach((column, c) => {
    const x = c * pitch + 13;
    cards.push(label(x, 10, column.title, { size: 10.5, bold: true, fill: GREY }));
    column.nodes.forEach((node: ChainNode, k) => {
      const y = middle + (k - column.nodes.length / 2) * rowPitch + (rowPitch - boxHeight) / 2;
      at.set(node.id, { x, y: y + boxHeight / 2 });
      if (node.tone === "none") {
        const css = `display:flex;align-items:center;justify-content:center;text-align:center;font-size:10.5px;font-style:italic;color:${GREY};`;
        cards.push(wrapped(x, y, w, boxHeight, css, `<span style="background:#fff">${escapeHtml(node.text)}</span>`));
        return;
      }
      // A white card with a bar on its left, as a record on the graph of the tool; the risk the chain is about stands out.
      const bar = node.tone === "accent" ? ACCENT : node.tone === "muted" ? FAINT : GREY;
      const edge = node.tone === "accent" ? ACCENT : node.tone === "muted" ? FAINT : EDGE;
      cards.push(
        rect(x, y, w, boxHeight, `rx="5" fill="#fff" stroke="${edge}" stroke-width="${node.tone === "accent" ? 2 : 1}"`),
      );
      cards.push(
        `<path d="M${n(x + 5)} ${n(y)}h-0.5a4.5 4.5 0 0 0-4.5 4.5v${boxHeight - 9}a4.5 4.5 0 0 0 4.5 4.5h0.5z" fill="${bar}"/>`,
      );
      const css = `padding:5px 6px 4px 11px;font-size:10.5px;line-height:1.24;color:${node.tone === "muted" ? GREY : INK};`;
      const heading = `<b style="display:block;font-size:11.5px;margin-bottom:1px">${rich(node.label)}</b>`;
      cards.push(wrapped(x, y, w, boxHeight, css, heading + escapeHtml(clip(node.text, CHAIN_TEXT))));
    });
  });
  const lines: string[] = [];
  for (const [from, to] of figure.links) {
    const a = at.get(from);
    const b = at.get(to);
    if (!a || !b) continue;
    const x1 = a.x + w;
    const bend = (b.x - x1) / 2;
    const curve = `M${n(x1)} ${n(a.y)}C${n(x1 + bend)} ${n(a.y)} ${n(b.x - bend)} ${n(b.y)} ${n(b.x)} ${n(b.y)}`;
    lines.push(`<path d="${curve}" fill="none" stroke="${LINE}" stroke-width="1.2"/>`);
  }
  const height = top + most * rowPitch;
  return { svg: `${open(width, height, title)}${lines.join("")}${cards.join("")}</svg>`, maxWidth: width, cut: wasCut() };
}

// ------------------------------------------------------------------------------------------------- network

/** How much of an element's width its lines of text have. */
const NODE_TEXT = ELEMENT_SIZE.w - 16;
/** The height of one more line of asset IDs inside an element. */
const HELD_LINE = 13;
/** How far apart several lines between the same two elements stand where they meet a side, and in their middle. */
const BETWEEN_LINES = 22;

/** The IDs of what an element holds, as they stand inside it. */
const heldText = (holds: string[]): string => holds.join(", ");

/**
 * The size an element is drawn at on the data flow diagram: the usual one, and taller where the IDs of the
 * assets it holds need more than one line. The arrangement is worked out for elements of this size.
 */
export function networkNodeSize(holds: string[]): Size {
  const lines = Math.ceil(widthOf(heldText(holds), 10.5) / NODE_TEXT);
  return { w: ELEMENT_SIZE.w, h: ELEMENT_SIZE.h + Math.max(0, lines - 1) * HELD_LINE };
}

type Network = Extract<Figure, { type: "network" }>;

/**
 * The lines of the diagram: each data flow between the facing sides of its two elements, in the style the
 * figure asks for. Several flows between the same two elements stand side by side.
 */
function networkLines(figure: Network, rich: Rich): { lines: string[]; tags: string[] } {
  const places = new Map(figure.nodes.map((node) => [node.id, node.place]));
  const drawable = figure.links.filter(
    (link): link is typeof link & { from: string; to: string } =>
      link.from !== null && link.to !== null && link.from !== link.to && places.has(link.from) && places.has(link.to),
  );
  const pairOf = (link: (typeof drawable)[number]) => [link.from, link.to].sort().join("|");
  const lines: string[] = [];
  const tags: string[] = [];
  for (const link of drawable) {
    const siblings = drawable.filter((other) => pairOf(other) === pairOf(link));
    const position = siblings.indexOf(link) - (siblings.length - 1) / 2;
    // The sides are those of the pair in one fixed order, so that flows of opposite direction use the same two sides.
    const [first, second] = [link.from, link.to].sort() as [string, string];
    const sides = facingSides(places.get(first) as Place, places.get(second) as Place);
    const [fromSide, toSide] = link.from === first ? sides : ([sides[1], sides[0]] as [Side, Side]);
    const shift = position * BETWEEN_LINES;
    const drawn = flowLine(
      sidePoint(places.get(link.from) as Place, fromSide, shift),
      fromSide,
      sidePoint(places.get(link.to) as Place, toSide, shift),
      toSide,
      figure.lines,
      shift,
    );
    const markers =
      (link.arrow === "forward" || link.arrow === "both" ? ' marker-end="url(#tip)"' : "") +
      (link.arrow === "backward" || link.arrow === "both" ? ' marker-start="url(#tip)"' : "");
    lines.push(`<path d="${drawn.d}" fill="none" stroke="${LINE}" stroke-width="1.6"${markers}/>`);
    const tagWidth = widthOf(link.id, 11.5) + 14;
    const tagCss = `font-size:11.5px;line-height:18px;text-align:center;color:${INK};`;
    tags.push(rect(drawn.label.x - tagWidth / 2, drawn.label.y - 9, tagWidth, 18, `rx="9" fill="#fff" stroke="${HAIR}"`));
    tags.push(wrapped(drawn.label.x - tagWidth / 2, drawn.label.y - 9, tagWidth, 18, tagCss, rich(link.id)));
  }
  return { lines, tags };
}

function network(figure: Network, title: string, rich: Rich): Drawn {
  const { clip, wasCut } = cutter();
  const all: Place[] = [...figure.nodes.map((node) => node.place), ...figure.frames];
  const pad = 26;
  const minX = Math.min(...all.map((b) => b.x)) - pad;
  const minY = Math.min(...all.map((b) => b.y)) - pad;
  const width = Math.max(...all.map((b) => b.x + b.w)) + pad - minX;
  const height = Math.max(...all.map((b) => b.y + b.h)) + pad - minY;
  const out: string[] = [
    '<defs><marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      `<path d="M0 0L10 5L0 10z" fill="${LINE}"/></marker></defs>`,
  ];

  // Boundaries first: everything else is drawn on top of them.
  for (const frame of figure.frames) {
    out.push(
      rect(
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        `rx="10" fill="${GROUND}" stroke="${GREY}" stroke-width="1.4" stroke-dasharray="7 5"`,
      ),
    );
    const css = `font-size:12px;line-height:1.2;color:${GREY};white-space:nowrap;`;
    out.push(
      wrapped(
        frame.x + 12,
        frame.y + 8,
        Math.max(40, frame.w - 24),
        18,
        css,
        `<b>${rich(frame.id)}</b> ${escapeHtml(frame.name)}`,
      ),
    );
  }

  const { lines, tags } = networkLines(figure, rich);
  out.push(...lines);

  // Elements, in the conventional shapes of a data flow diagram.
  for (const node of figure.nodes) {
    const box = node.place;
    if (node.shape === "store") {
      out.push(rect(box.x, box.y, box.w, box.h, 'fill="#fff"'));
      for (const y of [box.y, box.y + box.h]) out.push(line(box.x, y, box.x + box.w, y, `stroke="${INK}" stroke-width="1.6"`));
    } else if (node.shape === "external") {
      out.push(rect(box.x, box.y, box.w, box.h, `fill="#fff" stroke="${INK}" stroke-width="2.6"`));
    } else {
      out.push(rect(box.x, box.y, box.w, box.h, `rx="14" fill="#fff" stroke="${INK}" stroke-width="1.4"`));
    }
    const small = "font-size:10.5px;";
    const holds =
      node.holds.length > 0
        ? `<span style="display:block;margin-top:2px;${small}color:${ACCENT}">${rich(heldText(node.holds))}</span>`
        : "";
    const css =
      "display:flex;flex-direction:column;justify-content:center;text-align:center;padding:4px 8px;" +
      `font-size:12px;line-height:1.22;color:${INK};`;
    const name = `<b style="font-weight:600">${escapeHtml(clip(node.name, 52))}</b>`;
    const inner = `<span style="${small}color:${GREY}">${rich(node.id)}</span>${name}${holds}`;
    out.push(wrapped(box.x, box.y, box.w, box.h, css, inner));
  }
  out.push(...tags);

  const svg = `<svg viewBox="${n(minX)} ${n(minY)} ${n(width)} ${n(height)}" role="img" aria-label="${escapeHtml(title)}" font-family='${FONT}'>${out.join("")}</svg>`;
  return { svg, maxWidth: Math.round(width * 0.95), cut: wasCut() };
}

/** Draws a figure. title: what it shows, for readers who cannot see it. rich: turns a text into markup with its IDs as links. */
export function drawFigure(figure: Figure, title: string, rich: Rich = escapeHtml): Drawn {
  switch (figure.type) {
    case "bars":
      return bars(figure, title);
    case "matrix":
      return matrix(figure, title, rich);
    case "chain":
      return chain(figure, title, rich);
    case "network":
      return network(figure, title, rich);
  }
}
