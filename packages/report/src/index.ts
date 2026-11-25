// @tara/report: the report of a TARA.
//
//   build.ts   the report as content: sections of paragraphs, tables and figures (sections/ says what each holds)
//   html.ts    that content as one self-contained web page, which also prints as a document
//   svg.ts     the figures, drawn as SVG inside the page
//
// Pure functions of a TARA: nothing here reads a file or opens a connection.

export { buildReport, reportFileName } from "./build.ts";
export { ORDER as SECTION_ORDER, type SectionKey } from "./context.ts";
export { renderHtml } from "./html.ts";
export type { Block, ChainNode, Column, Figure, Report, ReportOptions, Section, Tone } from "./model.ts";
export { drawFigure, NODE_HEIGHT, NODE_WIDTH } from "./svg.ts";
