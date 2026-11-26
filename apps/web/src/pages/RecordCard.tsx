// The card of a record that is chosen on a drawing: the graph, the view of a record, the architecture diagram.
// One form for all of them: what it is with Edit, Minimise and Close at the top; its ID; its text and how it
// stands; the buttons that lead on, to the record first and then to its views; then its ratings, drawn, and
// what it is linked to, in sections. Made small, it shows the ID and one line. With Edit on, it shows the
// fields of the record instead: a second way to amend a record, for people who take things in as a picture.

import { type AnyRecord, cutText, findRecord } from "@tara/core";
import { type ReactNode, useState } from "react";
import { type Ctx, STEPS, type StepDef } from "../steps.tsx";
import { hrefOf, StateChip, StatusChip, ValueChip } from "../ui/marks.tsx";
import { Ratings } from "../ui/Ratings.tsx";
import { ViewLink } from "../ui/ViewLink.tsx";
import type { OpenTara } from "../useTara.ts";
import { architectureLinks } from "../views/belonging.ts";
import { type Graph, kindOf, type Thing } from "../views/graph.ts";
import { egoViewOf, type ViewOf, viewOf } from "../views/views.ts";
import { RecordForm } from "./RecordStep.tsx";

/** How a card is shown: small or whole, read or amended. */
export interface CardState {
  small: boolean;
  resize: (small: boolean) => void;
  editing: boolean;
  setEditing: (on: boolean) => void;
}

const SIZE_KEY = "tara.card";

/**
 * The state of the cards of one drawing. Whether cards are small is one choice for every card, remembered in
 * this browser, so that a drawing can be shown to others whole. Amending stays on from one record to the
 * next, so that a walk through a drawing can be a round of corrections.
 */
export function useCardState(): CardState {
  const [small, setSmall] = useState(() => localStorage.getItem(SIZE_KEY) === "small");
  const [editing, setEditing] = useState(false);
  const resize = (to: boolean) => {
    setSmall(to);
    localStorage.setItem(SIZE_KEY, to ? "small" : "whole");
  };
  return { small, resize, editing, setEditing };
}

/** The room a card takes on its drawing, by how it is shown: its width and height. */
export function cardRoom(state: CardState): { width: number; height: number } {
  if (state.small) return { width: 410, height: 150 };
  return { width: state.editing ? 520 : 330, height: Number.POSITIVE_INFINITY };
}

/** A pencil, for the button that turns reading into amending. */
function EditIcon() {
  return (
    <svg
      className="line-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M2 12l.7-2.9 7.2-7.2a1 1 0 0 1 1.4 0l.8.8a1 1 0 0 1 0 1.4L4.9 11.3 2 12z" />
      <path d="M8.7 3.1l2.2 2.2" />
    </svg>
  );
}

/** The steps whose form holds the record: its own step, and for a risk both its rating and its treatment. */
function formsOf(ctx: Ctx, id: string): { step: StepDef; record: AnyRecord }[] {
  const found = findRecord(ctx.tara, id);
  if (!found) return [];
  return STEPS.filter((step) => step.kind === found.kind && (step.fields?.length ?? 0) > 0).map((step) => ({
    step,
    record: found.record,
  }));
}

interface Props {
  ctx: Ctx;
  open: OpenTara;
  /** The chosen record, the graph it stands on, and every record that can be named here (views/graph.ts, thingsToDraw). */
  thing: Thing;
  graph: Graph;
  things: ReadonlyMap<string, Thing>;
  state: CardState;
  /** Closes the card: no record is chosen any more. */
  onClose: () => void;
  /** Goes to a record that the card names. */
  onGo: (id: string) => void;
  /** The view the card is shown in. The way into that view is not offered from within it. */
  shownIn?: ViewOf | undefined;
  /** Buttons after "Open the record" and the ways into the views. */
  actions?: ReactNode;
}

/** The card of the chosen record, in one of its three forms: small, whole, or with the fields of the record to amend it. */
export function RecordCard({ ctx, open, thing, graph, things, state, onClose, onGo, shownIn, actions }: Props) {
  const { tara } = ctx;
  const { small, resize, editing, setEditing } = state;
  const kind = thing.what ?? kindOf(thing).one;
  const address = hrefOf(tara, thing.id) ?? "#/";
  const chip = thing.kind === "risks" ? <ValueChip value={thing.value} /> : null;
  const forms = formsOf(ctx, thing.id);

  // The other ways to look at the record: the view it is seen in, and its ego view.
  const isShown = (view: ViewOf | null) => view !== null && view.kind === shownIn?.kind && view.centre === shownIn.centre;
  const ways = [viewOf(tara, thing.id), egoViewOf(tara, thing.id)].filter(
    (view): view is ViewOf => view !== null && !isShown(view),
  );
  const waysAs = (as: "button" | "plain" | "sign") =>
    ways.map((view) => <ViewLink key={view.kind} taraId={tara.id} view={view} from={thing.id} as={as} />);
  const close = (
    <button type="button" className="link" onClick={onClose}>
      Close
    </button>
  );

  if (small) {
    return (
      <aside className="map-inspector small" aria-live="polite">
        <div className="map-small-head">
          <b>{thing.id}</b>
          {chip}
          <span className="map-kind">{kind}</span>
          <span className="map-card-buttons">
            {waysAs("sign")}
            {forms.length > 0 && (
              <button
                type="button"
                className="card-edit"
                title="Amend this record here"
                onClick={() => {
                  resize(false);
                  setEditing(true);
                }}
              >
                <EditIcon />
                Edit
              </button>
            )}
            <button
              type="button"
              className="link"
              title="Show the whole card: how it stands and what it is linked to"
              onClick={() => resize(false)}
            >
              Expand
            </button>
            {close}
          </span>
        </div>
        <p className="map-small-text">{thing.text || <span className="muted">Nothing entered yet</span>}</p>
      </aside>
    );
  }

  if (editing && forms.length > 0) {
    const threat = things.get(graph.threatOf.get(thing.id) ?? "");
    return (
      <aside className="map-inspector editing" aria-label={`Amend ${thing.id}`}>
        <div className="detail-head">
          <p className="map-kind">{kind}</p>
          <span className="map-card-buttons">
            <button
              type="button"
              className="card-edit on"
              title="Back to reading. What you changed is saved."
              onClick={() => setEditing(false)}
            >
              Done
            </button>
            {close}
          </span>
        </div>
        <h2>
          {thing.id} {chip}
        </h2>
        {threat && (
          <p className="help">
            The wording of a risk is its threat scenario's: amend{" "}
            <button type="button" className="link" onClick={() => onGo(threat.id)}>
              {threat.id}
            </button>
            .
          </p>
        )}
        {forms.map(({ step, record }) => (
          <section key={step.key}>
            {forms.length > 1 && <h3>{step.title}</h3>}
            <RecordForm key={record.id} step={step} record={record} ctx={ctx} open={open} compact />
          </section>
        ))}
        <p className="map-edit-foot">
          <span className="muted">Saved as you leave a field.</span>
          <span className="map-foot-links">
            {waysAs("plain")}
            <a className="ref" href={address}>
              Open the record
            </a>
          </span>
        </p>
      </aside>
    );
  }

  const named = (ids: string[] | undefined) => (ids ?? []).flatMap((id) => things.get(id) ?? []);
  return (
    <aside className="map-inspector" aria-live="polite">
      <div className="detail-head">
        <p className="map-kind">{kind}</p>
        <span className="map-card-buttons">
          {forms.length > 0 && (
            <button type="button" className="card-edit" title="Amend this record here" onClick={() => setEditing(true)}>
              <EditIcon />
              Edit
            </button>
          )}
          <button
            type="button"
            className="link"
            title="Make this card small, so that it covers little of what is drawn"
            onClick={() => resize(true)}
          >
            Minimise
          </button>
          {close}
        </span>
      </div>
      <h2>
        {thing.id} {chip}
      </h2>
      <p>{thing.text || <span className="muted">Nothing entered yet</span>}</p>
      {thing.status !== undefined && (
        <p>
          <StatusChip status={thing.status} />
        </p>
      )}
      {thing.state && (
        <p>
          <StateChip state={thing.state} />{" "}
          {thing.workLink && (
            <a className="ref" href={thing.workLink} target="_blank" rel="noreferrer noopener">
              Where the work is tracked
            </a>
          )}
        </p>
      )}
      {thing.loose && (
        <p className="map-loose-note">
          <b>Loose end.</b> {thing.loose}.
        </p>
      )}
      <div className="actions">
        <a className="button" href={address}>
          Open the record
        </a>
        {waysAs("button")}
        {actions}
      </div>
      <Ratings tara={tara} scores={ctx.assessment.checks.scores} thing={thing} />
      <CardLinks title="Rests on" things={named(graph.up.get(thing.id))} onGo={onGo} />
      <CardLinks title="Leads to" things={named(graph.down.get(thing.id))} onGo={onGo} />
      {/* what the architecture knows about the record besides the links of the graph */}
      {architectureLinks(graph, tara, thing.id).map((section) => (
        <CardLinks key={section.title} title={section.title} things={named(section.ids)} none={section.none} onGo={onGo} />
      ))}
    </aside>
  );
}

interface LinksProps {
  title: string;
  things: Thing[];
  /** What to say when there are none. Without it, the section is left out. */
  none?: string | undefined;
  onGo: (id: string) => void;
}

/** A section of a card: the records this one is linked to in one way, each by its ID with the start of its text. */
function CardLinks({ title, things, none, onGo }: LinksProps) {
  if (things.length === 0 && none === undefined) return null;
  return (
    <section>
      <h3>{title}</h3>
      {things.length === 0 ? (
        <p className="muted">{none}</p>
      ) : (
        <ul className="uses">
          {things.map((thing) => (
            <li key={thing.id}>
              <button type="button" className="link" onClick={() => onGo(thing.id)}>
                {thing.id}
              </button>{" "}
              <span className="muted">{cutText(thing.text, 64)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
