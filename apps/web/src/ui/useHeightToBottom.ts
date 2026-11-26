// A drawing has the rest of the window: its canvas ends where the window ends, whatever stands above it. The
// head of a step may take one line or three, and a note may stand above a drawing or not; a height that is
// worked out from where the canvas begins is right in each case, where a fixed one is right in one.

import { type RefObject, useLayoutEffect } from "react";

/**
 * Gives an element the height that lets it reach the bottom of the window from where it stands.
 * below: the room kept beneath it, for a legend or a margin; null leaves the element the height its place gives it.
 *
 * The height is set on the element itself, before the page is drawn and before anything measures it: a
 * drawing that fits itself to its canvas when it opens must find the canvas at its final size. The style sheet
 * gives a smallest height, so a window that is too low gets a canvas that is moved through.
 */
export function useHeightToBottom(element: RefObject<HTMLElement | null>, below: number | null = 16): void {
  useLayoutEffect(() => {
    const measured = element.current;
    if (!measured || below === null) return;
    // Where it begins on the page, not in the window: scrolling does not change the answer.
    const fit = () => {
      measured.style.height = `${Math.floor(innerHeight - (measured.getBoundingClientRect().top + scrollY) - below)}px`;
    };
    fit();
    addEventListener("resize", fit);
    // What stands above may change its height, and with it the height of the page.
    const watcher = new ResizeObserver(fit);
    watcher.observe(document.body);
    return () => {
      removeEventListener("resize", fit);
      watcher.disconnect();
      measured.style.height = "";
    };
  }, [element, below]);
}
