// Showing a text where there is not room for all of it.
//
// The rule, everywhere the tool or the report shortens a text: nothing is hidden silently. A text that is cut
// ends after a whole word and in a mark that says so, and whatever shows it also shows the ID of its record,
// which leads to the text in full.

/** The mark at the end of a text that was cut for room. */
export const CUT = "…";

/**
 * A text that fits in `max` characters: whole, or cut after a whole word and marked. Runs of spaces and line
 * breaks count as one space. A text is cut inside a word only when that word alone is too long.
 */
export function cutText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const room = flat.slice(0, Math.max(1, max - 1));
  // Where the room ends exactly at the end of a word, all of it is kept.
  const endsAWord = /[\s,;:.)]/.test(flat[room.length] ?? " ");
  const lastSpace = room.lastIndexOf(" ");
  // A space in the first half would throw away most of the room: then the long word is cut instead.
  const kept = endsAWord || lastSpace <= max / 2 ? room : room.slice(0, lastSpace);
  return `${kept.replace(/[\s,;:(\-–]+$/, "")}${CUT}`;
}

/** Whether a text was cut by `cutText`. */
export const isCut = (text: string): boolean => text.endsWith(CUT);
