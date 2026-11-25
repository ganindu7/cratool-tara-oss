// The version of the tool: one number, kept in package.json at the root of the repository and nowhere else.
// It is shown on every screen, named in every document the tool stores and in every report it makes, so that
// a file says which version wrote it.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RULES_VERSION, type Writer } from "@tara/core";

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../package.json"), "utf8")) as { version?: string };

export const TOOL_NAME = "TARA workbench";
export const TOOL_VERSION: string = manifest.version ?? "0.0.0";

/** The tool as the writer of a document: what `writtenBy` holds in every TARA it stores. */
export const WRITER: Writer = { tool: TOOL_NAME, version: TOOL_VERSION, rules: RULES_VERSION };
