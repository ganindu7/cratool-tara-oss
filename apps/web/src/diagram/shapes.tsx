// What is drawn on the canvas of the architecture diagram: an element as a box with the rows it holds, a trust
// boundary as a frame, and a data flow as a line. The three kinds of box are told apart by shape, as in a data
// flow diagram (styles/diagram.css). What each one shows is decided in pages/Diagram.tsx; here it is drawn.

import { FIRST_LINE_STYLE, flowLine, type LineStyle, type Side } from "@tara/core";
import { BaseEdge, type Edge, type EdgeProps, Handle, type Node, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { createContext, type DragEvent, useContext, useState } from "react";
import { ValueChip } from "../ui/marks.tsx";
import type { BoxData, FrameData } from "./drawing.ts";
import { type Held, type Inside, nameOf, rowText } from "./held.ts";
import { HEAD_HEIGHT } from "./places.ts";

/** A row that is picked up or pointed at: what it is, and the element it sits in, if it sits in one. */
export interface Carried {
  kind: Inside;
  id: string;
  from: string | null;
}

/** What the shapes on the canvas can ask of the diagram. Given once, so that what a shape shows stays plain data. */
export interface DiagramActs {
  frozen: boolean;
  /** A row was chosen. */
  pick: (id: string) => void;
  /** A row was dropped on an element. */
  drop: (row: Carried, to: string) => void;
  /** The pointer is over a row, at this place on the screen, or has left it. */
  offer: (row: Carried, at: DOMRect | null) => void;
  /** A frame was given another size. */
  resized: (id: string, box: { x: number; y: number; width: number; height: number }) => void;
}
/** How the shapes reach the diagram they are drawn on. Outside a diagram nothing can be done. */
export const Acts = createContext<DiagramActs>({
  frozen: true,
  pick: () => undefined,
  drop: () => undefined,
  offer: () => undefined,
  resized: () => undefined,
});

// A row travels as text, so that every browser lets it be dragged.
const DRAG_TYPE = "text/plain";
const carry = (event: DragEvent, row: Carried) => {
  event.dataTransfer.setData(DRAG_TYPE, `${row.kind}:${row.id}:${row.from ?? ""}`);
  event.dataTransfer.effectAllowed = "move";
};
const carriedBy = (event: DragEvent): Carried | null => {
  const [kind, id, from] = event.dataTransfer.getData(DRAG_TYPE).split(":");
  return (kind === "assets" || kind === "controls") && id ? { kind, id, from: from || null } : null;
};

/** How many characters of a row fit in an element, and in the wider tray, at the size rows are set in. */
export const ROOM = { inElement: 27, inTray: 50 };

/**
 * An asset or a control as a row that can be chosen, picked up and dropped on an element. Where its name has
 * no room it is cut after a whole word; the ID in front of it leads to the record, which has it in full.
 */
export function Row({ row, carried, on, room }: { row: Held; carried: Carried; on: boolean; room: number }) {
  const acts = useContext(Acts);
  const at = (event: { currentTarget: HTMLElement }) => acts.offer(carried, event.currentTarget.getBoundingClientRect());
  const leave = () => acts.offer(carried, null);
  return (
    // Not a button: Safari and Firefox do not let a button be dragged.
    // biome-ignore lint/a11y/useSemanticElements: a button cannot be dragged in every browser
    <div
      role="button"
      tabIndex={0}
      className={on ? "dg-asset dg-asset-on" : "dg-asset"}
      title={`${row.id} ${nameOf(row)}`}
      draggable={!acts.frozen}
      onDragStart={(event) => carry(event, carried)}
      onMouseEnter={at}
      onMouseLeave={leave}
      onFocus={at}
      onBlur={leave}
      onClick={(event) => {
        event.stopPropagation();
        acts.pick(row.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        acts.pick(row.id);
      }}
    >
      <b>{row.id}</b> {rowText(row, room)}
    </div>
  );
}

/** An element as the canvas holds it: a box, with what it shows. */
export type BoxNode = Node<BoxData, "box">;
/** A trust boundary as the canvas holds it: a frame, with the name and the note it shows. */
export type FrameNode = Node<FrameData, "frame">;
/** Anything that stands on the canvas of the diagram: the box of an element, or the frame of a trust boundary. */
export type DiagramNode = BoxNode | FrameNode;

const SIDES: Record<Side, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};
// A line leaves the left and right of an element at the middle of its head, however many rows hang beneath.
const beside = (side: Side) => (side === "left" || side === "right" ? { top: HEAD_HEIGHT / 2 } : undefined);

const classes = (...names: (string | false | null)[]) => names.filter(Boolean).join(" ");

/** A component, an outside party or a data store, with the rows it holds beneath its head. */
function Box({ data, selected }: NodeProps<BoxNode>) {
  const { element, rows, rowsKind, chosenRow, step, risk, onRoute, gap, target } = data;
  const acts = useContext(Acts);
  const [over, setOver] = useState(false);
  const name = element.name ?? "No name yet";
  const look = classes(
    "dg-node",
    `dg-${element.kind}`,
    selected && "dg-picked",
    onRoute === true && "dg-on-route",
    onRoute === false && "dg-dim",
    over && "dg-over",
    target && "dg-target",
    gap && `dg-gap-${gap}`,
  );
  const dropped = (event: DragEvent) => {
    setOver(false);
    const row = carriedBy(event);
    if (!row || acts.frozen) return;
    event.preventDefault();
    acts.drop(row, element.id);
  };
  return (
    // A row can be dropped on the element. The same is done without dragging through the offer beside a row.
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target, with another way to do the same
    <div
      className={look}
      onDragOver={(event) => {
        if (acts.frozen) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={dropped}
    >
      {/* A connection can leave or arrive on any side: the line takes the side that faces the other element. */}
      {(Object.keys(SIDES) as Side[]).map((side) => (
        <Handle key={side} id={side} type="source" position={SIDES[side]} style={beside(side)} />
      ))}
      <div className="dg-head" title={[`${element.id}: ${name}`, element.description].filter(Boolean).join("\n")}>
        <b>{element.id}</b>
        {risk !== undefined && (
          <span className="dg-risk">
            <ValueChip value={risk} />
          </span>
        )}
        {step !== null && (
          <span
            className="dg-step"
            title={step === 1 ? "The entry point: where the attacker gets in" : `Step ${step} of the route`}
          >
            {step}
          </span>
        )}
        <span className="dg-name">{name}</span>
      </div>
      {rows.length > 0 && (
        <ul
          className={`dg-inside dg-rows-${rowsKind} nodrag`}
          aria-label={`${rowsKind === "controls" ? "Controls" : "Assets"} in ${element.id}`}
        >
          {rows.map((row) => (
            <li key={row.id}>
              <Row
                row={row}
                carried={{ kind: rowsKind, id: row.id, from: element.id }}
                on={row.id === chosenRow}
                room={ROOM.inElement}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A trust boundary: a dashed frame around what is in it, which can be made larger while it is chosen. */
function Frame({ id, data, selected }: NodeProps<FrameNode>) {
  const { element, note } = data;
  const acts = useContext(Acts);
  return (
    <div className={classes("dg-boundary", selected && "dg-picked")}>
      {!acts.frozen && (
        <NodeResizer
          isVisible={selected}
          minWidth={160}
          minHeight={110}
          lineClassName="dg-resize-line"
          handleClassName="dg-resize-handle"
          onResizeEnd={(_event, box) => acts.resized(id, box)}
        />
      )}
      <span className="dg-boundary-name">
        <b>{element.id}</b> {element.name ?? "Trust boundary"}
        {note && <span className="dg-boundary-note"> · {note}</span>}
      </span>
    </div>
  );
}

/** A line: how it is drawn, and for a straight one how far along it its label stands. */
export type FlowEdge = Edge<{ line: LineStyle; along: number }, "flow">;

/**
 * A data flow, between the facing sides of its two elements, drawn the way the reader chose. Straight lines
 * to one element fan out, and each carries its label on itself, clear of where they meet; curved and stepped
 * lines carry it at their middle.
 */
function Flow(props: EdgeProps<FlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const style = data?.line ?? FIRST_LINE_STYLE;
  const from = { x: sourceX, y: sourceY };
  const to = { x: targetX, y: targetY };
  // The canvas names a side by the same word as the line shapes do.
  const line = flowLine(from, sourcePosition as Side, to, targetPosition as Side, style);
  const along = data?.along ?? 0.5;
  const label = style === "straight" ? { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along } : line.label;
  return (
    <BaseEdge
      path={line.d}
      labelX={label.x}
      labelY={label.y}
      label={props.label}
      labelShowBg
      labelBgPadding={[4, 2]}
      labelBgBorderRadius={0}
      {...(props.interactionWidth === undefined ? {} : { interactionWidth: props.interactionWidth })}
      {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      {...(props.markerStart ? { markerStart: props.markerStart } : {})}
    />
  );
}

/** What the canvas draws each kind of node with. */
export const NODE_TYPES = { box: Box, frame: Frame };
/** What the canvas draws a line with. There is one kind of line: a data flow. */
export const EDGE_TYPES = { flow: Flow };
