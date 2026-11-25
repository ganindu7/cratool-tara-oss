// The report, and the release of the assessment: the evidence handed over, the release review, the three
// signatures, the release itself, and the next revision once it is released.

import { EVIDENCE_ROW_KEYS, openFindings, releaseNeeds, type SignoffRole, signoffStates } from "@tara/core";
import { useState } from "react";
import { api, author } from "../api.ts";
import { SCOPE_LABELS } from "../scopeLabels.ts";
import type { Ctx } from "../steps.tsx";
import { ReviewBox } from "../ui/ReviewBox.tsx";
import type { OpenTara } from "../useTara.ts";
import { ScopeRow } from "./ScopeStep.tsx";

const ROLE_NAMES: Record<SignoffRole, string> = { author: "Author", reviewer: "Reviewer", approver: "Approver" };
const moment = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ReportStep({ ctx, open, intro }: { ctx: Ctx; open: OpenTara; intro: string }) {
  const { tara, assessment } = ctx;
  const released = tara.meta.status === "released";
  const needs = releaseNeeds(tara, assessment);
  const stillOpen = openFindings(assessment.checks).filter((f) => f.step !== "release").length;
  const [revision, setRevision] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openRevision = async () => {
    try {
      const made = await api.openRevision(tara.id, revision, reason);
      location.hash = `#/tara/${made.id}/scope`;
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="step">
      <div className="step-main">
        <header className="step-head">
          <div>
            <h1>Report and release</h1>
            <p className="lede">{intro}</p>
          </div>
          <a className="button" href={api.reportUrl(tara.id)} target="_blank" rel="noreferrer">
            Open the report in a new tab
          </a>
        </header>

        <iframe className="report-frame" title="The report" src={`${api.reportUrl(tara.id)}#seq-${tara.seq}`} key={tara.seq} />

        <h2 className="section">Release</h2>
        {released ? (
          <p className="notice notice-done">
            Revision {tara.meta.revision} was released on{" "}
            {tara.meta.releasedAt ? moment(tara.meta.releasedAt) : "an unknown date"}. It can no longer be changed, and its report
            is kept as it was issued. Work continues in a new revision.
          </p>
        ) : (
          <p className="lede">
            {stillOpen > 0
              ? `${stillOpen} ${stillOpen === 1 ? "check is" : "checks are"} still open in the steps on the left. The assessment can be released when none is, the release review is recorded, and three people have signed.`
              : "Every check of the assessment is settled. What remains is below."}
          </p>
        )}

        {!released && <h3 className="section">Evidence handed over</h3>}
        {!released && EVIDENCE_ROW_KEYS.map((key) => <ScopeRow key={key} scopeKey={key} ctx={ctx} open={open} />)}

        {!released && (
          <ReviewBox
            open={open}
            kind="release"
            subjectId={null}
            label="Release review"
            help={SCOPE_LABELS.release_review.help}
            status={assessment.checks.releaseReview}
            decision={{ value: tara.scope.release_review.decision, label: "Outcome", example: "Approved for release" }}
          />
        )}

        <h3 className="section">Signatures</h3>
        <table className="records signatures">
          <tbody>
            {signoffStates(tara, assessment).map(({ role, signoff, current }) => (
              <tr key={role} className={signoff && current ? "row-done" : "row-waiting"}>
                <th scope="row">{ROLE_NAMES[role]}</th>
                <td className="grow">
                  {signoff ? (
                    <>
                      {signoff.name}
                      {signoff.roleTitle ? `, ${signoff.roleTitle}` : ""}{" "}
                      <span className="muted">signed {moment(signoff.signedAt)}</span>
                      {!current && <span className="status status-waiting">The assessment changed since: sign again</span>}
                    </>
                  ) : (
                    <span className="muted">Not signed</span>
                  )}
                </td>
                <td>
                  {!released && (
                    <span className="row">
                      <button
                        type="button"
                        disabled={assessment.checks.releaseReview.code !== "release.reviewed"}
                        onClick={() => open.send({ op: "sign", role })}
                      >
                        Sign as {author.get() || "…"}
                      </button>
                      {signoff && (
                        <button type="button" className="link" onClick={() => open.send({ op: "unsign", role })}>
                          Withdraw
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!released && (
          <>
            {needs.length > 0 && (
              <ul className="needs">
                {needs.map((need) => (
                  <li key={need}>{need}</li>
                ))}
              </ul>
            )}
            <button type="button" className="primary" disabled={needs.length > 0} onClick={() => open.send({ op: "release" })}>
              Release revision {tara.meta.revision}
            </button>
            <p className="help">Releasing freezes this TARA for good. The report is kept exactly as issued.</p>
          </>
        )}

        {released && (
          <form
            className="add-form"
            onSubmit={(e) => {
              e.preventDefault();
              void openRevision();
            }}
          >
            <h2>Open the next revision</h2>
            <p className="help">
              A new draft with everything carried over. Every record keeps its ID. Reviews are carried with their references and
              ask to be confirmed for the new revision.
            </p>
            <label className="field">
              New revision
              <input value={revision} placeholder="e.g. 1.1" onChange={(e) => setRevision(e.target.value)} />
            </label>
            <label className="field">
              Why it is opened
              <input value={reason} placeholder="e.g. new software release 2.5" onChange={(e) => setReason(e.target.value)} />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary" disabled={!revision.trim() || !reason.trim()}>
              Open revision
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
