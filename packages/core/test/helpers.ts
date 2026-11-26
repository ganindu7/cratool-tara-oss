// Shared by the tests of this package: the example TARAs, an empty TARA, and a short way to apply changes.
import { readFileSync } from "node:fs";
import { applyChanges, type Change, type ChangeContext, createTara, type Method, parseTara, type Tara } from "../src/index.ts";

const fromRoot = (path: string) => new URL(`../../../${path}`, import.meta.url);

/** The scoring method shipped with the tool. */
export const defaultMethod = (): Method => JSON.parse(readFileSync(fromRoot("methods/open-tara-1.0.json"), "utf8"));

export const EXAMPLES = ["kettle", "door-lock", "gateway"] as const;

/** One of the training examples, as stored in examples/. */
export const example = (name: (typeof EXAMPLES)[number]): Tara =>
  parseTara(JSON.parse(readFileSync(fromRoot(`examples/${name}.json`), "utf8")));

export const context: ChangeContext = { author: "Ada Example", now: "2026-11-25T10:00:00.000Z" };

/** A new, empty TARA. */
export const emptyTara = (): Tara => createTara({ id: "test", title: "Test product", method: defaultMethod(), now: context.now });

/** Applies changes as Ada and gives back the changed TARA. */
export const change = (tara: Tara, ...changes: Change[]): Tara => applyChanges(tara, changes, context).tara;

/** The last record of a list: the one a preceding "add" made. */
export const last = <T>(list: T[]): T => list[list.length - 1] as T;
