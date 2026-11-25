// What comes with the tool as data, read from the repository: the scoring methods a new TARA can start with,
// and the training examples. An installation adds methods of its own by putting them in <data>/methods/.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Method, parseTara, type Tara, upgrade, validateMethod } from "@tara/core";
import type { Config } from "./config.ts";

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

/** The scoring methods available here. A file that is not a valid method is left out, with a warning. */
export async function loadMethods(config: Config): Promise<MethodEntry[]> {
  const entries: MethodEntry[] = [];
  const folders: [string, MethodEntry["origin"]][] = [
    [config.methodsDir, "tool"],
    [join(config.dataDir, "methods"), "installation"],
  ];
  for (const [folder, origin] of folders) {
    for (const file of await jsonFiles(folder)) {
      try {
        const method = JSON.parse(await readFile(file.path, "utf8")) as Method;
        const problems = validateMethod(method);
        if (problems.length > 0) throw new Error(problems[0]);
        entries.push({ id: file.id, name: method.source ?? file.id, origin, method });
      } catch (error) {
        console.warn(`The scoring method ${file.path} cannot be used: ${(error as Error).message}`);
      }
    }
  }
  return entries;
}

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
