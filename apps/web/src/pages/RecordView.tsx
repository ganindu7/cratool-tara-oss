// The view of one record: the record in the middle, what belongs to it around it, and nothing else of the TARA.
//
// There are four that follow the chain of the method from the record in their middle. An element: what it is
// joined to and what is in it. An asset: where it lives, what can happen to it, and by which ways. A threat
// scenario: what it leads to, how it is carried out, what treats its risk. A control: the risks it treats and
// where it acts. Beside those, every record has its ego view: itself as a block that shows what it is made of,
// with only what is linked to it directly.
//
// What a view holds and where everything stands is worked out in views/; here it is drawn. A record is chosen
// as on the graph: the first click lights up what belongs to it and shows its card, a double click opens it.

import { bandName, cutText, levelName, type Scores, type Tara } from "@tara/core";
import { Fragment, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Ctx } from "../steps.tsx";
import { leaveTo, turnTo } from "../ui/address.ts";
import { hrefOf, StateChip, ValueChip } from "../ui/marks.tsx";
import { linesOf, onOneLine, widthOf } from "../ui/measure.ts";
import { CompositionBlock, compositionHeight, RatingStrip, STRIP_HEIGHT } from "../ui/Ratings.tsx";
import { useHeightToBottom } from "../ui/useHeightToBottom.ts";
import { useSize } from "../ui/useSize.ts";
import { ViewLink, viewHref } from "../ui/ViewLink.tsx";
import type { OpenTara } from "../useTara.ts";
import { belongingTo } from "../views/belonging.ts";
import { type Graph, kindOf, type Thing } from "../views/graph.ts";
import { NODE, NODE_READABLE } from "../views/layout.ts";
import { compositionOf, stripOf } from "../views/ratings.ts";
import {
  type Also,
  boxesOf,
  centresOf,
  drawView,
  egoViewOf,
  type Held,
  holdView,
  markLeadsTo,
  VIEWS,
  type ViewOf,
  viewOf,
} from "../views/views.ts";
import { tipOf } from "./GraphCanvas.tsx";
import { type CardState, cardRoom, RecordCard } from "./RecordCard.tsx";
import { HOW_TO_CHOOSE, howToRead, LineLegend, whatItIs } from "./recordViewWords.tsx";

/** The room kept beneath the canvas for the legend of the view. */
const LEGEND_ROOM = 50;
/** The room around a drawing in its canvas, also where the drawing is larger than the canvas and is moved through. */
const MARGIN = 32;
// A small view is shown larger than the graph draws its records. A large one is made smaller to be seen at
// once, but not smaller than this; and where its texts are to be read (drawn in detail, or with a card
// beside it), not smaller than can be read. What does not fit then is moved through.
const SMALLEST = 0.6;
const SMALLEST_READABLE = 0.8;
const LARGEST = 1.4;
/** The text of a record as it is drawn: its size, the height of a line, and the room a record needs besides its text. */
const TEXT_SIZE = 11.5;
const LINE = 14.4;
const AROUND_TEXT = 33;
/** How much narrower than its record a text is: the padding and the bar at the left. */
const TEXT_INSET = 28;
/** The block in the middle of an ego view is wider than the records around it. */
const BLOCK_WIDTH = { fit: 264, detailed: 340 };
const DETAILED_KEY = "tara.view.detailed";
/** The ID of a record is set larger and bold; the mark before it and the gaps around it take this much room. */
const ID_SIZE = 13;
const BOLDER = 1.1;
const AROUND_ID = 24;
/** The room a word beside the ID of a record has on the record's first line. */
const roomBeside = (id: string, width: number): number => width - TEXT_INSET - AROUND_ID - widthOf(id, ID_SIZE) * BOLDER;

/** How far the marks of a record stand out over its corner, and how far above its top edge. */
const MARK_OUT = 9;
const MARK_UP = 12;

/** The height of a record that shows its text whole, at this width. */
const heightFor = (text: string, width: number): number =>
  Math.ceil(AROUND_TEXT + LINE * linesOf(text || "Nothing entered yet", width - TEXT_INSET, TEXT_SIZE));

interface Beside {
  /** A word beside the ID: the level of a damage, the feasibility of a path, the category of a threat. */
  tag?: string | null;
  chip?: ReactNode;
  /** What the record is linked to besides what is drawn here, and in which way. */
  elsewhere?: { ids: string[]; does: Also };
}

/** What a record shows beside its ID in a view, by its kind and the view it stands in. */
function besideOf(thing: Thing, held: Held, tara: Tara, scores: Scores): Beside {
  const { id } = thing;
  const elsewhere = (among: { id: string; elsewhere: string[] }[] | undefined, does: Also) => ({
    elsewhere: { ids: among?.find((each) => each.id === id)?.elsewhere ?? [], does },
  });
  const threat = held.kind === "threat" ? held : null;
  const element = held.kind === "element" ? held : null;
  switch (thing.kind) {
    case "elements":
      return { tag: thing.what ?? null };
    case "assets":
      return elsewhere(element?.assets, "lives in");
    case "damages":
      return { tag: levelName(tara.method, scores.damages.get(id)?.score) };
    case "threats": {
      const category = tara.threats.find((candidate) => candidate.id === id)?.category;
      const tag = tara.method.threat_categories.find((candidate) => candidate.key === category)?.label ?? null;
      return { tag, ...elsewhere(held.kind === "asset" ? held.threats : undefined, "leads to") };
    }
    case "risks":
      return { chip: thing.value == null ? null : <ValueChip value={thing.value} /> };
    case "paths": {
      const screened = threat?.paths.find((path) => path.id === id)?.screened;
      const tag = screened ? "Screened out" : bandName(tara.method, scores.paths.get(id)?.feasibility ?? null);
      return { tag, ...elsewhere(threat?.paths, "carries out") };
    }
    case "controls": {
      const chip = thing.state ? <StateChip state={thing.state} small /> : null;
      return { chip, ...(threat ? elsewhere(threat.controls, "treats") : elsewhere(element?.controls, "acts in")) };
    }
    case "goalClaims":
      return { tag: thing.what ?? null, ...elsewhere(threat?.goals, "answers") };
    default:
      return {};
  }
}

interface Props {
  ctx: Ctx;
  open: OpenTara;
  graph: Graph;
  /** Every record a view can draw: those of the graph, and each data flow and boundary. */
  things: ReadonlyMap<string, Thing>;
  /** Which record the view is about, and which record is chosen in it when it opens. */
  view: ViewOf;
  /** It lies over the graph, which stays beneath as it was left. */
  over: boolean;
  /** What the marks of a record mean: the same legend as the graph has. */
  legend: ReactNode;
  cards: CardState;
}

/** The view of one record, drawn, with its head: turning to another record, the two sizes to draw at, and the way out. */
export function RecordView({ ctx, open, graph, things, view, over, legend, cards }: Props) {
  const { tara } = ctx;
  const scores = ctx.assessment.checks.scores;
  const { kind, centre } = view;
  const held = useMemo(() => holdView({ kind, centre }, tara, scores), [kind, centre, tara, scores]);
  const boxes = useMemo(() => (held ? boxesOf(held).filter((id) => things.has(id)) : []), [held, things]);

  // Two ways to draw it: everything fitted to the canvas, with each text on one line as on the graph; or every
  // record large enough to read its text, at a size that is not made smaller. Remembered in this browser.
  const [detailed, setDetailedState] = useState(() => localStorage.getItem(DETAILED_KEY) === "yes");
  const setDetailed = (on: boolean) => {
    setDetailedState(on);
    localStorage.setItem(DETAILED_KEY, on ? "yes" : "no");
  };
  const size = detailed ? NODE_READABLE : NODE;
  const isEgo = held?.kind === "ego";
  const blockWidth = isEgo ? (detailed ? BLOCK_WIDTH.detailed : BLOCK_WIDTH.fit) : undefined;
  const here = things.get(centre);
  const made = useMemo(
    () => (isEgo && here ? compositionOf(tara, scores, here.kind, centre) : null),
    [isEgo, here, tara, scores, centre],
  );

  /** Beneath its threat a risk does not repeat the threat's words: it says how it is treated. */
  const textOf = (id: string): string => {
    if (held?.kind === "threat" && id === held.riskId) {
      const treatment = tara.risks.find((risk) => risk.id === id)?.treatment;
      const label = tara.method.treatments.find((candidate) => candidate.key === treatment)?.label;
      return treatment ? `Treatment: ${label ?? treatment}` : "No treatment decided yet";
    }
    return things.get(id)?.text ?? "";
  };
  // A record that shows its text whole is as high as the text needs; one that has ratings carries them as a
  // strip beneath; the block of an ego view also holds what the record is made of.
  // biome-ignore lint/correctness/useExhaustiveDependencies: textOf reads what is listed here already
  const heights = useMemo(() => {
    if (!detailed && !made) return undefined;
    const heightOf = (id: string): number => {
      const thing = things.get(id);
      if (made && blockWidth && id === centre) return heightFor(textOf(id), blockWidth) + compositionHeight(made);
      if (!detailed || !thing) return NODE.h;
      return heightFor(textOf(id), size.w) + (stripOf(tara, scores, thing.kind, id) ? STRIP_HEIGHT : 0);
    };
    return new Map(boxes.map((id) => [id, heightOf(id)]));
  }, [boxes, detailed, made, blockWidth, things, tara, scores, centre, size.w]);
  const drawing = useMemo(() => (held ? drawView(held, size, heights, blockWidth) : null), [held, size, heights, blockWidth]);
  const shown = useMemo(
    () => new Set([...boxes, ...(drawing?.labels ?? []).flatMap((label) => label.recordId ?? [])]),
    [boxes, drawing],
  );

  const [picked, setPicked] = useState<string | null>(view.chosen);
  const thing = picked && shown.has(picked) ? (things.get(picked) ?? null) : null;
  /** What belongs to the chosen record, and is lit with it. */
  const lit = useMemo(() => (thing ? belongingTo(graph, tara, thing.id) : null), [thing, graph, tara]);

  const frameBox = useRef<HTMLDivElement>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const canvas = useSize(canvasBox);
  useHeightToBottom(canvasBox, LEGEND_ROOM);
  const leave = () => leaveTo(hrefOf(tara, centre) ?? `#/tara/${tara.id}/graph`);

  // Escape closes the card of the chosen record, and with none open leaves the view; not while something is typed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: leave reads the centre and the TARA, which are listed
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const on = event.target as HTMLInputElement | null;
      const typing =
        on?.tagName === "TEXTAREA" ||
        on?.tagName === "SELECT" ||
        (on?.tagName === "INPUT" && !["radio", "checkbox"].includes(on.type));
      if (event.key !== "Escape" || typing) return;
      if (thing) setPicked(null);
      else leave();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [thing, centre, tara.id]);

  // The whole card has room of its own at the right, and the drawing is fitted beside it, so that the card
  // covers nothing. The small card lies over the drawing.
  const room = thing && !cards.small ? cardRoom(cards).width + 24 : 0;
  const frame = drawing?.box ?? { left: 0, top: 0, width: 1, height: 1 };
  const smallest = detailed || room > 0 ? SMALLEST_READABLE : SMALLEST;
  const fitted = canvas
    ? Math.min(LARGEST, (canvas.width - room - 2 * MARGIN) / frame.width, (canvas.height - 2 * MARGIN) / frame.height)
    : 1;
  const zoom = Math.max(smallest, fitted);

  const drawnAt = (within: HTMLElement | null, id: string) =>
    [...(within?.querySelectorAll<HTMLElement>("[data-record]") ?? [])].find((element) => element.dataset.record === id);
  // A drawing larger than its canvas opens on the record in its middle, and a chosen record that is out of sight is brought in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run again whenever what is drawn moves or changes size
  useEffect(() => {
    const within = canvasBox.current;
    const at = drawnAt(within, thing?.id ?? centre);
    if (!within || !at) return;
    const all = within.getBoundingClientRect();
    const box = at.getBoundingClientRect();
    const wide = all.width - room;
    if (!thing) {
      within.scrollLeft += box.left + box.width / 2 - (all.left + wide / 2);
      within.scrollTop += box.top + box.height / 2 - (all.top + all.height / 2);
      return;
    }
    if (box.left < all.left + 12) within.scrollLeft += box.left - all.left - 12;
    else if (box.right > all.left + wide - 12) within.scrollLeft += box.right - (all.left + wide - 12);
    if (box.top < all.top + 12) within.scrollTop += box.top - all.top - 12;
    else if (box.bottom > all.bottom - 12) within.scrollTop += box.bottom - (all.bottom - 12);
  }, [thing?.id, centre, zoom, room, detailed, canvas?.width, canvas?.height, drawing]);
  // The small card moves to the left when the chosen record lies beneath it.
  const [cardLeft, setCardLeft] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run again whenever what is drawn moves or changes size
  useEffect(() => {
    const at = thing && cards.small ? drawnAt(frameBox.current, thing.id) : undefined;
    if (!at || !frameBox.current) return setCardLeft(false);
    const all = frameBox.current.getBoundingClientRect();
    const box = at.getBoundingClientRect();
    const card = cardRoom(cards);
    setCardLeft(
      box.right > all.right - card.width - 16 && box.top < all.top + card.height + 16 && box.left > all.left + card.width + 16,
    );
  }, [thing?.id, cards.small, canvas?.width, canvas?.height, zoom, detailed]);

  if (!held || !drawing || !here) {
    return (
      <section className={over ? "rv over" : "rv"}>
        <div className="rv-head">
          <h2>{VIEWS[kind].name}</h2>
          <button type="button" onClick={leave}>
            Leave
          </button>
        </div>
        <p className="empty">This record is no longer in the TARA, or it has no view of its own.</p>
      </section>
    );
  }

  const address = (id: string) => hrefOf(tara, id) ?? "#/";
  const show = (to: ViewOf) => turnTo(viewHref(tara.id, to));
  // The first click chooses a record, the same click again lets go of it, a double click opens it: as on the graph.
  const choose = (id: string) => ({
    "data-record": id,
    href: address(id),
    onClick: (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setPicked(id === picked ? null : id);
    },
    onDoubleClick: () => {
      location.hash = address(id);
    },
  });
  /** To a record that the card of another names: chosen here if it is drawn here, opened where it is listed if not. */
  const go = (id: string) => {
    if (shown.has(id)) setPicked(id);
    else location.hash = address(id);
  };
  const node = (id: string) => {
    const each = things.get(id);
    const place = drawing.at.get(id);
    if (!each || !place) return null;
    const beside = besideOf(each, held, tara, scores);
    const text = textOf(id) || "Nothing entered yet";
    const at = { left: place.x - frame.left, top: place.y - frame.top };
    const standing = [`map-${each.status?.kind ?? "empty"}`, each.loose ? "map-loose" : "", id === thing?.id ? "map-picked" : ""];
    // the record of an ego view: a block one looks into, with its own words whole and what it is made of beneath them
    if (made && id === centre) {
      return (
        <a
          key={id}
          {...choose(id)}
          className={["map-node rv-node rv-block", ...standing].join(" ")}
          style={{ ...at, width: blockWidth, height: heights?.get(id) }}
          title={tipOf(each)}
        >
          <span className="map-mark" aria-hidden="true" />
          <b>{id}</b>
          <span className="rv-beside">
            {beside.chip}
            <span className="rv-tag">{each.what ?? kindOf(each).one}</span>
          </span>
          <span className="map-text">{text}</span>
          <CompositionBlock made={made} />
        </a>
      );
    }
    const dim = lit !== null && !lit.has(id);
    const classes = ["map-node rv-node", ...standing, id === centre ? "map-centre" : "", dim ? "map-dim" : ""];
    // The marks of what the record is linked to elsewhere stand on its corner that points away from the middle.
    const leftOfMiddle = place.x + size.w / 2 < 0;
    return (
      <Fragment key={id}>
        <a {...choose(id)} className={classes.join(" ")} style={{ ...at, height: heights?.get(id) }} title={tipOf(each)}>
          <span className="map-mark" aria-hidden="true" />
          <b>{id}</b>
          <span className="rv-beside">
            {beside.chip}
            {beside.tag && <span className="rv-tag">{onOneLine(beside.tag, roomBeside(id, size.w), TEXT_SIZE)}</span>}
          </span>
          <span className="map-text">{detailed ? text : onOneLine(text, size.w - TEXT_INSET, TEXT_SIZE)}</span>
          {detailed && <RatingStrip tara={tara} scores={scores} thing={each} />}
        </a>
        {beside.elsewhere && beside.elsewhere.ids.length > 0 && (
          <Marks
            owner={id}
            {...beside.elsewhere}
            tara={tara}
            things={things}
            most={detailed ? 4 : 2}
            corner={{ left: at.left + (leftOfMiddle ? -MARK_OUT : size.w + MARK_OUT), top: at.top - MARK_UP }}
            towardsLeft={leftOfMiddle}
            dim={dim}
            onShow={show}
            onCard={() => setPicked(id)}
          />
        )}
      </Fragment>
    );
  };

  // The other records that can stand in the middle, and the other way to look at the one that does.
  const others = centresOf(kind, tara, things, centre);
  const otherView = isEgo ? viewOf(tara, centre) : egoViewOf(tara, centre);
  const risk = held.kind === "threat" && held.riskId ? things.get(held.riskId) : undefined;
  const what = whatItIs(held, tara, things);
  const sizes = [
    { on: false, name: "Fit to canvas", tip: "Everything at once, each text on one line" },
    {
      on: true,
      name: "Detailed",
      tip: "Every record with its whole text and its ratings; a view too large for the window is moved through",
    },
  ];

  return (
    <section className={over ? "rv over" : "rv"} aria-label={`${VIEWS[kind].name} of ${centre}`}>
      <div className="rv-head">
        <div>
          <p className="map-kind">{VIEWS[kind].name}</p>
          <h2>
            {centre} {isEgo && (here.what ?? kindOf(here).one)}
            {!isEgo && kind !== "threat" && here.text}
            {risk && (
              <>
                · {risk.id} <ValueChip value={risk.value} />
              </>
            )}
          </h2>
        </div>
        {others.length > 1 && (
          <label className="map-show">
            {isEgo ? kindOf(here).one : VIEWS[kind].noun}
            <select value={centre} onChange={(event) => show({ kind, centre: event.target.value, chosen: null })}>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.id} {cutText(other.text, 80)}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="ways" aria-label="How the records are drawn">
          {sizes.map(({ on, name, tip }) => (
            <button
              key={name}
              type="button"
              className={detailed === on ? "way way-on" : "way"}
              title={tip}
              aria-pressed={detailed === on}
              onClick={() => setDetailed(on)}
            >
              {name}
            </button>
          ))}
        </fieldset>
        <span className="rv-buttons">
          {otherView && <ViewLink taraId={tara.id} view={otherView} />}
          <a className="button" href={address(centre)}>
            Open the record
          </a>
          <button type="button" className="primary" title="Back to where you were (Esc)" onClick={leave}>
            Leave
          </button>
        </span>
      </div>
      {what && <p className="rv-what">{what}</p>}
      <p className="help">{howToRead(held, tara, things, otherView)}</p>
      <div className="rv-frame" ref={frameBox} data-card={cardLeft ? "left" : undefined}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a click on the empty canvas lets go of the chosen record; Escape does the same */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
        <div
          className="rv-canvas"
          ref={canvasBox}
          style={{ padding: MARGIN, paddingRight: room + MARGIN }}
          onClick={() => setPicked(null)}
        >
          {canvas && (
            <div className="rv-fit" style={{ width: frame.width * zoom, height: frame.height * zoom }}>
              <div
                className={detailed ? "rv-stage readable" : "rv-stage"}
                style={{ width: frame.width, height: frame.height, transform: `scale(${zoom})` }}
              >
                <svg
                  width={frame.width}
                  height={frame.height}
                  viewBox={`${frame.left} ${frame.top} ${frame.width} ${frame.height}`}
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id="rv-arrow"
                      viewBox="0 0 8 8"
                      refX="7.2"
                      refY="4"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M0 0.6 L8 4 L0 7.4 z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {/* a line is lit when everything it joins or stands for belongs to the chosen record */}
                  {drawing.lines.map((line) => {
                    const standing = lit === null ? "" : line.joins.every((id) => lit.has(id)) ? "lit" : "dim";
                    return (
                      <path
                        key={line.key}
                        d={line.d}
                        className={["rv-line", line.faint ? "faint" : "", standing].join(" ")}
                        markerEnd={line.arrow ? "url(#rv-arrow)" : undefined}
                        markerStart={line.arrowStart ? "url(#rv-arrow)" : undefined}
                      />
                    );
                  })}
                </svg>
                {boxes.map(node)}
                {/* the words above a group of records: how they are linked to the one in the middle */}
                {drawing.captions.map((caption) => (
                  <span
                    key={caption.key}
                    className="rv-caption"
                    style={{ left: caption.x - frame.left, top: caption.y - frame.top }}
                  >
                    {caption.text}
                  </span>
                ))}
                {/* what stands on a line: the ID of the record the line stands for, or the words of a line that stands for none */}
                {drawing.labels.map((label) => {
                  const each = label.recordId ? things.get(label.recordId) : undefined;
                  const style = { left: label.x - frame.left, top: label.y - frame.top };
                  const faint = label.faint ? "faint" : "";
                  if (each) {
                    const classes = [
                      "ref rv-label",
                      faint,
                      each.id === thing?.id ? "picked" : "",
                      lit && !lit.has(each.id) ? "dim" : "",
                    ];
                    return (
                      <a key={label.key} {...choose(each.id)} className={classes.join(" ")} style={style} data-tip={tipOf(each)}>
                        {each.id}
                      </a>
                    );
                  }
                  return label.text ? (
                    <span
                      key={label.key}
                      className={["rv-label", faint, lit && !lit.has(label.of) ? "dim" : ""].join(" ")}
                      style={style}
                    >
                      {label.text}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
        {!thing && <p className="map-hint">{HOW_TO_CHOOSE}</p>}
        {thing && (
          <RecordCard
            ctx={ctx}
            open={open}
            thing={thing}
            graph={graph}
            things={things}
            state={cards}
            shownIn={view}
            onClose={() => setPicked(null)}
            onGo={go}
            actions={
              graph.things.has(thing.id) && (
                <a
                  className="button"
                  href={`#/tara/${tara.id}/graph?focus=${encodeURIComponent(thing.id)}`}
                  title="This record on the graph, with everything it rests on and leads to"
                >
                  Whole chain
                </a>
              )
            }
          />
        )}
      </div>
      <div className="rv-foot">
        {legend}
        <LineLegend held={held} />
      </div>
    </section>
  );
}

interface MarksProps {
  /** The record that carries the marks, the records it is linked to besides what is drawn, and in which way. */
  owner: string;
  ids: string[];
  does: Also;
  tara: Tara;
  things: ReadonlyMap<string, Thing>;
  /** As many marks as the record has room for. With more to name, the last mark counts the rest. */
  most: number;
  /** The corner of the record the marks stand on, and whether they run from it to the right or end at it. */
  corner: { left: number; top: number };
  towardsLeft: boolean;
  /** The record has stepped back, because another one is chosen: its marks step back with it. */
  dim: boolean;
  onShow: (view: ViewOf) => void;
  /** Opens the card of the record, which lists everything it is linked to. */
  onCard: () => void;
}

/**
 * What a record is linked to besides what is drawn here. Each has a mark of its own on the record, which names
 * it and leads to the view it is seen in: one mark, one record, one place to go.
 */
function Marks({ owner, ids, does, tara, things, most, corner, towardsLeft, dim, onShow, onCard }: MarksProps) {
  const all = ids.map((id) => {
    // a damage scenario elsewhere is one of another asset: the mark says of which
    const asset =
      does === "leads to"
        ? tara.assets.find((each) => each.id === tara.damages.find((damage) => damage.id === id)?.assetId)
        : undefined;
    const of = asset ? ` (of ${asset.id} ${asset.name ?? ""})` : "";
    return { id, to: markLeadsTo(does, owner, id, tara), text: `${id} ${things.get(id)?.text ?? ""}${of}` };
  });
  const named = all.length <= most ? all : all.slice(0, most - 1);
  const rest = all.slice(named.length);
  const act = (event: MouseEvent, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };
  return (
    <span className={["rv-also", towardsLeft ? "left" : "", dim ? "dim" : ""].join(" ")} style={corner}>
      {named.map((mark) => (
        <button
          key={mark.id}
          type="button"
          className="rv-more"
          title={`Also ${does} ${mark.text}${mark.to ? `\nClick to see it in its ${VIEWS[mark.to.kind].name.toLowerCase()}` : ""}`}
          onClick={(event) => act(event, () => (mark.to ? onShow(mark.to) : onCard()))}
        >
          +{mark.id}
        </button>
      ))}
      {rest.length > 0 && (
        <button
          type="button"
          className="rv-more"
          title={`Also ${does}:\n${rest.map((mark) => mark.text).join("\n")}\nClick for the card, which lists them`}
          onClick={(event) => act(event, onCard)}
        >
          +{rest.length} more
        </button>
      )}
    </span>
  );
}
