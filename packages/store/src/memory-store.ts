// TARAs kept in memory: nothing is written anywhere and everything is gone when the process ends.
// For tests, and as the shortest complete example of what a Store has to do.

import { parseTara, Refusal, type Tara, type Writer } from "@tara/core";
import { checkFileName, firstEntry, prepareCommit, signed, summaryOf } from "./commit.ts";
import { type Changed, type HistoryEntry, NotFound, type Store, type TaraSummary, type UpdateOptions } from "./store.ts";

export class MemoryStore implements Store {
  private readonly taras = new Map<string, { tara: Tara; history: HistoryEntry[]; files: Map<string, string> }>();
  private readonly clock: () => string;

  private readonly writer: Writer | undefined;

  constructor(options: { clock?: () => string; writer?: Writer } = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.writer = options.writer;
  }

  private kept(id: string) {
    const kept = this.taras.get(id);
    if (!kept) throw new NotFound(id);
    return kept;
  }

  async list(): Promise<TaraSummary[]> {
    return [...this.taras.values()].map((kept) => summaryOf(kept.tara)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async exists(id: string): Promise<boolean> {
    return this.taras.has(id);
  }

  async read(id: string): Promise<Tara> {
    // A copy, so that nothing a caller does to it reaches what is stored.
    return structuredClone(this.kept(id).tara);
  }

  async create(tara: Tara, by: { author: string; summary: string }): Promise<Tara> {
    const fresh = parseTara(signed(structuredClone({ ...tara, seq: 0 }), this.writer));
    if (this.taras.has(fresh.id)) throw new Refusal(`A TARA with the ID "${fresh.id}" exists already.`, "conflict");
    this.taras.set(fresh.id, { tara: fresh, history: [firstEntry(fresh, by, this.clock())], files: new Map() });
    return structuredClone(fresh);
  }

  async update(id: string, options: UpdateOptions, change: (current: Tara) => Changed): Promise<Tara> {
    const kept = this.kept(id);
    const result = change(structuredClone(kept.tara));
    const next = "tara" in result ? result.tara : result;
    const summary = "tara" in result ? result.summary : options.summary;
    const since = options.baseSeq === undefined ? [] : kept.history.filter((entry) => entry.seq > (options.baseSeq as number));
    const commit = prepareCommit(kept.tara, next, since, { ...options, summary }, this.clock(), this.writer);
    if (!commit) return structuredClone(kept.tara);
    kept.tara = commit.tara;
    kept.history.push(commit.entry);
    return structuredClone(commit.tara);
  }

  async history(id: string): Promise<HistoryEntry[]> {
    return structuredClone(this.kept(id).history);
  }

  async remove(id: string): Promise<void> {
    this.kept(id);
    this.taras.delete(id);
  }

  async writeFile(id: string, name: string, content: string): Promise<void> {
    this.kept(id).files.set(checkFileName(name), content);
  }

  async readFile(id: string, name: string): Promise<string | null> {
    return this.taras.get(id)?.files.get(checkFileName(name)) ?? null;
  }
}
