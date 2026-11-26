// The view of one control: what it is for, and where it acts.
//
// The control stands in the middle. To its left are the risks that have it, each line an attack path of the
// risk's threat that the control covers, carrying the path's ID. Beneath it hang the elements it acts in.
// Nothing else of the TARA is in the view.

import type { Tara } from "@tara/core";
import { placesOf, riskHas } from "./graph.ts";
import { type Drawing, type Feed, feedFromLeft, type Heights, hang, NODE, Sheet, type Size } from "./layout.ts";

/** A risk in the view of a control: one that has the control, with the attack paths the control covers for it. */
export interface ControlViewRisk {
  id: string;
  /** For this risk the control is only proposed. */
  proposed: boolean;
  /** The attack paths of the risk's threat that the control covers. None: it treats the risk as a whole. */
  paths: string[];
}

/** What the view of a control holds: the control, the risks that have it, and the elements it acts in. */
export interface ControlView {
  controlId: string;
  /** The risks that have the control. */
  risks: ControlViewRisk[];
  /** Those of the paths that are screened out: they are drawn, and do not count. */
  screened: string[];
  /** Attack paths it is said to cover although no risk of their threats has the control. They are not drawn. */
  apart: string[];
  /** The elements of the architecture it acts in. */
  places: string[];
}

/** What the view of a control holds. null: the control is not in the TARA. */
export function controlView(tara: Tara, controlId: string): ControlView | null {
  const control = tara.controls.find((candidate) => candidate.id === controlId);
  if (!control) return null;
  const covered = tara.paths.filter((path) => control.coveredPathIds.includes(path.id));
  const risks = tara.risks
    .filter((risk) => riskHas(risk, controlId))
    .map((risk) => ({
      id: risk.id,
      proposed: !risk.existingControlIds.includes(controlId),
      paths: covered.filter((path) => path.threatIds.includes(risk.threatId)).map((path) => path.id),
    }));
  const drawn = new Set(risks.flatMap((risk) => risk.paths));
  return {
    controlId,
    risks,
    screened: covered.filter((path) => drawn.has(path.id) && path.disposition === "screened_out").map((path) => path.id),
    apart: covered.filter((path) => !drawn.has(path.id)).map((path) => path.id),
    places: placesOf(control.elementIds, tara.elements),
  };
}

/** The lines of one risk: one for each path the control covers for it, carrying the path's ID; or one that carries none. */
function feedOf(risk: ControlViewRisk, screened: string[]): Feed {
  if (risk.paths.length === 0) {
    return { id: risk.id, lines: [{ key: `treats|${risk.id}`, recordId: null, into: false, out: false, faint: risk.proposed }] };
  }
  const lines = risk.paths.map((pathId) => {
    const doesNotCount = screened.includes(pathId);
    const key = `covers|${risk.id}|${pathId}`;
    return { key, recordId: pathId, into: false, out: false, faint: risk.proposed || doesNotCount, faintLabel: doesNotCount };
  });
  return { id: risk.id, lines };
}

/** The view of a control, drawn: the risks to its left, and beneath it where it acts, in up to three columns. */
export function drawControlView(view: ControlView, node: Size = NODE, heights?: Heights): Drawing {
  const sheet = new Sheet(node, heights);
  sheet.put(view.controlId, -sheet.width / 2, 0);
  const fed = feedFromLeft(
    sheet,
    view.controlId,
    view.risks.map((risk) => feedOf(risk, view.screened)),
  );
  const hung = hang(sheet, { parent: view.controlId, key: "in", ids: view.places, columns: 3 });
  return { at: sheet.at, lines: [...fed.lines, ...hung.lines], labels: fed.labels, captions: [], box: sheet.frame(fed.reaches) };
}
