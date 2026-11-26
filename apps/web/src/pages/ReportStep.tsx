// The report, and the release of the assessment. The step has two views: the report itself, as it stands now,
// and what leads to its release: the evidence handed over, the release review, the three signatures, the
// release, and the next revision once it is released.

import { EVIDENCE_ROW_KEYS, type LineStyle, releaseNeeds, type SignoffRole, signoffStates } from "@tara/core";
import { type FormEvent, useRef, useState } from "react";
import { api } from "../api.ts";
import { useLook } from "../diagram/look.ts";
import { LineChoice } from "../diagram/panels.tsx";
import { type OpenPoint, openPoints } from "../openPoints.ts";
import { SCOPE_LABELS } from "../scopeLabels.ts";
import type { Ctx, StepDef } from "../steps.tsx";
import { StatusChip } from "../ui/marks.tsx";
import { ReviewBox } from "../ui/ReviewBox.tsx";
import { StepHead, Ways } from "../ui/StepHead.tsx";
import { useHeightToBottom } from "../ui/useHeightToBottom.ts";
import type { OpenTara } from "../useTara.ts";
import { ScopeTable } from "./ScopeStep.tsx";

const ROLES: Record<SignoffRole, { name: string; means: string }> = {
  author: { name: "Author", means: "wrote the assessment" },
  reviewer: { name: "Reviewer", means: "checked it" },
  approver: { name: "Approver", means: "accepts it for the product; a different person from the author" },
};
const moment = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

interface Props {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  /** The view of the step that is shown: the sign-off and release rather than the report. */
  signing: boolean;
  /** The name the person signs under. */
  who: string;
}

/** The screen of the Report step: the report as it stands, or what leads to the release, whichever the address asks for. */
export function ReportStep({ step, ctx, open, signing, who }: Props) {
  const { tara } = ctx;
  const frame = useRef<HTMLIFrameElement>(null);
  useHeightToBottom(frame);
  // The report draws its data flows the way the diagram is looked at: the choice is the same one, and is offered here too.
  const [look, setLook] = useLook();
  const released = tara.meta.status === "released";
  const reportUrl = api.reportUrl(tara.id, look.line);
  const place = `#/tara/${tara.id}/report`;
  const ways = (
    <Ways
      label="What the step shows"
      ways={[
        { name: "Report", href: place, on: !signing, title: "The report, as it stands now" },
        {
          name: "Sign-off and release",
          href: `${place}?show=release`,
          on: signing,
          title: "The evidence for release, the release review, the signatures and the release",
        },
      ]}
    />
  );
  return (
    <>
      <StepHead title={step.title} intro={step.intro} />
      {signing ? (
        <div className="report">
          <div className="report-tools">{ways}</div>
          <SignOffAndRelease ctx={ctx} open={open} who={who} lines={look.line} />
        </div>
      ) : (
        <div className="report report-reading">
          <div className="report-tools">
            {ways}
            <div className="report-actions">
              {/* a released report is as it was issued: how it is drawn can no longer be chosen */}
              {!released && tara.elements.length > 0 && <LineChoice value={look.line} onChange={(line) => setLook({ line })} />}
              <span className="report-buttons">
                <a className="button quiet" href={reportUrl} target="_blank" rel="noreferrer">
                  Open in a tab
                </a>
                <a className="button quiet" href={`#/tara/${tara.id}/export`}>
                  Export
                </a>
              </span>
            </div>
          </div>
          <p className="report-note">
            {released ? "The report as issued." : "A draft until the TARA is released."} Every ID in it leads to where its record
            is defined.
          </p>
          {/* The address carries the number of the last change, so the report is drawn again when the TARA changes. */}
          <iframe
            ref={frame}
            className="report-frame"
            title="The report"
            src={`${reportUrl}#seq-${tara.seq}`}
            key={`${tara.seq}-${look.line}`}
          />
        </div>
      )}
    </>
  );
}

/** What the view of sign-off and release is given. */
interface ReleaseProps {
  ctx: Ctx;
  open: OpenTara;
  who: string;
  /** How the report that is kept at the release draws its data flows. */
  lines: LineStyle;
}

/** Everything between a finished assessment and its release, in the order it is done. */
function SignOffAndRelease({ ctx, open, who, lines }: ReleaseProps) {
  const { tara, assessment } = ctx;
  const released = tara.meta.status === "released";
  const points = openPoints(ctx);
  return (
    <>
      <section>
        <h2>Evidence for release</h2>
        <ScopeTable heading="Evidence" keys={EVIDENCE_ROW_KEYS} ctx={ctx} open={open} />
      </section>
      <section>
        <h2>Release review</h2>
        <p>
          <StatusChip status={assessment.checks.releaseReview} />{" "}
          {released ? "This TARA is released." : "Until the TARA is released, the report is marked as a draft."}
        </p>
        <ReviewBox
          open={open}
          kind="release"
          subjectId={null}
          label="Release review reference"
          help={SCOPE_LABELS.release_review.help}
          status={assessment.checks.releaseReview}
          decision={{
            value: tara.scope.release_review.decision,
            label: "Outcome of the review",
            example: "Approved for release",
          }}
        />
      </section>
      <SignOff ctx={ctx} open={open} who={who} />
      <section>
        <h2>Release</h2>
        {released ? <Released ctx={ctx} /> : <Release ctx={ctx} open={open} lines={lines} />}
      </section>
      <OpenPoints points={points} />
    </>
  );
}

/** The three signatures. Each person signs for themself, for the assessment as it stands. */
function SignOff({ ctx, open, who }: { ctx: Ctx; open: OpenTara; who: string }) {
  const { tara, assessment } = ctx;
  const released = tara.meta.status === "released";
  const reviewed = assessment.checks.releaseReview.code === "release.reviewed";
  // What a person types about themself before signing: their function, and where the approval is recorded.
  const [said, setSaid] = useState<Partial<Record<SignoffRole, { roleTitle: string; evidenceRef: string }>>>({});
  const saidFor = (role: SignoffRole) => said[role] ?? { roleTitle: "", evidenceRef: "" };
  const say = (role: SignoffRole, part: "roleTitle" | "evidenceRef", value: string) =>
    setSaid({ ...said, [role]: { ...saidFor(role), [part]: value } });
  const sign = (role: SignoffRole) => {
    const { roleTitle, evidenceRef } = saidFor(role);
    return open.send({ op: "sign", role, roleTitle: roleTitle.trim() || null, evidenceRef: evidenceRef.trim() || null });
  };
  return (
    <section>
      <h2>Sign-off</h2>
      <p className="lede">
        Each person signs for themself, for the assessment as it stands. A change after signing asks for the signature again.
      </p>
      <div className="table-wrap">
        <table className="signoff">
          <thead>
            <tr>
              <th>Role</th>
              <th>Signed by</th>
              <th className="grow">Function and evidence</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {signoffStates(tara, assessment).map(({ role, signoff, current }) => (
              <tr key={role}>
                <td>
                  <b>{ROLES[role].name}</b>
                  <span className="help">{ROLES[role].means}</span>
                </td>
                <td>
                  {signoff ? (
                    <>
                      {signoff.name}
                      <span className="help">{moment(signoff.signedAt)}</span>
                    </>
                  ) : (
                    <span className="muted">Not signed</span>
                  )}
                </td>
                <td className="grow">
                  {signoff ? (
                    <>
                      {signoff.roleTitle ?? <span className="muted">No function given</span>}
                      {signoff.evidenceRef && <span className="help">{signoff.evidenceRef}</span>}
                    </>
                  ) : (
                    !released && (
                      <div className="signoff-fields">
                        <input
                          value={saidFor(role).roleTitle}
                          aria-label={`Your function, as ${ROLES[role].name.toLowerCase()}`}
                          placeholder="Your function, e.g. Cybersecurity engineer"
                          onChange={(e) => say(role, "roleTitle", e.target.value)}
                        />
                        <input
                          value={saidFor(role).evidenceRef}
                          aria-label="Evidence reference"
                          placeholder="Evidence, e.g. approval record number (optional)"
                          onChange={(e) => say(role, "evidenceRef", e.target.value)}
                        />
                      </div>
                    )
                  )}
                </td>
                <td className="signoff-state">
                  {signoff && (
                    <span className={current ? "chip chip-done" : "chip chip-waiting"}>{current ? "Signed" : "Sign again"}</span>
                  )}
                  {signoff && !released && (
                    <button type="button" className="link" onClick={() => open.send({ op: "unsign", role })}>
                      Take back
                    </button>
                  )}
                  {!signoff && !released && (
                    <button
                      type="button"
                      disabled={!reviewed}
                      title={
                        reviewed
                          ? `Signs under the name ${who || "Unnamed"}`
                          : "Signing opens when the release review is confirmed"
                      }
                      onClick={() => sign(role)}
                    >
                      Sign as {ROLES[role].name.toLowerCase()}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!released && !reviewed && <p className="help">Signing opens when the release review above is confirmed.</p>}
    </section>
  );
}

/** What the release still waits for, and the release itself, asked for twice because it cannot be undone. */
function Release({ ctx, open, lines }: { ctx: Ctx; open: OpenTara; lines: LineStyle }) {
  const { tara, assessment } = ctx;
  const needs = releaseNeeds(tara, assessment);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {needs.length > 0 ? (
        <>
          <p>Before this TARA can be released:</p>
          <ul className="needs">
            {needs.map((need) => (
              <li key={need}>{need}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="next next-done">Everything is in place. Revision {tara.meta.revision} can be released.</p>
      )}
      {confirming ? (
        <p className="delete">
          Release revision {tara.meta.revision}? It can then no longer be changed; further work happens in a new revision.{" "}
          <button
            type="button"
            className="primary"
            onClick={() => {
              setConfirming(false);
              // the report as issued is drawn the way the diagram is looked at now
              void open.run(api.change(tara.id, [{ op: "release" }], tara.seq, lines));
            }}
          >
            Release
          </button>{" "}
          <button type="button" className="link" onClick={() => setConfirming(false)}>
            Not yet
          </button>
        </p>
      ) : (
        <div className="actions">
          <button type="button" className="primary" disabled={needs.length > 0} onClick={() => setConfirming(true)}>
            Release revision {tara.meta.revision}
          </button>
        </div>
      )}
    </>
  );
}

/** A released revision says when it was released, and offers the revision that follows it. */
function Released({ ctx }: { ctx: Ctx }) {
  const { tara } = ctx;
  const [revision, setRevision] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openRevision = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const made = await api.openRevision(tara.id, revision, reason);
      location.hash = `#/tara/${made.id}/scope`;
    } catch (refusal) {
      setError((refusal as Error).message);
    }
  };
  return (
    <>
      <p className="next next-done">
        Revision {tara.meta.revision} was released on {tara.meta.releasedAt ? moment(tara.meta.releasedAt) : "an unknown date"}.
        It can no longer be changed, and its report is kept as it was issued.
      </p>
      <form className="new-record" onSubmit={openRevision}>
        <h3>Open the next revision</h3>
        <p className="help">
          The whole content is carried forward into a new draft. Every record keeps its ID. Reviews keep their references and are
          confirmed again for the new revision.
        </p>
        <label className="field">
          <span className="field-label">Revision</span>
          <input value={revision} placeholder="e.g. 1.1" onChange={(e) => setRevision(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Why it is opened</span>
          <input
            value={reason}
            placeholder="e.g. Software release 2.5 adds remote diagnostics"
            onChange={(e) => setReason(e.target.value)}
          />
          <span className="help">
            For example a design change, a new vulnerability, or the periodic review. It is recorded with the revision.
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={!revision.trim() || !reason.trim()}>
            Open revision
          </button>
        </div>
      </form>
    </>
  );
}

/** What is still open, as a table: the release review can be confirmed when none is. */
function OpenPoints({ points }: { points: OpenPoint[] }) {
  return (
    <section>
      <h2>{points.length === 0 ? "No open points" : `${points.length} open ${points.length === 1 ? "point" : "points"}`}</h2>
      {points.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Record</th>
                <th className="grow">What it needs</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key}>
                  <td>{point.step.title}</td>
                  <td>
                    <a className="ref" href={point.href}>
                      {point.name}
                    </a>
                  </td>
                  <td className="grow">
                    <StatusChip status={point.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
