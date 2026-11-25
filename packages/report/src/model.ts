// The report as content, independent of how it is laid out.
//
// build.ts turns a TARA into this content: sections made of paragraphs, tables and figures. html.ts lays the
// content out as a web page. Another layout (a word-processor file, a slide) would read the same content.

/** What the caller says about the making of a report. */
export interface ReportOptions {
  /** When the report was made, as an ISO date and time, and by whom. */
  generatedAt: string;
  generatedBy: string;
  /** The program that made the report, with its version and that of its rules: "TARA workbench 0.1.0, rules 1.0.0". */
  madeWith?: string;
  /**
   * The address of the TARA in the tool, for example "http://localhost:8787/#/tara/example-kettle".
   * With it, every record ID in the report links to its record in the tool. Without it the report is a file
   * to keep: IDs link to where they are defined inside the document only.
   */
  toolUrl?: string;
}

export interface Column {
  header: string;
  /** "fit": as wide as its content; "wrap": shares the remaining width; a number: a share of the width, in percent. */
  width: "fit" | "wrap" | number;
}

export type Block =
  | { kind: "paragraph"; text: string }
  /** A paragraph that must not be overlooked: the state of the document. */
  | { kind: "notice"; text: string }
  | { kind: "list"; items: string[] }
  | {
      kind: "table";
      caption: string;
      columns: Column[];
      rows: string[][];
      /** What is said in place of the table when it has no rows. */
      empty: string;
      /** The first column holds the IDs this table defines. Elsewhere in the report those IDs lead here. */
      definesRows?: boolean;
      /** The ID the whole table defines (an item is defined by a table of its own). */
      anchor?: string;
      /** The record behind each row, where the first column does not show its ID (a CRA requirement shows its letter). */
      rowIds?: string[];
    }
  | { kind: "figure"; caption: string; figure: Figure; note?: string };

/** How a bar is filled. done, waiting and todo are the colours of the three kinds of status, as on the screens of the tool. */
export type Tone = "strong" | "mid" | "done" | "waiting" | "todo";

/** A record in the trace of a risk. muted: it does not count (a screened-out path). none: a gap said in words. */
export interface ChainNode {
  id: string;
  label: string;
  text: string;
  tone?: "accent" | "muted" | "none";
}

/** A figure as content. svg.ts gives it a geometry and draws it. */
export type Figure =
  /** Horizontal bars, one row per category; several series are stacked. */
  | {
      type: "bars";
      series: { label: string; tone: Tone }[];
      /** risk: the bar takes the colour of that risk value (1 to 5) in place of the series' tones. */
      rows: { label: string; values: number[]; risk?: number }[];
    }
  /** A grid of cells coloured by risk value, each listing the risks that fall in it (the risk matrix). */
  | {
      type: "matrix";
      rowTitle: string;
      columnTitle: string;
      rows: string[];
      columns: string[];
      scaleTitle: string;
      scale: number[];
      cells: { value: number | null; entries: string[] }[][];
    }
  /** Records in columns, linked from left to right (the trace of one risk). */
  | { type: "chain"; columns: { title: string; nodes: ChainNode[] }[]; links: [from: string, to: string][] }
  /** Elements joined by flows (the data flow diagram). */
  | {
      type: "network";
      nodes: {
        id: string;
        name: string;
        shape: "process" | "external" | "store";
        /** Where it was placed on the diagram, in the diagram's own units. Absent: the figure is laid out for the page. */
        at?: { x: number; y: number };
        /** The assets that live in the element, by ID. */
        holds: string[];
      }[];
      /** A link with an end that is not a node is not drawn. */
      links: { id: string; from: string | null; to: string | null; arrow: "forward" | "backward" | "both" | null }[];
      /** Boundaries drawn around elements, in the same units as the positions. */
      frames: { id: string; name: string; x: number; y: number; w: number; h: number }[];
    };

export interface Section {
  /** Names the section in addresses: the anchor of its heading. */
  key: string;
  title: string;
  /** Which provision or work product the section answers, shown under the heading. */
  answers?: string;
  blocks: Block[];
}

export interface Report {
  title: string;
  subtitle: string;
  documentNumber: string | null;
  /** The revision, in words. */
  version: string;
  date: string;
  author: string;
  /** The organisation the report is of. */
  organisation: string | null;
  draft: boolean;
  /** A training example, not the assessment of a product. */
  example: boolean;
  sections: Section[];
  /**
   * For each record ID, what it stands for (shown on pointing at a mention of it) and, when the report was
   * made with the tool's address, where the record is opened in the tool.
   */
  records: Record<string, { tip: string; toolLink?: string }>;
}
