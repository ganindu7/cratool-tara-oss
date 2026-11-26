// The analysis: from the item and its architecture, through assets, damage, threats and attack paths, to the
// risk values.

import {
  arrangeElements,
  type Element,
  FACTOR_KEYS,
  FIRST_LINE_STYLE,
  IMPACT_CATEGORY_KEYS,
  type Item,
  isBlank,
  type Place,
} from "@tara/core";
import { col, figure, NONE, p, type ReportContext, show, table } from "../context.ts";
import type { Block, Figure, Section } from "../model.ts";
import { networkNodeSize } from "../svg.ts";
import { RISK_COLUMNS, rankedRisks, riskRow, scaleOf } from "./front.ts";

type Body = Omit<Section, "key">;

const THINGS: [kind: Element["kind"], plural: string][] = [
  ["component", "components"],
  ["external_interactor", "external interactors"],
  ["data_store", "data stores"],
];
const SHAPE: Record<string, "process" | "external" | "store"> = {
  component: "process",
  external_interactor: "external",
  data_store: "store",
};

/** The two ends of a data flow and which way it runs, in words. */
function between(flow: Element): string {
  const a = flow.sourceId ?? "open";
  const b = flow.targetId ?? "open";
  if (flow.direction === "forward") return `${a} to ${b}`;
  if (flow.direction === "backward") return `${b} to ${a}`;
  if (flow.direction === "both") return `${a} and ${b}, both ways`;
  return `${a}, ${b} (direction not recorded)`;
}

/** The data flow diagram of an item, drawn from its elements. Nothing, while the item has nothing to draw. */
function flowDiagram(c: ReportContext, item: Item): Block[] {
  const own = c.tara.elements.filter((e) => e.itemId === item.id);
  const nodes = own.filter((e) => e.kind in SHAPE);
  if (nodes.length === 0) return [];
  const flows = own.filter((e) => e.kind === "data_flow");
  const openFlows = flows.filter((f) => f.sourceId === null || f.targetId === null);
  // Every element has a place: the one a person gave it on the diagram, or else one worked out from the records.
  // So the diagram is always drawn, with its boundaries, whether or not anyone arranged it.
  const holds = (elementId: string) => c.tara.assets.filter((a) => a.elementIds.includes(elementId)).map((a) => a.id);
  // An element is as tall as the IDs of what it holds need; the arrangement is worked out for elements of that size.
  const places = arrangeElements(own, (element) => networkNodeSize(holds(element.id)));
  const arranged = nodes.every((e) => e.x !== null && e.y !== null);
  const boundaries = own.filter((e) => e.kind === "trust_boundary" && places.has(e.id));
  const directed = flows.some((f) => f.direction !== null);

  const content: Figure = {
    type: "network",
    lines: c.options.lines ?? FIRST_LINE_STYLE,
    nodes: nodes.map((e) => ({
      id: e.id,
      name: show(e.name),
      shape: SHAPE[e.kind] ?? "process",
      place: places.get(e.id) as Place,
      holds: holds(e.id),
    })),
    links: flows.map((f) => ({ id: f.id, from: f.sourceId, to: f.targetId, arrow: f.direction })),
    frames: boundaries.map((b) => ({ id: b.id, name: show(b.name), ...(places.get(b.id) as Place) })),
  };
  const note =
    `${arranged ? "As arranged on the diagram in the tool" : "Laid out from the lists below"}. A line is a recorded data flow, marked with its ID; ` +
    `${directed ? "an arrowhead shows the direction where it is recorded" : "the direction of a flow is not recorded"}. ` +
    "A rounded box is a component, a box with a heavy edge an external interactor, and a box open at the sides a data store. " +
    (boundaries.length > 0 ? "A dashed frame is a trust boundary. " : "") +
    (nodes.some((e) => holds(e.id).length > 0) ? "The IDs inside an element are the assets that live in it. " : "") +
    (openFlows.length === 0
      ? ""
      : `${openFlows.length === 1 ? "One data flow is" : `${openFlows.length} data flows are`} not drawn because an end is open: ${openFlows.map((f) => f.id).join(", ")}.`);
  return [figure(`Item ${item.id}: data flow diagram`, content, note.trim())];
}

/** The item definition: each item with its data flow diagram and the lists of its elements, data flows and trust boundaries. */
export function items(c: ReportContext): Body {
  const { tara, checks } = c;
  const isEmpty = (item: Item) =>
    [item.name, item.configurationRef, item.boundaryFunctions, item.architectureInterfaces, item.environmentUse].every(isBlank);
  const defined = tara.items.filter((item) => !isEmpty(item));
  const empty = tara.items.filter(isEmpty);

  const blocks: Block[] = [];
  for (const item of defined) {
    const own = tara.elements.filter((e) => e.itemId === item.id);
    const boundaries = own.filter((e) => e.kind === "trust_boundary");
    blocks.push(
      table(
        `Item ${item.id}: ${show(item.name)}`,
        [col("Aspect", 26), col("Definition")],
        [
          ["Configuration reference", show(item.configurationRef)],
          ["Boundary and functions", show(item.boundaryFunctions)],
          ["Architecture and interfaces", show(item.architectureInterfaces)],
          ["Operating environment and use", show(item.environmentUse)],
          ["Check", c.message(checks.items.get(item.id))],
        ],
        { anchor: item.id },
      ),
      ...flowDiagram(c, item),
    );
    for (const [kind, plural] of THINGS) {
      const ofKind = own.filter((e) => e.kind === kind);
      if (ofKind.length === 0) continue;
      // Which boundary an element is inside is said only where the item has boundaries.
      blocks.push(
        boundaries.length > 0
          ? table(
              `Item ${item.id}: ${plural}`,
              [col("ID", "fit"), col("Name", 28), col("Inside", 10), col("Description")],
              ofKind.map((e) => [e.id, show(e.name), e.boundaryId ?? NONE, show(e.description)]),
              { defines: true },
            )
          : table(
              `Item ${item.id}: ${plural}`,
              [col("ID", "fit"), col("Name", 30), col("Description")],
              ofKind.map((e) => [e.id, show(e.name), show(e.description)]),
              { defines: true },
            ),
      );
    }
    const flows = own.filter((e) => e.kind === "data_flow");
    if (flows.length > 0) {
      blocks.push(
        table(
          `Item ${item.id}: data flows`,
          [col("ID", "fit"), col("Data flow", 26), col("Between, and direction", 22), col("What is carried")],
          flows.map((f) => [f.id, show(f.name), between(f), show(f.description)]),
          { defines: true },
        ),
      );
    }
    if (boundaries.length > 0) {
      blocks.push(
        table(
          `Item ${item.id}: trust boundaries`,
          [col("ID", "fit"), col("Boundary", 24), col("Contains", 22), col("Description")],
          boundaries.map((b) => [
            b.id,
            show(b.name),
            c.ids(own.filter((e) => e.boundaryId === b.id).map((e) => e.id)),
            show(b.description),
          ]),
          { defines: true },
        ),
      );
    }
  }
  if (empty.length > 0) {
    blocks.push(
      p(
        `${empty.length === 1 ? "Item" : "Items"} ${c.ids(empty.map((i) => i.id))} ${empty.length === 1 ? "has" : "have"} an ID and no definition yet.`,
      ),
    );
  }
  return {
    title: "Item definition",
    answers: "ISO/SAE 21434 clause 9.3, work product WP-09-01; CRA Art. 13(3): conditions of use",
    blocks: tara.items.length === 0 ? [p("No item is defined yet.")] : blocks,
  };
}

/** The assets, and the damage scenarios with the security property each loses. */
export function damages(c: ReportContext): Body {
  const { tara, checks, scores } = c;
  return {
    title: "Assets and damage scenarios",
    answers: "ISO/SAE 21434 clause 15.3, work products WP-15-01, WP-15-02; CRA Art. 13(3): assets to be protected",
    blocks: [
      table(
        "Assets",
        [
          col("ID", "fit"),
          col("Asset"),
          col("Item", "fit"),
          col("Lives in", 14),
          col("Variant", 12),
          col("Damage scenarios", 20),
          col("Check", 16),
        ],
        tara.assets.map((asset) => [
          asset.id,
          show(asset.name),
          asset.itemId ?? NONE,
          c.ids(asset.elementIds),
          show(asset.variant),
          c.ids(tara.damages.filter((d) => d.assetId === asset.id).map((d) => d.id)) +
            (asset.coverageRationale ? ` (${asset.coverageRationale})` : ""),
          c.message(checks.assets.get(asset.id)),
        ]),
        { defines: true },
      ),
      table(
        "Damage scenarios",
        [col("ID", "fit"), col("Asset", 20), col("Property lost", 10), col("Damage scenario"), col("Check", 16)],
        tara.damages.map((damage) => [
          damage.id,
          damage.assetId ? `${damage.assetId} ${show(tara.assets.find((a) => a.id === damage.assetId)?.name)}` : NONE,
          show(scores.damages.get(damage.id)?.ciaLabel),
          show(damage.description),
          c.message(checks.damages.get(damage.id)),
        ]),
        { defines: true },
      ),
      p("Property lost: C confidentiality, I integrity, A availability."),
    ],
  };
}

/** The impact of each damage scenario: its level in each category, the overall level, and the rationale. */
export function impact(c: ReportContext): Body {
  const { tara, scores, method } = c;
  return {
    title: "Impact ratings",
    answers: "ISO/SAE 21434 clause 15.5, work product WP-15-04",
    blocks: [
      table(
        "Impact rating of each damage scenario",
        [
          col("ID", "fit"),
          // in the order the ratings are given below, whatever the order the method lists its categories in
          ...IMPACT_CATEGORY_KEYS.map((key) =>
            col(method.impact_categories.find((category) => category.key === key)?.label ?? key, 11),
          ),
          col("Overall", 11),
          col("Rationale"),
        ],
        tara.damages.map((damage) => [
          damage.id,
          ...IMPACT_CATEGORY_KEYS.map((key) => c.levelName(damage.ratings[key])),
          c.levelName(scores.damages.get(damage.id)?.score),
          show(damage.impactRationale),
        ]),
      ),
    ],
  };
}

/** The threat scenarios, each with its category, its damage scenarios and the highest impact among them. */
export function threats(c: ReportContext): Body {
  const { tara, checks } = c;
  return {
    title: "Threat scenarios",
    answers: "ISO/SAE 21434 clause 15.4, work product WP-15-03",
    blocks: [
      table(
        "Threat scenarios",
        [
          col("ID", "fit"),
          col("Category", 14),
          col("Threat scenario"),
          col("Damage scenarios", 16),
          col("Highest impact", 14),
          col("Check", 16),
        ],
        tara.threats.map((threat) => [
          threat.id,
          c.categoryName(threat.category),
          show(threat.description),
          c.ids(threat.damageIds),
          c.riskImpact(threat.id),
          c.message(checks.threats.get(threat.id)),
        ]),
        { defines: true },
      ),
    ],
  };
}

/** The attack paths, each with its route and the reason for its rating or for screening it out. */
export function paths(c: ReportContext): Body {
  const { tara, checks } = c;
  return {
    title: "Attack paths",
    answers: "ISO/SAE 21434 clause 15.6, work product WP-15-05",
    blocks: [
      table(
        "Attack paths",
        [col("ID", "fit"), col("Threats", 10), col("Attack path"), col("Feasibility or exclusion rationale"), col("Status", 14)],
        tara.paths.map((path) => [
          path.id,
          c.ids(path.threatIds),
          [show(path.description), path.elementIds.length > 0 ? `Route, from the entry point: ${c.ids(path.elementIds)}` : null]
            .filter(Boolean)
            .join("\n"),
          show(path.feasibilityBasis),
          c.message(checks.paths.get(path.id)),
        ]),
        { defines: true },
      ),
      p(
        'A path with status "Screened out" was assessed and excluded for the recorded reason; it does not contribute to a risk value.',
      ),
    ],
  };
}

/** The attack feasibility of each path that is not screened out: the option chosen for each factor, the total and the rating. */
export function feasibility(c: ReportContext): Body {
  const { tara, scores, method } = c;
  return {
    title: "Attack feasibility ratings",
    answers: "ISO/SAE 21434 clause 15.7, work product WP-15-06",
    blocks: [
      table(
        "Attack potential of each path that is not screened out",
        [
          col("ID", "fit"),
          ...FACTOR_KEYS.map((key) => col(method.feasibility_factors.find((factor) => factor.key === key)?.label ?? key)),
          col("Total", "fit"),
          col("Feasibility", 12),
        ],
        tara.paths
          .filter((path) => path.disposition !== "screened_out")
          .map((path) => {
            const score = scores.paths.get(path.id);
            return [
              path.id,
              ...FACTOR_KEYS.map((key) => {
                const option = method.feasibility_factors
                  .find((f) => f.key === key)
                  ?.options.find((o) => o.key === path.factors[key]);
                return option ? `${option.label} (${option.points})` : NONE;
              }),
              show(score?.totalPoints),
              c.feasibilityName(score?.feasibility),
            ];
          }),
      ),
    ],
  };
}

/**
 * The risk values: the risk of each threat scenario with the attack paths that decide it, the risk matrix with
 * the risks that fall in each cell, and the risks ranked by value.
 */
export function risks(c: ReportContext): Body {
  const { tara, checks, scores, method } = c;
  const bandsFromHard = [...method.feasibility_bands].reverse();
  const levelsFromWorst = [...method.impact_levels].sort((a, b) => b.level - a.level);
  const valued = tara.risks.filter((r) => c.riskScore(r.threatId).value !== null);
  const provisional = valued.some((r) => !c.reviewedRiskIds.has(r.id));
  const heatMap: Figure = {
    type: "matrix",
    rowTitle: "Impact",
    columnTitle: "Attack feasibility",
    scaleTitle: "Risk value",
    scale: scaleOf(c),
    rows: levelsFromWorst.map((level) => level.name),
    columns: bandsFromHard.map((band) => band.label),
    cells: levelsFromWorst.map((level) =>
      bandsFromHard.map((band) => ({
        value: method.risk_matrix[String(level.level)]?.[band.key] ?? null,
        entries: valued
          .filter((r) => {
            const score = c.riskScore(r.threatId);
            return "level" in score.impact && score.impact.level === level.level && score.feasibility === band.key;
          })
          .map((r) => r.id + (c.reviewedRiskIds.has(r.id) ? "" : "*")),
      })),
    ),
  };
  return {
    title: "Risk values",
    answers: "ISO/SAE 21434 clause 15.8, work product WP-15-07",
    blocks: [
      table(
        "Risk of each threat scenario",
        [
          col("Risk", "fit"),
          col("Threat", "fit"),
          col("Impact", 14),
          col("Lowest attack potential", 16),
          col("Governing paths"),
          col("Feasibility", 12),
          col("Value", "fit"),
          col("Rating check", 20),
        ],
        tara.risks.map((risk) => {
          const score = c.riskScore(risk.threatId);
          const lowest = "points" in score.minAttackPotential ? score.minAttackPotential.points : null;
          return [
            risk.id,
            risk.threatId,
            c.riskImpact(risk.threatId),
            c.riskPoints(risk.threatId),
            c.ids(score.includedPathIds.filter((pathId) => scores.paths.get(pathId)?.totalPoints === lowest)),
            c.feasibilityName(score.feasibility),
            show(score.value),
            c.message(checks.riskRating.get(risk.id)),
          ];
        }),
        { defines: true },
      ),
      figure(
        "Risks by impact and attack feasibility",
        heatMap,
        "Each cell shows the risk value the method gives for that impact and feasibility, and the risks that fall in it." +
          (provisional ? " An asterisk marks a risk whose rating is not yet reviewed; its place is provisional." : ""),
      ),
      table(
        "Risks ranked by value",
        RISK_COLUMNS,
        rankedRisks(c).map((risk) => riskRow(c, risk)),
      ),
    ],
  };
}
