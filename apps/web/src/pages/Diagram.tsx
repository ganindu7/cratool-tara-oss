// The architecture of an item as a drawing: its elements where the person placed them, the assets they hold
// inside them, the data flows between them, and the trust boundaries around them.
//
// The drawing is the data. A box is an element, a line is a data flow, a frame is a trust boundary, and a row
// inside a box is an asset that lives there: placing, joining, framing and moving here write the same records
// the lists show, through the same changes as everything else, so all of it is in the history and can be undone.
//
// The same drawing is opened from four steps, and each brings something else forward (`emphasis`). On top of
// it one thing at a time is laid over: the highest risk that reaches each element, the controls where they
// act, the gaps, or the route of one attack path. What is laid over is part of the address, so that such a
// view can be linked to. What the drawing holds and where it stands is worked out in ../diagram/*.ts; this
// file joins that to the canvas.

import type { Change, Element } from "@tara/core";
import {
  Background,
  type Connection,
  ConnectionMode,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar } from "../diagram/Bar.tsx";
import { drawnLines, drawnNodes, shownOf } from "../diagram/drawing.ts";
import { homesOf, type Inside, nameOf, notPlaced, placedCount, putIn } from "../diagram/held.ts";
import { type Emphasis, type Overlay, overlayFor, routeWith } from "../diagram/layers.ts";
import { openFlows } from "../diagram/lines.ts";
import { useLook } from "../diagram/look.ts";
import { useMoves, usePlacingByChoice } from "../diagram/moves.ts";
import { Done, GapNote, Offer, OpenEndsNote, Placing, RouteNote, Tray } from "../diagram/panels.tsx";
import {
  changesAfterDrag,
  GRID,
  HEAD_HEIGHT,
  isBox,
  isFlow,
  isFrame,
  NEW_FRAME,
  NODE_WIDTH,
  onGrid,
  placesOf,
  type Tidy,
  tidy,
} from "../diagram/places.ts";
import {
  Acts,
  type Carried,
  type DiagramActs,
  type DiagramNode,
  EDGE_TYPES,
  type FlowEdge,
  NODE_TYPES,
} from "../diagram/shapes.tsx";
import type { Ctx } from "../steps.tsx";
import { useHeightToBottom } from "../ui/useHeightToBottom.ts";
import type { OpenTara } from "../useTara.ts";

interface Props {
  ctx: Ctx;
  open: OpenTara;
  itemId: string;
  /** The step the drawing is opened from: what it shows while the address does not say. */
  emphasis?: Emphasis;
  /** The chosen record, from the address: an element, or an asset or a control that sits in one. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** What is laid over the drawing, from the address. Null while the address does not say: then the step decides. */
  overlay: Overlay | null;
  onOverlay: (overlay: Overlay) => void;
  /** The card of the chosen record, shown on the canvas. Without it, the panel of the record stands beside the drawing. */
  card?: (id: string) => ReactNode;
}

const FIT = { padding: 0.1, maxZoom: 1 };
/** With this many rows or fewer the tray starts open; with more it would cover the drawing, and waits to be opened. */
const TRAY_OPEN_UP_TO = 10;
const HINTS = {
  routing: "Choose the elements and data flows the attack passes through.",
  placing: "Choose where it goes, or press Esc to cancel.",
  drawing:
    "Drag an element to move it, from its edge to connect it, into a frame to put it inside. Shift and drag chooses several. " +
    "Point at an asset or a control to place it.",
};

const classes = (...names: (string | false | null)[]) => names.filter(Boolean).join(" ");

/** The architecture of one item, drawn: read, arranged and added to, with one thing at a time laid over it. */
export function Diagram({ ctx, open, itemId, emphasis = "architecture", selected, onSelect, overlay, onOverlay, card }: Props) {
  const { tara, assessment } = ctx;
  const frozen = tara.meta.status === "released";
  const layer = overlayFor(overlay, emphasis, tara);
  const [look, setLook] = useLook();
  const [routing, setRouting] = useState(false);
  /** The elements chosen together (Shift and drag, or Ctrl or Cmd and click), to be lined up as one. */
  const [chosen, setChosen] = useState<string[]>([]);
  const moves = useMoves(open, tara);
  const byChoice = usePlacingByChoice();
  const { placing } = byChoice;
  const flow = useRef<ReactFlowInstance<DiagramNode, FlowEdge> | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  useHeightToBottom(canvas);
  const dragging = useRef(false);
  /** Set when the whole arrangement is about to change: the drawing is then fitted to the canvas again. */
  const fitNext = useRef(false);

  // ---------------------------------------------------------------------------- what the drawing holds
  const own = useMemo(() => tara.elements.filter((element) => element.itemId === itemId), [tara, itemId]);
  const boxes = useMemo(() => own.filter(isBox), [own]);
  const flows = useMemo(() => own.filter(isFlow), [own]);
  const shown = useMemo(
    () => shownOf(tara, assessment.checks.scores.risks, layer, look.assetsInside),
    [tara, assessment, layer, look.assetsInside],
  );
  const places = useMemo(() => placesOf(own, (id) => shown.rowsIn(id).length), [own, shown]);
  const lines = useMemo(() => drawnLines(flows, places, shown, selected), [flows, places, shown, selected]);
  const waiting = useMemo(() => notPlaced(tara, shown.rowsKind, itemId), [tara, shown.rowsKind, itemId]);
  const [trayOpen, setTrayOpen] = useState(() => waiting.length <= TRAY_OPEN_UP_TO);
  /** Where what is being placed is already: it can go into every other element. */
  const homes = useMemo(() => (placing ? homesOf(tara, placing.kind, placing.id) : null), [tara, placing]);
  const takes = useCallback((elementId: string) => homes !== null && !homes.includes(elementId), [homes]);

  const drawn = useMemo(
    (): DiagramNode[] => drawnNodes(own, places, shown, { selected, chosen, takes }),
    [own, places, shown, selected, chosen, takes],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>(drawn);
  useEffect(() => {
    // The stored arrangement is shown, except while the person is dragging something.
    if (dragging.current) return;
    setNodes(drawn);
    if (!fitNext.current) return;
    fitNext.current = false;
    void flow.current?.fitView({ ...FIT, duration: 250 });
  }, [drawn, setNodes]);

  const edges = useMemo(
    () =>
      lines.map((each): FlowEdge => {
        const arrow = {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: each.onRoute ? "var(--route)" : each.forward ? "var(--accent)" : "var(--ink)",
        };
        return {
          id: each.id,
          type: "flow",
          source: each.source,
          target: each.target,
          sourceHandle: each.sides[0],
          targetHandle: each.sides[1],
          zIndex: each.forward ? 2 : 0,
          className: classes("dg-flow", each.forward && "dg-forward", each.onRoute && "dg-route", each.back && "dg-back"),
          data: { line: look.line, along: each.along },
          label: each.label,
          interactionWidth: 18,
          ...(each.arrows.end ? { markerEnd: arrow } : {}),
          ...(each.arrows.start ? { markerStart: arrow } : {}),
        };
      }),
    [lines, look.line],
  );

  // ---------------------------------------------------------------------------- arranging
  const setElements = (changes: [id: string, values: Record<string, unknown>][]) =>
    open.send(...changes.map(([id, values]): Change => ({ op: "set", kind: "elements", id, values })));
  /** Stores where things stand when a drag ends, and which frame each element then sits in. */
  const settle = (dragged: DiagramNode[]) => {
    dragging.current = false;
    const now = new Map(nodes.map((node) => [node.id, node]));
    for (const node of dragged) now.set(node.id, node);
    const onCanvas = [...now.values()].map((node) => ({
      element: node.data.element,
      at: node.position,
      within: node.parentId ?? null,
      ...(node.type === "frame" ? { size: { w: node.width ?? NEW_FRAME.w, h: node.height ?? NEW_FRAME.h } } : {}),
    }));
    const draggedIds = dragged.map((node) => node.id);
    const changes = changesAfterDrag(onCanvas, draggedIds);
    if (changes.length > 0) void open.send(...changes);
  };
  const resized: DiagramActs["resized"] = (id, box) => {
    const place = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
    void setElements([[id, place]]);
  };
  /** Every element is placed anew from what the records say: a person's own arrangement is given up. */
  const arrangeAnew = () => {
    fitNext.current = true;
    const placed = own.filter((element) => element.x !== null || element.y !== null);
    void setElements(placed.map((element) => [element.id, { x: null, y: null, w: null, h: null }]));
  };
  const lineUp = (how: Tidy) => void setElements([...tidy(places, chosen, how)].map(([id, at]) => [id, { ...at }]));
  const goTo = (id: string) => {
    const place = places.get(id);
    if (place) void flow.current?.setCenter(place.x + place.w / 2, place.y + place.h / 2, { zoom: 1, duration: 300 });
    onSelect(id);
  };

  // ---------------------------------------------------------------------------- adding and joining
  /** Adds an element and chooses it, so that it can be named at once. */
  const add = async (first: Record<string, unknown>) => {
    const before = new Set(own.map((element) => element.id));
    if (!(await open.send({ op: "add", kind: "elements", values: { itemId, ...first } }))) return;
    const made = open.latest()?.elements.find((element) => element.itemId === itemId && !before.has(element.id));
    if (made) onSelect(made.id);
  };
  /** A new element is put in the middle of what is seen of the drawing. */
  const addElement = (kind: Element["kind"]) => {
    const box = canvas.current?.getBoundingClientRect();
    const seen = box && flow.current?.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const size = kind === "trust_boundary" ? NEW_FRAME : { w: NODE_WIDTH, h: HEAD_HEIGHT };
    const at = { x: onGrid((seen?.x ?? 0) - size.w / 2), y: onGrid((seen?.y ?? 0) - size.h / 2) };
    void add({ kind, ...at, ...(kind === "trust_boundary" ? NEW_FRAME : {}) });
  };
  const join = (connection: Connection) => {
    if (connection.source === connection.target) return;
    void add({ kind: "data_flow", sourceId: connection.source, targetId: connection.target, direction: "forward" });
  };

  // ---------------------------------------------------------------------------- placing, and recording a route
  const put = (row: Carried, to: string) => moves.place(row.kind, row.id, putIn(homesOf(tara, row.kind, row.id), row.from, to));
  const begin = (row: Carried) => {
    byChoice.begin(row);
    setRouting(false);
    if (selected !== null) onSelect(null);
  };
  /** What is being placed goes where the person chose. It is then the chosen record, so that the change can be seen. */
  const place = (to: string) => {
    if (!placing) return;
    void put(placing, to);
    onSelect(placing.id);
    byChoice.end();
  };
  /** A click on an element or a line: it takes what is being placed, goes on the route being recorded, or is chosen. */
  const choose = (ids: string[], kind: "box" | "frame" | "line") => {
    const [first] = ids as [string];
    const { route } = shown;
    if (placing) {
      if (kind !== "frame" || placing.kind === "controls") place(first);
    } else if (routing && route && kind !== "frame") {
      void moves.place("paths", route.path.id, routeWith(route.path.elementIds, ids));
    } else onSelect(first);
  };
  /** A row was dropped on an element. The offer beside the row goes with it: the row is no longer where it was. */
  const drop = (row: Carried, to: string) => {
    byChoice.hold(false);
    void put(row, to);
  };
  const acts: DiagramActs = { frozen, pick: onSelect, drop, offer: frozen ? () => undefined : byChoice.offer, resized };

  /** Told by the canvas whenever its selection changes: only a change of several chosen elements is taken up. */
  const chosenNow = useRef("");
  const onSelectionChange = ({ nodes: selectedNodes }: { nodes: DiagramNode[] }) => {
    const ids = selectedNodes.filter((node) => node.type === "box").map((node) => node.id);
    const several = ids.length > 1 ? ids : [];
    if (several.join() === chosenNow.current) return;
    chosenNow.current = several.join();
    setChosen(several);
  };

  // ---------------------------------------------------------------------------- what is said around the drawing
  const named = (kind: Inside, id: string) =>
    `${id} ${nameOf({ id, name: tara[kind].find((record) => record.id === id)?.name ?? null })}`;
  /** Where what is being placed can go, for the list: an asset into a box or a flow, a control also at a boundary. */
  const choices = own
    .filter((element) => (placing?.kind === "controls" || !isFrame(element)) && takes(element.id))
    .map((element) => ({ id: element.id, label: `${element.id} ${element.name ?? ""}` }));
  const ownIds = new Set(own.map((element) => element.id));
  const placed = placedCount(tara, shown.rowsKind, ownIds);
  const count =
    `${boxes.length} elements, ${flows.length} data flows, ${placed.placed} of ${placed.all} ` +
    (shown.rowsKind === "controls" ? "controls placed on the architecture" : "assets placed");
  const loose = openFlows(flows);
  const showTray = (shown.rowsKind === "controls" || look.assetsInside) && waiting.length > 0 && boxes.length > 0;

  return (
    <Acts value={acts}>
      <div className="diagram">
        <Bar
          boxes={boxes}
          paths={tara.paths}
          layer={layer}
          rowsKind={shown.rowsKind}
          onLayer={(next) => {
            setRouting(false);
            onOverlay(next);
          }}
          look={look}
          onLook={setLook}
          chosen={chosen.length}
          count={count}
          onGoTo={goTo}
          edit={frozen ? null : { add: addElement, arrangeAnew, lineUp }}
        />
        {shown.gaps && <GapNote places={[...shown.gaps.values()].filter((gap) => ownIds.has(gap.elementId))} onGoTo={goTo} />}
        {shown.route && (
          <RouteNote
            route={shown.route}
            href={`#/tara/${tara.id}/paths/${encodeURIComponent(shown.route.path.id)}`}
            routing={routing}
            onRouting={frozen ? null : setRouting}
            onClear={() => shown.route && void moves.place("paths", shown.route.path.id, [])}
          />
        )}
        {loose.length > 0 && !shown.route && <OpenEndsNote ids={loose.map((each) => each.id)} onChoose={onSelect} />}

        <div className={classes("map-canvas dg-canvas", (routing || placing !== null) && "dg-choosing")} ref={canvas}>
          {placing && (
            <Placing
              row={placing}
              name={named(placing.kind, placing.id)}
              choices={choices}
              onSettle={place}
              onCancel={byChoice.end}
            />
          )}
          {!frozen && !placing && <Done notes={moves.done} onUndo={moves.undo} onHide={moves.hide} />}
          {byChoice.offered && !placing && !frozen && (
            <Offer
              row={byChoice.offered}
              name={named(byChoice.offered.kind, byChoice.offered.id)}
              onBegin={() => byChoice.offered && begin(byChoice.offered)}
              onHold={byChoice.hold}
            />
          )}
          {drawn.length === 0 ? (
            <p className="empty map-empty-note">
              Nothing here yet. Add a component to start, then connect elements by dragging from the edge of one to another.
            </p>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onInit={(instance) => {
                flow.current = instance;
              }}
              onNodeDragStart={() => {
                dragging.current = true;
              }}
              onNodeDragStop={(_event, _node, dragged) => settle(dragged)}
              onConnect={join}
              onSelectionChange={onSelectionChange}
              onNodeClick={(_event, node) => choose([node.id], node.type === "frame" ? "frame" : "box")}
              onEdgeClick={(_event, edge) => {
                const flowIds = lines.find((each) => each.id === edge.id)?.flowIds ?? [edge.id];
                choose(routing ? flowIds : [edge.id], "line");
              }}
              onPaneClick={() => onSelect(null)}
              connectionMode={ConnectionMode.Loose}
              forceColorMode="light"
              snapToGrid
              snapGrid={[GRID, GRID]}
              minZoom={0.15}
              maxZoom={1.8}
              panOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              deleteKeyCode={null}
              nodesDraggable={!frozen}
              nodesConnectable={!frozen && !routing}
              fitView
              fitViewOptions={FIT}
            >
              <Background gap={GRID * 2} />
              {look.overview && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  nodeClassName={(node) => classes(`dg-mini-${node.type}`, node.id === selected && "dg-mini-picked")}
                  ariaLabel="Overview of the diagram: drag to move the view"
                />
              )}
              <Controls showInteractive={false} showFitView={false} position="bottom-right">
                <ControlButton
                  onClick={() => void flow.current?.fitView({ ...FIT, duration: 250 })}
                  title="Fit everything"
                  aria-label="Fit everything"
                >
                  <svg className="dg-fit" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
                  </svg>
                </ControlButton>
              </Controls>
            </ReactFlow>
          )}
          {showTray && (
            <Tray
              kind={shown.rowsKind}
              rows={waiting}
              open={trayOpen}
              onToggle={() => setTrayOpen(!trayOpen)}
              chosen={placing?.id ?? selected}
              canPlace={!frozen}
            />
          )}
          {selected !== null && card
            ? card(selected)
            : !frozen && <p className="map-hint">{routing ? HINTS.routing : placing ? HINTS.placing : HINTS.drawing}</p>}
        </div>
      </div>
    </Acts>
  );
}
