// Where a text names a record.
//
// A person writes the ID of a record into a text ("see KT-DOC-05 section 2"), and wherever that text is shown,
// on screen or in the report, the ID leads to its record. Both find the IDs here, so that both find the same.

import { RECORD_KINDS, recordsOf, type Tara } from "./tara.ts";

/** One piece of a text: the ID of a record, or what stands between two of them. */
export interface TextPiece {
  text: string;
  /** Set where the piece is the ID of a record. */
  id?: string;
}

/** A text as it must be written inside a pattern to stand for itself. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** The ID of every record of a TARA. */
export const recordIds = (tara: Tara): string[] =>
  RECORD_KINDS.flatMap((kind) => recordsOf(tara, kind).map((record) => record.id));

/**
 * Gives the function that cuts a text into its pieces, for the IDs given. An ID counts only where it stands
 * alone, not inside a longer word or number; and where two IDs fit, the longer one is meant ("A012", not "A01").
 * The IDs are those the TARA has, whatever they look like: an item or a document may be given an ID of the
 * person's own choosing.
 */
export function mentionFinder(ids: Iterable<string>): (text: string) => TextPiece[] {
  const longestFirst = [...ids].sort((a, b) => b.length - a.length);
  const whole = (text: string): TextPiece[] => (text === "" ? [] : [{ text }]);
  if (longestFirst.length === 0) return whole;
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(${longestFirst.map(literal).join("|")})(?![A-Za-z0-9]|[-/][A-Za-z0-9])`, "g");
  return (text) => {
    const pieces: TextPiece[] = [];
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      pieces.push(...whole(text.slice(last, match.index)), { text: match[0], id: match[0] });
      last = match.index + match[0].length;
    }
    return [...pieces, ...whole(text.slice(last))];
  };
}
