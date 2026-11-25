// A step that lists records: the table, the form of the open record, and adding a record.
// What the table and the form hold is said by the step's definition (steps.tsx); this screen is the same for all.

import { type AnyRecord, controlState, getField, KINDS, RECORD_KINDS, type RecordKind, recordsOf, type Tara } from "@tara/core";
import { type FormEvent, type ReactNode, useState } from "react";
import type { Ctx, FieldDef, StepDef } from "../steps.tsx";
import { CheckField, LinksField, SelectField, StepsField, TextField } from "../ui/fields.tsx";
import { RecordLinks, StatusMark } from "../ui/marks.tsx";
import { ReviewBox } from "../ui/ReviewBox.tsx";
import type { OpenTara } from "../useTara.ts";

interface Props {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  /** The ID of the open record, from the address. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Shown beside the heading: the switch between list and diagram, on the architecture step. */
  aside?: ReactNode;
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

export function RecordStep({ step, ctx, open, selected, onSelect, aside }: Props) {
  const kind = step.kind as RecordKind;
  const records = recordsOf(ctx.tara, kind);
  const record = records.find((r) => r.id === selected) ?? null;
  const frozen = ctx.tara.meta.status === "released";

  return (
    <div className={record ? "step with-panel" : "step"}>
      <div className="step-main">
        <header className="step-head">
          <div>
            <h1>{step.title}</h1>
            <p className="lede">{step.intro}</p>
          </div>
          {aside}
        </header>
        {records.length === 0 ? (
          <p className="empty">{step.emptyText}</p>
        ) : (
          <table className="records">
            <thead>
              <tr>
                <th>ID</th>
                {step.columns?.map((column) => (
                  <th key={column.header} className={column.grow ? "grow" : undefined}>
                    {column.header}
                  </th>
                ))}
                {step.status && <th>Status</th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const status = step.status?.(r, ctx);
                return (
                  <tr
                    key={r.id}
                    className={[r.id === selected ? "open" : "", status ? `row-${status.kind}` : ""].join(" ")}
                    onClick={() => onSelect(r.id === selected ? null : r.id)}
                  >
                    <td>
                      <a
                        className="id"
                        href={`#/tara/${ctx.tara.id}/${step.key}/${encodeURIComponent(r.id)}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.id}
                      </a>
                    </td>
                    {step.columns?.map((column) => (
                      <td key={column.header} className={column.grow ? "grow" : undefined}>
                        {column.cell(r, ctx)}
                      </td>
                    ))}
                    {step.status && (
                      <td>
                        <StatusMark status={status} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {step.add && !frozen && <AddRecord step={step} ctx={ctx} open={open} onAdded={onSelect} />}
      </div>
      {record && <RecordPanel step={step} record={record} ctx={ctx} open={open} onClose={() => onSelect(null)} />}
    </div>
  );
}

/** Adds a record: asks what must be known first (an element's kind, a goal or a claim), then opens the new record. */
function AddRecord({ step, ctx, open, onAdded }: { step: StepDef; ctx: Ctx; open: OpenTara; onAdded: (id: string) => void }) {
  const add = step.add;
  const kind = step.kind as RecordKind;
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [ownId, setOwnId] = useState("");
  if (!add) return null;
  const blocked = add.blocked?.(ctx) ?? null;
  const needsQuestions = add.fields.length > 0 || add.ownId;

  const create = async (values: Record<string, string>, id: string) => {
    const before = new Set(recordsOf(ctx.tara, kind).map((r) => r.id));
    const stored = await open.send({ op: "add", kind, values: add.values(values), ...(id.trim() ? { id: id.trim() } : {}) });
    if (!stored) return;
    setAsking(false);
    setOwnId("");
    // The new record is the one that was not there before; `open.tara` has moved on by now.
    setTimeout(() => {
      const made = recordsOf(openTaraNow(open) ?? ctx.tara, kind).find((r) => !before.has(r.id));
      if (made) onAdded(made.id);
    }, 0);
  };
  const start = () => {
    if (!needsQuestions) return void create({}, "");
    setChosen(add.defaults?.(ctx) ?? {});
    setAsking(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void create(chosen, ownId);
  };

  if (blocked) return <p className="empty">{blocked}</p>;
  if (!asking) {
    return (
      <button type="button" className="primary add" onClick={start}>
        Add {/^[aeiou]/.test(step.noun ?? "") ? "an" : "a"} {step.noun}
      </button>
    );
  }
  return (
    <form className="add-form" onSubmit={submit}>
      <h2>New {step.noun}</h2>
      {add.fields.map((field) =>
        field.widget === "select" ? (
          <SelectField
            key={field.name}
            label={field.label}
            value={chosen[field.name] ?? null}
            options={field.options?.(ctx) ?? []}
            onCommit={(value) => setChosen({ ...chosen, [field.name]: value ?? "" })}
          />
        ) : (
          <TextField
            key={field.name}
            label={field.label}
            value={chosen[field.name] ?? null}
            example={field.example}
            onCommit={(value) => setChosen({ ...chosen, [field.name]: value ?? "" })}
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
      <div className="row">
        <button type="submit" className="primary">
          Add
        </button>
        <button type="button" className="link" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The TARA as the hook holds it now; read after a change has been stored. */
const openTaraNow = (open: OpenTara): Tara | null => open.latest();

/** The form of one record: what the tool works out from it, its fields, its review, and what links to it. */
export function RecordPanel({
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
  const frozen = ctx.tara.meta.status === "released";
  const status = step.status?.(record, ctx);
  const set = (name: string, value: unknown) => open.send({ op: "set", kind, id: record.id, values: { [name]: value } });
  const removable = KINDS[kind].id !== null && !frozen;
  const [confirming, setConfirming] = useState(false);

  // Fields that belong together are shown under one heading, in the order they are defined.
  const groups: { heading: string | null; fields: FieldDef[] }[] = [];
  for (const field of step.fields ?? []) {
    const last = groups.at(-1);
    if (last && last.heading === (field.group ?? null)) last.fields.push(field);
    else groups.push({ heading: field.group ?? null, fields: [field] });
  }
  const backlinks = linkedFrom(ctx.tara, kind, record.id);

  return (
    <aside className="panel" aria-label={`${step.noun} ${record.id}`}>
      <header className="panel-head">
        <div>
          <span className="panel-id">{record.id}</span>
          <span className="panel-noun">{KINDS[kind].noun}</span>
        </div>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </header>
      {status && (
        <p className={`panel-status status-line-${status.kind}`}>
          <StatusMark status={status} />
        </p>
      )}
      {step.derived && (
        <dl className="derived">
          {step.derived(record, ctx).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {groups.map((group) => (
        <fieldset key={group.heading ?? group.fields[0]?.name} className={group.heading ? "group" : "group plain"}>
          {group.heading && <legend>{group.heading}</legend>}
          {group.fields.map((field) => (
            <RecordField key={field.name} field={field} record={record} ctx={ctx} disabled={frozen} set={set} open={open} />
          ))}
        </fieldset>
      ))}
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
        <p className="backlinks">
          Linked from <RecordLinks tara={ctx.tara} ids={backlinks} />
        </p>
      )}
      {removable &&
        (confirming ? (
          <div className="remove-confirm">
            <p>Remove {record.id}? It is taken out of every link. Its ID is not given again. You can undo this from History.</p>
            <div className="row">
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  setConfirming(false);
                  if (await open.send({ op: "remove", kind, id: record.id })) onClose();
                }}
              >
                Remove {record.id}
              </button>
              <button type="button" className="link" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link remove" onClick={() => setConfirming(true)}>
            Remove this {step.noun}
          </button>
        ))}
    </aside>
  );
}

interface FieldProps {
  field: FieldDef;
  record: AnyRecord;
  ctx: Ctx;
  disabled: boolean;
  set: (name: string, value: unknown) => void;
  open: OpenTara;
}

/** One field of a record, as the widget its definition asks for. */
function RecordField({ field, record, ctx, disabled, set, open }: FieldProps) {
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
        <StepsField
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
