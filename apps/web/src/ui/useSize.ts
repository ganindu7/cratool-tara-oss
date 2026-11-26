// The size of an element on the page, kept up to date as the window or the layout changes: what a drawing
// needs to know to fit itself to the room it has.

import { type RefObject, useEffect, useState } from "react";

/** The room an element has on the page: its width and height in pixels, inside its border. */
export interface Room {
  width: number;
  height: number;
}

/** null until the element is on the page. */
export function useSize(element: RefObject<HTMLElement | null>): Room | null {
  const [size, setSize] = useState<Room | null>(null);
  useEffect(() => {
    const measured = element.current;
    if (!measured) return;
    const measure = () => setSize({ width: measured.clientWidth, height: measured.clientHeight });
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(measured);
    return () => watcher.disconnect();
  }, [element]);
  return size;
}
