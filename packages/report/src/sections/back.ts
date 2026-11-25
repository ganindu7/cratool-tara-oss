// The back of the report: what is still open, the documents it relies on, and the trace of every risk
// from the assets it threatens to the way it is treated.

import { ACTION_GROUPS, actionPlan, coverage, type Risk } from "@tara/core";
import { col, figure, p, type ReportContext, show, table } from "../context.ts";
import type { Block, ChainNode, Figure, Section } from "../model.ts";

type Body = Omit<Section, "key">;

/** Where on the architecture a risk lands and no control acts: said once, as a point to look at, not as a failed check. */
function gapNote(c: ReportContext): string | null {
  const { tara } = c;
  const placed = tara.assets.some((a) => a.elementIds.length > 0) || tara.paths.some((path) => path.elementIds.length > 0);
  if (!placed) return null;
  const values = new Map(tara.threats.map((t) => [t.id, c.riskScore(t.id).value]));
  const gaps = coverage(tara, values).filter((entry) => entry.state === "gap");
  if (gaps.length === 0) return null;
  const named = gaps
    .map(
      (gap) =>
        `${gap.elementId} (${gap.risks
          .filter((r) => r.asks)
          .map((r) => r.riskId)
          .join(", ")})`,
    )
    .join("; ");
  return (
    `On the architecture, ${gaps.length === 1 ? "one element is" : `${gaps.length} elements are`} reached by a risk that is to be reduced while no control is placed there ` +
    `(in it, on a data flow that ends at it, or at the boundary around it) or earlier on the route of the attack: ${named}. ` +
    "This is not a failed check. A control may protect an element without having a place on the diagram, as a procedure does; where that is so, the control's description should say it."
  );
}

export function open(c: ReportContext): Body {
  const actions = actionPlan(c.tara, c.assessment);
  const groupOf = (kind: string) => ACTION_GROUPS.find((group) => (group.kinds as string[]).includes(kind))?.title ?? "";
  const gaps = gapNote(c);
  const blocks: Block[] = [
    p(
      c.open.rows.length === 0
        ? "No points are open: every check of the assessment has its final status."
        : '"Input needed" means information is missing or inconsistent. "Awaiting review" means the work is complete as a draft and waits for a review or approval reference.',
    ),
  ];
  if (c.open.rows.length > 0)
    blocks.push(table("Open points", [col("Area", 16), col("Records"), col("Status"), col("Kind", 14)], c.open.rows));
  if (gaps) blocks.push(p(gaps));
  if (actions.length > 0) {
    blocks.push(
      p(
        "The assessment also names work that follows from it: controls still to be built, put into service or verified, and decisions still to be taken. " +
          "The list is made from the assessment as it stands. A check can be settled while such work is outstanding: a proposed control is a plan, and counts for nothing until it is in the product and verified.",
      ),
      table(
        "Work that follows from the assessment",
        [col("Action", "fit"), col("Priority", "fit"), col("What"), col("Risks", 12), col("Done when"), col("Group", 18)],
        actions.map((action) => [
          action.id,
          String(action.priority),
          action.title,
          c.ids(action.riskIds),
          action.doneWhen,
          groupOf(action.kind),
        ]),
      ),
    );
  }
  return { title: c.draft ? "Open points at the time of export" : "Open points", blocks };
}

export function references(c: ReportContext): Body {
  const { tara } = c;
  return {
    title: "References",
    blocks: [
      p(
        "Each document is described once, here. Evidence and review fields in the other sections cite it by its ID. The revision says which edition of a document is meant.",
      ),
      table(
        "Referenced documents",
        [col("ID", "fit"), col("Title"), col("Revision", 12), col("Date", "fit"), col("Location", 28)],
        tara.references.map((reference) => [
          reference.id,
          show(reference.title),
          show(reference.revision),
          show(reference.date),
          show(reference.location),
        ]),
        { defines: true },
      ),
      table(
        "Standards and regulations",
        [col("Reference", 32), col("Use in this assessment")],
        [
          [
            "Regulation (EU) 2024/2847 (Cyber Resilience Act)",
            `Legal basis. Applicability: ${c.decisionText("cra_applicability")}.`,
          ],
          [
            "ISO/SAE 21434:2021",
            `The structure of the method (clauses 9 and 15). Applicability: ${c.decisionText("iso21434_applicability")}.`,
          ],
          [
            "UN Regulation No. 155",
            `Best practice for vehicle cybersecurity. Applicability: ${c.decisionText("r155_applicability")}.`,
          ],
        ],
      ),
    ],
  };
}

/** The trace of one risk, from the assets affected to its treatment. */
function traceOf(c: ReportContext, risk: Risk): Figure {
  const { tara, scores } = c;
  const threat = tara.threats.find((t) => t.id === risk.threatId);
  const score = c.riskScore(risk.threatId);
  const damages = (threat?.damageIds ?? []).map((id) => tara.damages.find((d) => d.id === id)).filter((d) => d !== undefined);
  const assets = tara.assets.filter((asset) => damages.some((d) => d.assetId === asset.id));
  damages.sort((a, b) => assets.findIndex((x) => x.id === a.assetId) - assets.findIndex((x) => x.id === b.assetId));
  const paths = score.linkedPathIds.map((id) => tara.paths.find((path) => path.id === id)).filter((path) => path !== undefined);
  const controls = [
    ...risk.existingControlIds.map((id) => [id, "Existing"] as const),
    ...risk.proposedControlIds.map((id) => [id, "Proposed"] as const),
  ];
  const goals = tara.goalClaims.filter((g) => g.riskIds.includes(risk.id));
  /** A column with nothing in it says so, in place of an empty space. */
  const orNothing = (nodes: ChainNode[], key: string, text: string): ChainNode[] =>
    nodes.length > 0 ? nodes : [{ id: `${key}:${risk.id}`, label: "", text, tone: "none" }];

  const pathNodes = orNothing(
    paths.map((path): ChainNode => {
      const pathScore = scores.paths.get(path.id);
      const out = path.disposition === "screened_out";
      const rating = out
        ? "Screened out"
        : pathScore?.totalPoints == null
          ? "Not rated"
          : `${c.feasibilityName(pathScore.feasibility)}, ${pathScore.totalPoints} ${pathScore.totalPoints === 1 ? "point" : "points"}`;
      return {
        id: path.id,
        label: path.id,
        text: `${rating}. ${show(path.description)}`,
        ...(out ? { tone: "muted" as const } : {}),
      };
    }),
    "paths",
    "No attack path yet",
  );
  const threatNode: ChainNode = { id: risk.threatId, label: risk.threatId, text: show(threat?.description) };
  const riskText =
    `${score.value === null ? "No value yet" : `Value ${score.value}`}. Impact ${c.riskImpact(risk.threatId)}, feasibility ${c.feasibilityName(score.feasibility)}. ` +
    `${risk.treatment ? c.treatmentName(risk.treatment) : "No treatment yet"}.`;
  return {
    type: "chain",
    columns: [
      {
        title: "Assets",
        nodes: orNothing(
          assets.map((a) => ({ id: a.id, label: a.id, text: show(a.name) })),
          "assets",
          "No asset linked",
        ),
      },
      {
        title: "Damage scenarios",
        nodes: orNothing(
          damages.map((d) => ({
            id: d.id,
            label: d.id,
            text: `${c.levelName(scores.damages.get(d.id)?.score)}. ${show(d.description)}`,
          })),
          "damages",
          "No damage scenario linked",
        ),
      },
      { title: "Threat scenario", nodes: [threatNode] },
      { title: "Attack paths", nodes: pathNodes },
      { title: "Risk", nodes: [{ id: risk.id, label: risk.id, tone: "accent", text: riskText }] },
      {
        title: "Controls, goals, claims",
        nodes: orNothing(
          [
            ...controls.map(
              ([id, state]): ChainNode => ({
                id,
                label: id,
                text: `${state} control. ${show(tara.controls.find((x) => x.id === id)?.name)}`,
              }),
            ),
            ...goals.map(
              (g): ChainNode => ({
                id: g.id,
                label: g.id,
                text: `${g.kind === "goal" ? "Goal" : "Claim"}. ${show(g.statement)}`,
              }),
            ),
          ],
          "treatment",
          "None recorded yet",
        ),
      },
    ],
    links: [
      ...damages.filter((d) => d.assetId).map((d): [string, string] => [d.assetId as string, d.id]),
      ...damages.map((d): [string, string] => [d.id, risk.threatId]),
      ...pathNodes.map((node): [string, string] => [risk.threatId, node.id]),
      ...pathNodes.filter((node) => node.tone !== "muted").map((node): [string, string] => [node.id, risk.id]),
      ...controls.map(([id]): [string, string] => [risk.id, id]),
      ...goals.map((g): [string, string] => [risk.id, g.id]),
    ],
  };
}

export function trace(c: ReportContext): Body {
  const { tara, checks } = c;
  return {
    title: "Traceability",
    answers: "ISO/SAE 21434 work product WP-09-02",
    blocks: [
      p(
        "One diagram per risk shows what the risk rests on and how it is treated: the assets and damage scenarios behind the threat scenario, its attack paths, and the controls, goals and claims. " +
          "A path drawn in grey was screened out and does not count towards the risk. The table after the diagrams gives the same links, one row per risk, with the verified evidence.",
      ),
      ...tara.risks.map((risk) => figure(`Trace of risk ${risk.id}`, traceOf(c, risk))),
      table(
        "Traceability from asset to goal or claim",
        [
          col("Risk", "fit"),
          col("Assets"),
          col("Damage scenarios"),
          col("Threat", "fit"),
          col("Attack paths"),
          col("Controls"),
          col("Verified evidence"),
          col("Goals / claims"),
        ],
        tara.risks.map((risk) => {
          const threat = tara.threats.find((t) => t.id === risk.threatId);
          const damageIds = threat?.damageIds ?? [];
          const assetIds = [
            ...new Set(damageIds.map((id) => tara.damages.find((d) => d.id === id)?.assetId).filter((id): id is string => !!id)),
          ];
          const verified = tara.evidence.filter(
            (e) => e.riskId === risk.id && checks.evidence.get(e.id)?.code === "evidence.verified",
          );
          return [
            risk.id,
            c.ids(assetIds),
            c.ids(damageIds),
            risk.threatId,
            c.ids(c.riskScore(risk.threatId).linkedPathIds),
            c.ids([...risk.existingControlIds, ...risk.proposedControlIds]),
            c.ids(verified.map((e) => e.id)),
            c.ids(tara.goalClaims.filter((g) => g.riskIds.includes(risk.id)).map((g) => g.id)),
          ];
        }),
      ),
    ],
  };
}
