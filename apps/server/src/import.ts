// Taking in a TARA from a file: what it would bring, said before anything is stored.
//
// An import is two steps. First the file is read and the person is shown what it holds, what does not come
// with it, and what it would collide with here. Only then is it taken in, as a new draft. Nothing that is
// here is ever replaced or changed by an import: where a title or a document number is taken already, the
// imported TARA gets one of its own, so that a number and revision still mean one thing.

import { asImported, parseTara, type Tara, takeKnown, upgrade } from "@tara/core";
import type { TaraSummary } from "@tara/store";

/** What an import would do, for showing to the person. */
export interface ImportPlan {
  /** What the TARA will be called here. */
  title: string;
  product: string | null;
  documentNumber: string | null;
  revision: string;
  /** What it holds, as counts with their names: "5 threat scenarios". */
  holds: string[];
  /** What the person should know before it is taken in: what is renamed, and what does not come with the file. */
  notes: string[];
}

/** A name that nothing here has: the wanted one, or the wanted one with a mark, numbered from the second on. */
function freeName(wanted: string, taken: (name: string) => boolean, marked: (n: number) => string): string {
  if (!taken(wanted)) return wanted;
  for (let n = 1; ; n++) {
    const candidate = marked(n);
    if (!taken(candidate)) return candidate;
  }
}

const counted = (n: number, one: string, many: string): string | null => (n === 0 ? null : `${n} ${n === 1 ? one : many}`);

/**
 * Reads a document as a TARA to take in, and says what taking it in would do. Throws InvalidTara, with what
 * is wrong, if the document is not a TARA.
 *
 * existing: the TARAs that are here. id: the ID the new TARA would get.
 */
export function planImport(
  document: unknown,
  existing: TaraSummary[],
  id: string,
  now: string,
): { tara: Tara; plan: ImportPlan } {
  // A file written by a later version of the tool is taken for what this version knows, and that is said.
  const read = takeKnown(document);
  const { tara, notTaken } = asImported(parseTara(upgrade(read.document)), { id, now });
  const notes: string[] = [...read.notTaken];

  const number = tara.meta.documentNumber;
  if (number !== null) {
    const taken = (candidate: string) =>
      existing.some((t) => t.documentNumber === candidate && t.revision === tara.meta.revision);
    const free = freeName(number, taken, (n) => `${number}-IMPORT${n === 1 ? "" : `-${n}`}`);
    if (free !== number) {
      notes.push(
        `A TARA numbered ${number}, revision ${tara.meta.revision}, is here already. It is not replaced: this one comes in as ${free}.`,
      );
      tara.meta.documentNumber = free;
    }
  }
  const title = tara.meta.title;
  const free = freeName(
    title,
    (candidate) => existing.some((t) => t.title === candidate),
    (n) => `${title} (imported${n === 1 ? "" : ` ${n}`})`,
  );
  if (free !== title) {
    notes.push(`A TARA with this title is here already. This one comes in as "${free}".`);
    tara.meta.title = free;
  }

  const holds = [
    counted(tara.items.length, "item", "items"),
    counted(tara.elements.length, "architecture element", "architecture elements"),
    counted(tara.assets.length, "asset", "assets"),
    counted(tara.damages.length, "damage scenario", "damage scenarios"),
    counted(tara.threats.length, "threat scenario", "threat scenarios"),
    counted(tara.paths.length, "attack path", "attack paths"),
    counted(tara.controls.length, "control", "controls"),
    counted(tara.goalClaims.length, "goal or claim", "goals and claims"),
    counted(tara.references.length, "document", "documents"),
  ].filter((entry): entry is string => entry !== null);

  return {
    tara,
    plan: {
      title: tara.meta.title,
      product: tara.meta.product,
      documentNumber: tara.meta.documentNumber,
      revision: tara.meta.revision,
      holds,
      notes: [...notes, ...notTaken],
    },
  };
}
