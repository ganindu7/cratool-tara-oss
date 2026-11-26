// TARAs as files: the store the tool uses unless told otherwise.
//
// Everything a person entered lives under one folder, the data folder, and nowhere else:
//
//   <data>/taras/<tara id>/tara.json       the TARA, as one JSON document (docs/data-format.md)
//   <data>/taras/<tara id>/history.jsonl   every change ever stored, one JSON object per line, oldest first
//   <data>/taras/<tara id>/files/...       texts kept beside the TARA, such as the report as issued
//   <data>/trash/<tara id>-<time>/         TARAs that were removed
//   <data>/methods/<name>.json             scoring methods of this installation's own, offered for new TARAs
//
// To back everything up, copy the folder. To move to another machine, copy the folder.
//
// How a change is stored, and why in this order:
//   1. One update of a TARA runs at a time (a queue per TARA in this process).
//   2. The change is written to the history first, then the document is replaced in one step: written to a
//      temporary file, flushed to disk, and renamed over the old one. A reader sees the old document or the
//      new one, never half of each.
//   3. If the process dies between the two, the history holds one change more than the document. The next
//      update notices and brings the document up to date from the history before doing anything else.
//
// This store is for one server process. Two processes on the same data folder would not see each other's queue.

import { constants } from "node:fs";
import { access, mkdir, open, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { applyDelta, InvalidTara, parseTara, Refusal, TARA_ID_PATTERN, type Tara, upgrade, type Writer } from "@tara/core";
import { checkFileName, checksumOf, firstEntry, prepareCommit, serialise, signed, summaryOf } from "./commit.ts";
import {
  type Changed,
  type HistoryEntry,
  NotFound,
  type Store,
  type StoredMethod,
  type TaraSummary,
  type UpdateOptions,
} from "./store.ts";

/** The author recorded for a change that was made in the file itself. */
export const OUTSIDE_THE_TOOL = "Outside the tool";

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === "ENOENT";

/** Replaces a file in one step, so that it is never seen half written. */
async function writeAtomically(path: string, text: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

/** The store that keeps each TARA as a JSON file with its history, all under one data folder. For one server process. */
export class FileStore implements Store {
  /** The data folder. */
  readonly root: string;
  /** For each TARA, the update that is running or waiting last. The next one starts when it has finished. */
  private readonly queues = new Map<string, Promise<unknown>>();
  /** The history files already read, with their size when read. A history only grows. */
  private readonly histories = new Map<string, { size: number; entries: HistoryEntry[] }>();
  private readonly clock: () => string;

  private readonly writer: Writer | undefined;

  /**
   * clock: gives the present moment; replaced in tests.
   * writer: the program that stores the documents, named in each as `writtenBy`.
   */
  constructor(root: string, options: { clock?: () => string; writer?: Writer } = {}) {
    this.root = resolve(root);
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.writer = options.writer;
  }

  // ------------------------------------------------------------------------------------------------ paths

  /** The folder of a TARA. The ID is checked first: it must never be able to name a place outside the data folder. */
  private folder(id: string): string {
    if (typeof id !== "string" || !TARA_ID_PATTERN.test(id)) throw new NotFound(String(id));
    return join(this.root, "taras", id);
  }
  private documentPath = (id: string) => join(this.folder(id), "tara.json");
  private historyPath = (id: string) => join(this.folder(id), "history.jsonl");

  // ---------------------------------------------------------------------------------------------- reading

  async exists(id: string): Promise<boolean> {
    try {
      await stat(this.documentPath(id));
      return true;
    } catch (error) {
      if (isMissing(error) || error instanceof NotFound) return false;
      throw error;
    }
  }

  async read(id: string): Promise<Tara> {
    const path = this.documentPath(id);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) throw new NotFound(id);
      throw error;
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch (error) {
      throw new InvalidTara([`${path} is not readable as JSON: ${(error as Error).message}`]);
    }
    const tara = parseTara(upgrade(document));
    if (tara.id !== id) {
      throw new InvalidTara([`The document in the folder "${id}" says its id is "${tara.id}". The two must be the same.`]);
    }
    return tara;
  }

  async list(): Promise<TaraSummary[]> {
    let ids: string[];
    try {
      const entries = await readdir(join(this.root, "taras"), { withFileTypes: true });
      ids = entries.filter((entry) => entry.isDirectory() && TARA_ID_PATTERN.test(entry.name)).map((entry) => entry.name);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const summaries: TaraSummary[] = [];
    for (const id of ids) {
      try {
        summaries.push(summaryOf(await this.read(id)));
      } catch (error) {
        if (error instanceof NotFound) continue; // a folder without a document: not a TARA
        // A damaged document is shown with what is wrong with it, rather than hidden.
        summaries.push({
          id,
          title: id,
          product: null,
          documentNumber: null,
          revision: "",
          status: "draft",
          example: false,
          updatedAt: "",
          method: null,
          basedOn: null,
          counts: { assets: 0, threats: 0, risks: 0, controls: 0 },
          problem: (error as Error).message,
        });
      }
    }
    return summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async history(id: string): Promise<HistoryEntry[]> {
    const path = this.historyPath(id);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch (error) {
      if (!isMissing(error)) throw error;
      if (!(await this.exists(id))) throw new NotFound(id);
      return [];
    }
    const known = this.histories.get(id);
    // A list of its own each time, so that nothing a caller does to it reaches what is kept here.
    if (known && known.size === size) return [...known.entries];

    const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line.trim() !== "");
    const entries: HistoryEntry[] = [];
    lines.forEach((line, index) => {
      try {
        entries.push(JSON.parse(line) as HistoryEntry);
      } catch (error) {
        // A last line cut short is a write that never finished, and is left out. Anything else is damage.
        if (index !== lines.length - 1)
          throw new Error(`${path}, line ${index + 1} is not readable: ${(error as Error).message}`);
      }
    });
    this.histories.set(id, { size, entries });
    return [...entries];
  }

  // ---------------------------------------------------------------------------------------------- writing

  /** Runs one thing at a time per TARA, in the order asked for. */
  private async exclusive<T>(id: string, run: () => Promise<T>): Promise<T> {
    const before = this.queues.get(id) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(run);
    this.queues.set(id, mine);
    try {
      return await mine;
    } finally {
      if (this.queues.get(id) === mine) this.queues.delete(id);
    }
  }

  private async appendHistory(id: string, entry: HistoryEntry): Promise<void> {
    const path = this.historyPath(id);
    const handle = await open(path, "a");
    try {
      await handle.writeFile(`${JSON.stringify(entry)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.histories.delete(id);
  }

  async create(tara: Tara, by: { author: string; summary: string }): Promise<Tara> {
    const fresh = parseTara(signed({ ...tara, seq: 0 }, this.writer));
    return this.exclusive(fresh.id, async () => {
      if (await this.exists(fresh.id)) throw new Refusal(`A TARA with the ID "${fresh.id}" exists already.`, "conflict");
      await mkdir(this.folder(fresh.id), { recursive: true });
      await this.appendHistory(fresh.id, firstEntry(fresh, by, this.clock()));
      await writeAtomically(this.documentPath(fresh.id), serialise(fresh));
      return fresh;
    });
  }

  async update(id: string, options: UpdateOptions, change: (current: Tara) => Changed): Promise<Tara> {
    return this.exclusive(id, async () => {
      const current = await this.reconcile(id);
      const history = await this.history(id);

      const result = change(current);
      const next = "tara" in result ? result.tara : result;
      const summary = "tara" in result ? result.summary : options.summary;
      const since = options.baseSeq === undefined ? [] : history.filter((entry) => entry.seq > (options.baseSeq as number));
      const commit = prepareCommit(current, next, since, { ...options, summary }, this.clock(), this.writer);
      if (!commit) return current;

      await this.appendHistory(id, commit.entry);
      await writeAtomically(this.documentPath(id), serialise(commit.tara));
      return commit.tara;
    });
  }

  /**
   * Reads a TARA for changing, and first puts right the two ways the document and its history can disagree:
   * a change that reached the history and not the document (the process died in between), and a document
   * that was edited in the file itself.
   */
  private async reconcile(id: string): Promise<Tara> {
    const stored = await this.read(id);
    const history = await this.history(id);
    const last = history.at(-1);
    if (!last || last.checksum === checksumOf(stored)) return stored;

    if (last.seq === stored.seq + 1 && !last.external) {
      // The last change was recorded and never reached the document. Complete it.
      try {
        const completed = parseTara(signed({ ...applyDelta(stored, last.delta), seq: last.seq }, this.writer));
        completed.meta.updatedAt = last.at;
        if (checksumOf(completed) === last.checksum) {
          await writeAtomically(this.documentPath(id), serialise(completed));
          return completed;
        }
      } catch {
        // Not the state that change started from: it is an outside edit after all.
      }
    }

    // The file was changed outside the tool. It is valid (it was read), so it stands; the history says so.
    const edited = { ...stored, seq: Math.max(stored.seq, last.seq) + 1 };
    await this.appendHistory(id, {
      seq: edited.seq,
      at: this.clock(),
      author: OUTSIDE_THE_TOOL,
      summary: "The file was changed outside the tool",
      delta: [],
      external: true,
      checksum: checksumOf(edited),
    });
    await writeAtomically(this.documentPath(id), serialise(edited));
    return edited;
  }

  async remove(id: string, by: { author: string }): Promise<void> {
    return this.exclusive(id, async () => {
      const tara = await this.read(id);
      await this.appendHistory(id, {
        seq: tara.seq,
        at: this.clock(),
        author: by.author,
        summary: "Removed (moved to the trash)",
        delta: [],
        checksum: checksumOf(tara),
      });
      const trash = join(this.root, "trash");
      await mkdir(trash, { recursive: true });
      await rename(
        this.folder(id),
        join(
          trash,
          `${id}-${this.clock()
            .replace(/[^0-9]/g, "")
            .slice(0, 14)}`,
        ),
      );
      this.histories.delete(id);
    });
  }

  async writeFile(id: string, name: string, content: string): Promise<void> {
    if (!(await this.exists(id))) throw new NotFound(id);
    const path = join(this.folder(id), "files", checkFileName(name));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }

  async readFile(id: string, name: string): Promise<string | null> {
    try {
      return await readFile(join(this.folder(id), "files", checkFileName(name)), "utf8");
    } catch (error) {
      if (isMissing(error) || error instanceof NotFound) return null;
      throw error;
    }
  }

  async ownMethods(): Promise<StoredMethod[]> {
    const folder = join(this.root, "methods");
    let names: string[];
    try {
      names = (await readdir(folder)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const read = async (name: string) => ({
      id: name.slice(0, -".json".length),
      text: await readFile(join(folder, name), "utf8"),
    });
    return Promise.all(names.map(read));
  }

  /**
   * Makes the data folder if it is not there, and makes sure it can be written. Asked for once, when the tool
   * starts: a folder the tool may not write is then known at once and with what to do about it, and not as a
   * fault at the first change someone makes.
   */
  async prepare(): Promise<void> {
    try {
      await mkdir(this.root, { recursive: true });
      await access(this.root, constants.R_OK | constants.W_OK);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
      throw new Error(
        `The data folder ${this.root} cannot be written (${code}). Let the user the tool runs as write to it, or name another folder in TARA_DATA_DIR.`,
      );
    }
  }
}
