// The links of the open record, beside its list: the record in the middle, with everything linked to it
// within a chosen distance. Choosing a record on it opens that record in its own list, so that a TARA can be
// walked through along its links. This is the "Page and links" way of showing a step.

import { useMemo, useState } from "react";
import type { Ctx } from "../steps.tsx";
import { hrefOf } from "../ui/marks.tsx";
import { ViewLink } from "../ui/ViewLink.tsx";
import { graphOf, within } from "../views/graph.ts";
import { egoViewOf, type ViewOf, viewOf } from "../views/views.ts";
import { GraphCanvas, StatusLegend } from "./GraphCanvas.tsx";

const DISTANCE_KEY = "tara.links.distance";
const DISTANCES = [1, 2, 3];

/** The pane beside a list: the open record (centre) with what is linked to it, or a note to open a record while none is. */
export function LinksPane({ ctx, centre }: { ctx: Ctx; centre: string | null }) {
  const { tara, assessment } = ctx;
  const graph = useMemo(() => graphOf(tara, assessment.checks), [tara, assessment]);
  // How far the links are followed is one choice for every list, remembered in this browser.
  const [distance, setDistanceState] = useState(() => Number(localStorage.getItem(DISTANCE_KEY)) || 2);
  const setDistance = (links: number) => {
    setDistanceState(links);
    localStorage.setItem(DISTANCE_KEY, String(links));
  };
  const here = centre && graph.things.has(centre) ? centre : null;
  const near = useMemo(() => (here ? within(graph, here, distance) : new Set<string>()), [graph, here, distance]);
  const visible = useMemo(() => [...graph.things.values()].filter((thing) => near.has(thing.id)), [graph, near]);
  const links = useMemo(() => graph.links.filter(([from, to]) => near.has(from) && near.has(to)), [graph, near]);
  const further = here ? within(graph, here, distance + 1).size - near.size : 0;
  const goTo = (id: string) => {
    location.hash = hrefOf(tara, id) ?? location.hash;
  };
  const views = here ? [viewOf(tara, here), egoViewOf(tara, here)].filter((view): view is ViewOf => view !== null) : [];

  return (
    <aside className="map-pane" aria-label="What the open record is linked to">
      <div className="map-pane-head">
        <h2>{here ? `Linked to ${here}` : "Links"}</h2>
        <fieldset className="ways" aria-label="How far to follow the links">
          {DISTANCES.map((links) => (
            <button
              key={links}
              type="button"
              className={distance === links ? "way way-on" : "way"}
              aria-pressed={distance === links}
              title={links === 1 ? "Only what is linked to it directly" : `Everything within ${links} links`}
              onClick={() => setDistance(links)}
            >
              {links === 1 ? "1 link" : `${links} links`}
            </button>
          ))}
        </fieldset>
        {views.map((view) => (
          <ViewLink key={view.kind} taraId={tara.id} view={view} as="plain" />
        ))}
        {here && (
          <a className="ref" href={`#/tara/${tara.id}/graph?focus=${encodeURIComponent(here)}`}>
            Whole chain
          </a>
        )}
      </div>
      {here ? (
        <GraphCanvas
          things={visible}
          links={links}
          lit={null}
          picked={null}
          centre={here}
          smallest={0.5}
          onPick={(id) => id && id !== here && goTo(id)}
          onOpen={goTo}
        >
          <p className="map-hint">
            {visible.length === 1
              ? "Nothing is linked to this record yet."
              : `Choose a record to go to it.${further > 0 ? ` ${further} more one link further.` : ""}`}
          </p>
        </GraphCanvas>
      ) : (
        <div className="map-canvas">
          <p className="empty map-empty-note">Open a record on the left to see what it is linked to.</p>
        </div>
      )}
      <StatusLegend />
    </aside>
  );
}
