// Lays the report out as one self-contained web page.
//
// Nothing is loaded from elsewhere and nothing runs: the styles and the figures are inside the page, and the
// page says so itself (its content security policy allows no script and no outside resource). It can be kept
// as a file, sent by mail, and printed: "Print to PDF" in a browser gives the document on A4.
//
// Every text of the TARA is escaped before it is placed (escape.ts). A record ID in a text becomes a link:
// into the tool when the report was made with the tool's address, otherwise to the place in the document
// where the record is defined.

import { CUT, mentionFinder } from "@tara/core";
import { anchorName, escapeHtml, escapeLines, safeUrl, shortAddress, WEB_ADDRESS } from "./escape.ts";
import type { Block, Report } from "./model.ts";
import { drawFigure } from "./svg.ts";

/** What the page holds itself to: it loads nothing, sends nothing and runs nothing. */
const POLICY = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

// The colours and the face are those of the tool's tokens (apps/web/src/styles/tokens.css). The page loads nothing,
// so it repeats the few it uses: ink and grey for text, shade and line for tables, and one colour for each meaning.
const STYLE = `
:root { --ink: #1d1c18; --accent: #1d5d8c; --grey: #5c5953; --shade: #f1f1ef; --line: #dad9d5; --done: #2f6b3a; --todo: #b3261e; --amber-wash: #fdf3d7; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 15px/1.5 Lato, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: var(--ink); background: #fff; }
a { color: inherit; text-decoration-color: var(--line); text-underline-offset: 0.15em; }
a:hover { color: var(--accent); text-decoration-color: currentColor; }
header.title { padding: 2.2rem 2.5rem 1.4rem; border-bottom: 2px solid var(--accent); }
header.title h1 { margin: 0; font-size: 1.9rem; line-height: 1.2; letter-spacing: -0.01em; }
header.title .subtitle { margin: 0.35rem 0 0; color: var(--grey); font-size: 1.05rem; max-width: 60rem; }
header.title dl { display: flex; flex-wrap: wrap; gap: 0.3rem 2rem; margin: 1rem 0 0; font-size: 0.9rem; }
header.title dl div { display: flex; gap: 0.4rem; }
dt { color: var(--grey); }
dd { margin: 0; }
.marks { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 0.9rem; }
.mark { display: inline-block; padding: 0.1rem 0.6rem; border: 1.5px solid currentColor; border-radius: 3px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.mark.draft { color: var(--todo); }
.mark.released { color: var(--done); }
.mark.example { color: var(--accent); }
.page { display: grid; grid-template-columns: 17rem minmax(0, 1fr); }
nav { position: sticky; top: 0; align-self: start; max-height: 100vh; overflow: auto; padding: 1.5rem 1rem 2rem 2.5rem; border-right: 1px solid var(--line); font-size: 0.9rem; }
nav strong { display: block; margin-bottom: 0.6rem; }
nav ol { margin: 0; padding-left: 1.5rem; }
nav li { margin: 0.25rem 0; }
nav a { text-decoration: none; }
nav a:hover { text-decoration: underline; }
main { padding: 0.5rem 2.5rem 5rem; max-width: 86rem; min-width: 0; }
section { margin-top: 2.4rem; }
h2 { color: var(--accent); font-size: 1.3rem; margin: 0 0 0.3rem; scroll-margin-top: 1rem; }
.answers { color: var(--grey); font-style: italic; font-size: 0.88rem; margin: 0 0 0.8rem; }
p, ul { margin: 0.7rem 0; max-width: 48rem; }
ul { padding-left: 1.3rem; }
.notice { background: var(--shade); border-left: 3px solid var(--accent); color: var(--accent); font-weight: 700; padding: 0.6rem 0.9rem; max-width: none; }
figure { margin: 1.4rem 0; }
figcaption { font-size: 0.9rem; margin-top: 0.45rem; }
figcaption b { color: var(--accent); }
.note { font-size: 0.88rem; color: var(--grey); margin-top: 0.3rem; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.86rem; border-top: 1.5px solid var(--ink); border-bottom: 1.5px solid var(--ink); }
/* a table of a few short entries is as wide as what it says, not as the page */
table.short { width: auto; min-width: 22rem; }
th { text-align: left; background: var(--shade); border-bottom: 1px solid var(--ink); font-weight: 700; }
th, td { padding: 0.34rem 0.55rem; vertical-align: top; }
tbody tr + tr td { border-top: 1px solid var(--shade); }
td { overflow-wrap: break-word; }
td.fit, th.fit { white-space: nowrap; }
a.rec { white-space: nowrap; text-decoration: underline; text-decoration-color: var(--line); }
a.out { overflow-wrap: anywhere; }
/* where a followed link lands: the row is marked, and stays clear of the top edge */
tr[id], figure[id] { scroll-margin-top: 4rem; }
tr:target td { background: var(--amber-wash); }
tr:target td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
figure:target table { outline: 2px solid var(--accent); outline-offset: 2px; }
figure.drawing svg { display: block; width: 100%; height: auto; }
figure.drawing .frame { margin: 0 auto 0 0; }
svg a { color: inherit; }
footer { margin-top: 3rem; padding-top: 0.8rem; border-top: 1px solid var(--line); color: var(--grey); font-size: 0.82rem; }
@media (max-width: 62rem) {
  .page { grid-template-columns: minmax(0, 1fr); }
  nav { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--line); padding: 1.2rem 1rem; }
  main, header.title { padding-left: 1rem; padding-right: 1rem; }
}
@page { size: A4; margin: 16mm 14mm 18mm; }
@media print {
  body { font-size: 9.5pt; }
  header.title { padding: 0 0 1rem; }
  .page { display: block; }
  nav { position: static; max-height: none; border: 0; padding: 1.2rem 0 0; break-after: page; font-size: 10pt; }
  main { padding: 0; max-width: none; }
  section { margin-top: 0; break-before: page; }
  section:first-of-type { break-before: auto; }
  h2 { break-after: avoid; }
  table { font-size: 7.6pt; }
  th, td { padding: 0.22rem 0.36rem; }
  thead { display: table-header-group; }
  tr, figure.drawing, .notice { break-inside: avoid; }
  figcaption { break-before: avoid; }
  .scroll { overflow: visible; }
  a { text-decoration: none; }
  th, .notice, .mark { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** The IDs that are defined somewhere in the document: by a row of a table, or by a table as a whole. */
function definedIds(report: Report): Set<string> {
  const defined = new Set<string>();
  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "table") continue;
      if (block.anchor) defined.add(block.anchor);
      if (block.definesRows) for (const row of block.rows) defined.add((row[0] ?? "").trim());
      for (const id of block.rowIds ?? []) defined.add(id);
    }
  }
  defined.delete("");
  return defined;
}

/** What the report says under a figure in which a text was cut. */
const CUT_NOTE = `A text that ends in ${CUT} is cut short for room. The ID in the same box leads to where it stands in full.`;

/**
 * Lays a report out as one self-contained web page: the styles and the figures are inside it, every text is
 * escaped, and a record ID in a text becomes a link, to its record in the tool or else to where the document
 * defines it.
 */
export function renderHtml(report: Report): string {
  const defined = definedIds(report);
  // The IDs in a text are found as the screens find them (core, model/mentions.ts).
  const piecesOf = mentionFinder(Object.keys(report.records));

  /** A record ID as a link: into the tool, or to where it is defined in this document; as plain text where neither exists. */
  const idLink = (id: string, shown = id): string => {
    const record = report.records[id];
    const tip = record?.tip ? ` title="${escapeHtml(record.tip)}"` : "";
    if (record?.toolLink)
      return `<a class="rec" href="${escapeHtml(record.toolLink)}" target="_top"${tip}>${escapeHtml(shown)}</a>`;
    if (defined.has(id)) return `<a class="rec" href="#${anchorName(id)}"${tip}>${escapeHtml(shown)}</a>`;
    return escapeHtml(shown);
  };
  /** Plain text with the IDs in it as links. */
  const withIds = (value: string): string =>
    piecesOf(value)
      .map((piece) => (piece.id ? idLink(piece.id) : escapeLines(piece.text)))
      .join("");
  /** Any text of the report as markup: escaped, with web addresses and record IDs as links. */
  const text = (value: string): string =>
    value
      .trim()
      .split(WEB_ADDRESS)
      .map((part, i) => {
        if (i % 2 === 0) return withIds(part);
        const address = safeUrl(part);
        if (!address) return escapeLines(part);
        // A web address is shown short; the whole of it is where the link leads, and is told on pointing at it.
        const short = shortAddress(address)
          .split(/(?<=\/)|(?=#)/)
          .map(escapeHtml)
          .join("<wbr>");
        return `<a class="out" href="${escapeHtml(address)}" title="${escapeHtml(address)}" target="_blank" rel="noopener noreferrer">${short}</a>`;
      })
      .join("");

  let tables = 0;
  let figures = 0;
  /** The anchors already given: an ID is the target of links once. */
  const anchored = new Set<string>();
  const anchorOnce = (id: string | undefined): string => {
    if (!id || !defined.has(id) || anchored.has(id)) return "";
    anchored.add(id);
    return ` id="${anchorName(id)}"`;
  };

  /** Whether the section being laid out has already said what a cut text is. */
  let saidCut = false;

  const block = (b: Block): string => {
    switch (b.kind) {
      case "paragraph":
        return `<p>${text(b.text)}</p>`;
      case "notice":
        return `<p class="notice">${text(b.text)}</p>`;
      case "list":
        return `<ul>${b.items.map((item) => `<li>${text(item)}</li>`).join("")}</ul>`;
      case "table": {
        if (b.rows.length === 0) return `<p><b>${text(b.caption)}.</b> ${text(b.empty)}</p>`;
        const fit = b.columns.map((column) => (column.width === "fit" ? ' class="fit"' : ""));
        const widths = b.columns.some((column) => typeof column.width === "number")
          ? `<colgroup>${b.columns.map((column) => (typeof column.width === "number" ? `<col style="width:${column.width}%">` : "<col>")).join("")}</colgroup>`
          : "";
        const rows = b.rows.map((row, r) => {
          const first = (row[0] ?? "").trim();
          const rowId = b.definesRows ? first : b.rowIds?.[r];
          const cells = row.map((value, i) => {
            // The cell that names the record of its row: bold, and the way to the record in the tool.
            if (i === 0 && rowId && rowId in report.records)
              return `<td${fit[i] ?? ""}><b>${report.records[rowId]?.toolLink ? idLink(rowId, first) : escapeHtml(first)}</b></td>`;
            return `<td${fit[i] ?? ""}>${text(value)}</td>`;
          });
          return `<tr${anchorOnce(rowId)}>${cells.join("")}</tr>`;
        });
        const short = b.columns.length <= 4 && Math.max(...b.rows.map((row) => row.join("").length)) < 60;
        return (
          `<figure${anchorOnce(b.anchor)}><div class="scroll"><table${short ? ' class="short"' : ""}>${widths}` +
          `<thead><tr>${b.columns.map((column, i) => `<th${fit[i] ?? ""}>${escapeLines(column.header)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.join("")}</tbody></table></div>` +
          `<figcaption><b>Table ${++tables}:</b> ${text(b.caption)}</figcaption></figure>`
        );
      }
      case "figure": {
        const drawn = drawFigure(b.figure, b.caption, withIds);
        // A box with no room for the whole text of its record says so, and its ID leads to the text in full.
        // What the mark means is said once in a section, under the first figure that has one: not under each of twenty.
        const explainCut = drawn.cut && !saidCut;
        if (explainCut) saidCut = true;
        const note = [b.note, explainCut ? CUT_NOTE : null].filter(Boolean).join(" ");
        return (
          `<figure class="drawing"><div class="frame" style="max-width:${drawn.maxWidth}px">${drawn.svg}</div>` +
          `<figcaption><b>Figure ${++figures}:</b> ${text(b.caption)}</figcaption>${note ? `<p class="note">${text(note)}</p>` : ""}</figure>`
        );
      }
    }
  };

  const sections = report.sections
    .map((section, i) => {
      saidCut = false;
      return (
        `<section><h2 id="${escapeHtml(section.key)}">${i + 1}&ensp;${escapeHtml(section.title)}</h2>` +
        `${section.answers ? `<p class="answers">${escapeHtml(section.answers)}</p>` : ""}${section.blocks.map(block).join("\n")}</section>`
      );
    })
    .join("\n");
  const marks = [
    report.draft ? '<span class="mark draft">Draft</span>' : '<span class="mark released">Released</span>',
    ...(report.example ? ['<span class="mark example">Training example</span>'] : []),
  ];
  const facts: [string, string][] = [
    ["Version", report.version],
    ...(report.documentNumber ? [["Document", report.documentNumber] as [string, string]] : []),
    ...(report.organisation ? [["Organisation", report.organisation] as [string, string]] : []),
    ["Date", report.date],
    ["Generated by", report.author],
  ];
  const contents = report.sections
    .map((section) => `<li><a href="#${escapeHtml(section.key)}">${escapeHtml(section.title)}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.subtitle || report.title)}</title>
<style>${STYLE}</style></head>
<body>
<header class="title"><div class="marks">${marks.join("")}</div><h1>${escapeHtml(report.title)}</h1><p class="subtitle">${escapeHtml(report.subtitle)}</p>
<dl>${facts.map(([name, value]) => `<div><dt>${name}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></header>
<div class="page">
<nav aria-label="Contents"><strong>Contents</strong><ol>${contents}</ol></nav>
<main>
${sections}
<footer>${escapeHtml(report.title)}. ${escapeHtml(report.subtitle)}. ${escapeHtml(report.version)}. Generated ${escapeHtml(report.date)} by ${escapeHtml(report.author)}.</footer>
</main></div>
</body></html>
`;
}
