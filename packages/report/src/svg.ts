// Draws the figures of the report as SVG that sits inside the page: bars, the risk matrix, the trace of a
// risk, and the data flow diagram. Nothing is loaded from elsewhere, and nothing here runs in the browser.
//
// Text that may hold record IDs is placed with <foreignObject>, so that it wraps like ordinary text and its
// IDs can be links. `rich` turns a text into such markup; the caller (html.ts) supplies it.

import { cutText } from "@tara/core";
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

const INK = "#1a1a1a";
const GREY = "#6b6b6b";
const LINE = "#8a8a8a";
const ACCENT = "#1d5d8c";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const TONES: Record<Tone, { fill: string; text: string }> = {
  strong: { fill: "#4a4a4a", text: "#fff" },
  mid: { fill: "#b5b5b5", text: INK },
  done: { fill: "#2f6b3a", text: "#fff" },
  waiting: { fill: "#c79a00", text: INK },
  todo: { fill: "#b3261e", text: "#fff" },
};
/** The risk values 1 to 5 have colours of their own, from green to red, the same as on the screens of the tool. */
const RISK = ["#3d7d46", "#7a9a2e", "#c79a00", "#d9661a", "#c62828"];
const riskColour = (position: number): string => RISK[Math.min(4, Math.max(0, position))] as string;

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
        ? { fill: k === 0 ? colour : tint(colour, 0.38), text: k === 0 ? "#fff" : INK }
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
  out.push(line(labelWidth, top - 2, labelWidth, height, 'stroke="#bdbdbd" stroke-width="1"'));
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
      out.push(rect(x + 1.5, y + 1.5, cell - 3, h - 3, `rx="4" fill="${fill}"${c.value === null ? ' stroke="#d0d0d0"' : ""}`));
      if (c.value !== null) out.push(label(x + 9, y + 12, String(c.value), { size: 10.5, fill: "#4a4a4a" }));
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
    out.push(label(x + 17, y + 22, String(value), { anchor: "middle", size: 11, bold: true, fill: k === 2 ? INK : "#fff" }));
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
      const bar = node.tone === "accent" ? ACCENT : node.tone === "muted" ? "#c8c8c8" : "#5c5c5c";
      const edge = node.tone === "accent" ? ACCENT : node.tone === "muted" ? "#c8c8c8" : "#a6a6a6";
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
    lines.push(`<path d="${curve}" fill="none" stroke="#9a9a9a" stroke-width="1.2"/>`);
  }
  const height = top + most * rowPitch;
  return { svg: `${open(width, height, title)}${lines.join("")}${cards.join("")}</svg>`, maxWidth: width, cut: wasCut() };
}

// ------------------------------------------------------------------------------------------------- network

/** The size of an element on the data flow diagram, in the diagram's units. Its position is its top left corner. */
export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 76;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a line that starts at a point inside a box, and runs in a direction, leaves the box. */
function exitPoint(box: Box, from: { x: number; y: number }, direction: { x: number; y: number }): { x: number; y: number } {
  const reach = (start: number, low: number, high: number, d: number) =>
    d > 0 ? (high - start) / d : d < 0 ? (low - start) / d : Number.POSITIVE_INFINITY;
  const t = Math.max(
    0,
    Math.min(reach(from.x, box.x, box.x + box.w, direction.x), reach(from.y, box.y, box.y + box.h, direction.y)),
  );
  return Number.isFinite(t) ? { x: from.x + direction.x * t, y: from.y + direction.y * t } : from;
}

/** Places for elements that were never arranged: outside parties on the left, components in the middle, stores on the right. */
function layOut(nodes: Extract<Figure, { type: "network" }>["nodes"]): Map<string, Box> {
  const ofShape = (shape: string) => nodes.filter((node) => node.shape === shape);
  const columns: (typeof nodes)[] = [ofShape("external"), ofShape("process"), ofShape("store")];
  const filled = columns.filter((column) => column.length > 0);
  const tallest = Math.max(1, ...filled.map((column) => column.length));
  const pitchY = NODE_HEIGHT + 44;
  const boxes = new Map<string, Box>();
  filled.forEach((column, c) => {
    const offset = ((tallest - column.length) * pitchY) / 2;
    column.forEach((node, k) => {
      boxes.set(node.id, { x: c * (NODE_WIDTH + 130), y: offset + k * pitchY, w: NODE_WIDTH, h: NODE_HEIGHT });
    });
  });
  return boxes;
}

function network(figure: Extract<Figure, { type: "network" }>, title: string, rich: Rich): Drawn {
  const { clip, wasCut } = cutter();
  const arranged = figure.nodes.every((node) => node.at !== undefined);
  const boxes = arranged
    ? new Map(figure.nodes.map((node) => [node.id, { x: node.at?.x ?? 0, y: node.at?.y ?? 0, w: NODE_WIDTH, h: NODE_HEIGHT }]))
    : layOut(figure.nodes);
  const frames = arranged ? figure.frames : [];
  const all: Box[] = [...boxes.values(), ...frames];
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
  for (const frame of frames) {
    out.push(
      rect(
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        `rx="10" fill="#fafafa" stroke="${GREY}" stroke-width="1.4" stroke-dasharray="7 5"`,
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

  // Flows: a straight line from border to border. Several flows between the same two elements run side by side.
  const drawable = figure.links.filter(
    (link) => link.from !== null && link.to !== null && link.from !== link.to && boxes.has(link.from) && boxes.has(link.to),
  );
  const pairOf = (link: (typeof drawable)[number]) => [link.from, link.to].sort().join("|");
  const tags: string[] = [];
  for (const link of drawable) {
    const siblings = drawable.filter((other) => pairOf(other) === pairOf(link));
    const position = siblings.indexOf(link) - (siblings.length - 1) / 2;
    // The offset is measured against one fixed direction of the pair, so that flows of opposite direction do not land on each other.
    const [firstId, secondId] = [link.from as string, link.to as string].sort() as [string, string];
    const centre = (id: string) => {
      const box = boxes.get(id) as Box;
      return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    };
    const along = { x: centre(secondId).x - centre(firstId).x, y: centre(secondId).y - centre(firstId).y };
    const length = Math.hypot(along.x, along.y) || 1;
    const shift = { x: (-along.y / length) * position * 22, y: (along.x / length) * position * 22 };
    const from = boxes.get(link.from as string) as Box;
    const to = boxes.get(link.to as string) as Box;
    const p = { x: centre(link.from as string).x + shift.x, y: centre(link.from as string).y + shift.y };
    const q = { x: centre(link.to as string).x + shift.x, y: centre(link.to as string).y + shift.y };
    const a = exitPoint(from, p, { x: q.x - p.x, y: q.y - p.y });
    const b = exitPoint(to, q, { x: p.x - q.x, y: p.y - q.y });
    const markers =
      (link.arrow === "forward" || link.arrow === "both" ? ' marker-end="url(#tip)"' : "") +
      (link.arrow === "backward" || link.arrow === "both" ? ' marker-start="url(#tip)"' : "");
    out.push(line(a.x, a.y, b.x, b.y, `stroke="${LINE}" stroke-width="1.6"${markers}`));
    const tagWidth = widthOf(link.id, 11.5) + 14;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const tagCss = `font-size:11.5px;line-height:18px;text-align:center;color:${INK};`;
    tags.push(rect(mid.x - tagWidth / 2, mid.y - 9, tagWidth, 18, 'rx="9" fill="#fff" stroke="#d0d0d0"'));
    tags.push(wrapped(mid.x - tagWidth / 2, mid.y - 9, tagWidth, 18, tagCss, rich(link.id)));
  }

  // Elements, in the conventional shapes of a data flow diagram.
  for (const node of figure.nodes) {
    const box = boxes.get(node.id) as Box;
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
        ? `<span style="display:block;margin-top:2px;${small}color:${ACCENT}">${rich(node.holds.join(", "))}</span>`
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
