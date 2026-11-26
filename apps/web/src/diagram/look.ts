// How the architecture diagram is looked at: whether elements show what they hold, how the data flows are
// drawn, whether an overview stands in a corner. None of it is part of the TARA. It is kept in this browser
// from one visit to the next, and whatever draws the diagram is told: the canvas, and the report when it is made.

import { FIRST_LINE_STYLE, type LineStyle } from "@tara/core";
import { useState } from "react";

/** One person's way of looking at the architecture diagram. It is kept in their browser and is no part of the TARA. */
export interface Look {
  /** Elements show the assets that live in them. */
  assetsInside: boolean;
  line: LineStyle;
  /** A small picture of the whole drawing stands in a corner. */
  overview: boolean;
}

const KEPT_IN = "tara.diagram.look";
const FIRST_LOOK: Look = { assetsInside: true, line: FIRST_LINE_STYLE, overview: false };

/** What this browser kept. The look of a first visit, where it kept nothing that can be read. */
function kept(): Look {
  try {
    return { ...FIRST_LOOK, ...JSON.parse(localStorage.getItem(KEPT_IN) ?? "{}") };
  } catch {
    return FIRST_LOOK;
  }
}

/** The look, and the way to change a part of it. */
export function useLook(): [Look, (change: Partial<Look>) => void] {
  const [look, setLook] = useState<Look>(kept);
  const change = (changed: Partial<Look>) => {
    const next = { ...look, ...changed };
    localStorage.setItem(KEPT_IN, JSON.stringify(next));
    setLook(next);
  };
  return [look, change];
}
