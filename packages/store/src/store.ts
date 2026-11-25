// What a place that keeps TARAs must be able to do.
//
// The rest of the tool knows this interface and nothing else about storage. The server never opens a file:
// it asks a Store. Two stores come with the tool: FileStore keeps each TARA as a JSON file in a folder
// (file-store.ts), and MemoryStore keeps them in memory, for tests (memory-store.ts). A store on a database
// or an object store is a third implementation of the same few methods (docs/architecture.md).

import type { Delta, Tara } from "@tara/core";

/** A TARA as it appears in a list. */
export interface TaraSummary {
  id: string;
  title: string;
  product: string | null;
  documentNumber: string | null;
  revision: string;
  status: "draft" | "released";
  example: boolean;
  updatedAt: string;
  /** The name of the scoring method the TARA is rated with. */
  method: string | null;
  basedOn: { id: string; revision: string } | null;
  counts: { assets: number; threats: number; risks: number; controls: number };
  /** Set instead of the details when the stored document cannot be read as a TARA: what is wrong with it. */
  problem?: string;
}

/** One line of a TARA's history: a change that was stored. */
export interface HistoryEntry {
  /** The TARA's `seq` after this change. */
  seq: number;
  at: string;
  author: string;
  summary: string;
  /** Every place that changed, with what was there before and after. */
  delta: Delta;
  /** The `seq` of the change this one takes back, when it is an undo. */
  undoes?: number;
  /**
   * The document was changed outside the tool, in the file itself. What changed is not known in detail,
   * so `delta` is empty and the change cannot be undone here.
   */
  external?: boolean;
  /** The SHA-256 of the document as stored by this change. */
  checksum: string;
}

export interface UpdateOptions {
  author: string;
  /** What the change was, in one line. May be replaced by the summary the change itself gives. */
  summary: string;
  /**
   * The `seq` of the TARA the person was looking at. If someone else has since changed the same place,
   * the update is refused with a Conflict instead of overwriting their work.
   */
  baseSeq?: number;
  /** The `seq` of the change this update takes back. */
  undoes?: number;
}

/** What a change gives back: the next TARA, and optionally a better summary than the caller had. */
export type Changed = Tara | { tara: Tara; summary: string };

export interface Store {
  /** Every TARA, most recently changed first. */
  list(): Promise<TaraSummary[]>;
  exists(id: string): Promise<boolean>;
  /** The TARA as stored, validated. Throws NotFound, or InvalidTara if the stored document is damaged. */
  read(id: string): Promise<Tara>;
  /** Stores a new TARA under its `id`. Its history starts here. Refused if the ID is taken. */
  create(tara: Tara, by: { author: string; summary: string }): Promise<Tara>;
  /**
   * Changes a TARA. `change` is given the TARA as stored and returns the next one; it must not modify what
   * it is given. The store validates the result, checks it against what others changed in the meantime,
   * and stores it with a line in the history. One update of a TARA runs at a time.
   * Returns the TARA as stored, or the unchanged TARA if nothing changed.
   */
  update(id: string, options: UpdateOptions, change: (current: Tara) => Changed): Promise<Tara>;
  /** The history of a TARA, oldest first. */
  history(id: string): Promise<HistoryEntry[]>;
  /** Takes a TARA away. It is moved aside, not destroyed (docs/data-format.md, "The trash"). */
  remove(id: string, by: { author: string }): Promise<void>;
  /** Keeps a text beside a TARA, such as the report as it was issued. */
  writeFile(id: string, name: string, content: string): Promise<void>;
  readFile(id: string, name: string): Promise<string | null>;
}

/** There is no TARA with this ID. */
export class NotFound extends Error {
  constructor(id: string) {
    super(`There is no TARA "${id}".`);
    this.name = "NotFound";
  }
}

/** Someone else changed the same place since the caller last looked. Nothing was stored. */
export class Conflict extends Error {
  /** The TARA as it is now, for showing to the person whose change was refused. */
  readonly current: Tara;
  constructor(message: string, current: Tara) {
    super(message);
    this.name = "Conflict";
    this.current = current;
  }
}
