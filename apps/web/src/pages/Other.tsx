// The screens that show the assessment as a whole rather than one kind of record: the document's details,
// the scoring method, and the ways to take the assessment out of the tool.

import {
  ACTION_GROUPS,
  type Action,
  EDITABLE_META,
  FEASIBILITY_KEYS,
  IMPACT_LEVELS,
  type Method,
  validateMethod,
  withdrawnIds,
} from "@tara/core";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import type { Ctx } from "../steps.tsx";
import { TextField } from "../ui/fields.tsx";
import { RecordLinks, ValueChip } from "../ui/marks.tsx";
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
export function DocumentStep({ ctx, open }: { ctx: Ctx; open: OpenTara }) {
  const { tara } = ctx;
  const frozen = tara.meta.status === "released";
  const withdrawn = withdrawnIds(tara);
  return (
    <div className="step">
      <div className="step-main narrow">
        <header className="step-head">
          <div>
            <h1>Document details</h1>
            <p className="lede">
              What this document is called and how it is identified. These details are printed in the report.
            </p>
          </div>
        </header>
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
        {tara.meta.basedOn && (
          <p className="notice">
            This is the next revision of{" "}
            <a href={`#/tara/${tara.meta.basedOn.id}/report`}>revision {tara.meta.basedOn.revision}</a>
            {tara.meta.revisionReason ? `, opened because: ${tara.meta.revisionReason}` : ""}.
          </p>
        )}
        <h2 className="section">Revision history</h2>
        {tara.changeLog.length === 0 ? (
          <p className="muted">No revision has been released yet.</p>
        ) : (
          <table className="records">
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
      </div>
    </div>
  );
}

/** The scoring method of this TARA, shown as the tables a rating is read from; and replacing it. */
export function MethodStep({ ctx, open, intro }: { ctx: Ctx; open: OpenTara; intro: string }) {
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
    <div className="step">
      <div className="step-main">
        <header className="step-head">
          <div>
            <h1>Scoring method</h1>
            <p className="lede">{intro}</p>
          </div>
        </header>
        <p className="method-name">{method.source ?? "A method without a name"}</p>

        <h2 className="section">Risk value</h2>
        <p className="help">
          The value of a risk, from 1 to 5, is read from this table: how bad the damage would be, against how feasible the attack
          is.
        </p>
        <table className="matrix">
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
                  <td key={key}>
                    <ValueChip value={method.risk_matrix[String(level)]?.[key] ?? null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="section">Attack feasibility</h2>
        <p className="help">
          An attack path is rated on five factors. The points are added up; the fewer points, the easier the attack and the higher
          its feasibility.
        </p>
        <table className="records plain">
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
            <section key={factor.key}>
              <h3>{factor.label}</h3>
              {factor.description && <p className="help">{factor.description}</p>}
              <ul>
                {factor.options.map((option) => (
                  <li key={option.key} title={option.description}>
                    <span className="points">{option.points}</span> {option.label}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <h2 className="section">Impact</h2>
        <p className="help">A damage scenario is rated in each category. Its impact is the highest of the four.</p>
        {method.impact_categories.map((category) => (
          <section key={category.key} className="impact-category">
            <h3>{category.label}</h3>
            {category.heading && <p className="help">{category.heading}</p>}
            <table className="records plain">
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
          </section>
        ))}

        {method.sources && (
          <>
            <h2 className="section">Where the method comes from</h2>
            <table className="records plain">
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
          </>
        )}

        {!frozen && (
          <>
            <h2 className="section">Use another method</h2>
            <p className="help">
              A method is a JSON file (docs/method.md describes it). Replacing the method changes how this TARA is rated from now
              on: every value is worked out again, and the reviews that covered the old method ask to be confirmed again. It can
              be undone from History.
            </p>
            <div className="row">
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
          </>
        )}
      </div>
    </div>
  );
}

/** The ways out of the tool: the report, the TARA as a document, and the action plan. */
export function ExportStep({ ctx, intro }: { ctx: Ctx; intro: string }) {
  const { tara } = ctx;
  const [actions, setActions] = useState<Action[] | null>(null);
  useEffect(() => {
    api
      .actionPlan(tara.id)
      .then((plan) => setActions(plan.actions))
      .catch(() => setActions([]));
  }, [tara.id]);

  return (
    <div className="step">
      <div className="step-main narrow">
        <header className="step-head">
          <div>
            <h1>Export</h1>
            <p className="lede">{intro}</p>
          </div>
        </header>

        <section className="export">
          <h2>The report</h2>
          <p>
            One web page that holds the whole assessment and needs nothing else to be read. Keep it in the technical file, or
            print it to PDF from the browser: it is laid out for A4.
          </p>
          <p className="row">
            <a className="button primary" href={api.reportUrl(tara.id, true)}>
              Download the report
            </a>
            <a className="button" href={api.reportUrl(tara.id)} target="_blank" rel="noreferrer">
              Open it to print
            </a>
          </p>
        </section>

        <section className="export">
          <h2>The TARA itself</h2>
          <p>
            The whole assessment as one JSON document, in the format the tool stores it in: to pass it to someone else, or to keep
            it under version control beside the product's code. Taken in on another installation, it arrives as a new draft: its
            reviews ask to be confirmed again there, and signatures do not travel with a file. To move a TARA exactly as it is,
            copy its folder from the data folder instead.
          </p>
          <p className="row">
            <a className="button" href={api.exportUrl(tara.id)}>
              Download {tara.id}.tara.json
            </a>
          </p>
        </section>

        <section className="export">
          <h2>The action plan</h2>
          <p>
            The work that follows from the assessment: controls to build and verify, decisions to make, reviews to hold. It is
            made anew from the TARA each time.
          </p>
          <p className="row">
            <a className="button" href={api.actionPlanUrl(tara.id)}>
              Download as Markdown
            </a>
          </p>
          {actions === null ? (
            <p className="muted">Working it out…</p>
          ) : actions.length === 0 ? (
            <p className="notice notice-done">
              Nothing is open: every control the assessment relies on is in the product and verified.
            </p>
          ) : (
            ACTION_GROUPS.map((group) => {
              const inGroup = actions.filter((a) => group.kinds.includes(a.kind));
              if (inGroup.length === 0) return null;
              return (
                <div key={group.title} className="actions">
                  <h3>{group.title}</h3>
                  <p className="help">{group.note}</p>
                  <ul>
                    {inGroup.map((action) => (
                      <li key={action.id} className={`priority-${action.priority}`}>
                        <p className="action-title">
                          <span className="id">{action.id}</span> {action.title}
                        </p>
                        {action.what && <p>{action.what}</p>}
                        <p className="help">Done when: {action.doneWhen}</p>
                        {action.riskIds.length > 0 && (
                          <p className="help">
                            For <RecordLinks tara={tara} ids={action.riskIds} />
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
