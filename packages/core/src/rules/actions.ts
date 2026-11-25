// The work that follows from an assessment: the action plan.
//
// A TARA ends in decisions: controls to build, controls to put into service, tests to write, questions to
// settle. The action plan lists them as work, each with why it matters, when it counts as done, and what to
// record in the TARA afterwards. It is made anew from the TARA every time and stores nothing, so it cannot
// fall out of step with the assessment.
//
// An action's ID says what it is about and stays the same from one revision to the next (ACT-CTL-003 builds
// control CTL-003), so it can be used in a ticket or a commit message.

import type { Tara } from "../model/tara.ts";
import { controlState, risksUsingControl } from "./controls.ts";
import type { Assessment } from "./reviews.ts";
import { riskValue } from "./scoring.ts";

/**
 * implement: a technical control to build.      establish: a control of the organisation or a process to put in place.
 * service:   a built control to put into the product in use.      verify: show that a control in the product works.
 * decide:    a decision only a person can make.  document: something to write down.  review: a review to carry out.
 */
export type ActionKind = "implement" | "establish" | "service" | "verify" | "decide" | "document" | "review";

export interface Action {
  id: string;
  kind: ActionKind;
  /** 1 first. Follows the highest value among the risks the action is about. */
  priority: 1 | 2 | 3;
  title: string;
  what: string;
  why: string;
  riskIds: string[];
  controlId: string | null;
  pathIds: string[];
  craRequirements: string[];
  /** Where the work is tracked, when the control names it. */
  link: string | null;
  /** What must be true for the action to count as done. */
  doneWhen: string;
  /** What to record in the TARA once it is done, so that the assessment follows the product. */
  thenRecord: string;
}

/** How actions are grouped where people read them: by what the work is. */
export const ACTION_GROUPS: { title: string; note: string; kinds: ActionKind[] }[] = [
  {
    title: "Technical controls to implement and verify",
    note: "Changes to the product, and tests that show a control works. Done in the product's code.",
    kinds: ["implement", "verify"],
  },
  {
    title: "Process and organisational controls to put in place",
    note: "Procedures, responsibilities and settings outside the product's code. Each needs an owner.",
    kinds: ["establish"],
  },
  {
    title: "Built controls to put into service",
    note: "Implemented and tested, but not yet in the product in use. A control reduces no risk until it is in service.",
    kinds: ["service"],
  },
  {
    title: "Decisions and compliance evidence to complete",
    note: "Open scope decisions, and CRA essential requirements with no implementation recorded.",
    kinds: ["decide", "document"],
  },
  {
    title: "Independent review",
    note: "Review of the assessment by someone other than its author.",
    kinds: ["review"],
  },
];

const words = (key: string) => key.replace(/_/g, " ");

/** The action plan of a TARA, most urgent first. */
export function actionPlan(tara: Tara, assessment: Assessment): Action[] {
  const { checks } = assessment;
  const actions: Action[] = [];
  const riskValueOf = (threatId: string) => checks.scores.risks.get(threatId)?.value ?? null;
  const rank = (riskIds: string[]): 1 | 2 | 3 => {
    const worst = Math.max(
      0,
      ...riskIds.map((id) => {
        const risk = tara.risks.find((r) => r.id === id);
        if (!risk) return 0;
        return riskValue(tara.method, risk.residualImpact, risk.residualFeasibility) ?? riskValueOf(risk.threatId) ?? 0;
      }),
    );
    return worst >= 5 ? 1 : worst >= 4 ? 2 : 3;
  };

  // ---- one action per control that is not yet where it should be
  for (const control of tara.controls) {
    const risks = risksUsingControl(tara, control.id);
    if (risks.length === 0) continue;
    const riskIds = risks.map((r) => r.id);
    const state = controlState(tara, control.id);
    const name = control.name ?? control.id;
    const common = {
      riskIds,
      controlId: control.id,
      pathIds: control.coveredPathIds,
      craRequirements: control.craTags,
      link: control.workLink,
    };
    const because = risks
      .map((r) => {
        const threat = tara.threats.find((t) => t.id === r.threatId);
        return `${r.id} (value ${riskValueOf(r.threatId) ?? "?"}): ${threat?.description ?? ""}`;
      })
      .join(" ");

    if (state === "proposed" || state === "planned") {
      const technical = control.type === "technical";
      const paths = control.coveredPathIds.join(", ") || "none named";
      actions.push({
        ...common,
        id: `ACT-${control.id}`,
        kind: technical ? "implement" : "establish",
        priority: rank(riskIds),
        title: `${technical ? "Implement" : "Put in place"}: ${name}${state === "planned" ? " (under way)" : ""}`,
        what: control.description ?? "",
        why: because,
        doneWhen: technical
          ? `The control is in the product, and a test shows it: each attack path it covers (${paths}) is tried and no longer works as described.`
          : "The control is in place, approved by the person responsible, and can be shown: the document, the record or the setting, with its date.",
        thenRecord: `Set the state of ${control.id} to Built once it is implemented and tested, and to Live once it is in the product in use. In Control evidence, say where it is implemented and name the test. Then rate the risk that remains for ${riskIds.join(", ")}.`,
      });
    } else if (state === "built") {
      actions.push({
        ...common,
        id: `ACT-LIVE-${control.id}`,
        kind: "service",
        priority: rank(riskIds),
        title: `Put into service: ${name}`,
        what: "The control is implemented and tested, but not yet in the product in use. It reduces no risk until it is in service.",
        why: `The assessment names ${control.id} against ${riskIds.join(", ")} and gives it no credit until it is in service.`,
        doneWhen:
          "The change is released to the product in use, with the settings and secrets it needs, and a check on the product in use confirms it.",
        thenRecord: `Set the state of ${control.id} to Live, and name the release in Control evidence; then set it to Verified, with the test.`,
      });
    } else if (state === "implemented") {
      const effect = tara.evidence.find((e) => e.controlId === control.id)?.effect;
      actions.push({
        ...common,
        id: `ACT-VERIFY-${control.id}`,
        kind: "verify",
        priority: rank(riskIds) === 1 ? 2 : 3,
        title: `Verify: ${name}`,
        what: `The control is in the product, but nothing shows yet that it works. Write a test for it, or run the existing one, and keep the result.${effect ? ` What the test must show: ${effect}` : ""}`,
        why: `The assessment relies on ${control.id} for ${riskIds.join(", ")}. Until it is verified, its evidence does not count.`,
        doneWhen: "A test that fails with the control removed and passes with it in place exists and has been run.",
        thenRecord: `Set the state of ${control.id} to Verified; in Control evidence set the result to pass and name the test.`,
      });
    }
  }

  // ---- open decisions of the scope
  for (const [key, status] of Object.entries(checks.scopeFields)) {
    if (status.code !== "scope.input-needed") continue;
    actions.push({
      id: `ACT-DECIDE-${key.replace(/_/g, "-")}`,
      kind: "decide",
      priority: 2,
      title: `Decide: ${words(key)}`,
      what: `The scope field "${words(key)}" is empty.`,
      why: "The scope review cannot be completed while a scope field is open, and every rating waits for the scope review.",
      riskIds: [],
      controlId: null,
      pathIds: [],
      craRequirements: [],
      link: null,
      doneWhen: "The decision is recorded together with its basis.",
      thenRecord: `Enter it under Scope, ${words(key)}, with its evidence.`,
    });
  }

  // ---- CRA requirements that apply and have no implementation recorded
  for (const decision of tara.craDecisions) {
    const status = checks.cra.get(decision.id);
    if (decision.applicability !== "applies" || decision.implementationRef || status?.code === "cra.out-of-scope") continue;
    actions.push({
      id: `ACT-${decision.id}`,
      kind: "document",
      priority: 2,
      title: `CRA requirement ${decision.requirementKey}: no implementation recorded`,
      what: decision.justification ?? "",
      why: "The requirement applies and nothing says where it is implemented.",
      riskIds: [],
      controlId: null,
      pathIds: [],
      craRequirements: [decision.requirementKey],
      link: null,
      doneWhen: "What the requirement calls for is in place and can be shown.",
      thenRecord: `Under CRA requirements, ${decision.requirementKey}: say where it is implemented and how it was verified.`,
    });
  }

  // ---- the review
  const unreviewed = tara.paths
    .filter((p) => p.disposition === "included" && checks.paths.get(p.id)?.kind === "waiting")
    .map((p) => p.id);
  if (unreviewed.length > 0) {
    actions.push({
      id: "ACT-REVIEW",
      kind: "review",
      priority: 3,
      title: "Independent review of the assessment",
      what: `Attack paths ${unreviewed.join(", ")}, and the ratings, treatments, goals and claims that rest on them, have a review still to be recorded.`,
      why: "A rating that nobody but its author has looked at stays provisional, and the tool marks it so until the review is recorded.",
      riskIds: [],
      controlId: null,
      pathIds: unreviewed,
      craRequirements: [],
      link: null,
      doneWhen: "A reviewer other than the author has examined each attack path and rating, and the corrections are made.",
      thenRecord: "Record the review on each attack path, risk rating, treatment and goal; then record the scope review.",
    });
  }

  const technicalFirst = (action: Action) => (action.kind === "implement" ? 0 : 1);
  return actions.sort((a, b) => a.priority - b.priority || technicalFirst(a) - technicalFirst(b));
}

/** The action plan as a Markdown document, for a ticket system or a code repository. */
export function actionPlanMarkdown(tara: Tara, actions: Action[]): string {
  const lines: string[] = [
    `# Action plan: ${tara.meta.title}`,
    "",
    `From the TARA ${[tara.meta.documentNumber, `revision ${tara.meta.revision}`].filter(Boolean).join(", ")}. This plan is made from the assessment as it stands; it holds no state of its own.`,
    "",
  ];
  if (actions.length === 0)
    lines.push("Nothing is open: every control the assessment relies on is in the product and verified.", "");
  for (const group of ACTION_GROUPS) {
    const inGroup = actions.filter((a) => group.kinds.includes(a.kind));
    if (inGroup.length === 0) continue;
    lines.push(`## ${group.title}`, "", group.note, "");
    for (const action of inGroup) {
      lines.push(`### ${action.id}: ${action.title}`, "");
      lines.push(`- **Priority:** ${action.priority}`);
      if (action.what) lines.push(`- **What:** ${action.what}`);
      lines.push(`- **Why:** ${action.why}`);
      if (action.riskIds.length > 0) lines.push(`- **Risks:** ${action.riskIds.join(", ")}`);
      if (action.pathIds.length > 0) lines.push(`- **Attack paths:** ${action.pathIds.join(", ")}`);
      if (action.craRequirements.length > 0) lines.push(`- **CRA Annex I:** ${action.craRequirements.join(", ")}`);
      if (action.link) lines.push(`- **Tracked at:** ${action.link}`);
      lines.push(`- **Done when:** ${action.doneWhen}`);
      lines.push(`- **Then record in the TARA:** ${action.thenRecord}`, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
