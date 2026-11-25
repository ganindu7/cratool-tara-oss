// The part of storing a change that is the same for every store: working out what changed, checking it
// against what others did in the meantime, and making the history entry. Pure: it reads and writes nothing.

import { canonicalJson, deltasOverlap, diffTara, parseTara, sha256, type Tara, type Writer } from "@tara/core";
import { Conflict, type HistoryEntry, type TaraSummary, type UpdateOptions } from "./store.ts";

/** A TARA as the text that is stored: JSON, indented so that a person can read and compare it. */
export const serialise = (tara: Tara): string => `${JSON.stringify(tara, null, 2)}\n`;

/** The checksum of a stored document. It does not depend on how the JSON is laid out. */
export const checksumOf = (tara: Tara): string => sha256(canonicalJson(tara));

export interface Commit {
  tara: Tara;
  entry: HistoryEntry;
}

/**
 * Prepares the storing of `next` in place of `current`. Returns null when nothing changed.
 *
 * since: the history entries after options.baseSeq, i.e. what happened since the caller last looked.
 * writer: the program that stores it, named in the stored document.
 * Throws a Conflict when one of them changed a place this change also changes.
 */
export function prepareCommit(
  current: Tara,
  next: Tara,
  since: HistoryEntry[],
  options: UpdateOptions,
  now: string,
  writer?: Writer,
): Commit | null {
  const delta = diffTara(current, next);
  if (delta.length === 0) return null;

  for (const earlier of since) {
    // What an outside change touched is not known, so it is taken to touch everything.
    if (earlier.external || deltasOverlap(earlier.delta, delta)) {
      throw new Conflict(
        `${earlier.author} changed this in the meantime (${earlier.summary}). Your change was not stored; the latest state is now shown.`,
        current,
      );
    }
  }

  const tara = parseTara(signed({ ...next, seq: current.seq + 1, meta: { ...next.meta, updatedAt: now } }, writer));
  const entry: HistoryEntry = {
    seq: tara.seq,
    at: now,
    author: options.author,
    summary: options.summary,
    delta,
    checksum: checksumOf(tara),
  };
  if (options.undoes !== undefined) entry.undoes = options.undoes;
  return { tara, entry };
}

/** A document with the program that is about to store it named in it. Without a writer, the document as it is. */
export const signed = (tara: Tara, writer: Writer | undefined): Tara => (writer ? { ...tara, writtenBy: writer } : tara);

/** The first entry of a history: the TARA as it was created. */
export function firstEntry(tara: Tara, by: { author: string; summary: string }, now: string): HistoryEntry {
  return { seq: tara.seq, at: now, author: by.author, summary: by.summary, delta: [], checksum: checksumOf(tara) };
}

export function summaryOf(tara: Tara): TaraSummary {
  return {
    id: tara.id,
    title: tara.meta.title,
    product: tara.meta.product,
    documentNumber: tara.meta.documentNumber,
    revision: tara.meta.revision,
    status: tara.meta.status,
    example: tara.meta.example,
    updatedAt: tara.meta.updatedAt,
    method: tara.method.source ?? null,
    basedOn: tara.meta.basedOn,
    counts: {
      assets: tara.assets.length,
      threats: tara.threats.length,
      risks: tara.risks.length,
      controls: tara.controls.length,
    },
  };
}

/** A name for a file kept beside a TARA: path segments of small letters, digits, dots, hyphens and underscores. */
export function checkFileName(name: string): string {
  const segments = name.split("/");
  if (segments.length === 0 || segments.some((s) => !/^[a-z0-9][a-z0-9._-]*$/.test(s))) {
    throw new Error(`"${name}" is not a usable file name.`);
  }
  return segments.join("/");
}
