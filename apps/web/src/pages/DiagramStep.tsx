// A step shown as the drawing of the architecture. The same drawing is opened from four steps, and each
// brings its own records forward: the elements, the assets inside them, the routes of attack paths, the
// controls where they act. Whatever is chosen on it shows the card every drawing has.

import { type ReactNode, useMemo } from "react";
import type { Emphasis } from "../diagram/layers.ts";
import type { Ctx, StepDef } from "../steps.tsx";
import { hrefOf } from "../ui/marks.tsx";
import { StepHead } from "../ui/StepHead.tsx";
import type { OpenTara } from "../useTara.ts";
import { graphOf, thingsToDraw } from "../views/graph.ts";
import { Diagram } from "./Diagram.tsx";
import { RecordCard, useCardState } from "./RecordCard.tsx";

/** The steps whose records are part of the architecture, and what each brings forward on the drawing. */
export const DRAWN_STEPS: Record<string, Emphasis> = {
  architecture: "architecture",
  assets: "assets",
  paths: "paths",
  controls: "controls",
};

interface Props {
  step: StepDef;
  ctx: Ctx;
  open: OpenTara;
  /** The item whose architecture is drawn. */
  itemId: string;
  /** The chosen record, from the address. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** What is laid over the drawing, from the address. null: the step decides. */
  overlay: string | null;
  onOverlay: (overlay: string) => void;
  /** The choice between the list and the drawing, at the right of the step's head. */
  ways: ReactNode;
}

/** The screen of a step that is shown as the architecture diagram: its head, the drawing, and the card of the chosen record. */
export function DiagramStep({ step, ctx, open, itemId, selected, onSelect, overlay, onOverlay, ways }: Props) {
  const { tara, assessment } = ctx;
  const graph = useMemo(() => graphOf(tara, assessment.checks), [tara, assessment]);
  const things = useMemo(() => thingsToDraw(graph, tara, assessment.checks), [graph, tara, assessment]);
  const cards = useCardState();
  /** A record the card names is chosen on the drawing if the drawing holds it, and opened in its list if not. */
  const go = (id: string) => {
    const onDrawing = [...tara.elements, ...tara.assets, ...tara.controls].some((record) => record.id === id);
    if (onDrawing) onSelect(id);
    else location.hash = hrefOf(tara, id) ?? location.hash;
  };
  const card = (id: string) => {
    const thing = things.get(id);
    if (!thing) return null;
    return (
      <RecordCard
        ctx={ctx}
        open={open}
        thing={thing}
        graph={graph}
        things={things}
        state={cards}
        onClose={() => onSelect(null)}
        onGo={go}
      />
    );
  };
  return (
    <>
      <StepHead title={step.title} intro={step.intro}>
        {ways}
      </StepHead>
      <Diagram
        ctx={ctx}
        open={open}
        itemId={itemId}
        emphasis={DRAWN_STEPS[step.key] ?? "architecture"}
        selected={selected}
        onSelect={onSelect}
        overlay={overlay}
        onOverlay={onOverlay}
        card={card}
      />
    </>
  );
}
