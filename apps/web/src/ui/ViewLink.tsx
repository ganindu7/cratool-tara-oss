// The ways from a record to a drawing of it. There are two, each with its sign, the same wherever the way is
// offered. A view that follows the chain of the method from the record (of an element, an asset, a threat or
// a control); and its ego view: the record in the middle, with only what is linked to it directly.

import { VIEWS, type ViewOf, viewKey, viewTip } from "../views/views.ts";

/** The sign of a way to look at a record. In both, the filled square is the record. */
function ViewIcon({ ego, size = 18 }: { ego: boolean; size?: number }) {
  return (
    <svg
      className="view-icon"
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {ego ? (
        <>
          <rect x="5.9" y="4.3" width="6.2" height="6.2" rx="0.8" fill="currentColor" />
          <circle cx="2.3" cy="7.4" r="1.6" />
          <circle cx="15.7" cy="7.4" r="1.6" />
          <circle cx="9" cy="15.2" r="1.6" />
          <path d="M3.9 7.4h2M12.1 7.4h2M9 10.5v3.1" />
        </>
      ) : (
        <>
          <path d="M5.4 9C8.6 9 8 4.2 11.8 4.2M5.4 9c3.2 0 2.6 4.8 6.4 4.8" />
          <rect x="1.2" y="6.8" width="4.2" height="4.4" rx="0.6" fill="currentColor" />
          <circle cx="13.9" cy="4.2" r="2.1" />
          <circle cx="13.9" cy="13.8" r="2.1" />
        </>
      )}
    </svg>
  );
}

/** The address of a view: it lies on the Graph step, and is named after the "?". */
export const viewHref = (taraId: string, view: ViewOf): string =>
  `#/tara/${taraId}/graph?view=${encodeURIComponent(viewKey(view))}`;

interface Props {
  taraId: string;
  view: ViewOf;
  /** The record the way starts from: it stays chosen in the view, so that its card stays where it is. */
  from?: string;
  /** A button with the name of the view, the same as a plain link, or the sign alone where there is no room for its name. */
  as?: "button" | "plain" | "sign";
}

/** A way into a view of a record. Leaving the view leads back to where it was entered. */
export function ViewLink({ taraId, view, from, as = "button" }: Props) {
  const href = viewHref(taraId, { ...view, chosen: view.chosen ?? from ?? null });
  const { name } = VIEWS[view.kind];
  const ego = view.kind === "ego";
  const tip = `${viewTip(view)}. Leaving it brings you back here.`;
  if (as === "sign") {
    return (
      <a className="graph-link view-sign" href={href} title={tip} aria-label={name} onClick={(e) => e.stopPropagation()}>
        <ViewIcon size={15} ego={ego} />
      </a>
    );
  }
  return (
    <a className={as === "plain" ? "ref view-link" : "button view-link"} href={href} title={tip}>
      <ViewIcon size={14} ego={ego} />
      {name}
    </a>
  );
}
