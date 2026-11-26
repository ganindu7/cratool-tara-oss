// Measures a text as the browser will draw it, so that a drawing can give each record the room its words need
// and no more. A record that has room for one line gets its text cut after a whole word; one that is drawn
// large is as high as its text. Nothing is cut by the box it stands in.

import { cutText } from "@tara/core";

let pen: CanvasRenderingContext2D | null | undefined;

/** The width of a text in the font of the page, at this size. */
export function widthOf(text: string, fontSize: number): number {
  if (pen === undefined) pen = document.createElement("canvas").getContext("2d");
  // Without a canvas (a browser that withholds it) an average letter is assumed: rather a little too wide than too narrow.
  if (!pen) return text.length * fontSize * 0.56;
  pen.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
  return pen.measureText(text).width;
}

/** How many lines a text takes at this width, broken between words as the browser breaks it. */
export function linesOf(text: string, width: number, fontSize: number): number {
  let lines = 1;
  let line = "";
  for (const word of text.split(/\s+/)) {
    const longer = line ? `${line} ${word}` : word;
    if (line && widthOf(longer, fontSize) > width) {
      lines++;
      line = word;
    } else {
      line = longer;
    }
  }
  return lines;
}

/** A text as one line of at most this width: whole if it fits, otherwise cut after a whole word and marked. */
export function onOneLine(text: string, width: number, fontSize: number): string {
  if (widthOf(text, fontSize) <= width) return text;
  // The longest cut that fits, found by halving: a cut is never longer than the text, and one letter always fits.
  let fits = 1;
  let tooLong = text.length;
  while (tooLong - fits > 1) {
    const middle = Math.floor((fits + tooLong) / 2);
    if (widthOf(cutText(text, middle), fontSize) <= width) fits = middle;
    else tooLong = middle;
  }
  return cutText(text, fits);
}
