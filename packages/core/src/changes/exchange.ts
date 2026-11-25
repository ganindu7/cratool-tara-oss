// Taking in a TARA from a file.
//
// A file that travels is working material, not the record. So a TARA that is taken in always becomes a new
// draft of this installation, and some things do not come with it, by decision:
//
//   - Signatures. A signature is a person's statement, made here, for what was in front of them.
//   - Confirmed reviews. Each review keeps the reference that was entered, and asks to be confirmed again.
//   - The arrangement of the diagram. Where someone placed the elements is a way of looking at the records,
//     not part of the assessment. The diagram is drawn anew from them (rules/arrange.ts).
//   - The history. It belongs to the installation where the changes were made.
//
// Everything else comes in whole: every record under its ID, every link, the scoring method, the scope, the
// decisions on the CRA requirements, the documents. Every value is worked out anew, as always.
//
// To keep a TARA exactly as it is, with its reviews, signatures and history, copy its folder instead
// (docs/data-format.md).

import type { Tara } from "../model/tara.ts";

export interface Incoming {
  /** The TARA as it will be stored. */
  tara: Tara;
  /** What the file held that is not taken, in words, for showing before anything is stored. */
  notTaken: string[];
}

/** A TARA document, as it is taken in: a new draft under a given ID. The document passed in is unchanged. */
export function asImported(document: Tara, into: { id: string; now: string }): Incoming {
  const tara = structuredClone(document);
  const notTaken: string[] = [];

  if (tara.meta.status === "released") {
    notTaken.push(
      `It was released as revision ${tara.meta.revision} where it comes from. Here it is a draft: a release is made, and signed, where the work is done.`,
    );
  }
  if (tara.signoffs.length > 0) {
    notTaken.push(
      `Its ${tara.signoffs.length === 1 ? "signature is" : `${tara.signoffs.length} signatures are`} not taken. A signature is given here, by the person, for what they see.`,
    );
  }
  const confirmed = tara.reviews.filter((review) => review.fingerprint !== null).length;
  if (confirmed > 0) {
    notTaken.push(
      `Its ${confirmed === 1 ? "review keeps its reference and asks" : `${confirmed} reviews keep their references and ask`} to be confirmed again.`,
    );
  }
  if (tara.elements.some((element) => element.x !== null || element.y !== null)) {
    notTaken.push(
      "The arrangement of its diagram is not taken. The diagram is drawn anew from the records, and can be arranged again.",
    );
  }

  tara.id = into.id;
  tara.seq = 0;
  tara.meta = { ...tara.meta, status: "draft", createdAt: into.now, updatedAt: into.now, releasedAt: null, basedOn: null };
  tara.signoffs = [];
  tara.reviews = tara.reviews.map((review) => ({
    ...review,
    fingerprint: null,
    revision: null,
    confirmedBy: null,
    confirmedAt: null,
  }));
  tara.reviewCount = 0;
  tara.elements = tara.elements.map((element) => ({ ...element, x: null, y: null, w: null, h: null }));
  return { tara, notTaken };
}
