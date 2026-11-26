// The front of the report: what the document is, where it answers the regulation, how it is controlled,
// what it covers, and the method it was made with.

import { EVIDENCE_ROW_KEYS, type Risk, releaseNeeds, SCOPE_FIELD_KEYS, signoffStates, withdrawnIds } from "@tara/core";
import { col, figure, moment, NONE, notice, p, type ReportContext, SCOPE_LABELS, show, table } from "../context.ts";
import type { Block, Column, Figure, Section } from "../model.ts";

type Body = Omit<Section, "key">;

/** The columns of a table of risks, used for the highest risks and for the ranking. */
export const RISK_COLUMNS: Column[] = [
  col("Risk", "fit"),
  col("Threat scenario"),
  col("Impact", 11),
  col("Feasibility", 11),
  col("Value", "fit"),
  col("Treatment", 10),
  col("Rating check", 18),
];

/** One risk as a row of such a table. */
export function riskRow(c: ReportContext, risk: Risk): string[] {
  const score = c.riskScore(risk.threatId);
  const threat = c.tara.threats.find((t) => t.id === risk.threatId);
  return [
    risk.id,
    `${risk.threatId}: ${show(threat?.description)}`,
    c.riskImpact(risk.threatId),
    c.feasibilityName(score.feasibility),
    show(score.value),
    c.treatmentName(risk.treatment),
    c.message(c.checks.riskRating.get(risk.id)),
  ];
}

/** The risks from the highest value down; risks of equal value keep their order. */
export function rankedRisks(c: ReportContext): Risk[] {
  return c.tara.risks
    .map((risk, position) => ({ risk, position, value: c.riskScore(risk.threatId).value ?? 0 }))
    .sort((a, b) => b.value - a.value || a.position - b.position)
    .map((entry) => entry.risk);
}

/** The risk values the method can give, from lowest to highest. */
export const scaleOf = (c: ReportContext): number[] =>
  [...new Set(Object.values(c.method.risk_matrix).flatMap((row) => Object.values(row)))].sort((a, b) => a - b);

/**
 * The summary: whether the document is a draft or released, what it is and how it is laid out, the assessment
 * in numbers and, once there are risks, in two figures, and the highest risks, ten at most.
 */
export function summary(c: ReportContext): Body {
  const { tara, checks, open } = c;
  const meta = tara.meta;
  const scale = scaleOf(c);
  const valued = tara.risks.filter((r) => c.riskScore(r.threatId).value !== null);

  const byValue: Figure = {
    type: "bars",
    series: [
      { label: "Rating reviewed", tone: "strong" },
      { label: "Rating not yet reviewed", tone: "mid" },
    ],
    rows: [
      ...[...scale].reverse().map((value) => {
        const all = tara.risks.filter((r) => c.riskScore(r.threatId).value === value);
        const reviewed = all.filter((r) => c.reviewedRiskIds.has(r.id)).length;
        return {
          label: `Risk value ${value}`,
          values: [reviewed, all.length - reviewed],
          risk: Math.min(5, Math.max(1, scale.indexOf(value) + 1)),
        };
      }),
      { label: "Not yet calculated", values: [0, tara.risks.length - valued.length] },
    ],
  };
  const progress: Figure = {
    type: "bars",
    series: [
      { label: "Settled", tone: "done" },
      { label: "Awaiting review", tone: "waiting" },
      { label: "Input needed", tone: "todo" },
    ],
    rows: [...open.tally]
      .filter(([area]) => area !== "Release" && area !== "Evidence")
      .map(([area, counted]) => ({ label: area, values: [counted.done, counted.waiting, counted.todo] })),
  };

  const state: Block[] = [];
  if (c.draft) {
    state.push(
      notice(
        `DRAFT. This assessment is not released. ${open.count} point${open.count === 1 ? " is" : "s are"} open (section ${c.sec("open")}). ` +
          `Risk values whose rating check is not "Reviewed" are provisional. Content as of ${moment(c.options.generatedAt)}.`,
      ),
    );
  } else {
    state.push(
      notice(
        `RELEASED. Revision ${show(meta.revision)} as frozen at release${meta.releasedAt ? ` on ${meta.releasedAt.slice(0, 10)}` : ""}. ` +
          `This copy was generated ${moment(c.options.generatedAt)}.`,
      ),
    );
  }
  if (meta.example)
    state.push(notice("TRAINING EXAMPLE. This document was produced for training and is not an assessment of a product."));

  const approved = tara.risks.filter((r) => checks.riskTreatment.get(r.id)?.code === "treatment.approved").length;
  return {
    title: "Summary",
    blocks: [
      ...state,
      p(
        `This document is the cybersecurity risk assessment (threat analysis and risk assessment, TARA) of ${show(meta.product)}, ` +
          `${c.configuration === NONE ? "whose configuration is not yet identified" : `configuration ${c.configuration}`}. ` +
          "It is the assessment required by Regulation (EU) 2024/2847 (Cyber Resilience Act, CRA), Article 13(2) and 13(3), and forms part of the technical documentation under Article 13(4) and Annex VII point 3. " +
          `The method follows the structure of ISO/SAE 21434 clause 15 and is set out in section ${c.sec("method")}.`,
      ),
      p(
        `Section ${c.sec("cra_reference")} shows where each CRA provision is answered. Sections ${c.sec("items")} to ${c.sec("risks")} give the analysis from the item and its assets to the risk values; ` +
          `sections ${c.sec("treatment")} to ${c.sec("controls")} give the treatment of each risk and the evidence for the controls relied on; ` +
          `section ${c.sec("cra")} gives the decision on every essential requirement of CRA Annex I.`,
      ),
      table(
        "Assessment at a glance",
        [col("Measure"), col("Count", "fit")],
        [
          ["Items", String(tara.items.length)],
          ["Assets", String(tara.assets.length)],
          ["Damage scenarios", String(tara.damages.length)],
          ["Threat scenarios", String(tara.threats.length)],
          ["Attack paths", String(tara.paths.length)],
          ["Risks", String(tara.risks.length)],
          ["Risks with a reviewed rating", String(c.reviewedRiskIds.size)],
          ["Risks with an approved treatment", String(approved)],
          ["Controls", String(tara.controls.length)],
          ["Open points", String(open.count)],
          ["Product release review", checks.releaseReview.message],
        ],
      ),
      ...(tara.risks.length > 0
        ? [
            figure("Risks by risk value (1 lowest, 5 highest)", byValue),
            figure(
              "State of the assessment, by area",
              progress,
              `Settled: the check has its final status. Awaiting review: complete as a draft. Input needed: information is missing or inconsistent. The points are listed in section ${c.sec("open")}.`,
            ),
          ]
        : []),
      table(
        "Highest risks",
        RISK_COLUMNS,
        rankedRisks(c)
          .filter((r) => c.riskScore(r.threatId).value !== null)
          .slice(0, 10)
          .map((r) => riskRow(c, r)),
        { empty: "No risk has a calculated value yet." },
      ),
    ],
  };
}

/** Where the report answers the Cyber Resilience Act: a table from each provision to the sections that answer it. */
export function craReference(c: ReportContext): Body {
  return {
    title: "Where this document answers the CRA",
    answers: "Regulation (EU) 2024/2847",
    blocks: [
      table(
        "CRA cross-reference",
        [col("Provision", 16), col("What it requires"), col("Section", 14)],
        [
          [
            "Art. 13(2)",
            "A cybersecurity risk assessment is carried out and taken into account in all phases of the product",
            `${c.sec("method")}; ${c.sec("damages")} to ${c.sec("treatment")}`,
          ],
          [
            "Art. 13(3)",
            "Analysis based on the intended purpose and reasonably foreseeable use, the conditions of use (operational environment, assets to be protected) and the expected time in use",
            c.sec("scope", "items", "damages"),
          ],
          [
            "Art. 13(3)",
            "Whether and how each requirement of Annex I Part I(2) applies, and how it is implemented as informed by the risk assessment",
            c.sec("cra"),
          ],
          [
            "Art. 13(3)",
            "How Annex I Part I(1) and the vulnerability handling requirements of Part II are applied",
            c.sec("scope", "cra"),
          ],
          ["Art. 13(3)", "The assessment is documented and updated during the support period", c.sec("document_control")],
          [
            "Art. 13(4)",
            "The assessment is included in the technical documentation; a clear justification is given for each requirement that does not apply",
            `this document; ${c.sec("cra")}`,
          ],
          [
            "Annex VII point 3",
            "The assessment of cybersecurity risks, including how the essential requirements are applicable",
            `${c.sec("items")} to ${c.sec("cra")}`,
          ],
          ["Annex VII point 6", "Reports of the tests carried out to verify conformity", c.sec("controls")],
        ],
      ),
    ],
  };
}

/**
 * Document control: what identifies the document, its revision history and the sign-off. A draft also says what
 * it still needs before it can be released, and the IDs that were withdrawn are listed.
 */
export function documentControl(c: ReportContext): Body {
  const { tara } = c;
  const meta = tara.meta;
  const signoffs = signoffStates(tara, c.assessment);
  const needs = releaseNeeds(tara, c.assessment);
  const withdrawn = withdrawnIds(tara);
  const blocks: Block[] = [
    table(
      "Document identification",
      [col("Field", 26), col("Value")],
      [
        ["Title", meta.title],
        ["Product", show(meta.product)],
        ["Organisation", show(meta.organisation)],
        ["Document number", show(meta.documentNumber)],
        ["Revision", show(meta.revision)],
        ["Status", c.draft ? "Draft" : `Released${meta.releasedAt ? ` on ${meta.releasedAt.slice(0, 10)}` : ""}`],
        ["Follows", meta.basedOn ? `Revision ${meta.basedOn.revision}` : NONE],
        ["Reason for this revision", show(meta.revisionReason)],
        ["Configuration ID", c.configuration],
        ["Where the released document is kept", show(meta.storageLocation)],
        ["Distribution", show(meta.distribution)],
        ["Report generated", `${moment(c.options.generatedAt)} by ${c.options.generatedBy}`],
        ...(c.options.madeWith ? [["Made with", c.options.madeWith]] : []),
      ],
    ),
    table(
      "Revision history",
      [col("Version", "fit"), col("Date", "fit"), col("Author", 20), col("Description"), col("Approved by", 18)],
      tara.changeLog.map((entry) => [
        show(entry.version),
        show(entry.date),
        show(entry.author),
        show(entry.description),
        show(entry.approvedBy),
      ]),
    ),
    table(
      "Sign-off",
      [
        col("Role", 12),
        col("Name"),
        col("Function", 22),
        col("Evidence reference", 20),
        col("Signed", "fit"),
        col("Covers the assessment as it stands", 18),
      ],
      signoffs.map((state) => [
        state.role[0]?.toUpperCase() + state.role.slice(1),
        show(state.signoff?.name),
        show(state.signoff?.roleTitle),
        show(state.signoff?.evidenceRef),
        show(state.signoff?.signedAt.slice(0, 10)),
        state.signoff ? (state.current ? "Yes" : "No: signed before the last change") : "Not signed",
      ]),
    ),
  ];
  if (c.draft && needs.length > 0) {
    blocks.push(p("Before this revision can be released:"), { kind: "list", items: needs });
  }
  if (withdrawn.length > 0) {
    blocks.push(
      p(
        `These IDs were given in this TARA and belong to no record any more: ${withdrawn.join(", ")}. An ID is given once; ` +
          "a withdrawn one is not given to another record, so that an ID in an earlier revision, a review or a ticket never points at something else.",
      ),
    );
  }
  return { title: "Document control", answers: "CRA Art. 13(3); ISO/SAE 21434 clauses 5.4.4, 6.4", blocks };
}

/** The scope: every scope field with its decision, evidence and status, then the two reviews and the evidence handed over. */
export function scope(c: ReportContext): Body {
  const { tara, checks } = c;
  return {
    title: "Scope and applicability",
    answers: "CRA Art. 13(3): intended purpose, foreseeable use, conditions of use, expected time in use",
    blocks: [
      table(
        "Scope decisions",
        [col("Field", 22), col("Decision / reference"), col("Evidence", 22), col("Status", 14)],
        SCOPE_FIELD_KEYS.map((key) => [
          SCOPE_LABELS[key],
          c.decisionText(key),
          show(tara.scope[key].evidence),
          checks.scopeFields[key].message,
        ]),
      ),
      table(
        "Scope review and evidence",
        [col("Row", 22), col("Decision / reference"), col("Evidence", 22), col("Status", 16)],
        [
          [
            SCOPE_LABELS.scope_review,
            c.decisionText("scope_review"),
            c.reviewReference("scope", null),
            checks.scopeReview.message,
          ],
          ...EVIDENCE_ROW_KEYS.map((key) => [
            SCOPE_LABELS[key],
            c.decisionText(key),
            show(tara.scope[key].evidence),
            checks.handover[key].message,
          ]),
          [
            SCOPE_LABELS.release_review,
            c.decisionText("release_review"),
            c.reviewReference("release", null),
            checks.releaseReview.message,
          ],
        ],
      ),
    ],
  };
}

/**
 * The scoring method as it is stored with the TARA: how a risk value comes about, where the method comes from,
 * and its criteria, points, bands, risk matrix and treatments.
 */
export function method(c: ReportContext): Body {
  const m = c.method;
  const bandsFromHard = [...m.feasibility_bands].reverse();
  const levelsFromWorst = [...m.impact_levels].sort((a, b) => b.level - a.level);
  return {
    title: "Method",
    answers: "ISO/SAE 21434 clause 15",
    blocks: [
      p(
        "Each damage scenario is rated in four impact categories; its impact is the highest of the four. Each attack path is rated on five attack potential factors; " +
          "the points are added and the total gives the attack feasibility. The risk of a threat scenario combines the highest impact of its damage scenarios with the feasibility of its most feasible included attack path. " +
          `The criteria below${m.source ? ` (${m.source})` : ""} are those in force for this assessment and are stored with it.`,
      ),
      ...(m.sources?.length
        ? [
            table(
              "Where the method comes from",
              [col("Part", 26), col("Source"), col("Terms of use", 24)],
              m.sources.map((s) => [s.part, s.source, s.terms]),
            ),
          ]
        : []),
      ...m.impact_categories.map((category) =>
        table(
          `Impact criteria: ${category.label}`,
          [col("Level", 30), col("Criteria")],
          [...category.ratings].sort((a, b) => b.level - a.level).map((rating) => [rating.label, rating.criteria]),
        ),
      ),
      ...m.feasibility_factors.map((factor) =>
        table(
          `Attack potential: ${factor.label}`,
          [col("Option", 30), col("Points", "fit"), col("Meaning")],
          factor.options.map((option) => [option.label, String(option.points), show(option.description)]),
        ),
      ),
      table(
        "Attack feasibility from total attack potential points",
        [col("Feasibility"), col("Total points"), col("Meaning")],
        m.feasibility_bands.map((band) => [
          band.label,
          band.max === undefined ? `${band.min} or more` : `${band.min} to ${band.max}`,
          show(band.potential),
        ]),
      ),
      table(
        "Risk matrix: risk value from impact and attack feasibility",
        [col("Impact"), ...bandsFromHard.map((band) => col(band.label, 16))],
        levelsFromWorst.map((level) => [
          level.name,
          ...bandsFromHard.map((band) => String(m.risk_matrix[String(level.level)]?.[band.key] ?? NONE)),
        ]),
      ),
      table(
        "Risk treatment options",
        [col("Option", 16), col("Meaning")],
        m.treatments.map((t) => [t.label, t.description]),
      ),
    ],
  };
}
