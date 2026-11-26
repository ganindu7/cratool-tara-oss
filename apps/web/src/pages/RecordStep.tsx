// A step that lists records: the table, the open record beside it, and adding a record.
// What the table and the form hold is said by the step's definition (steps.tsx); this screen is the same for all.

import { type AnyRecord, controlState, getField, KINDS, RECORD_KINDS, type RecordKind, recordsOf, type Tara } from "@tara/core";
import { type FormEvent, type ReactNode, useState } from "react";
import type { Ctx, FieldDef, StepDef } from "../steps.tsx";
import { CheckField, LeverField, LinksField, SelectField, TextField } from "../ui/fields.tsx";
import { NextAction, RecordLinks, StatusChip } from "../ui/marks.tsx";
import { ReviewBox } from "../ui/ReviewBox.tsx";
import { StepHead } from "../ui/StepHead.tsx";
import { ViewLink } from "../ui/ViewLink.tsx";
import type { OpenTara } from "../useTara.ts";
import { GRAPH_KINDS } from "../views/graph.ts";
import { egoViewOf, type ViewOf, viewOf } from "../views/views.ts";

interface Props {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  /** The ID of the open record, from the address. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** The choice of how the step is shown, at the right of its head: as a list or a drawing, with its links or without. */
  ways?: ReactNode;
  /** What stands beside the list when the step is shown with its links: the open record and what it is linked to. */
  beside?: ReactNode;
}

/** The records that name this one in a link, as IDs. */
function linkedFrom(tara: Tara, kind: RecordKind, id: string): string[] {
  const ids: string[] = [];
  for (const otherKind of RECORD_KINDS) {
    for (const [name, field] of Object.entries(KINDS[otherKind].fields)) {
      if ((field.type !== "ref" && field.type !== "refs") || field.to !== kind) continue;
      for (const other of recordsOf(tara, otherKind)) {
        const value = getField(other, name);
        if ((value === id || (Array.isArray(value) && value.includes(id))) && !ids.includes(other.id)) ids.push(other.id);
      }
    }
  }
  return ids;
}

/** The views a record can be looked at in: the one that follows the chain from it, and its ego view. */
const viewsOf = (tara: Tara, id: string): ViewOf[] =>
  [viewOf(tara, id), egoViewOf(tara, id)].filter((view): view is ViewOf => view !== null);

/** The ways from a record to its drawings, each by its sign. */
function ViewSigns({ tara, id }: { tara: Tara; id: string }) {
  const views = viewsOf(tara, id);
  if (views.length === 0) return <span className="muted">-</span>;
  return (
    <span className="view-signs">
      {views.map((view) => (
        <ViewLink key={view.kind} taraId={tara.id} view={view} from={id} as="sign" />
      ))}
    </span>
  );
}

/** The screen of a step that lists records. A click on a row opens the record beside the table; the same click closes it. */
export function RecordStep({ step, ctx, open, selected, onSelect, ways, beside }: Props) {
  const kind = step.kind as RecordKind;
  const records = recordsOf(ctx.tara, kind);
  const record = records.find((r) => r.id === selected) ?? null;
  const frozen = ctx.tara.meta.status === "released";
  const [adding, setAdding] = useState(false);
  // A list whose records can be looked at as a drawing has a column of the signs that lead there.
  const viewed = records.some((r) => viewsOf(ctx.tara, r.id).length > 0);

  /** Adds the record, then opens it: it is the one that was not there before. */
  const create = async (values: Record<string, string>, id: string) => {
    const before = new Set(records.map((r) => r.id));
    const stored = await open.send({ op: "add", kind, values: step.add?.values(values) ?? {}, ...(id ? { id } : {}) });
    if (!stored) return;
    setAdding(false);
    // `open.latest()` is the TARA as it stands after the change; this screen is drawn again only afterwards.
    setTimeout(() => {
      const made = recordsOf(open.latest() ?? ctx.tara, kind).find((r) => !before.has(r.id));
      if (made) onSelect(made.id);
    }, 0);
  };
  /** A record that needs nothing said first is added at once; otherwise the questions are asked. */
  const asksFirst = step.add !== undefined && (step.add.fields.length > 0 || step.add.ownId === true);
  const blocked = step.add?.blocked?.(ctx) ?? null;
  const startAdding = () => (asksFirst || blocked ? setAdding(true) : void create({}, ""));

  const list = (
    <div className={record ? "records records-open" : "records"}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              {step.columns?.map((column) => (
                <th key={column.header} className={column.grow ? "grow" : undefined}>
                  {column.header}
                </th>
              ))}
              {viewed && <th>View</th>}
              {step.status && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr
                key={r.id}
                className={r.id === selected ? "row-selected" : undefined}
                onClick={() => onSelect(r.id === selected ? null : r.id)}
              >
                <td className="id">
                  <a href={`#/tara/${ctx.tara.id}/${step.key}/${encodeURIComponent(r.id)}`} onClick={(e) => e.stopPropagation()}>
                    {r.id}
                  </a>
                </td>
                {step.columns?.map((column) => (
                  <td key={column.header} className={column.grow ? "grow" : undefined}>
                    {column.cell(r, ctx)}
                  </td>
                ))}
                {viewed && (
                  <td>
                    <ViewSigns tara={ctx.tara} id={r.id} />
                  </td>
                )}
                {step.status && (
                  <td>
                    <StatusChip status={step.status(r, ctx)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {record && <RecordPanel step={step} record={record} ctx={ctx} open={open} onClose={() => onSelect(null)} />}
    </div>
  );

  return (
    <>
      <StepHead title={step.title} intro={step.intro}>
        {ways}
        {step.add && !frozen && (
          <button type="button" className="primary" onClick={startAdding}>
            Add {step.noun}
          </button>
        )}
      </StepHead>
      {adding && blocked && (
        <p className="new-record">
          {blocked}{" "}
          <button type="button" className="link" onClick={() => setAdding(false)}>
            Close
          </button>
        </p>
      )}
      {adding && !blocked && <NewRecord step={step} ctx={ctx} onCreate={create} onCancel={() => setAdding(false)} />}
      {records.length === 0 ? (
        <p className="empty">{step.emptyText}</p>
      ) : beside ? (
        <div className="split">
          {list}
          {beside}
        </div>
      ) : (
        list
      )}
    </>
  );
}

/** What must be known before a record exists (an element's kind, a goal or a claim), asked above the list. */
function NewRecord({
  step,
  ctx,
  onCreate,
  onCancel,
}: {
  step: StepDef;
  ctx: Ctx;
  onCreate: (values: Record<string, string>, id: string) => void;
  onCancel: () => void;
}) {
  const add = step.add;
  const [chosen, setChosen] = useState<Record<string, string>>(() => add?.defaults?.(ctx) ?? {});
  const [ownId, setOwnId] = useState("");
  if (!add) return null;
  const choose = (name: string) => (value: string | null) => setChosen({ ...chosen, [name]: value ?? "" });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate(chosen, ownId.trim());
  };
  return (
    <form className="new-record" onSubmit={submit}>
      {add.fields.map((field) =>
        field.widget === "select" ? (
          <SelectField
            key={field.name}
            label={field.label}
            value={chosen[field.name] ?? null}
            options={field.options?.(ctx) ?? []}
            empty="Choose"
            onCommit={choose(field.name)}
          />
        ) : (
          <TextField
            key={field.name}
            label={field.label}
            value={chosen[field.name] ?? null}
            example={field.example}
            onCommit={choose(field.name)}
          />
        ),
      )}
      {add.ownId && (
        <TextField
          label="ID (optional)"
          value={ownId}
          help="Leave empty and the tool numbers it. Give your own where a document or an item already has a number. An ID cannot be changed later."
          onCommit={(value) => setOwnId(value ?? "")}
        />
      )}
      <div className="actions">
        <button type="submit" className="primary">
          Add {step.noun}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Fields that belong together are shown under one heading, in the order they are defined. */
function grouped(fields: FieldDef[]): { heading: string | null; fields: FieldDef[] }[] {
  const groups: { heading: string | null; fields: FieldDef[] }[] = [];
  for (const field of fields) {
    const last = groups.at(-1);
    if (last && field.group && last.heading === field.group) last.fields.push(field);
    else groups.push({ heading: field.group ?? null, fields: [field] });
  }
  return groups;
}

interface FormProps {
  step: StepDef;
  record: AnyRecord;
  ctx: Ctx;
  open: OpenTara;
  /** In a narrow place, such as the card of a record on a drawing: lists of links show what is chosen. */
  compact?: boolean;
}

/** The fields of one record. A change to a field is sent when the field is left. */
export function RecordForm({ step, record, ctx, open, compact }: FormProps) {
  const kind = step.kind as RecordKind;
  const disabled = ctx.tara.meta.status === "released";
  const set = (name: string, value: unknown) => open.send({ op: "set", kind, id: record.id, values: { [name]: value } });
  const field = (definition: FieldDef) => (
    <RecordField
      key={definition.name}
      field={definition}
      record={record}
      ctx={ctx}
      disabled={disabled}
      compact={compact ?? false}
      set={set}
      open={open}
    />
  );
  return (
    <div className="form">
      {grouped(step.fields ?? []).map((group) =>
        group.heading ? (
          <fieldset key={group.heading} className="group">
            <legend>{group.heading}</legend>
            {group.fields.map(field)}
          </fieldset>
        ) : (
          group.fields.map(field)
        ),
      )}
    </div>
  );
}

/** The open record beside its list: how it stands, what the tool works out from it, its fields, its review. */
function RecordPanel({
  step,
  record,
  ctx,
  open,
  onClose,
}: {
  step: StepDef;
  record: AnyRecord;
  ctx: Ctx;
  open: OpenTara;
  onClose: () => void;
}) {
  const kind = step.kind as RecordKind;
  const status = step.status?.(record, ctx);
  const backlinks = linkedFrom(ctx.tara, kind, record.id);
  const removable = KINDS[kind].id !== null && ctx.tara.meta.status !== "released";
  return (
    <aside className="detail" aria-label={`${step.noun} ${record.id}`}>
      <div className="detail-head">
        <h2>{record.id}</h2>
        <span className="detail-links">
          {viewsOf(ctx.tara, record.id).length > 0 && <ViewSigns tara={ctx.tara} id={record.id} />}
          {GRAPH_KINDS.some((each) => each.key === kind) && (
            <a
              className="ref"
              href={`#/tara/${ctx.tara.id}/graph?focus=${encodeURIComponent(record.id)}`}
              title="See what this rests on and what rests on it"
            >
              On the graph
            </a>
          )}
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </span>
      </div>
      {step.status && <NextAction status={status} />}
      {step.derived && (
        <dl className="facts">
          {step.derived(record, ctx).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <RecordForm step={step} record={record} ctx={ctx} open={open} />
      {step.review && (
        <ReviewBox
          open={open}
          kind={step.review.kind}
          subjectId={record.id}
          label={step.review.label}
          help={step.review.help}
          status={status}
        />
      )}
      {backlinks.length > 0 && (
        <p className="mentions">
          Linked from <RecordLinks tara={ctx.tara} ids={backlinks} />
        </p>
      )}
      {removable && <RemoveRecord kind={kind} id={record.id} noun={step.noun ?? "record"} open={open} onRemoved={onClose} />}
    </aside>
  );
}

/** Taking a record away is asked for twice: it leaves every link, and its ID is not given again. */
function RemoveRecord({
  kind,
  id,
  noun,
  open,
  onRemoved,
}: {
  kind: RecordKind;
  id: string;
  noun: string;
  open: OpenTara;
  onRemoved: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <p className="delete">
        <button type="button" className="link" onClick={() => setAsking(true)}>
          Remove this {noun}
        </button>
      </p>
    );
  }
  const remove = async () => {
    setAsking(false);
    if (await open.send({ op: "remove", kind, id })) onRemoved();
  };
  return (
    <p className="delete">
      Remove {id}? It is taken out of every link, and its ID is not given again. You can undo this from History.{" "}
      <button type="button" className="danger" onClick={remove}>
        Remove {id}
      </button>{" "}
      <button type="button" className="link" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </p>
  );
}

interface FieldProps {
  field: FieldDef;
  record: AnyRecord;
  ctx: Ctx;
  disabled: boolean;
  compact: boolean;
  set: (name: string, value: unknown) => void;
  open: OpenTara;
}

/** One field of a record, as the widget its definition asks for. */
function RecordField({ field, record, ctx, disabled, compact, set, open }: FieldProps) {
  const value = getField(record, field.name);
  const options = field.options?.(ctx, record) ?? [];
  switch (field.widget) {
    case "text":
    case "area":
    case "date":
    case "url":
      return (
        <TextField
          label={field.label}
          value={typeof value === "string" ? value : null}
          help={field.help}
          example={field.example}
          multiline={field.widget === "area"}
          type={field.widget === "date" ? "date" : "text"}
          disabled={disabled}
          onCommit={(next) => set(field.name, next)}
        />
      );
    case "check":
      return (
        <CheckField label={field.label} value={value === true} disabled={disabled} onCommit={(next) => set(field.name, next)} />
      );
    case "select":
      return (
        <SelectField
          label={field.label}
          value={value === null || value === undefined ? null : String(value)}
          options={options}
          help={field.help}
          empty={field.empty}
          disabled={disabled}
          onCommit={(next) => set(field.name, next === null ? null : field.numeric ? Number(next) : next)}
        />
      );
    case "links":
    case "route":
      return (
        <LinksField
          label={field.label}
          values={Array.isArray(value) ? (value as string[]) : []}
          options={options}
          help={field.help}
          empty={field.empty}
          ordered={field.widget === "route"}
          compact={compact}
          disabled={disabled}
          onCommit={(next) => set(field.name, next)}
        />
      );
    case "state": {
      const state = controlState(ctx.tara, record.id);
      const unused = !ctx.tara.risks.some(
        (r) => r.existingControlIds.includes(record.id) || r.proposedControlIds.includes(record.id),
      );
      return (
        <LeverField
          label={field.label}
          value={state}
          options={options}
          help={field.help}
          disabled={disabled || unused}
          note={
            unused
              ? "No risk uses this control yet. Choose it for a risk under Risk treatment first."
              : state === "failed"
                ? "An evidence entry says its test failed."
                : null
          }
          onCommit={(next) => open.send({ op: "setControlState", id: record.id, state: next as never })}
        />
      );
    }
  }
}
