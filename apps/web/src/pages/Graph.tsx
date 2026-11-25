// Every record of the assessment and how they are linked, in the order of the method: from what is worth
// protecting, through what could happen to it and how, to what is done about it.
//
// Choosing a record shows its chain: everything that leads to it and everything that follows from it.
// The graph is drawn from the links in the records; it stores nothing.

import { controlState, type Status } from "@tara/core";
import { useMemo } from "react";
import type { Ctx } from "../steps.tsx";
import { describe, hrefOf, StateChip, StatusMark, ValueChip } from "../ui/marks.tsx";

interface GraphNode {
  id: string;
  column: number;
  text: string;
  status: Status | undefined;
  /** For a risk: its value. */
  value?: number | null;
}
interface GraphEdge {
  from: string;
  to: string;
  /** A link that is only planned: a proposed control. */
  dashed?: boolean;
}

const COLUMNS = ["Assets", "Damage scenarios", "Threat scenarios", "Attack paths", "Risks", "Controls", "Goals and claims"];
const NODE = { w: 164, h: 58, gapX: 44, gapY: 12, top: 40 };

/** The records as nodes in columns, and their links as edges from left to right. */
function build(ctx: Ctx): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { tara, assessment } = ctx;
  const { checks } = assessment;
  const nodes: GraphNode[] = [
    ...tara.assets.map((r) => ({ id: r.id, column: 0, text: r.name ?? "", status: checks.assets.get(r.id) })),
    ...tara.damages.map((r) => ({ id: r.id, column: 1, text: r.description ?? "", status: checks.damages.get(r.id) })),
    ...tara.threats.map((r) => ({ id: r.id, column: 2, text: r.description ?? "", status: checks.threats.get(r.id) })),
    ...tara.paths.map((r) => ({ id: r.id, column: 3, text: r.description ?? "", status: checks.paths.get(r.id) })),
    ...tara.risks.map((r) => ({
      id: r.id,
      column: 4,
      text: tara.method.treatments.find((t) => t.key === r.treatment)?.label ?? "No treatment yet",
      status: checks.riskTreatment.get(r.id),
      value: checks.scores.risks.get(r.threatId)?.value ?? null,
    })),
    ...tara.controls.map((r) => ({ id: r.id, column: 5, text: r.name ?? "", status: checks.controls.get(r.id) })),
    ...tara.goalClaims.map((r) => ({ id: r.id, column: 6, text: r.statement ?? "", status: checks.goalClaims.get(r.id) })),
  ];
  const riskOfThreat = new Map(tara.risks.map((r) => [r.threatId, r.id]));
  const edges: GraphEdge[] = [
    ...tara.damages.filter((d) => d.assetId).map((d) => ({ from: d.assetId as string, to: d.id })),
    ...tara.threats.flatMap((t) => t.damageIds.map((d) => ({ from: d, to: t.id }))),
    ...tara.paths.flatMap((p) => p.threatIds.map((t) => ({ from: t, to: p.id }))),
    // A risk follows from its threat by way of the attack paths; a threat without a path leads to it directly.
    ...tara.paths.flatMap((p) => p.threatIds.map((t) => ({ from: p.id, to: riskOfThreat.get(t) ?? "" }))),
    ...tara.threats
      .filter((t) => !tara.paths.some((p) => p.threatIds.includes(t.id)))
      .map((t) => ({ from: t.id, to: riskOfThreat.get(t.id) ?? "" })),
    ...tara.risks.flatMap((r) => [
      ...r.existingControlIds.map((c) => ({ from: r.id, to: c })),
      ...r.proposedControlIds.map((c) => ({ from: r.id, to: c, dashed: true })),
    ]),
    ...tara.goalClaims.flatMap((g) => g.riskIds.map((r) => ({ from: r, to: g.id }))),
  ].filter((e) => e.to !== "");
  return { nodes, edges };
}

/**
 * Where each node goes. Within a column the nodes are ordered by where their neighbours in the column
 * before them sit, so that linked records end up near each other and fewer lines cross.
 */
function arrange(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const row = new Map<string, number>();
  for (let column = 0; column < COLUMNS.length; column++) {
    const inColumn = nodes.filter((n) => n.column === column);
    const weight = (node: GraphNode, index: number) => {
      const before = edges.filter((e) => e.to === node.id && row.has(e.from)).map((e) => row.get(e.from) as number);
      return before.length > 0 ? before.reduce((sum, r) => sum + r, 0) / before.length : index;
    };
    inColumn
      .map((node, index) => ({ node, weight: weight(node, index) }))
      .sort((a, b) => a.weight - b.weight)
      .forEach(({ node }, index) => {
        row.set(node.id, index);
      });
  }
  return new Map(
    nodes.map((n) => [n.id, { x: n.column * (NODE.w + NODE.gapX), y: NODE.top + (row.get(n.id) ?? 0) * (NODE.h + NODE.gapY) }]),
  );
}

/** Everything that leads to a record and everything that follows from it. */
function chainOf(id: string, edges: GraphEdge[]): Set<string> {
  /** Follows the links from the record in one direction until nothing new is reached. */
  const follow = (direction: "forward" | "backward"): Set<string> => {
    const reached = new Set([id]);
    const queue = [id];
    while (queue.length > 0) {
      const at = queue.pop() as string;
      for (const edge of edges) {
        const next = direction === "forward" ? (edge.from === at ? edge.to : null) : edge.to === at ? edge.from : null;
        if (next !== null && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    return reached;
  };
  return new Set([...follow("forward"), ...follow("backward")]);
}

interface Props {
  ctx: Ctx;
  intro: string;
  /** The record whose chain is shown. It is part of the address, so a chain can be linked to. */
  chosen: string | null;
  onChoose: (id: string | null) => void;
}

export function Graph({ ctx, intro, chosen, onChoose: setChosen }: Props) {
  const { tara } = ctx;
  const { nodes, edges } = useMemo(() => build(ctx), [ctx]);
  const places = useMemo(() => arrange(nodes, edges), [nodes, edges]);
  const chain = useMemo(() => (chosen ? chainOf(chosen, edges) : null), [chosen, edges]);

  const width = COLUMNS.length * (NODE.w + NODE.gapX) - NODE.gapX;
  const height =
    NODE.top + Math.max(1, ...COLUMNS.map((_, column) => nodes.filter((n) => n.column === column).length)) * (NODE.h + NODE.gapY);
  const chosenNode = nodes.find((n) => n.id === chosen);

  return (
    <div className="step">
      <div className="step-main">
        <header className="step-head">
          <div>
            <h1>Graph</h1>
            <p className="lede">{intro}</p>
          </div>
        </header>
        {nodes.length === 0 ? (
          <p className="empty">Nothing to draw yet. The graph fills as assets, damage scenarios and threats are added.</p>
        ) : (
          <div className="graph-scroll">
            <div className={chain ? "graph focused" : "graph"} style={{ width, height }}>
              <svg className="graph-edges" width={width} height={height} aria-hidden="true">
                {edges.map((edge) => {
                  const from = places.get(edge.from);
                  const to = places.get(edge.to);
                  if (!from || !to) return null;
                  const x1 = from.x + NODE.w;
                  const y1 = from.y + NODE.h / 2;
                  const y2 = to.y + NODE.h / 2;
                  const bend = (to.x - x1) / 2;
                  const lit = chain?.has(edge.from) && chain.has(edge.to);
                  return (
                    <path
                      key={`${edge.from}>${edge.to}`}
                      className={[lit ? "lit" : "", edge.dashed ? "dashed" : ""].join(" ")}
                      d={`M${x1},${y1} C${x1 + bend},${y1} ${to.x - bend},${y2} ${to.x},${y2}`}
                    />
                  );
                })}
              </svg>
              {COLUMNS.map((title, column) => (
                <h2 key={title} className="graph-column" style={{ left: column * (NODE.w + NODE.gapX), width: NODE.w }}>
                  {title}
                </h2>
              ))}
              {nodes.map((node) => {
                const at = places.get(node.id) ?? { x: 0, y: 0 };
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={[
                      "graph-node",
                      `row-${node.status?.kind ?? "done"}`,
                      chain?.has(node.id) ? "lit" : "",
                      node.id === chosen ? "chosen" : "",
                    ].join(" ")}
                    style={{ left: at.x, top: at.y, width: NODE.w, height: NODE.h }}
                    title={describe(tara, node.id)}
                    onClick={() => setChosen(node.id === chosen ? null : node.id)}
                  >
                    <span className="graph-node-head">
                      <span className="id">{node.id}</span>
                      {node.column === 4 && <ValueChip value={node.value} />}
                      {node.column === 5 && <StateChip state={controlState(tara, node.id)} />}
                    </span>
                    <span className="graph-node-text">{node.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {chosenNode && (
          <aside className="graph-card">
            <p>
              <span className="panel-id">{chosenNode.id}</span> <StatusMark status={chosenNode.status} />
            </p>
            <p>{describe(tara, chosenNode.id)}</p>
            <p className="row">
              <a className="button" href={hrefOf(tara, chosenNode.id) ?? "#"}>
                Open {chosenNode.id}
              </a>
              <button type="button" className="link" onClick={() => setChosen(null)}>
                Show everything
              </button>
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
