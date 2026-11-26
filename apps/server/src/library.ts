// What comes with the tool as data, read from the repository when the tool starts: the scoring methods a new
// TARA can start with, and the training examples. An installation adds methods of its own by putting them in
// <data>/methods/. Those are in the data folder, so the store reads them and they are handed in here.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Method, parseTara, type Tara, upgrade, validateMethod } from "@tara/core";
import type { StoredMethod } from "@tara/store";
import type { Config } from "./config.ts";

/** A scoring method a new TARA can start with: the method itself, what it is called, and where it comes from. */
export interface MethodEntry {
  /** The file name without ".json". */
  id: string;
  name: string;
  /** Shipped with the tool, or added by this installation. */
  origin: "tool" | "installation";
  method: Method;
}

async function jsonFiles(folder: string): Promise<{ id: string; path: string }[]> {
  try {
    const names = (await readdir(folder)).filter((name) => name.endsWith(".json")).sort();
    return names.map((name) => ({ id: name.slice(0, -".json".length), path: join(folder, name) }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * The scoring methods available here: those that come with the tool, then the installation's own, which the
 * store gives (`Store.ownMethods`). A file that is not a valid method is left out, with a warning.
 */
export async function loadMethods(config: Pick<Config, "methodsDir">, own: StoredMethod[] = []): Promise<MethodEntry[]> {
  const shipped = await Promise.all(
    (await jsonFiles(config.methodsDir)).map(async (file) => ({ id: file.id, text: await readFile(file.path, "utf8") })),
  );
  const entries: MethodEntry[] = [];
  const kept: [StoredMethod[], MethodEntry["origin"], string][] = [
    [shipped, "tool", "that comes with the tool"],
    [own, "installation", "in the data folder"],
  ];
  for (const [files, origin, where] of kept) {
    for (const file of files) {
      try {
        const method = JSON.parse(file.text) as Method;
        const problems = validateMethod(method);
        if (problems.length > 0) throw new Error(problems[0]);
        entries.push({ id: file.id, name: method.source ?? file.id, origin, method });
      } catch (error) {
        console.warn(`The scoring method ${file.id}.json ${where} cannot be used: ${(error as Error).message}`);
      }
    }
  }
  return entries;
}

/** A training example as it comes with the tool: a whole TARA, copied into the data folder when a person loads it. */
export interface ExampleEntry {
  /** The file name without ".json": "kettle". */
  name: string;
  tara: Tara;
}

/** The training examples, in reading order: the simplest first. */
export async function loadExamples(config: Config): Promise<ExampleEntry[]> {
  const order = ["kettle", "door-lock", "gateway"];
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  const entries: ExampleEntry[] = [];
  for (const file of await jsonFiles(config.examplesDir)) {
    entries.push({ name: file.id, tara: parseTara(upgrade(JSON.parse(await readFile(file.path, "utf8")))) });
  }
  return entries.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
