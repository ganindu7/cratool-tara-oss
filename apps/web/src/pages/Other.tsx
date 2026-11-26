// The screens that show the assessment as a whole rather than one kind of record: the document's details,
// the scoring method, and the ways to take the assessment out of the tool.

import {
  ACTION_GROUPS,
  type Action,
  EDITABLE_META,
  FEASIBILITY_KEYS,
  IMPACT_LEVELS,
  type Method,
  type Tara,
  validateMethod,
  withdrawnIds,
} from "@tara/core";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { useLook } from "../diagram/look.ts";
import type { Ctx, StepDef } from "../steps.tsx";
import { TextField } from "../ui/fields.tsx";
import { RecordLinks } from "../ui/marks.tsx";
import { StepHead } from "../ui/StepHead.tsx";
import type { OpenTara } from "../useTara.ts";

const META_LABELS: Record<(typeof EDITABLE_META)[number], [label: string, help: string, example: string]> = {
  title: ["Title", "What the assessment is called.", "Smart thermostat T1, software release 2.4"],
  product: ["Product", "TARAs of the same product are listed together.", "Smart thermostat T1"],
  organisation: ["Organisation", "Named in the report.", "Example Heating Ltd"],
  documentNumber: ["Document number", "The number this document has in your document control.", "TARA-0042"],
  revision: ["Revision", "The revision this TARA is, or will be released as.", "1.0"],
  storageLocation: [
    "Where the released document is kept",
    "Printed in the report's document control.",
    "Technical file, section 4",
  ],
  distribution: [
    "Who receives it",
    "Printed in the report's document control.",
    "Product security, product management, notified body on request",
  ],
};

/** The details the document is known by, and its revision history. */
export function DocumentStep({ step, ctx, open }: { step: StepDef; ctx: Ctx; open: OpenTara }) {
  const { tara } = ctx;
  const frozen = tara.meta.status === "released";
  const withdrawn = withdrawnIds(tara);
  return (
    <div className="page">
      <StepHead title={step.title} intro={step.intro} />
      <div className="form">
        {EDITABLE_META.map((name) => (
          <TextField
            key={name}
            label={META_LABELS[name][0]}
            help={META_LABELS[name][1]}
            example={META_LABELS[name][2]}
            value={tara.meta[name]}
            disabled={frozen}
            onCommit={(value) => open.send({ op: "setMeta", values: { [name]: value } })}
          />
        ))}
      </div>
      {tara.meta.basedOn && (
        <p className="banner">
          This is the next revision of <a href={`#/tara/${tara.meta.basedOn.id}/report`}>revision {tara.meta.basedOn.revision}</a>
          {tara.meta.revisionReason ? `, opened because: ${tara.meta.revisionReason}` : ""}.
        </p>
      )}
      <section>
        <h2>Revision history</h2>
        {tara.changeLog.length === 0 ? (
          <p className="muted">No revision has been released yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Revision</th>
                <th>Date</th>
                <th>Author</th>
                <th className="grow">Description</th>
                <th>Approved by</th>
              </tr>
            </thead>
            <tbody>
              {tara.changeLog.map((entry) => (
                <tr key={`${entry.version}-${entry.date}`}>
                  <td>{entry.version}</td>
                  <td>{entry.date}</td>
                  <td>{entry.author}</td>
                  <td className="grow">{entry.description}</td>
                  <td>{entry.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {withdrawn.length > 0 && (
          <p className="help">
            IDs that were given in this TARA and belong to no record any more: {withdrawn.join(", ")}. They are never given again,
            so that an ID means one thing for good.
          </p>
        )}
      </section>
    </div>
  );
}

/** The scoring method of this TARA, shown as the tables a rating is read from; and replacing it. */
export function MethodStep({ step, ctx, open }: { step: StepDef; ctx: Ctx; open: OpenTara }) {
  const method = ctx.tara.method;
  const frozen = ctx.tara.meta.status === "released";
  const fileInput = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [shipped, setShipped] = useState<{ id: string; name: string; method: Method }[]>([]);
  useEffect(() => {
    api
      .methods()
      .then(setShipped)
      .catch(() => setShipped([]));
  }, []);

  const replaceWith = (candidate: unknown) => {
    const found = validateMethod(candidate);
    setProblems(found);
    if (found.length === 0) void open.send({ op: "setMethod", method: candidate as Method });
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      replaceWith(JSON.parse(await file.text()));
    } catch {
      setProblems(["The file is not readable as JSON."]);
    }
  };
  const bands = method.feasibility_bands;

  return (
    <div className="page method">
      <StepHead title={step.title} intro={step.intro} />
      <p className="method-name">{method.source ?? "A method without a name"}</p>

      <section>
        <h2>Risk value</h2>
        <p className="help">
          The value of a risk, from 1 to 5, is read from this table: how bad the damage would be, against how feasible the attack
          is.
        </p>
        <table className="method-matrix">
          <thead>
            <tr>
              <th>Impact</th>
              {[...FEASIBILITY_KEYS].reverse().map((key) => (
                <th key={key}>{bands.find((b) => b.key === key)?.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...IMPACT_LEVELS].reverse().map((level) => (
              <tr key={level}>
                <th scope="row">{method.impact_levels.find((l) => l.level === level)?.name}</th>
                {[...FEASIBILITY_KEYS].reverse().map((key) => (
                  <MatrixCell key={key} value={method.risk_matrix[String(level)]?.[key] ?? null} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Attack feasibility</h2>
        <p className="help">
          An attack path is rated on five factors. The points are added up; the fewer points, the easier the attack and the higher
          its feasibility.
        </p>
        <table>
          <thead>
            <tr>
              <th>Points in total</th>
              <th>Feasibility</th>
              <th className="grow">What it stands for</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={band.key}>
                <td>{band.max === undefined ? `${band.min} or more` : `${band.min} to ${band.max}`}</td>
                <td>{band.label}</td>
                <td className="grow">{band.potential}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="factors">
          {method.feasibility_factors.map((factor) => (
            <div key={factor.key} className="method-block">
              <h3>{factor.label}</h3>
              {factor.description && <p className="help">{factor.description}</p>}
              <ul>
                {factor.options.map((option) => (
                  <li key={option.key} title={option.description}>
                    <span className="points">{option.points}</span> {option.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Impact</h2>
        <p className="help">A damage scenario is rated in each category. Its impact is the highest of the four.</p>
        {method.impact_categories.map((category) => (
          <div key={category.key} className="method-block">
            <h3>{category.label}</h3>
            {category.heading && <p className="help">{category.heading}</p>}
            <table>
              <tbody>
                {[...category.ratings]
                  .sort((a, b) => b.level - a.level)
                  .map((rating) => (
                    <tr key={rating.level}>
                      <th scope="row">{rating.label}</th>
                      <td className="grow">{rating.criteria}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {method.sources && (
        <section>
          <h2>Where the method comes from</h2>
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th className="grow">Source</th>
                <th>Terms</th>
              </tr>
            </thead>
            <tbody>
              {method.sources.map((source) => (
                <tr key={source.part}>
                  <td>{source.part}</td>
                  <td className="grow">{source.source}</td>
                  <td>{source.terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!frozen && (
        <section>
          <h2>Use another method</h2>
          <p className="help">
            A method is a JSON file (docs/method.md describes it). Replacing the method changes how this TARA is rated from now
            on: every value is worked out again, and the reviews that covered the old method ask to be confirmed again. It can be
            undone from History.
          </p>
          <div className="actions">
            {shipped.map((entry) => (
              <button key={entry.id} type="button" onClick={() => replaceWith(entry.method)}>
                Use {entry.name}
              </button>
            ))}
            <button type="button" onClick={() => fileInput.current?.click()}>
              Use a method from a file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </div>
          {problems.length > 0 && (
            <ul className="needs" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** A cell of the risk matrix: the value, on the wash of its colour. */
function MatrixCell({ value }: { value: number | null }) {
  return <td className={value === null ? undefined : `wash-${value}`}>{value ?? "-"}</td>;
}

/** The ways out of the tool: the report, the TARA as a document, and the action plan. */
export function ExportStep({ step, ctx }: { step: StepDef; ctx: Ctx }) {
  const { tara } = ctx;
  // The report is drawn the way the diagram is looked at in this browser.
  const [look] = useLook();
  const [actions, setActions] = useState<Action[] | null>(null);
  useEffect(() => {
    api
      .actionPlan(tara.id)
      .then((plan) => setActions(plan.actions))
      .catch(() => setActions([]));
  }, [tara.id]);

  return (
    <>
      <StepHead title={step.title} intro={step.intro} />
      <div className="export">
        <section>
          <h2>The report</h2>
          <p>
            One web page that holds the whole assessment and needs nothing else to be read. Keep it in the technical file, or
            print it to PDF from the browser: it is laid out for A4. Its diagrams draw their data flows the way you look at the
            diagram here: straight, curved or stepped.
          </p>
          <p className="actions">
            <a className="button primary" href={api.reportUrl(tara.id, look.line, true)}>
              Download the report
            </a>
            <a className="button" href={api.reportUrl(tara.id, look.line)} target="_blank" rel="noreferrer">
              Open it to print
            </a>
          </p>
        </section>

        <section>
          <h2>The TARA itself</h2>
          <p>
            The whole assessment as one JSON document, in the format the tool stores it in: to pass it to someone else, or to keep
            it under version control beside the product's code. Taken in on another installation, it arrives as a new draft: its
            reviews ask to be confirmed again there, and signatures do not travel with a file. To move a TARA exactly as it is,
            copy its folder from the data folder instead.
          </p>
          <p className="actions">
            <a className="button" href={api.exportUrl(tara.id)}>
              Download the TARA document
            </a>
          </p>
        </section>

        <section>
          <h2>The action plan</h2>
          <p>
            The work that follows from the assessment: controls to build and verify, decisions to make, reviews to hold. It is
            made anew from the TARA each time.
          </p>
          <p className="actions">
            <a className="button" href={api.actionPlanUrl(tara.id)}>
              Download as Markdown
            </a>
          </p>
          {actions === null ? (
            <p className="muted">Working it out…</p>
          ) : actions.length === 0 ? (
            <p className="next next-done">
              Nothing is open: every control the assessment relies on is in the product and verified.
            </p>
          ) : (
            ACTION_GROUPS.map((group) => (
              <ActionGroup
                key={group.title}
                title={group.title}
                note={group.note}
                actions={actions.filter((action) => group.kinds.includes(action.kind))}
                tara={tara}
              />
            ))
          )}
        </section>
      </div>
    </>
  );
}

const PRIORITY_NAMES = { 1: "First", 2: "Next", 3: "Then" } as const;

/** The actions of one kind: each a line that opens to say what to do, why, and when it counts as done. */
function ActionGroup({ title, note, actions, tara }: { title: string; note: string; actions: Action[]; tara: Tara }) {
  if (actions.length === 0) return null;
  return (
    <div className="left-to-do">
      <h3>
        {title} <span className="muted">{actions.length}</span>
      </h3>
      <p className="action-note">{note}</p>
      <ul className="action-list">
        {actions.map((action) => (
          <li key={action.id}>
            <details>
              <summary>
                <span className="action-id">{action.id}</span>
                <span className="action-title">{action.title}</span>
                <span className="action-priority muted">{PRIORITY_NAMES[action.priority]}</span>
              </summary>
              <div className="action-more">
                {action.what && <p>{action.what}</p>}
                {action.why && <p className="muted">{action.why}</p>}
                <p>
                  <b>Done when</b>
                  {action.doneWhen}
                </p>
                {action.riskIds.length > 0 && (
                  <p className="action-links">
                    <span>
                      For <RecordLinks tara={tara} ids={action.riskIds} />
                    </span>
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
