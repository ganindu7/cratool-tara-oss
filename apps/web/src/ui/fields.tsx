// The fields of a form. Each shows a value and reports a new one when the person has finished entering it:
// a text when the field is left, a choice at once. None of them stores anything; the caller sends the change.

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
  /** Shown when the pointer rests on the option. */
  title?: string;
}

interface Frame {
  label: string;
  help?: string | undefined;
  /** A line under the field that says something about this record. */
  note?: ReactNode;
  children: (id: string) => ReactNode;
}

/** The label, the field and its help, laid out the same for every kind of field. */
function Field({ label, help, note, children }: Frame) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {help && <p className="help">{help}</p>}
      {note && <p className="field-note">{note}</p>}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string | null;
  onCommit: (value: string | null) => void;
  help?: string | undefined;
  /** A realistic value, shown faintly while the field is empty. */
  example?: string | undefined;
  multiline?: boolean;
  type?: "text" | "date" | "url";
  disabled?: boolean;
}

/** A text. What is typed is kept here until the field is left, then reported once. */
export function TextField({ label, value, onCommit, help, example, multiline, type = "text", disabled }: TextProps) {
  const [draft, setDraft] = useState(value ?? "");
  const focused = useRef(false);
  // The stored value may change under the field (someone else's change, an undo): show it, unless being typed in.
  useEffect(() => {
    if (!focused.current) setDraft(value ?? "");
  }, [value]);
  const commit = () => {
    focused.current = false;
    const next = draft.trim() === "" ? null : draft.trim();
    if (next !== (value ?? null)) onCommit(next);
  };
  const shared = {
    value: draft,
    disabled,
    placeholder: example ? `e.g. ${example}` : undefined,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: commit,
  };
  return (
    <Field label={label} help={help}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            rows={Math.min(12, Math.max(3, Math.ceil(draft.length / 70) + 1))}
            {...shared}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input
            id={id}
            type={type}
            {...shared}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        )
      }
    </Field>
  );
}

interface SelectProps {
  label: string;
  value: string | null;
  options: Option[];
  onCommit: (value: string | null) => void;
  help?: string | undefined;
  /** What the field shows while nothing is chosen. */
  empty?: string | undefined;
  note?: ReactNode;
  disabled?: boolean;
}

/** One choice from a list, or none. */
export function SelectField({ label, value, options, onCommit, help, empty = "Not chosen", note, disabled }: SelectProps) {
  // A stored value that is no longer among the choices is still shown, so that it is not lost unseen.
  const known = value === null || options.some((o) => o.value === value);
  return (
    <Field label={label} help={help} note={note}>
      {(id) => (
        <select
          id={id}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onCommit(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">{empty}</option>
          {!known && <option value={value ?? ""}>{value} (not an option of the method)</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} title={option.title}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** A yes or no. */
export function CheckField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: boolean;
  onCommit: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onCommit(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

interface LinksProps {
  label: string;
  values: string[];
  options: Option[];
  onCommit: (values: string[]) => void;
  help?: string | undefined;
  /** What to say when there is nothing to choose from. */
  empty?: string | undefined;
  /** The order means something (the route of an attack): entries can be moved up and down. */
  ordered?: boolean;
  disabled?: boolean;
}

/** Several choices from a list: what is chosen is shown in order, and more can be added from the rest. */
export function LinksField({ label, values, options, onCommit, help, empty, ordered, disabled }: LinksProps) {
  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const rest = options.filter((o) => !values.includes(o.value));
  const move = (index: number, by: number) => {
    const next = [...values];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved as string);
    onCommit(next);
  };
  return (
    <Field label={label} help={help}>
      {(id) => (
        <div className="links-field">
          {values.length > 0 && (
            <ol className={ordered ? "chosen ordered" : "chosen"}>
              {values.map((value, index) => (
                <li key={value}>
                  <span className="chosen-label">{labelOf(value)}</span>
                  {!disabled && ordered && (
                    <>
                      <button
                        type="button"
                        className="mini"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label="Move earlier"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="mini"
                        disabled={index === values.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label="Move later"
                      >
                        ↓
                      </button>
                    </>
                  )}
                  {!disabled && (
                    <button
                      type="button"
                      className="mini"
                      onClick={() => onCommit(values.filter((v) => v !== value))}
                      aria-label={`Take out ${labelOf(value)}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {options.length === 0 && empty ? (
            <p className="muted">{empty}</p>
          ) : (
            !disabled &&
            rest.length > 0 && (
              <select id={id} value="" onChange={(e) => e.target.value && onCommit([...values, e.target.value])}>
                <option value="">{values.length === 0 ? "Choose…" : "Add another…"}</option>
                {rest.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )
          )}
        </div>
      )}
    </Field>
  );
}

interface StepsProps {
  label: string;
  value: string;
  options: Option[];
  onCommit: (value: string) => void;
  help?: string | undefined;
  note?: ReactNode;
  disabled?: boolean;
}

/** One of a few states that follow each other, shown side by side: where something stands on its way. */
export function StepsField({ label, value, options, onCommit, help, note, disabled }: StepsProps) {
  return (
    <Field label={label} help={help} note={note}>
      {() => (
        <fieldset className="steps-field" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === value}
              className={option.value === value ? `on state-${option.value}` : ""}
              title={option.title}
              disabled={disabled}
              onClick={() => option.value !== value && onCommit(option.value)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      )}
    </Field>
  );
}
