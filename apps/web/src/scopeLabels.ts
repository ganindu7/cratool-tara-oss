// What each scope field and each row of hand-over evidence asks, in words, with a realistic example.

import type { ScopeKey } from "@tara/core";

export interface ScopeLabel {
  label: string;
  help: string;
  example?: string;
}

export const SCOPE_LABELS: Record<ScopeKey, ScopeLabel> = {
  configuration_id: {
    label: "Configuration ID",
    help: "The exact product configuration this assessment is valid for. Evidence is recorded against this ID.",
    example: "T1-EU-SW-2.4",
  },
  scoring_method: {
    label: "Scoring method",
    help: "The method by which impact, feasibility and risk are rated here, and who approved its use.",
    example: "Open TARA method 1.0, approved for all products in 2026",
  },
  variant_boundary: {
    label: "Variants covered",
    help: "Which variants and options are covered, and which are not.",
    example: "All models with Wi-Fi; the model without it is assessed separately",
  },
  intended_use: {
    label: "Intended and foreseeable use",
    help: "The intended purpose, and the use that can reasonably be foreseen.",
    example: "Controlling the heating of a home; set up by the owner; foreseeable: installed in a small office",
  },
  architecture_trust_boundaries: {
    label: "Architecture and trust boundaries",
    help: "Where trusted parts meet untrusted ones.",
    example: "One trust boundary: the housing. The phone app, the cloud service and the home network are outside it",
  },
  lifecycle_support: {
    label: "Lifecycle and support",
    help: "The expected time in use, and the support period.",
    example: "Expected use 10 years; security updates for 5 years from the last sale",
  },
  product_market_context: {
    label: "Product and market",
    help: "Who buys and operates it, and where.",
    example: "A consumer product sold in shops in the EU",
  },
  assumptions_exclusions: {
    label: "Assumptions and exclusions",
    help: "What is assumed to hold, and what is left out on purpose, with where it is handled instead.",
    example:
      "The owner's phone and router are assessed by their makers. Electrical safety is covered by the product safety assessment",
  },
  reassessment_triggers: {
    label: "When this is assessed again",
    help: "The events that require this assessment to be looked at again.",
    example: "A new software release, a new interface, a reported vulnerability, and in any case every year",
  },
  cra_applicability: { label: "Cyber Resilience Act", help: "Is the product in scope of Regulation (EU) 2024/2847?" },
  iso21434_applicability: { label: "ISO/SAE 21434", help: "Is the method of ISO/SAE 21434 applied to this product?" },
  r155_applicability: {
    label: "UN Regulation No. 155",
    help: "Is UN R155 followed, as a requirement or as good practice? Only for vehicles.",
  },
  scope_review: { label: "Scope review", help: "The review of the scope and of the scoring method. Every rating waits for it." },
  cra_annex_i_part_i_1: {
    label: "CRA Annex I Part I(1): the risk assessment",
    help: "What this assessment concludes about the product's security, and where the result is kept.",
    example: "The risk assessment is this TARA. Three controls are in the product; two risks are accepted with a claim",
  },
  cra_annex_i_part_ii: {
    label: "CRA Annex I Part II: vulnerability handling",
    help: "How vulnerabilities are handled. Shown by the decisions on the requirements II(1) to II(8).",
    example: "Vulnerability handling follows the company's procedure",
  },
  cra_annex_vii: {
    label: "CRA Annex VII: technical documentation",
    help: "Where this assessment sits in the technical documentation.",
    example: "The technical file holds this assessment, the security concept and the test report",
  },
  iso_work_products: {
    label: "ISO/SAE 21434 work products",
    help: "The work products kept or handed over.",
    example: "Item definition, TARA, cybersecurity goals and the concept are kept",
  },
  vehicle_supplier_evidence: {
    label: "Vehicle or supplier evidence",
    help: "Evidence exchanged with a vehicle manufacturer or a supplier. Only where UN R155 is in scope.",
  },
  release_review: { label: "Release review", help: "The review of the assessment as a whole, before it is signed and released." },
};
