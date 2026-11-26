// What each scope field and each row of hand-over evidence asks, in words, with a realistic example.

import { SCOPE_KEYS, SCOPE_NAMES, type ScopeKey } from "@tara/core";

/** The words of one row: what it is called, what it asks and, where one helps, an example of an answer. */
export interface ScopeLabel {
  label: string;
  help: string;
  example?: string;
}

/** What each row asks, and an example of an answer. What a row is called is said once, in core (`SCOPE_NAMES`). */
const ASKED: Record<ScopeKey, Omit<ScopeLabel, "label">> = {
  configuration_id: {
    help: "The exact product configuration this assessment is valid for. Evidence is recorded against this ID.",
    example: "T1-EU-SW-2.4",
  },
  scoring_method: {
    help: "The method by which impact, feasibility and risk are rated here, and who approved its use.",
    example: "Open TARA method 1.0, approved for all products in 2026",
  },
  variant_boundary: {
    help: "Which variants and options are covered, and which are not.",
    example: "All models with Wi-Fi; the model without it is assessed separately",
  },
  intended_use: {
    help: "The intended purpose, and the use that can reasonably be foreseen.",
    example: "Controlling the heating of a home; set up by the owner; foreseeable: installed in a small office",
  },
  architecture_trust_boundaries: {
    help: "Where trusted parts meet untrusted ones.",
    example: "One trust boundary: the housing. The phone app, the cloud service and the home network are outside it",
  },
  lifecycle_support: {
    help: "The expected time in use, and the support period.",
    example: "Expected use 10 years; security updates for 5 years from the last sale",
  },
  product_market_context: {
    help: "Who buys and operates it, and where.",
    example: "A consumer product sold in shops in the EU",
  },
  assumptions_exclusions: {
    help: "What is assumed to hold, and what is left out on purpose, with where it is handled instead.",
    example:
      "The owner's phone and router are assessed by their makers. Electrical safety is covered by the product safety assessment",
  },
  reassessment_triggers: {
    help: "The events that require this assessment to be looked at again.",
    example: "A new software release, a new interface, a reported vulnerability, and in any case every year",
  },
  cra_applicability: { help: "Is the product in scope of Regulation (EU) 2024/2847?" },
  iso21434_applicability: { help: "Is the method of ISO/SAE 21434 applied to this product?" },
  r155_applicability: {
    help: "Is UN R155 followed, as a requirement or as good practice? Only for vehicles.",
  },
  scope_review: { help: "The review of the scope and of the scoring method. Every rating waits for it." },
  cra_annex_i_part_i_1: {
    help: "What this assessment concludes about the product's security, and where the result is kept.",
    example: "The risk assessment is this TARA. Three controls are in the product; two risks are accepted with a claim",
  },
  cra_annex_i_part_ii: {
    help: "How vulnerabilities are handled. Shown by the decisions on the requirements II(1) to II(8).",
    example: "Vulnerability handling follows the company's procedure",
  },
  cra_annex_vii: {
    help: "Where this assessment sits in the technical documentation.",
    example: "The technical file holds this assessment, the security concept and the test report",
  },
  iso_work_products: {
    help: "The work products kept or handed over.",
    example: "Item definition, TARA, cybersecurity goals and the concept are kept",
  },
  vehicle_supplier_evidence: {
    help: "Evidence exchanged with a vehicle manufacturer or a supplier. Only where UN R155 is in scope.",
  },
  release_review: { help: "The review of the assessment as a whole, before it is signed and released." },
};

/** The words of every row of the scope and of the hand-over evidence, by the key the TARA keeps its answer under. */
export const SCOPE_LABELS = Object.fromEntries(
  SCOPE_KEYS.map((key) => [key, { label: SCOPE_NAMES[key], ...ASKED[key] }]),
) as Record<ScopeKey, ScopeLabel>;
