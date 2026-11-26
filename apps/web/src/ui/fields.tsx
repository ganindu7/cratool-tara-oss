// The fields of a form. Each shows a value and reports a new one when the person has finished entering it:
// a text when the field is left, a choice at once. None of them stores anything; the caller sends the change.

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** One of the choices a field offers: the value that is stored, and the words the person sees for it. */
export interface Option {
  value: string;
  label: string;
  /** Shown when the pointer rests on the option. */
  title?: string;
}

interface Frame {
  label: string;
  /** The label is said by the column the field stands in: it is kept for screen readers and not shown. */
  quiet?: boolean | undefined;
  help?: string | undefined;
  /** A line under the field that says something about this record. */
  note?: ReactNode;
  children: (id: string) => ReactNode;
}

/** The label above, the field, and its help beneath: the one pattern for every kind of field. */
function Field({ label, quiet, help, note, children }: Frame) {
  const id = useId();
  return (
    <div className="field">
      <label className={quiet ? "field-label unseen" : "field-label"} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {note && <span className="field-note">{note}</span>}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

interface TextProps {
  label: string;
  quiet?: boolean;
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
export function TextField({ label, quiet, value, onCommit, help, example, multiline, type = "text", disabled }: TextProps) {
  const [draft, setDraft] = useState(value ?? "");
  const focused = useRef(false);
  // A text of several lines is shown whole: its field is as high as the text, and grows as it is typed.
  const area = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text, which is `draft`
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [draft]);
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
    <Field label={label} quiet={quiet} help={help}>
      {(id) =>
        multiline ? (
          <textarea id={id} ref={area} rows={2} {...shared} onChange={(e) => setDraft(e.target.value)} />
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
  quiet?: boolean;
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
export function SelectField({ label, quiet, value, options, onCommit, help, empty = "Not chosen", note, disabled }: SelectProps) {
  // A stored value that is no longer among the choices is still shown, so that it is not lost unseen.
  const known = value === null || options.some((o) => o.value === value);
  return (
    <Field label={label} quiet={quiet} help={help} note={note}>
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
      {label}
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
  /** The order means something (the route of an attack): the links are a numbered list that can be rearranged. */
  ordered?: boolean;
  /** In a narrow place: what is chosen is shown, and the rest opens on request. */
  compact?: boolean;
  disabled?: boolean;
}

/** Links to other records: a tick box for each, or a numbered list where their order means something. */
export function LinksField({ label, values, options, onCommit, help, empty, ordered, compact, disabled }: LinksProps) {
  const shared = { values, options, onCommit, disabled: disabled ?? false };
  return (
    <Field label={label} help={help}>
      {(id) =>
        options.length === 0 ? (
          <p className="muted small">{empty}</p>
        ) : ordered ? (
          <OrderedLinks id={id} {...shared} />
        ) : (
          <TickedLinks compact={compact ?? false} {...shared} />
        )
      }
    </Field>
  );
}

interface LinksBody {
  values: string[];
  options: Option[];
  onCommit: (values: string[]) => void;
  disabled: boolean;
}

/** One tick box per record that can be linked. What was ticked when the record was opened is listed first. */
function TickedLinks({ values, options, onCommit, disabled, compact }: LinksBody & { compact: boolean }) {
  // Kept from the first drawing: a box does not jump to the top of the list at the moment it is ticked.
  const [atOpen] = useState(() => new Set(values));
  const box = (option: Option) => (
    <CheckField
      key={option.value}
      label={option.label}
      value={values.includes(option.value)}
      disabled={disabled}
      onCommit={(on) => onCommit(on ? [...values, option.value] : values.filter((value) => value !== option.value))}
    />
  );
  const first = options.filter((option) => atOpen.has(option.value));
  const rest = options.filter((option) => !atOpen.has(option.value));
  if (!compact) return <div className="links">{[...first, ...rest].map(box)}</div>;

  // In a narrow place a box that is ticked stays in sight, also once it was ticked from the rest.
  const chosen = options.filter((option) => atOpen.has(option.value) || values.includes(option.value));
  const others = options.filter((option) => !chosen.includes(option));
  return (
    <div className="links">
      {chosen.length === 0 && <p className="muted small">None chosen.</p>}
      {chosen.map(box)}
      {others.length > 0 && !disabled && (
        <details className="links-more">
          <summary>
            {chosen.length > 0 ? "Add another" : "Choose"} <span className="muted">{others.length}</span>
          </summary>
          {others.map(box)}
        </details>
      )}
    </div>
  );
}

/** The links in their order, each of which can be moved or taken out, and the rest to add from. */
function OrderedLinks({ id, values, options, onCommit, disabled }: LinksBody & { id: string }) {
  const labelOf = (value: string) => options.find((option) => option.value === value)?.label ?? value;
  const rest = options.filter((option) => !values.includes(option.value));
  const move = (index: number, by: number) => {
    const next = [...values];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved as string);
    onCommit(next);
  };
  return (
    <>
      {values.length > 0 && (
        <ol className="links-ordered">
          {values.map((value, index) => (
            <li key={value}>
              <span>{labelOf(value)}</span>
              {!disabled && (
                <>
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move earlier">
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === values.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move later"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onCommit(values.filter((other) => other !== value))}
                    aria-label={`Take out ${labelOf(value)}`}
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {!disabled && rest.length > 0 && (
        <select id={id} value="" onChange={(e) => e.target.value && onCommit([...values, e.target.value])}>
          <option value="">{values.length === 0 ? "Choose where it begins…" : "Add the next place…"}</option>
          {rest.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

interface LeverProps {
  label: string;
  value: string;
  options: Option[];
  onCommit: (value: string) => void;
  help?: string | undefined;
  note?: ReactNode;
  disabled?: boolean;
}

/**
 * A choice among a few states that follow one another, as a track: it is filled up to the state chosen, so
 * that how far along something is can be read at a glance. Choosing another state reports it at once.
 */
export function LeverField({ label, value, options, onCommit, help, note, disabled }: LeverProps) {
  const at = options.findIndex((option) => option.value === value);
  return (
    <Field label={label} help={help} note={note}>
      {() => (
        <fieldset className={`lever lever-at-${value}`} aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={index === at}
              className={`lever-step${index === at ? " on" : index < at ? " passed" : ""}`}
              title={option.title}
              disabled={disabled}
              onClick={() => index !== at && onCommit(option.value)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      )}
    </Field>
  );
}
