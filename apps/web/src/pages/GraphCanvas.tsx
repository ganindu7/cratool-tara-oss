// The canvas of the graph: records as nodes in columns by kind, their links as lines. It is used twice: by
// the Graph step, for the whole TARA or a part of it, and beside a list, for the open record and what is
// linked to it.
//
// It opens at a size at which the records can be read: everything if that is legible, otherwise as large as
// legible, on the record the drawing is about if there is one. From there it is moved and zoomed by hand.

import {
  Background,
  ControlButton,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { StateChip, ValueChip } from "../ui/marks.tsx";
import { onOneLine } from "../ui/measure.ts";
import { useHeightToBottom } from "../ui/useHeightToBottom.ts";
import { useSize } from "../ui/useSize.ts";
import { arrangeColumns, HEADING_ROOM } from "../views/columns.ts";
import { GRAPH_KINDS, type Thing } from "../views/graph.ts";
import { NODE } from "../views/layout.ts";

type Link = [from: string, to: string];
interface ThingData extends Record<string, unknown> {
  thing: Thing;
  dim: boolean;
  picked: boolean;
  centre: boolean;
}
interface HeadingData extends Record<string, unknown> {
  title: string;
  count: number;
}

/** What a record says when the pointer rests on it: its words whole, how it stands, and what is missing if its chain stops. */
export const tipOf = (thing: Thing): string =>
  [`${thing.id}: ${thing.text || "Nothing entered yet"}`, thing.status?.message, thing.loose && `Loose end: ${thing.loose}`]
    .filter(Boolean)
    .join("\n");

/** A record on the graph: the bar on its left says how it stands; the ID leads, one line of its text follows. */
function ThingNode({ data }: NodeProps<Node<ThingData>>) {
  const { thing, dim, picked, centre } = data;
  const classes = [
    "map-node",
    `map-${thing.status?.kind ?? "empty"}`,
    dim ? "map-dim" : "",
    picked ? "map-picked" : "",
    centre ? "map-centre" : "",
    thing.loose ? "map-loose" : "",
  ];
  return (
    <div className={classes.join(" ")} title={tipOf(thing)}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="map-mark" aria-hidden="true" />
      <b>{thing.id}</b>
      {thing.kind === "risks" && thing.value != null && <ValueChip value={thing.value} />}
      {thing.state && <StateChip state={thing.state} small />}
      <span className="map-text">{onOneLine(thing.text || "Nothing entered yet", NODE.w - 24, 11.5)}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** The name of a column, with how many records it holds. */
function HeadingNode({ data }: NodeProps<Node<HeadingData>>) {
  return (
    <div className="map-heading">
      {data.title}
      <span>{data.count}</span>
    </div>
  );
}
const NODE_TYPES = { thing: ThingNode, heading: HeadingNode };

// Plain line drawings for the three ways of getting back to something.
const icon = {
  className: "line-icon",
  width: 14,
  height: 14,
  viewBox: "0 0 14 14",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
};
const CentreIcon = () => (
  <svg {...icon} aria-hidden="true">
    <circle cx="7" cy="7" r="2.2" />
    <path d="M7 0.5v3M7 10.5v3M0.5 7h3M10.5 7h3" />
  </svg>
);
const LitIcon = () => (
  <svg {...icon} aria-hidden="true">
    <rect x="1" y="5" width="3.6" height="4" />
    <rect x="9.4" y="5" width="3.6" height="4" />
    <path d="M4.6 7h4.8" />
  </svg>
);
const FitIcon = () => (
  <svg {...icon} aria-hidden="true">
    <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
  </svg>
);

/** The frame around some of the records that are drawn. */
function frameOf(places: ReadonlyMap<string, { x: number; y: number }>, ids: string[]) {
  const here = ids.flatMap((id) => places.get(id) ?? []);
  if (here.length === 0) return null;
  const left = Math.min(...here.map((place) => place.x));
  const top = Math.min(...here.map((place) => place.y));
  const width = Math.max(...here.map((place) => place.x)) + NODE.w - left;
  const height = Math.max(...here.map((place) => place.y)) + NODE.h - top;
  return { left, top, width, height };
}

interface Props {
  /** The records that are drawn, and the links among them. */
  things: Thing[];
  links: Link[];
  /** What is lit: the chain of the chosen record. null: nothing is chosen, and nothing steps back. */
  lit: ReadonlySet<string> | null;
  picked: string | null;
  /** The record the drawing is about, which stands out. */
  centre: string | null;
  onPick: (id: string | null) => void;
  onOpen: (id: string) => void;
  /** The smallest size the records are shown at when the drawing opens. */
  smallest?: number;
  /** The room the card of the chosen record takes at the top right. A card without an end to its height has that side to itself. */
  card?: { width: number; height: number } | undefined;
  /** Something lies over the canvas: it keeps its view and takes no key or pointer. */
  covered?: boolean;
  /** The canvas reaches the bottom of the window. Without it, it has the height its place gives it. */
  fill?: boolean;
  /** What stands on the canvas besides the drawing: the card of the chosen record, or a hint. */
  children?: ReactNode;
}

/**
 * The canvas itself. It tells its caller which record was clicked and which was double-clicked, and has buttons
 * that bring back into view the chosen record, what is lit, or everything.
 */
export function GraphCanvas({
  things,
  links,
  lit,
  picked,
  centre,
  onPick,
  onOpen,
  smallest = 0.56,
  card,
  covered,
  fill,
  children,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  useHeightToBottom(box, fill ? 16 : null);
  const places = useMemo(() => arrangeColumns(things, links), [things, links]);
  const ids = useMemo(() => things.map((thing) => thing.id), [things]);
  // A whole card keeps its side of the canvas clear; a small one lies over the drawing.
  const keepClear = card && !Number.isFinite(card.height) ? card.width : 0;

  const nodes: Node[] = useMemo(() => {
    const drawn: Node[] = things.map((thing) => ({
      id: thing.id,
      type: "thing",
      position: places.get(thing.id) ?? { x: 0, y: 0 },
      draggable: false,
      data: { thing, dim: lit !== null && !lit.has(thing.id), picked: thing.id === picked, centre: thing.id === centre },
    }));
    for (const kind of GRAPH_KINDS) {
      const column = things.filter((thing) => thing.kind === kind.key);
      const first = column[0] && places.get(column[0].id);
      if (!first) continue;
      drawn.push({
        id: `heading-${kind.key}`,
        type: "heading",
        position: { x: first.x, y: -HEADING_ROOM },
        draggable: false,
        selectable: false,
        data: { title: kind.many, count: column.length },
      });
    }
    return drawn;
  }, [things, places, lit, picked, centre]);
  const edges: Edge[] = useMemo(
    () =>
      links.map(([from, to]) => {
        // with a record chosen, the lines of its chain stand out and the others step back
        const on = lit === null || (lit.has(from) && lit.has(to));
        const strong = on && lit !== null;
        return {
          id: `${from}>${to}`,
          source: from,
          target: to,
          selectable: false,
          focusable: false,
          style: { stroke: strong ? "var(--ink)" : "var(--field)", strokeWidth: strong ? 1.6 : 1, opacity: on ? 1 : 0.14 },
        };
      }),
    [links, lit],
  );

  /** Where the drawing stands when it opens. */
  const viewport = useMemo(() => {
    const all = frameOf(places, ids);
    if (!size || !all) return null;
    const margin = 28;
    const top = all.top - HEADING_ROOM;
    const height = all.height + HEADING_ROOM;
    const room = Math.max(240, size.width - keepClear);
    const zoom = Math.max(smallest, Math.min(1, (room - 2 * margin) / all.width, (size.height - 2 * margin) / height));
    const about = centre ? places.get(centre) : undefined;
    // What fits is set in the middle; what does not opens on the record the drawing is about, or at its top left corner.
    const fitsAcross = all.width * zoom <= room - 2 * margin;
    const fitsDown = height * zoom <= size.height - 2 * margin;
    const x = fitsAcross
      ? (room - all.width * zoom) / 2 - all.left * zoom
      : about
        ? room / 2 - (about.x + NODE.w / 2) * zoom
        : margin - all.left * zoom;
    const y = fitsDown
      ? (size.height - height * zoom) / 2 - top * zoom
      : about
        ? size.height / 2 - (about.y + NODE.h / 2) * zoom
        : margin - top * zoom;
    return { x, y, zoom };
  }, [size, places, ids, centre, smallest, keepClear]);

  // Moving the view to some of the records, framed in the part of the canvas that nothing covers.
  const flow = useRef<ReactFlowInstance | null>(null);
  const frame = (which: string[], keepZoom = false) => {
    const around = frameOf(places, which);
    if (!flow.current || !size || !around) return;
    const margin = 36;
    const room = Math.max(240, size.width - keepClear);
    const fitted = Math.min(1, (room - 2 * margin) / around.width, (size.height - 2 * margin) / around.height);
    const zoom = keepZoom ? flow.current.getViewport().zoom : Math.max(0.12, fitted);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    void flow.current.setViewport(
      {
        x: room / 2 - (around.left + around.width / 2) * zoom,
        y: size.height / 2 - (around.top + around.height / 2) * zoom,
        zoom,
      },
      { duration: calm ? 0 : 280 },
    );
  };
  // Choosing a record never moves the canvas while the record can be seen: its card moves aside instead. Only
  // a record that is out of view (chosen from a card's list, or moved away) is brought back.
  const [cardLeft, setCardLeft] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run when another record is chosen or its card changes size
  useEffect(() => {
    const place = picked ? places.get(picked) : undefined;
    if (!picked || !place || !flow.current || !size) return setCardLeft(false);
    const view = flow.current.getViewport();
    const x = place.x * view.zoom + view.x;
    const y = place.y * view.zoom + view.y;
    const width = NODE.w * view.zoom;
    const height = NODE.h * view.zoom;
    if (x + width < 24 || x > size.width - 24 || y + height < 24 || y > size.height - 24) {
      frame([picked], true);
      return setCardLeft(false);
    }
    // the card is at the right unless the record lies where the card would be
    const { width: cardWidth, height: cardHeight } = card ?? { width: 0, height: 0 };
    setCardLeft(cardWidth > 0 && x + width > size.width - cardWidth - 16 && y < cardHeight + 16 && x > cardWidth + 16);
  }, [picked, card?.width, card?.height, places]);

  return (
    <div className="map-canvas" ref={box} inert={covered} data-card={cardLeft ? "left" : undefined}>
      {things.length === 0 ? (
        <p className="empty map-empty-note">Nothing to show here.</p>
      ) : (
        viewport && (
          <ReactFlow
            // drawn anew when what is shown or the room for it changes, so that it opens well placed each time
            key={`${ids.join()}|${size?.width}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            defaultViewport={viewport}
            minZoom={0.1}
            maxZoom={1.6}
            forceColorMode="light"
            panOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesDraggable={false}
            nodesConnectable={false}
            aria-label="The records and how they are linked"
            onInit={(instance) => {
              flow.current = instance as unknown as ReactFlowInstance;
            }}
            onNodeClick={(_event, node) => node.type === "thing" && onPick(node.id === picked ? null : node.id)}
            onNodeDoubleClick={(_event, node) => node.type === "thing" && onOpen(node.id)}
            onPaneClick={() => onPick(null)}
          >
            <Background gap={24} />
            <Controls showInteractive={false} showFitView={false} position="bottom-right">
              {picked && ids.includes(picked) && (
                <ControlButton
                  onClick={() => frame([picked], true)}
                  title="Centre on the selected record"
                  aria-label="Centre on the selected record"
                >
                  <CentreIcon />
                </ControlButton>
              )}
              {lit && (
                <ControlButton
                  onClick={() => frame(ids.filter((id) => lit.has(id)))}
                  title="Fit what is lit"
                  aria-label="Fit what is lit"
                >
                  <LitIcon />
                </ControlButton>
              )}
              <ControlButton onClick={() => frame(ids)} title="Fit everything" aria-label="Fit everything">
                <FitIcon />
              </ControlButton>
            </Controls>
          </ReactFlow>
        )
      )}
      {children}
    </div>
  );
}

/** What the mark of a record means, wherever records are drawn. */
export function StatusLegend() {
  return (
    <ul className="map-legend" aria-label="What the marks mean">
      <li>
        <span className="map-mark map-done" />
        Settled
      </li>
      <li>
        <span className="map-mark map-waiting" />
        Waiting for a review
      </li>
      <li>
        <span className="map-mark map-todo" />
        To complete
      </li>
      <li>
        <span className="map-mark map-empty" />
        Not started
      </li>
      <li>
        <span className="map-loose-key" />
        Loose end
      </li>
    </ul>
  );
}
