// The architecture of an item as a drawing: its elements where the person placed them, the data flows
// between them, and the trust boundaries around them. The same records as the list, shown another way.
//
// The drawing stores nothing of its own. Moving an element changes its x and y; joining two elements adds a
// data flow record; dropping an element into a boundary sets its boundary. All of it goes through the same
// changes as everything else, so it is in the history and can be undone.
//
// On top of the drawing, one thing at a time can be laid over it: where the assets live, where the controls
// act, where a risk lands that no control meets (the gaps), or the route of one attack path.

import {
  arrangeElements,
  type Change,
  type Coverage,
  coverage,
  cutText,
  ELEMENT_SIZE,
  type Element,
  type Tara,
} from "@tara/core";
import {
  Background,
  type Connection,
  ConnectionMode,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  NodeResizer,
  Position,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import type { Ctx } from "../steps.tsx";
import type { OpenTara } from "../useTara.ts";

const SIZE = ELEMENT_SIZE;
/** The size a trust boundary is given when it is added. */
const BOUNDARY = { w: 320, h: 240 };
/** What can be laid over the drawing. An attack path is named by its ID. */
type Overlay = "none" | "assets" | "controls" | "gaps" | string;

interface ElementData extends Record<string, unknown> {
  element: Element;
  /** Small notes under the name: asset IDs, control IDs, or the gap's state. */
  notes: string[];
  /** A tone for the whole node: the gap view's state, or "on" for a step of the shown attack path. */
  tone: string | null;
  /** The position of the element on the shown attack path, counted from 1. */
  step: number | null;
  onResized: (id: string, box: { x: number; y: number; width: number; height: number }) => void;
}
type ElementNode = Node<ElementData>;

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/** A component, an outside party or a data store, in the shape a data flow diagram gives it. */
function ElementShape({ data, selected }: NodeProps<ElementNode>) {
  const { element, notes, tone, step } = data;
  return (
    <div className={`dfd dfd-${element.kind}${selected ? " selected" : ""}${tone ? ` tone-${tone}` : ""}`}>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} />
      ))}
      {step !== null && <span className="dfd-step">{step}</span>}
      <span className="dfd-id">{element.id}</span>
      <span className="dfd-name">{element.name ?? "Unnamed"}</span>
      {notes.length > 0 && <span className="dfd-notes">{notes.join(", ")}</span>}
    </div>
  );
}

/** A trust boundary: a dashed frame that elements sit in, and that can be made larger. */
function BoundaryShape({ id, data, selected }: NodeProps<ElementNode>) {
  return (
    <div className={`dfd-boundary${selected ? " selected" : ""}${data.tone ? ` tone-${data.tone}` : ""}`}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} onResizeEnd={(_event, box) => data.onResized(id, box)} />
      <span className="dfd-boundary-label">
        {data.element.id} {data.element.name ?? "Trust boundary"}
        {data.notes.length > 0 && <span className="dfd-notes"> {data.notes.join(", ")}</span>}
      </span>
    </div>
  );
}

const NODE_TYPES = { element: ElementShape, boundary: BoundaryShape };

/** The side of a box that faces another box: flows leave and arrive where the two are nearest. */
function facing(from: { x: number; y: number }, to: { x: number; y: number }): [Position, Position] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? [Position.Right, Position.Left] : [Position.Left, Position.Right];
  return dy >= 0 ? [Position.Bottom, Position.Top] : [Position.Top, Position.Bottom];
}

const GAP_WORDS: Record<Coverage["state"], string> = {
  gap: "Gap",
  planned: "Only proposed controls",
  before: "Met earlier on the route",
  covered: "Covered",
  accepted: "Accepted",
};

interface Props {
  ctx: Ctx;
  open: OpenTara;
  itemId: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** What is laid over the drawing. It is part of the address, so a view of the gaps can be linked to. */
  overlay: Overlay;
  onOverlay: (overlay: Overlay) => void;
}

export function Diagram({ ctx, open, itemId, selected, onSelect, overlay, onOverlay }: Props) {
  const { tara, assessment } = ctx;
  const frozen = tara.meta.status === "released";
  const elements = useMemo(() => tara.elements.filter((e) => e.itemId === itemId), [tara, itemId]);
  const dragging = useRef(false);

  // What the overlay says about each element.
  const laidOver = useMemo(() => overlayNotes(tara, assessment.checks.scores.risks, overlay), [tara, assessment, overlay]);

  const derived = useMemo((): ElementNode[] => {
    // Where each element is drawn: where it was placed, or else where the records put it (rules/arrange.ts).
    const absolute = arrangeElements(elements);
    const onResized: ElementData["onResized"] = (id, box) => {
      void open.send({
        op: "set",
        kind: "elements",
        id,
        values: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      });
    };
    const data = (element: Element): ElementData => ({
      element,
      notes: laidOver.notes.get(element.id) ?? [],
      tone: laidOver.tones.get(element.id) ?? null,
      step: laidOver.steps.get(element.id) ?? null,
      onResized,
    });
    // Boundaries come first: a node must be listed after the node that contains it.
    const boundaries = elements
      .filter((e) => e.kind === "trust_boundary")
      .map(
        (e): ElementNode => ({
          id: e.id,
          type: "boundary",
          position: absolute.get(e.id) ?? { x: 0, y: 0 },
          width: absolute.get(e.id)?.w ?? BOUNDARY.w,
          height: absolute.get(e.id)?.h ?? BOUNDARY.h,
          zIndex: -1,
          selected: e.id === selected,
          data: data(e),
        }),
      );
    const things = elements
      .filter((e) => e.kind !== "trust_boundary" && e.kind !== "data_flow")
      .map((e): ElementNode => {
        const own = absolute.get(e.id) ?? { x: 0, y: 0 };
        const parent = e.boundaryId ? absolute.get(e.boundaryId) : undefined;
        return {
          id: e.id,
          type: "element",
          // Inside a boundary a node's position is counted from the boundary's corner, so that it moves with it.
          position: parent ? { x: own.x - parent.x, y: own.y - parent.y } : own,
          ...(parent && e.boundaryId ? { parentId: e.boundaryId } : {}),
          width: SIZE.w,
          height: SIZE.h,
          selected: e.id === selected,
          data: data(e),
        };
      });
    return [...boundaries, ...things];
  }, [elements, selected, laidOver, open]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ElementNode>(derived);
  useEffect(() => {
    // The stored arrangement is shown, except while the person is dragging something.
    if (!dragging.current) setNodes(derived);
  }, [derived, setNodes]);

  const edges = useMemo((): Edge[] => {
    const centre = arrangeElements(elements);
    return elements
      .filter((e) => e.kind === "data_flow" && e.sourceId && e.targetId)
      .map((flow) => {
        const [from, to] = flow.direction === "backward" ? [flow.targetId, flow.sourceId] : [flow.sourceId, flow.targetId];
        const [out, into] = facing(centre.get(from as string) ?? { x: 0, y: 0 }, centre.get(to as string) ?? { x: 0, y: 0 });
        const tone = laidOver.tones.get(flow.id);
        // The arrowhead takes the colour of its line: ink, or the accent on the shown attack path.
        const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: tone === "route" ? "#1d5d8c" : "#17212b" };
        const step = laidOver.steps.get(flow.id);
        return {
          id: flow.id,
          source: from as string,
          target: to as string,
          sourceHandle: out,
          targetHandle: into,
          label: `${step ? `(${step}) ` : ""}${flow.id} ${flow.name ?? ""}`.trim(),
          markerEnd: arrow,
          ...(flow.direction === "both" ? { markerStart: arrow } : {}),
          selected: flow.id === selected,
          className: tone ? `flow tone-${tone}` : "flow",
        };
      });
  }, [elements, selected, laidOver]);

  /** Stores where nodes were dropped, as absolute positions, and which boundary each now sits in. */
  const settle = (moved: ElementNode[]) => {
    dragging.current = false;
    const changes: Change[] = [];
    const current = new Map(nodes.map((n) => [n.id, n]));
    const absoluteOf = (node: ElementNode) => {
      const parent = node.parentId ? current.get(node.parentId) : undefined;
      return { x: node.position.x + (parent?.position.x ?? 0), y: node.position.y + (parent?.position.y ?? 0) };
    };
    const boundaries = nodes.filter((n) => n.type === "boundary");
    const touched = new Set(moved.map((n) => n.id));
    // What sits in a moved boundary has moved with it.
    for (const node of nodes) if (node.parentId && touched.has(node.parentId)) touched.add(node.id);

    for (const id of touched) {
      const node = current.get(id);
      if (!node) continue;
      const at = absoluteOf(node);
      const values: Record<string, unknown> = { x: Math.round(at.x), y: Math.round(at.y) };
      if (node.type === "element") {
        // An element belongs to the boundary its centre lies in.
        const centre = { x: at.x + SIZE.w / 2, y: at.y + SIZE.h / 2 };
        const inside = boundaries.find(
          (b) =>
            centre.x >= b.position.x &&
            centre.x <= b.position.x + (b.width ?? BOUNDARY.w) &&
            centre.y >= b.position.y &&
            centre.y <= b.position.y + (b.height ?? BOUNDARY.h),
        );
        if ((inside?.id ?? null) !== node.data.element.boundaryId) values.boundaryId = inside?.id ?? null;
      }
      const stored = node.data.element;
      if (values.x !== stored.x || values.y !== stored.y || "boundaryId" in values)
        changes.push({ op: "set", kind: "elements", id, values });
    }
    if (changes.length > 0) void open.send(...changes);
  };

  const connect = (connection: Connection) => {
    if (frozen || connection.source === connection.target) return;
    void open.send({
      op: "add",
      kind: "elements",
      values: { kind: "data_flow", itemId, sourceId: connection.source, targetId: connection.target, direction: "forward" },
    });
  };
  const addElement = (kind: Element["kind"]) => {
    const count = elements.filter((e) => e.kind === kind).length;
    const values = {
      kind,
      itemId,
      x: 60 + count * 30,
      y: 60 + count * 30,
      ...(kind === "trust_boundary" ? { w: BOUNDARY.w, h: BOUNDARY.h } : {}),
    };
    void open.send({ op: "add", kind: "elements", values });
  };

  return (
    <div className="diagram">
      <div className="diagram-bar">
        {!frozen && (
          <span className="row">
            <span className="bar-label">Add</span>
            <button type="button" onClick={() => addElement("component")}>
              Component
            </button>
            <button type="button" onClick={() => addElement("external_interactor")}>
              Outside party
            </button>
            <button type="button" onClick={() => addElement("data_store")}>
              Data store
            </button>
            <button type="button" onClick={() => addElement("trust_boundary")}>
              Trust boundary
            </button>
          </span>
        )}
        <label className="row">
          <span className="bar-label">Lay over</span>
          <select value={overlay} onChange={(e) => onOverlay(e.target.value)}>
            <option value="none">Nothing</option>
            <option value="assets">Where the assets live</option>
            <option value="controls">Where the controls act</option>
            <option value="gaps">Gaps: risks no control meets</option>
            {tara.paths
              .filter((p) => p.elementIds.length > 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} {cutText(p.description ?? "", 70)}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="help diagram-hint">
        {overlay === "gaps"
          ? "Red: a risk that asks for a control reaches this element, and none acts there or earlier on the attack's route. Amber: only proposed controls stand in the way."
          : "Drag an element to place it. Drag from the edge of one element to another to join them with a data flow. Drop an element into a boundary to put it inside."}
      </p>
      <div className="diagram-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStart={() => {
            dragging.current = true;
          }}
          onNodeDragStop={(_event, _node, moved) => settle(moved)}
          onConnect={connect}
          onNodeClick={(_event, node) => onSelect(node.id)}
          onEdgeClick={(_event, edge) => onSelect(edge.id)}
          onPaneClick={() => onSelect(null)}
          connectionMode={ConnectionMode.Loose}
          forceColorMode="light"
          nodesDraggable={!frozen}
          nodesConnectable={!frozen}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.25}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

/** What the chosen overlay says about each element: notes to show, a tone, and for a route the step numbers. */
function overlayNotes(tara: Tara, risks: Map<string, { value: number | null }>, overlay: Overlay) {
  const notes = new Map<string, string[]>();
  const tones = new Map<string, string>();
  const steps = new Map<string, number>();
  const note = (id: string, text: string) => notes.set(id, [...(notes.get(id) ?? []), text]);

  if (overlay === "assets") {
    for (const asset of tara.assets) for (const id of asset.elementIds) note(id, asset.id);
  } else if (overlay === "controls") {
    for (const control of tara.controls) for (const id of control.elementIds) note(id, control.id);
  } else if (overlay === "gaps") {
    const values = new Map([...risks].map(([threatId, score]) => [threatId, score.value]));
    for (const place of coverage(tara, values)) {
      tones.set(place.elementId, place.state);
      const unmet = place.risks.filter((r) => r.asks && (r.met === "no" || r.met === "planned")).map((r) => r.riskId);
      note(place.elementId, unmet.length > 0 ? `${GAP_WORDS[place.state]}: ${unmet.join(", ")}` : GAP_WORDS[place.state]);
    }
  } else if (overlay !== "none") {
    const path = tara.paths.find((p) => p.id === overlay);
    path?.elementIds.forEach((id, index) => {
      tones.set(id, "route");
      steps.set(id, index + 1);
    });
  }
  return { notes, tones, steps };
}
