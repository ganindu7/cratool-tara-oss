// The steps of the method, in the order they are worked, described as data.
//
// A step that lists records says here which records, the columns of its table and the fields of its form.
// The screen that shows a step (pages/RecordStep.tsx) is the same for all of them. To change what a step
// asks for, change its entry here; to add a field, see docs/architecture.md, "Adding a field".

import {
  type AnyRecord,
  type Assessment,
  bandName,
  type CheckedStep,
  CONTROL_STATE_LABELS,
  CONTROL_STATES,
  CRA_REQUIREMENTS,
  CRA_TAGS,
  controlState,
  craSummary,
  craTrace,
  ELEMENT_KIND_NAMES,
  type ElementKind,
  FACTOR_KEYS,
  IMPACT_CATEGORY_KEYS,
  IMPACT_PENDING_TEXT,
  levelName,
  POTENTIAL_PENDING_TEXT,
  type RecordKind,
  type ReviewKind,
  risksUsingControl,
  riskValue,
  type Status,
  type Tara,
} from "@tara/core";
import type { ReactNode } from "react";
import type { Option } from "./ui/fields.tsx";
import { Linked, RecordLink, RecordLinks, StateChip, stateMeaning, ValueChip } from "./ui/marks.tsx";

/** What a step is given to work with. */
export interface Ctx {
  tara: Tara;
  assessment: Assessment;
}

/** One field of a step's form: which field of the record it holds, what it is called, and how it is entered. */
export interface FieldDef {
  /** The name of the field in the record, as in the schema: "name", "ratings.safety". */
  name: string;
  label: string;
  /** How the field is entered. "state" is the state of a control, set on every risk that uses it. */
  widget: "text" | "area" | "date" | "url" | "select" | "check" | "links" | "route" | "state";
  help?: string;
  /** A realistic value, shown faintly while the field is empty. */
  example?: string;
  /** The choices; `record` is absent while a new record is being described. */
  options?: (ctx: Ctx, record?: AnyRecord) => Option[];
  /** The stored value is a number (an impact level). */
  numeric?: boolean;
  /** What to show when there is nothing to choose from. */
  empty?: string;
  /** Fields with the same group are shown together under this heading. */
  group?: string;
}

/** One column of a step's table: its heading, and what it shows of each record. */
export interface ColumnDef {
  header: string;
  cell: (record: AnyRecord, ctx: Ctx) => ReactNode;
  /** The column takes the room that is left. */
  grow?: boolean;
}

/**
 * One step of the method, as data: what it is called and what it is for and, where it lists records, which
 * records, the columns of its table, the fields of its form and how a record is added.
 */
export interface StepDef {
  key: string;
  title: string;
  intro: string;
  /** The kind of record the step lists. Absent for steps with a screen of their own. */
  kind?: RecordKind;
  /** The checks of this step count towards what its stop on the route says is left. */
  checked?: CheckedStep;
  noun?: string;
  /** What must be chosen before a record can be added, and how the choices become its first values. */
  add?: {
    fields: FieldDef[];
    defaults?: (ctx: Ctx) => Record<string, string>;
    values: (chosen: Record<string, string>) => Record<string, unknown>;
    /** Why nothing can be added right now, if so. */
    blocked?: (ctx: Ctx) => string | null;
    /** The person may give the record its ID. */
    ownId?: boolean;
  };
  /** The review that settles a record of this step. */
  review?: { kind: ReviewKind; label: string; help: string };
  emptyText?: string;
  status?: (record: AnyRecord, ctx: Ctx) => Status | undefined;
  columns?: ColumnDef[];
  fields?: FieldDef[];
  /** What follows from the record, shown above its fields: the values the tool works out. */
  derived?: (record: AnyRecord, ctx: Ctx) => { label: string; value: ReactNode }[];
}

// ---------------------------------------------------------------------------------------------- small helpers

const text = (value: unknown): ReactNode =>
  typeof value === "string" && value.trim() ? value : <span className="muted">–</span>;
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);

/** In a list, a name that is not there yet is a dash. */
const orDash = (name: string | null): string => name ?? "–";

const FACTOR_LABELS: Record<string, string> = {
  elapsed_time: "Elapsed time",
  expertise: "Expertise",
  knowledge: "Knowledge of the product",
  window_of_opportunity: "Window of opportunity",
  equipment: "Equipment",
};
/** What a kind of element is called; a kind that is not known keeps its own word. */
export const elementKindName = (kind: unknown): string => ELEMENT_KIND_NAMES[kind as ElementKind] ?? String(kind);

/** Records as choices: the ID, then what the record is called. */
const named = (
  records: { id: string; name?: string | null; description?: string | null; statement?: string | null }[],
): Option[] =>
  records.map((r) => ({ value: r.id, label: [r.id, r.name ?? r.description ?? r.statement].filter(Boolean).join("  ") }));
const riskOptions = (ctx: Ctx): Option[] =>
  ctx.tara.risks.map((r) => ({
    value: r.id,
    label: `${r.id}  ${ctx.tara.threats.find((t) => t.id === r.threatId)?.description ?? ""}`,
  }));
const tagOptions = (only?: string[]): Option[] =>
  CRA_TAGS.filter((key) => !only || only.includes(key)).map((key) => ({ value: key, label: `(${key}) ${craSummary(key)}` }));
/** The elements a record can name: things first, then the flows between them, then the boundaries if asked for. */
const elementOptions = (ctx: Ctx, flows = true, boundaries = false): Option[] => {
  const rank = (kind: string) => (kind === "data_flow" ? 1 : kind === "trust_boundary" ? 2 : 0);
  return [...ctx.tara.elements]
    .filter((e) => (flows || e.kind !== "data_flow") && (boundaries || e.kind !== "trust_boundary"))
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map((e) => ({ value: e.id, label: `${e.id}  ${e.name ?? ""}` }));
};
const threatOf = (ctx: Ctx, risk: AnyRecord) => ctx.tara.threats.find((t) => t.id === risk.threatId);
const scoreOfRisk = (ctx: Ctx, risk: AnyRecord) => ctx.assessment.checks.scores.risks.get(str(risk.threatId));
const residualOf = (ctx: Ctx, risk: AnyRecord) =>
  riskValue(ctx.tara.method, risk.residualImpact as never, risk.residualFeasibility as never);

const EVIDENCE_STATES: Option[] = [
  { value: "planned", label: "Planned" },
  { value: "built", label: "Built, not yet in the product in use" },
  { value: "implemented", label: "In the product" },
  { value: "verified", label: "Verified" },
  { value: "failed", label: "Failed" },
];

// ----------------------------------------------------------------------------------------------------- the steps

/** Every step, in the order it is worked: the order of the route at the left of an open TARA. */
export const STEPS: StepDef[] = [
  {
    key: "scope",
    title: "Scope",
    checked: "scope",
    intro:
      "Say what is assessed and which rules apply to it. The Cyber Resilience Act asks for the intended purpose, the foreseeable use, the conditions of use and the expected time in use.",
  },
  {
    key: "items",
    title: "Assessed items",
    kind: "items",
    checked: "items",
    noun: "item",
    intro:
      "An item is what this assessment is about: a system or function of the product. Most assessments have one. Say where its boundary lies, what it does, what it connects to and where it is used.",
    emptyText: "No item yet. Add the system or function this assessment covers.",
    add: { fields: [], values: () => ({}), ownId: true },
    status: (r, c) => c.assessment.checks.items.get(r.id),
    columns: [
      { header: "Name", cell: (r) => text(r.name), grow: true },
      { header: "Configuration", cell: (r) => text(r.configurationRef) },
    ],
    fields: [
      { name: "name", label: "Name", widget: "text", example: "Smart thermostat T1" },
      {
        name: "configurationRef",
        label: "Configuration",
        widget: "text",
        help: "The controlled configuration, drawing or release this definition describes.",
        example: "Hardware C, software release 2.4",
      },
      {
        name: "boundaryFunctions",
        label: "Boundary and functions",
        widget: "area",
        help: "What is inside the item, what is outside, and what it does.",
        example:
          "The thermostat with its display and sensors. It switches the heating and keeps a schedule. The boiler is outside.",
      },
      {
        name: "architectureInterfaces",
        label: "Architecture and interfaces",
        widget: "area",
        help: "The main components and every way in from outside: networks, ports, radio, service access.",
        example: "Wi-Fi to the home network, a relay output to the boiler, a USB service port under the cover",
      },
      {
        name: "environmentUse",
        label: "Operating environment and use",
        widget: "area",
        help: "Where it is used and by whom, including misuse that can be foreseen.",
        example: "Homes and small offices; set up by the owner; guests may share the same Wi-Fi",
      },
    ],
  },
  {
    key: "architecture",
    title: "Architecture",
    kind: "elements",
    checked: "architecture",
    noun: "element",
    intro:
      "What the item is made of: its components, the outside parties it talks to, where data is kept, and the data flows that join them. Assets and attack paths then name these elements. Switch to the diagram to draw them.",
    emptyText: "No elements yet. List the item's components, what it connects to, and the data flows between them.",
    add: {
      blocked: (c) => (c.tara.items.length === 0 ? "Add an item first: an element belongs to an item." : null),
      defaults: (c) => ({ kind: "component", itemId: c.tara.items[0]?.id ?? "" }),
      values: (chosen) => ({ kind: chosen.kind, itemId: chosen.itemId, name: chosen.name }),
      fields: [
        {
          name: "kind",
          label: "Kind",
          widget: "select",
          options: () => Object.entries(ELEMENT_KIND_NAMES).map(([value, label]) => ({ value, label })),
        },
        { name: "itemId", label: "Item", widget: "select", options: (c) => named(c.tara.items) },
        { name: "name", label: "Name", widget: "text", example: "Controller, or Owner's phone" },
      ],
    },
    status: (r, c) => c.assessment.checks.elements.get(r.id),
    columns: [
      { header: "Kind", cell: (r) => elementKindName(r.kind) },
      {
        header: "Element",
        grow: true,
        cell: (r) => (
          <>
            {text(r.name)}
            {str(r.description) && <span className="cell-note">{str(r.description)}</span>}
          </>
        ),
      },
      {
        header: "Joins",
        cell: (r, c) =>
          r.kind === "data_flow" ? (
            <RecordLinks tara={c.tara} ids={[r.sourceId, r.targetId].filter((id): id is string => typeof id === "string")} />
          ) : (
            <RecordLinks
              tara={c.tara}
              ids={c.tara.elements.filter((f) => f.sourceId === r.id || f.targetId === r.id).map((f) => f.id)}
            />
          ),
      },
      {
        header: "Assets",
        cell: (r, c) => (
          <RecordLinks tara={c.tara} ids={c.tara.assets.filter((a) => a.elementIds.includes(r.id)).map((a) => a.id)} />
        ),
      },
    ],
    fields: [
      { name: "name", label: "Name", widget: "text", example: "Controller" },
      {
        name: "description",
        label: "Description",
        widget: "area",
        help: "What it is, or for a data flow what is carried and how.",
        example: "The small computer in the housing: joins the Wi-Fi, takes commands, switches the relay",
      },
      {
        name: "sourceId",
        label: "From (data flow only)",
        widget: "select",
        options: (c) => elementOptions(c, false),
        empty: "Open",
      },
      {
        name: "targetId",
        label: "To (data flow only)",
        widget: "select",
        options: (c) => elementOptions(c, false),
        empty: "Open",
      },
      {
        name: "direction",
        label: "Direction (data flow only)",
        widget: "select",
        options: () => [
          { value: "forward", label: "One way: from, to" },
          { value: "both", label: "Both ways" },
          { value: "backward", label: "One way: to, from" },
        ],
        empty: "Not said",
      },
      {
        name: "boundaryId",
        label: "Inside the trust boundary",
        widget: "select",
        options: (c) =>
          c.tara.elements
            .filter((e) => e.kind === "trust_boundary")
            .map((e) => ({ value: e.id, label: `${e.id}  ${e.name ?? ""}` })),
        empty: "None",
      },
    ],
  },
  {
    key: "assets",
    title: "Assets",
    kind: "assets",
    checked: "assets",
    noun: "asset",
    intro:
      "An asset is something of the item worth protecting: a function, data, or a component whose compromise would cause damage.",
    emptyText: "No assets yet. List what an attacker could read, change or stop.",
    add: { fields: [], values: () => ({}) },
    status: (r, c) => c.assessment.checks.assets.get(r.id),
    columns: [
      { header: "Asset", cell: (r) => text(r.name), grow: true },
      { header: "Item", cell: (r, c) => <RecordLink tara={c.tara} id={str(r.itemId)} /> },
      { header: "Lives in", cell: (r, c) => <RecordLinks tara={c.tara} ids={list(r.elementIds)} /> },
      {
        header: "Damage scenarios",
        cell: (r, c) => <RecordLinks tara={c.tara} ids={c.tara.damages.filter((d) => d.assetId === r.id).map((d) => d.id)} />,
      },
    ],
    fields: [
      { name: "name", label: "Name", widget: "text", example: "Heating schedule" },
      { name: "itemId", label: "Item", widget: "select", options: (c) => named(c.tara.items) },
      {
        name: "elementIds",
        label: "Where it lives in the architecture",
        widget: "links",
        options: (c) => elementOptions(c),
        empty: "There are no architecture elements yet.",
        help: "The component that holds it, the store that keeps it, or the data flow that carries it.",
      },
      {
        name: "variant",
        label: "Variant",
        widget: "text",
        help: "Only if the asset exists in some variants of the product.",
        example: "Models with Wi-Fi",
      },
      {
        name: "coverageRationale",
        label: "Why no damage scenario applies",
        widget: "area",
        help: "Needed only when the asset has no damage scenario.",
        example: "Read-only model number; its loss or change harms no one",
      },
    ],
  },
  {
    key: "damages",
    title: "Damage scenarios",
    kind: "damages",
    checked: "damages",
    noun: "damage scenario",
    intro:
      "A damage scenario says who is harmed and how, when an asset loses confidentiality, integrity or availability. Each is rated in four categories; the highest rating is its impact.",
    emptyText: "No damage scenarios yet. For each asset, describe what would happen if it were compromised.",
    add: { fields: [], values: () => ({}) },
    status: (r, c) => c.assessment.checks.damages.get(r.id),
    columns: [
      { header: "Asset", cell: (r, c) => <RecordLink tara={c.tara} id={str(r.assetId)} /> },
      { header: "Lost", cell: (r, c) => text(c.assessment.checks.scores.damages.get(r.id)?.ciaLabel) },
      { header: "Damage scenario", cell: (r) => text(r.description), grow: true },
      { header: "Impact", cell: (r, c) => orDash(levelName(c.tara.method, c.assessment.checks.scores.damages.get(r.id)?.score)) },
    ],
    derived: (r, c) => [
      { label: "Impact", value: orDash(levelName(c.tara.method, c.assessment.checks.scores.damages.get(r.id)?.score)) },
    ],
    fields: [
      { name: "assetId", label: "Affected asset", widget: "select", options: (c) => named(c.tara.assets) },
      { name: "confidentiality", label: "Confidentiality", widget: "check", group: "Security property lost" },
      { name: "integrity", label: "Integrity", widget: "check", group: "Security property lost" },
      { name: "availability", label: "Availability", widget: "check", group: "Security property lost" },
      {
        name: "description",
        label: "Damage scenario",
        widget: "area",
        help: "Who is harmed and what happens.",
        example: "The heating runs at full power for days while the owner is away",
      },
      ...IMPACT_CATEGORY_KEYS.map(
        (key): FieldDef => ({
          name: `ratings.${key}`,
          label: key[0]?.toUpperCase() + key.slice(1),
          widget: "select",
          numeric: true,
          group: "Impact rating",
          empty: "Not rated",
          options: (c) =>
            [...(c.tara.method.impact_categories.find((x) => x.key === key)?.ratings ?? [])]
              .sort((a, b) => b.level - a.level)
              .map((rating) => ({ value: String(rating.level), label: rating.label, title: rating.criteria })),
        }),
      ),
      {
        name: "impactRationale",
        label: "Rationale for the ratings",
        widget: "area",
        help: "The assumptions and evidence behind the ratings.",
        example:
          "Moderate: wasted energy and a cold or overheated home; a frost guard that no software can switch off prevents damage to pipes",
      },
    ],
  },
  {
    key: "threats",
    title: "Threat scenarios",
    kind: "threats",
    checked: "threats",
    noun: "threat scenario",
    intro:
      "A threat scenario is a way an asset could be compromised that leads to one or more damage scenarios. Each threat has one risk.",
    emptyText: "No threat scenarios yet. Describe what could happen to cause each damage scenario.",
    add: { fields: [], values: () => ({}) },
    status: (r, c) => c.assessment.checks.threats.get(r.id),
    columns: [
      { header: "Category", cell: (r, c) => text(c.tara.method.threat_categories.find((x) => x.key === r.category)?.label) },
      { header: "Threat scenario", cell: (r) => text(r.description), grow: true },
      { header: "Damage", cell: (r, c) => <RecordLinks tara={c.tara} ids={list(r.damageIds)} /> },
      {
        header: "Highest impact",
        cell: (r, c) => {
          const impact = c.assessment.checks.scores.threats.get(r.id)?.maxImpact;
          if (!impact) return text(null);
          return "level" in impact ? (
            orDash(levelName(c.tara.method, impact.level))
          ) : (
            <span className="muted">{IMPACT_PENDING_TEXT[impact.pending]}</span>
          );
        },
      },
      {
        header: "Risk",
        cell: (r, c) => (
          <RecordLinks tara={c.tara} ids={c.tara.risks.filter((risk) => risk.threatId === r.id).map((risk) => risk.id)} />
        ),
      },
    ],
    fields: [
      {
        name: "category",
        label: "Category",
        widget: "select",
        options: (c) => c.tara.method.threat_categories.map((x) => ({ value: x.key, label: x.label, title: x.description })),
      },
      {
        name: "description",
        label: "Threat scenario",
        widget: "area",
        help: "What happens, to which asset, and which security property is compromised.",
        example: "Someone other than the owner changes the heating schedule",
      },
      {
        name: "damageIds",
        label: "Damage scenarios it leads to",
        widget: "links",
        options: (c) => named(c.tara.damages),
        empty: "Add damage scenarios first, then link them here.",
      },
    ],
  },
  {
    key: "paths",
    title: "Attack paths",
    kind: "paths",
    checked: "paths",
    noun: "attack path",
    review: {
      kind: "attack_path",
      label: "Review of this attack path",
      help: "The record of the review of this path and its rating.",
    },
    intro:
      "An attack path is a concrete way to carry out a threat. Rate how hard it is on five factors, or screen it out with a reason. The fewer points, the easier the attack.",
    emptyText: "No attack paths yet. Describe how each threat could actually be carried out.",
    add: { fields: [], values: () => ({}) },
    status: (r, c) => c.assessment.checks.paths.get(r.id),
    columns: [
      { header: "Threats", cell: (r, c) => <RecordLinks tara={c.tara} ids={list(r.threatIds)} /> },
      { header: "Attack path", cell: (r) => text(r.description), grow: true },
      {
        header: "Points",
        cell: (r, c) => c.assessment.checks.scores.paths.get(r.id)?.totalPoints ?? <span className="muted">–</span>,
      },
      {
        header: "Feasibility",
        cell: (r, c) => orDash(bandName(c.tara.method, c.assessment.checks.scores.paths.get(r.id)?.feasibility)),
      },
    ],
    derived: (r, c) => {
      const score = c.assessment.checks.scores.paths.get(r.id);
      return [
        { label: "Points", value: score?.totalPoints ?? "–" },
        { label: "Feasibility", value: orDash(bandName(c.tara.method, score?.feasibility)) },
      ];
    },
    fields: [
      {
        name: "threatIds",
        label: "Threats this path carries out",
        widget: "links",
        options: (c) => named(c.tara.threats),
        empty: "Add threat scenarios first, then link them here.",
      },
      {
        name: "elementIds",
        label: "Its route through the architecture",
        widget: "route",
        options: (c) => elementOptions(c),
        empty: "There are no architecture elements yet.",
        help: "Where the attacker gets in, then what the attack passes through, in order.",
      },
      {
        name: "description",
        label: "Attack path",
        widget: "area",
        help: "The steps of the attack and the conditions assumed.",
        example:
          "From any device on the same Wi-Fi, send the schedule command. As first built, the thermostat obeys whoever asks.",
      },
      {
        name: "disposition",
        label: "Does it count towards the risk?",
        widget: "select",
        options: () => [
          { value: "included", label: "Yes, included" },
          { value: "screened_out", label: "No, screened out" },
        ],
        help: "Screen a path out only with a reason, given in the rationale.",
      },
      ...FACTOR_KEYS.map(
        (key): FieldDef => ({
          name: `factors.${key}`,
          label: FACTOR_LABELS[key] ?? key,
          widget: "select",
          group: "Attack potential",
          empty: "Not rated",
          options: (c) =>
            (c.tara.method.feasibility_factors.find((f) => f.key === key)?.options ?? []).map((o) => ({
              value: o.key,
              label: `${o.label} (${o.points})`,
              ...(o.description ? { title: o.description } : {}),
            })),
        }),
      ),
      {
        name: "feasibilityBasis",
        label: "Rationale",
        widget: "area",
        help: "Why these ratings, or why the path is screened out.",
        example: "The command is simple and documented. The only hurdle is being on the home network.",
      },
    ],
  },
  {
    key: "risks",
    title: "Risks",
    kind: "risks",
    checked: "risks",
    noun: "risk",
    review: {
      kind: "risk_rating",
      label: "Review of this rating",
      help: "The record of the review of this risk's value. The scope and every linked attack path must be reviewed first.",
    },
    intro:
      "One risk per threat scenario. Its value comes from the highest impact of the linked damage scenarios and from the easiest included attack path. Nothing is entered here: change the inputs and the value follows.",
    emptyText: "Risks appear here as soon as there are threat scenarios.",
    status: (r, c) => c.assessment.checks.riskRating.get(r.id),
    columns: [
      {
        header: "Threat",
        grow: true,
        cell: (r, c) => (
          <>
            <RecordLink tara={c.tara} id={str(r.threatId)} /> <span>{threatOf(c, r)?.description}</span>
          </>
        ),
      },
      {
        header: "Impact",
        cell: (r, c) => {
          const impact = scoreOfRisk(c, r)?.impact;
          if (!impact) return text(null);
          return "level" in impact ? (
            orDash(levelName(c.tara.method, impact.level))
          ) : (
            <span className="muted">{IMPACT_PENDING_TEXT[impact.pending]}</span>
          );
        },
      },
      {
        header: "Feasibility",
        cell: (r, c) => {
          const score = scoreOfRisk(c, r);
          if (!score) return text(null);
          const potential = score.minAttackPotential;
          return "points" in potential ? (
            `${orDash(bandName(c.tara.method, score.feasibility))} (${potential.points})`
          ) : (
            <span className="muted">{POTENTIAL_PENDING_TEXT[potential.pending]}</span>
          );
        },
      },
      { header: "Value", cell: (r, c) => <ValueChip value={scoreOfRisk(c, r)?.value} /> },
    ],
    derived: (r, c) => {
      const score = scoreOfRisk(c, r);
      const impact = score?.impact;
      return [
        { label: "Threat", value: <Linked tara={c.tara} text={`${str(r.threatId)} ${threatOf(c, r)?.description ?? ""}`} /> },
        { label: "Impact", value: impact && "level" in impact ? orDash(levelName(c.tara.method, impact.level)) : "–" },
        { label: "Attack paths", value: <RecordLinks tara={c.tara} ids={score?.linkedPathIds ?? []} /> },
        { label: "Feasibility", value: orDash(bandName(c.tara.method, score?.feasibility)) },
        { label: "Risk value", value: <ValueChip value={score?.value} /> },
      ];
    },
    fields: [],
  },
  {
    key: "controls",
    title: "Controls",
    kind: "controls",
    checked: "controls",
    noun: "control",
    intro: "The security measures this product has or will get. Each risk then selects the controls that treat it.",
    emptyText: "No controls yet. Add the security measures that exist or are planned.",
    add: { fields: [], values: () => ({}) },
    status: (r, c) => c.assessment.checks.controls.get(r.id),
    columns: [
      {
        header: "Control",
        grow: true,
        cell: (r) => (
          <>
            {text(r.name)}
            {str(r.description) && <span className="cell-note">{str(r.description)}</span>}
          </>
        ),
      },
      { header: "State", cell: (r, c) => <StateChip state={controlState(c.tara, r.id)} /> },
      { header: "Type", cell: (r) => text(str(r.type) && str(r.type)[0]?.toUpperCase() + str(r.type).slice(1)) },
      { header: "CRA", cell: (r) => text(list(r.craTags).join(", ")) },
      {
        header: "Used by",
        cell: (r, c) => <RecordLinks tara={c.tara} ids={risksUsingControl(c.tara, r.id).map((risk) => risk.id)} />,
      },
    ],
    fields: [
      {
        name: "state",
        label: "State in the product",
        widget: "state",
        options: () => CONTROL_STATES.map((s) => ({ value: s, label: CONTROL_STATE_LABELS[s], title: stateMeaning(s) })),
        help: "Choosing a state updates every risk that uses this control. Only Live and Verified count towards a risk; what a state still needs is asked for under Control evidence.",
      },
      { name: "name", label: "Name", widget: "text", example: "Paired phones only" },
      {
        name: "description",
        label: "Description",
        widget: "area",
        help: "What the control does and where it acts.",
        example: "The thermostat takes commands only from a phone that was paired by pressing its button",
      },
      {
        name: "type",
        label: "Type",
        widget: "select",
        options: () => [
          { value: "technical", label: "Technical" },
          { value: "organisational", label: "Organisational" },
          { value: "process", label: "Process" },
        ],
      },
      {
        name: "craTags",
        label: "CRA Annex I Part I(2) requirements it may support",
        widget: "links",
        options: () => tagOptions(),
      },
      {
        name: "coveredPathIds",
        label: "Attack paths it covers",
        widget: "links",
        options: (c) => named(c.tara.paths),
        empty: "No attack paths yet.",
      },
      {
        name: "elementIds",
        label: "Where it acts in the architecture",
        widget: "links",
        options: (c) => elementOptions(c, true, true),
        empty: "There are no architecture elements yet.",
        help: "The components, data flows, stores or boundaries the control acts in. A control of the organisation may act nowhere in particular.",
      },
      {
        name: "workLink",
        label: "Where the work is tracked",
        widget: "url",
        help: "The address of the ticket, the commit or the pull request.",
        example: "https://example.org/tickets/123",
      },
    ],
  },
  {
    key: "treatment",
    title: "Risk treatment",
    kind: "risks",
    checked: "treatment",
    noun: "risk",
    review: {
      kind: "treatment",
      label: "Approval of this treatment",
      help: "The record of the approval of this decision and of the risk that remains.",
    },
    intro:
      "Decide what is done about each risk: avoid, reduce, share or retain. Select the controls, give the reasoning and who owns the decision, and rate the risk that remains once the controls are in place.",
    emptyText: "Risks appear here as soon as there are threat scenarios.",
    status: (r, c) => c.assessment.checks.riskTreatment.get(r.id),
    columns: [
      { header: "Threat", cell: (r, c) => <span>{threatOf(c, r)?.description}</span>, grow: true },
      { header: "Value", cell: (r, c) => <ValueChip value={scoreOfRisk(c, r)?.value} /> },
      { header: "Treatment", cell: (r, c) => text(c.tara.method.treatments.find((t) => t.key === r.treatment)?.label) },
      {
        header: "Controls",
        cell: (r, c) => <RecordLinks tara={c.tara} ids={[...list(r.existingControlIds), ...list(r.proposedControlIds)]} />,
      },
      { header: "Remains", cell: (r, c) => <ValueChip value={residualOf(c, r)} /> },
    ],
    derived: (r, c) => [
      { label: "Threat", value: <Linked tara={c.tara} text={`${str(r.threatId)} ${threatOf(c, r)?.description ?? ""}`} /> },
      { label: "Risk value", value: <ValueChip value={scoreOfRisk(c, r)?.value} /> },
      { label: "Remains", value: <ValueChip value={residualOf(c, r)} /> },
    ],
    fields: [
      {
        name: "treatment",
        label: "Treatment",
        widget: "select",
        options: (c) => c.tara.method.treatments.map((t) => ({ value: t.key, label: `${t.label}: ${t.description}` })),
      },
      {
        name: "existingControlIds",
        label: "Existing controls",
        widget: "links",
        options: (c) => named(c.tara.controls),
        empty: "Add controls first, then select them here.",
        help: "Controls already in this configuration of the product. Only these can count, once verified.",
      },
      {
        name: "proposedControlIds",
        label: "Proposed controls",
        widget: "links",
        options: (c) => named(c.tara.controls),
        empty: "Add controls first, then select them here.",
        help: "Controls planned and not yet in the product. Choosing a control here takes it out of the existing ones.",
      },
      {
        name: "rationale",
        label: "Rationale",
        widget: "area",
        group: "The decision",
        help: "Why this treatment, and what the decision rests on.",
        example: "Reduced: only a paired phone can give commands. What remains needs a paired phone in hand and is accepted.",
      },
      {
        name: "owner",
        label: "Owner",
        widget: "text",
        group: "The decision",
        help: "The person responsible for this decision.",
        example: "Product manager, heating controls",
      },
      { name: "reviewDate", label: "Decided on", widget: "date", group: "The decision" },
      {
        name: "residualImpact",
        label: "Impact that remains",
        widget: "select",
        numeric: true,
        group: "The risk that remains",
        empty: "Not rated",
        options: (c) =>
          [...c.tara.method.impact_levels]
            .sort((a, b) => b.level - a.level)
            .map((l) => ({ value: String(l.level), label: l.name })),
      },
      {
        name: "residualFeasibility",
        label: "Attack feasibility that remains",
        widget: "select",
        group: "The risk that remains",
        empty: "Not rated",
        options: (c) => c.tara.method.feasibility_bands.map((b) => ({ value: b.key, label: b.label })),
      },
      {
        name: "residualBasis",
        label: "Basis",
        widget: "area",
        group: "The risk that remains",
        help: "The evidence for the remaining ratings. For a risk that is avoided: the evidence that the exposure is gone.",
        example: "Rated again after the penetration test; see the test report, case 4",
      },
    ],
  },
  {
    key: "goals",
    title: "Goals and claims",
    kind: "goalClaims",
    checked: "goals",
    noun: "goal or claim",
    review: { kind: "goal_claim", label: "Review of this statement", help: "The record of the review of this goal or claim." },
    intro:
      "A risk that is reduced needs a cybersecurity goal. A risk that is retained or shared needs a claim that says why that is acceptable, and who accepted it.",
    emptyText: "No goals or claims yet.",
    add: {
      values: (chosen) => ({ kind: chosen.kind }),
      defaults: () => ({ kind: "goal" }),
      fields: [
        {
          name: "kind",
          label: "Kind",
          widget: "select",
          options: () => [
            { value: "goal", label: "Goal: what must be achieved to reduce a risk" },
            { value: "claim", label: "Claim: why a retained or shared risk is acceptable" },
          ],
        },
      ],
    },
    status: (r, c) => c.assessment.checks.goalClaims.get(r.id),
    columns: [
      { header: "Kind", cell: (r) => (r.kind === "goal" ? "Goal" : "Claim") },
      { header: "Statement", cell: (r, c) => <Linked tara={c.tara} text={str(r.statement)} />, grow: true },
      { header: "Risks", cell: (r, c) => <RecordLinks tara={c.tara} ids={list(r.riskIds)} /> },
    ],
    fields: [
      {
        name: "statement",
        label: "Statement",
        widget: "area",
        example: "Only the owner's own phones can operate the thermostat",
      },
      {
        name: "riskIds",
        label: "Risks it answers",
        widget: "links",
        options: (c) => riskOptions(c),
        empty: "Risks appear as soon as there are threat scenarios.",
      },
    ],
  },
  {
    key: "evidence",
    title: "Control evidence",
    kind: "evidence",
    checked: "evidence",
    noun: "evidence",
    review: {
      kind: "control_evidence",
      label: "Review of this evidence",
      help: "The record of the review that accepted this evidence.",
    },
    intro:
      "For each control a risk relies on: what it achieves for that risk, where it is implemented, and the test that showed it works in this configuration. A control without a passed test does not count.",
    emptyText: "No control evidence yet. Select controls on the risks first, then record their evidence here.",
    add: {
      blocked: (c) =>
        c.tara.risks.some((r) =>
          [...r.existingControlIds, ...r.proposedControlIds].some(
            (id) => !c.tara.evidence.some((e) => e.riskId === r.id && e.controlId === id),
          ),
        )
          ? null
          : "Every control selected on a risk has its evidence already. Select controls under Risk treatment first.",
      values: (chosen) => {
        const [riskId, controlId] = (chosen.pair ?? "").split("|");
        return { riskId, controlId };
      },
      fields: [
        {
          name: "pair",
          label: "Risk and control",
          widget: "select",
          options: (c) =>
            c.tara.risks.flatMap((r) =>
              [...r.existingControlIds, ...r.proposedControlIds]
                .filter((id) => !c.tara.evidence.some((e) => e.riskId === r.id && e.controlId === id))
                .map((id) => ({
                  value: `${r.id}|${id}`,
                  label: `${r.id} / ${id}  ${c.tara.controls.find((x) => x.id === id)?.name ?? ""}`,
                })),
            ),
        },
      ],
    },
    status: (r, c) => c.assessment.checks.evidence.get(r.id),
    columns: [
      { header: "Risk", cell: (r, c) => <RecordLink tara={c.tara} id={str(r.riskId)} /> },
      {
        header: "Control",
        grow: true,
        cell: (r, c) => (
          <>
            <RecordLink tara={c.tara} id={str(r.controlId)} />{" "}
            <span>{c.tara.controls.find((x) => x.id === r.controlId)?.name}</span>
          </>
        ),
      },
      { header: "State", cell: (r) => EVIDENCE_STATES.find((s) => s.value === r.state)?.label.split(",")[0] },
      { header: "Result", cell: (r) => text(r.result === "pass" ? "Pass" : r.result === "fail" ? "Fail" : null) },
    ],
    derived: (r, c) => [
      { label: "Risk", value: <RecordLink tara={c.tara} id={str(r.riskId)} /> },
      {
        label: "Control",
        value: (
          <Linked tara={c.tara} text={`${str(r.controlId)} ${c.tara.controls.find((x) => x.id === r.controlId)?.name ?? ""}`} />
        ),
      },
    ],
    fields: [
      {
        name: "configurationId",
        label: "Configuration ID",
        widget: "text",
        help: "Must be the configuration ID given in the scope.",
      },
      { name: "state", label: "State", widget: "select", options: () => EVIDENCE_STATES },
      {
        name: "effect",
        label: "Effect on this risk",
        widget: "area",
        help: "What the control prevents or limits for this risk.",
        example: "A command from a phone that is not paired is ignored",
      },
      {
        name: "implementationRef",
        label: "Where it is implemented",
        widget: "text",
        help: "The document, or the place in the code, that holds the implementation. Name a document of the references by its ID.",
        example: "DOC-05 section 2: pairing",
      },
      {
        name: "verificationRef",
        label: "How it was verified",
        widget: "text",
        help: "The test report or review record that verified it.",
        example: "TEST-01 case 1: 50 commands from an unpaired phone, none carried out",
      },
      {
        name: "result",
        label: "Result of the verification",
        widget: "select",
        options: () => [
          { value: "pass", label: "Pass" },
          { value: "fail", label: "Fail" },
        ],
      },
      {
        name: "verifiedCraTags",
        label: "CRA requirements verified by this evidence",
        widget: "links",
        options: (c, r) => tagOptions(c.tara.controls.find((x) => x.id === r?.controlId)?.craTags ?? []),
        empty: "The control is not tagged with any CRA requirement.",
      },
    ],
  },
  {
    key: "cra",
    title: "CRA requirements",
    kind: "craDecisions",
    checked: "cra",
    noun: "requirement",
    review: { kind: "cra_requirement", label: "Review of this decision", help: "The record of the review of this decision." },
    intro:
      "For every essential requirement of CRA Annex I, decide whether it applies, justify the decision, and point to how it is implemented and verified. For the requirements of the product, (a) to (m), the list shows what the assessment says: the controls tagged to each and the risks those controls treat.",
    status: (r, c) => c.assessment.checks.cra.get(r.id),
    columns: [
      { header: "", cell: (r) => <span className="cra-key">{str(r.requirementKey)}</span> },
      { header: "Requirement", cell: (r) => craSummary(str(r.requirementKey)), grow: true },
      {
        header: "Applies",
        cell: (r) =>
          r.applicability === "applies" ? (
            "Applies"
          ) : r.applicability === "does_not_apply" ? (
            "Does not apply"
          ) : (
            <span className="muted">Undecided</span>
          ),
      },
      {
        header: "Controls",
        cell: (r, c) => (
          <RecordLinks tara={c.tara} ids={craTrace(c.tara, c.assessment.checks, str(r.requirementKey))?.controlIds ?? []} />
        ),
      },
      {
        header: "Risks",
        cell: (r, c) => (
          <RecordLinks tara={c.tara} ids={craTrace(c.tara, c.assessment.checks, str(r.requirementKey))?.riskIds ?? []} />
        ),
      },
    ],
    derived: (r) => {
      const requirement = CRA_REQUIREMENTS.find((x) => x.key === r.requirementKey);
      return [
        {
          label: "Annex I",
          value:
            requirement?.part === "II" ? `Part II, ${requirement.key.replace("II", "")}` : `Part I(2)(${str(r.requirementKey)})`,
        },
        { label: "Requirement", value: requirement?.summary ?? "" },
      ];
    },
    fields: [
      {
        name: "applicability",
        label: "Does it apply to this product?",
        widget: "select",
        empty: "Undecided",
        options: () => [
          { value: "applies", label: "Applies" },
          { value: "does_not_apply", label: "Does not apply" },
        ],
      },
      {
        name: "justification",
        label: "Justification",
        widget: "area",
        help: "Needed for both answers. The regulation asks for a clear justification where a requirement does not apply.",
        example: "Applies: the product receives software updates over the home network",
      },
      {
        name: "implementationRef",
        label: "Where it is implemented",
        widget: "text",
        help: "The document that describes how the requirement is met.",
        example: "DOC-05 section 3: signed updates",
      },
      {
        name: "verificationRef",
        label: "How it was verified",
        widget: "text",
        help: "The test report or review record.",
        example: "TEST-01 case 2",
      },
    ],
  },
  {
    key: "references",
    title: "References",
    kind: "references",
    noun: "document",
    intro:
      "Every document this assessment relies on, described once. Other fields cite a document by its ID; in the report, and wherever a screen shows such a text for reading, the ID leads here.",
    emptyText: "No documents yet. Add the specifications, test reports and review records this assessment relies on.",
    add: { fields: [], values: () => ({}), ownId: true },
    columns: [
      { header: "Title", cell: (r) => text(r.title), grow: true },
      { header: "Revision", cell: (r) => text(r.revision) },
      { header: "Date", cell: (r) => text(r.date) },
      {
        header: "Where it is kept",
        cell: (r) =>
          /^https?:\/\//i.test(str(r.location)) ? (
            <a href={str(r.location)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
              Open the link
            </a>
          ) : (
            text(r.location)
          ),
      },
    ],
    fields: [
      { name: "title", label: "Title", widget: "text", example: "Penetration test report, thermostat T1" },
      { name: "revision", label: "Revision", widget: "text", example: "B, or 2.1" },
      { name: "date", label: "Date of the document", widget: "date" },
      {
        name: "location",
        label: "Where it is kept",
        widget: "text",
        help: "A document number, a folder, or a link that opens it.",
        example: "https://…",
      },
      {
        name: "content",
        label: "The text itself",
        widget: "area",
        help: "For a short text that is best kept here, such as a note or a guide.",
      },
    ],
  },
  {
    key: "graph",
    title: "Graph",
    intro:
      "Every record and how they are linked, from the item to the goals and claims. Focus on one risk or one item, and open any record from here.",
  },
  {
    key: "report",
    title: "Report and release",
    checked: "release",
    intro:
      "The assessment as one document, made from everything in this TARA as it stands. It is signed and released here; until then it is marked as a draft.",
  },
  {
    key: "document",
    title: "Document details",
    intro: "What this document is called and how it is identified. These details are printed in the report.",
  },
  {
    key: "method",
    title: "Scoring method",
    intro:
      "How impact, attack feasibility and risk are rated in this TARA. The method is this TARA's own copy: changing it changes nothing elsewhere.",
  },
  {
    key: "export",
    title: "Export",
    intro:
      "Take the assessment out of the tool: the report as a file, the TARA itself as a document, and the work that follows from it as an action plan.",
  },
];

/** The step an address names. A key that names no step gives the first, the scope, so that there is always a step to show. */
export const stepByKey = (key: string): StepDef => STEPS.find((s) => s.key === key) ?? (STEPS[0] as StepDef);
