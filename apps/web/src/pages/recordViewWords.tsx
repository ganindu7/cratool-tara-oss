// What a view of one record says in words: the line that says what the record is, the sentence above the
// drawing that says what there is to see and how to read it, and what the lines of the drawing mean.
// Kept apart from the drawing itself (RecordView.tsx), so that the words can be read and changed in one place.

import type { Tara } from "@tara/core";
import type { ReactNode } from "react";
import { kindOf, type Thing } from "../views/graph.ts";
import { type Held, VIEWS, type ViewOf } from "../views/views.ts";

type Things = ReadonlyMap<string, Thing>;

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const total = (numbers: number[]): number => numbers.reduce((all, n) => all + n, 0);
/** A record by its ID and its words: "IT01 Kettle". */
const titled = (things: Things, id: string | null | undefined): string | null =>
  id ? `${id} ${things.get(id)?.text ?? ""}`.trim() : null;

/** How a record is chosen in a view, said on its canvas while none is. */
export const HOW_TO_CHOOSE =
  "Select a record to light up what belongs to it, and to read or amend it at the right. Double-click to open it.";

/** One line under the name of the record: what it is. Nothing where the drawing says it already. */
export function whatItIs(held: Held, tara: Tara, things: Things): ReactNode {
  switch (held.kind) {
    case "element": {
      const element = tara.elements.find((candidate) => candidate.id === held.elementId);
      if (!element) return null;
      const item = titled(things, element.itemId);
      const boundary = titled(things, element.boundaryId);
      return [
        `${things.get(element.id)?.what ?? "Element"}${item ? ` of ${item}` : ""}${boundary ? `, inside ${boundary}` : ""}.`,
        element.description,
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "asset": {
      const asset = tara.assets.find((candidate) => candidate.id === held.assetId);
      const item = titled(things, asset?.itemId);
      return (
        [item ? `Asset of ${item}.` : null, asset?.variant ? `Variant: ${asset.variant}.` : null].filter(Boolean).join(" ") ||
        null
      );
    }
    case "threat":
      return things.get(held.threatId)?.text || <span className="muted">Nothing entered yet</span>;
    case "control": {
      const control = tara.controls.find((candidate) => candidate.id === held.controlId);
      if (!control) return null;
      const type = control.type ? `${control.type[0]?.toUpperCase()}${control.type.slice(1)} control.` : null;
      const supports =
        control.craTags.length > 0
          ? `It may support CRA Annex I Part I(2) ${control.craTags.map((tag) => `(${tag})`).join(", ")}.`
          : null;
      return [type, control.description, supports].filter(Boolean).join(" ") || null;
    }
    case "ego":
      // what the record is stands in its block
      return null;
  }
}

/** The sentence above the drawing: what there is to see, and how to read it. */
export function howToRead(held: Held, tara: Tara, things: Things, otherView: ViewOf | null): string {
  switch (held.kind) {
    case "element": {
      if (held.joined.length + held.assets.length + held.controls.length === 0) {
        return "Nothing is joined to this element, and nothing is recorded in it yet.";
      }
      const flows = total(held.joined.map((joined) => joined.flows.length));
      const damages = total(held.assets.map((asset) => asset.damages.length));
      return [
        `What this element is joined to, and what is in it: ${count(held.joined.length, "element", "elements")} joined to it by`,
        `${count(flows, "data flow", "data flows")} to the left, ${count(held.assets.length, "asset that lives", "assets that live")} in it`,
        `with ${count(damages, "damage scenario", "damage scenarios")} to the right` +
          (held.controls.length > 0
            ? `, and beneath it ${count(held.controls.length, "control that acts", "controls that act")} in it.`
            : "."),
        "Each line to the left is a data flow: it carries the flow's ID, and its arrowhead shows which way the data goes.",
        held.open.length > 0 ? `Not drawn, because an end is open: ${held.open.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "asset": {
      const beneath = held.homes.length > 0 ? "Beneath the asset: where it lives." : "";
      if (held.damages.length === 0) {
        const why = (tara.assets.find((asset) => asset.id === held.assetId)?.coverageRationale ?? "").trim();
        return ["No damage scenario is recorded for this asset.", why ? `Why none applies: ${why}` : "", beneath]
          .filter(Boolean)
          .join(" ");
      }
      const paths = new Set(held.threats.flatMap((threat) => threat.paths)).size;
      return [
        `What can happen to this asset, and by which ways: ${count(held.damages.length, "damage scenario", "damage scenarios")},`,
        `${count(held.threats.length, "threat scenario that leads", "threat scenarios that lead")} to ${held.damages.length === 1 ? "it" : "them"},`,
        `and ${count(paths, "attack path", "attack paths")}. Each line from a threat carries the ID of the attack path it stands for.`,
        beneath,
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "threat": {
      if (held.assets.length + held.paths.length + held.controls.length + held.goals.length === 0) {
        return "Nothing is linked to this threat scenario yet.";
      }
      const damages = total(held.assets.map((asset) => asset.damages.length));
      return [
        `What this threat leads to, how it is carried out, and what treats its risk: ${count(damages, "damage scenario", "damage scenarios")}`,
        `of ${count(held.assets.length, "asset", "assets")} to the left, ${count(held.paths.length, "attack path", "attack paths")}`,
        `and ${count(held.controls.length, "control", "controls")} to the right.`,
        "A control stands beside the path it covers; one that treats the risk as a whole stands level with the risk.",
        held.goals.length > 0
          ? `Beneath the risk: the ${count(held.goals.length, "goal or claim that answers", "goals and claims that answer")} it.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "control": {
      if (held.risks.length + held.places.length === 0)
        return "No risk has this control yet, and it is not placed on the architecture.";
      const apart = held.apart.length === 1 ? "that path's threat" : "those paths' threats";
      return [
        `What this control is for, and where it acts: ${count(held.risks.length, "risk has", "risks have")} it, to the left.`,
        held.risks.some((risk) => risk.paths.length > 0)
          ? "A line that carries an ID stands for an attack path of that risk's threat which the control covers; a line without one, for a risk it treats as a whole."
          : "",
        held.places.length > 0
          ? `Beneath it: the ${count(held.places.length, "element", "elements")} it acts in.`
          : "It is not placed on the architecture.",
        held.apart.length > 0
          ? `It also names ${held.apart.join(", ")} as covered, but no risk of ${apart} has this control.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "ego": {
      const thing = things.get(held.id);
      const around = held.left.length + held.right.length + (held.beneath ? 1 : 0);
      const itself = `This ${thing ? kindOf(thing).one.toLowerCase() : "record"} as the primary component: the block shows what it is made of`;
      const beneath = held.beneath ? `, beneath it ${held.beneath.title.toLowerCase()}` : "";
      return [
        around === 0
          ? `${itself}, and nothing is linked to it yet.`
          : `${itself}, and around it stands only what is linked to it directly, each group under the words that say how: ` +
            `to the left what it rests on or comes from, to the right what follows from it${beneath}.`,
        otherView ? `The chain is followed further in its ${VIEWS[otherView.kind].name.toLowerCase()}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
}

/** What the lines of a view mean, and what a mark on a record stands for, as entries of the legend beneath it. */
export function LineLegend({ held }: { held: Held }) {
  const line = (words: string, faint = false) => (
    <li key={words}>
      <span className={faint ? "rv-key faint" : "rv-key"} />
      {words}
    </li>
  );
  const mark = (sign: string, words: string) => (
    <li key={words}>
      <span className="rv-more key">{sign}</span>
      {words}
    </li>
  );
  const entries = (): ReactNode[] => {
    switch (held.kind) {
      case "element":
        return [
          line("Data flow; the arrowhead shows which way the data goes"),
          [...held.assets, ...held.controls].some((each) => each.elsewhere.length > 0) &&
            mark("+C", "Is in that element as well"),
        ];
      case "asset":
        return [
          line("Attack path"),
          line("Screened out", true),
          held.threats.some((threat) => threat.elsewhere.length > 0) &&
            mark("+DS", "Also leads to that damage scenario, of another asset"),
        ];
      case "threat":
        return [
          line("Carries out, leads to, covers"),
          line("Screened out, or only proposed", true),
          held.paths.some((path) => path.elsewhere.length > 0) && mark("+TS", "Also carries out that threat"),
          [...held.controls, ...held.goals].some((each) => each.elsewhere.length > 0) &&
            mark("+R", "Also treats or answers that risk"),
        ];
      case "control":
        return [
          line("Covers a path of the risk, or treats the risk as a whole"),
          line("Only proposed for that risk, or the path is screened out", true),
        ];
      case "ego":
        return [
          line("Linked to it directly"),
          [...held.left, ...held.right].some((group) => (group.faint?.length ?? 0) > 0) &&
            line("Does not count: screened out, or only proposed", true),
        ];
    }
  };
  return (
    <ul className="map-legend" aria-label="What the lines mean">
      {entries()}
    </ul>
  );
}
