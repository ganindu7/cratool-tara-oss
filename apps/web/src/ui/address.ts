// Going back. A view of a record is left to where it was entered, which the browser remembers: but only if
// this page has moved from one address to another since it was opened. A page that was opened on the view
// itself (by a link someone sent) has nothing to go back to, and is left to a place that is named instead.

let moved = false;
let replacing = false;
addEventListener("hashchange", () => {
  if (!replacing) moved = true;
  replacing = false;
});

/** Goes back to where the person was; where there is nothing to go back to, goes to `otherwise`. */
export function leaveTo(otherwise: string): void {
  if (moved) history.back();
  else location.hash = otherwise;
}

/**
 * Takes the place of the address of now, instead of following it: turning a view from one record to another
 * is not a step to go back through, so leaving still leads to where the views were entered.
 */
export function turnTo(address: string): void {
  if (address === location.hash) return;
  replacing = true;
  location.replace(address);
}
