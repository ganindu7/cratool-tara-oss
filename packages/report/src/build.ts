// Builds the report of a TARA: the cybersecurity risk assessment for the technical documentation.
//
// Every status and value in it comes from the rule engine (assess, in @tara/core), so the report cannot
// disagree with the screens of the tool. This file puts the sections in order; what each says is in sections/.

import { type AnyRecord, craSummary, RECORD_KINDS, type RecordKind, recordsOf, type Tara } from "@tara/core";
import { ORDER, type ReportContext, reportContext, type SectionKey, show } from "./context.ts";
import type { Report, ReportOptions, Section } from "./model.ts";
import { damages, feasibility, impact, items, paths, risks, threats } from "./sections/analysis.ts";
import { open, references, trace } from "./sections/back.ts";
import { craReference, documentControl, method, scope, summary } from "./sections/front.ts";
import { controls, cra, goals, reviews, treatment } from "./sections/treatment.ts";

const SECTIONS: Record<SectionKey, (context: ReportContext) => Omit<Section, "key">> = {
  summary,
  cra_reference: craReference,
  document_control: documentControl,
  scope,
  method,
  items,
  damages,
  impact,
  threats,
  paths,
  feasibility,
  risks,
  treatment,
  goals,
  controls,
  reviews,
  cra,
  open,
  references,
  trace,
};

/** The step of the tool in which a record of each kind is worked on: the middle of its address there. */
const STEP_OF_KIND: Record<RecordKind, string> = {
  items: "items",
  elements: "architecture",
  assets: "assets",
  damages: "damages",
  threats: "threats",
  paths: "paths",
  risks: "risks",
  controls: "controls",
  evidence: "evidence",
  goalClaims: "goals",
  craDecisions: "cra",
  references: "references",
};

/** What a record is, in a few words, for the text shown on pointing at its ID. */
function tipOf(tara: Tara, kind: RecordKind, record: AnyRecord): string {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  switch (kind) {
    case "items":
    case "elements":
    case "assets":
    case "controls":
      return text(record.name);
    case "damages":
    case "threats":
    case "paths":
      return text(record.description);
    case "risks":
      return `Risk of ${text(record.threatId)}: ${text(tara.threats.find((t) => t.id === record.threatId)?.description)}`;
    case "evidence":
      return `Evidence for ${text(record.controlId)} on ${text(record.riskId)}`;
    case "goalClaims":
      return `${record.kind === "goal" ? "Goal" : "Claim"}: ${text(record.statement)}`;
    case "craDecisions":
      return craSummary(text(record.requirementKey));
    case "references":
      return text(record.title);
  }
}

/** Every record of the TARA by ID: what it stands for, and where it is opened in the tool when the tool's address is known. */
function recordIndex(tara: Tara, toolUrl: string | undefined): Report["records"] {
  const base = toolUrl?.replace(/\/+$/, "");
  const records: Report["records"] = {};
  for (const kind of RECORD_KINDS) {
    for (const record of recordsOf(tara, kind)) {
      const tip = tipOf(tara, kind, record).replace(/\s+/g, " ").trim().slice(0, 240);
      records[record.id] = base ? { tip, toolLink: `${base}/${STEP_OF_KIND[kind]}/${encodeURIComponent(record.id)}` } : { tip };
    }
  }
  return records;
}

/** The report of a TARA as content: sections of paragraphs, tables and figures, for html.ts to lay out. */
export function buildReport(tara: Tara, options: ReportOptions): Report {
  const context = reportContext(tara, options);
  const meta = tara.meta;
  return {
    title: "Cybersecurity risk assessment (TARA)",
    subtitle: [...new Set([meta.product, meta.title].filter(Boolean))].join(": "),
    documentNumber: meta.documentNumber,
    version: `Revision ${show(meta.revision)}${context.draft ? ", draft" : ""}`,
    date: options.generatedAt.slice(0, 10),
    author: options.generatedBy,
    organisation: meta.organisation,
    draft: context.draft,
    example: meta.example,
    sections: ORDER.map((key) => ({ key, ...SECTIONS[key](context) })),
    records: recordIndex(tara, options.toolUrl),
  };
}

/**
 * A name for the report as a file, without an ending: the document number (or the TARA's ID), the revision,
 * and "draft" while it is one. Letters, digits, dots and hyphens only, so that it is safe in any file system
 * and in a download header.
 */
export function reportFileName(tara: Tara): string {
  const parts = [
    tara.meta.documentNumber ?? tara.id,
    "rev",
    tara.meta.revision,
    ...(tara.meta.status === "released" ? [] : ["draft"]),
  ];
  const name = parts
    .join("-")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return name || "tara-report";
}
