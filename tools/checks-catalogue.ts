// Writes docs/reference/checks.md from the catalogue of checks in the rule engine, so that the documentation
// of what each status means cannot fall behind the code.
//
//   npm run docs:checks              writes the file
//   node tools/checks-catalogue.ts --check   fails if the file is out of date (run by `npm run check`)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CHECKS, type CheckDef, RULES_VERSION } from "@tara/core";

const OUTPUT = join(resolve(import.meta.dirname, ".."), "docs/reference/checks.md");

/** The first part of a code says what the check is about. */
const SUBJECTS: Record<string, [title: string, where: string]> = {
  scope: ["Scope fields", "Scope"],
  "scope-review": ["The scope review", "Scope"],
  item: ["Assessed items", "Assessed items"],
  element: ["Architecture elements", "Architecture"],
  asset: ["Assets", "Assets"],
  damage: ["Damage scenarios", "Damage scenarios"],
  threat: ["Threat scenarios", "Threat scenarios"],
  path: ["Attack paths", "Attack paths"],
  rating: ["Risks: does the value stand?", "Risks"],
  control: ["Controls", "Controls"],
  treatment: ["Risks: does the decision stand?", "Risk treatment"],
  goal: ["Goals and claims", "Goals and claims"],
  evidence: ["Control evidence", "Control evidence"],
  cra: ["CRA essential requirements", "CRA requirements"],
  handover: ["Evidence handed over at release", "Report and release"],
  release: ["The release review", "Report and release"],
};
const KIND_WORDS = { todo: "To do", waiting: "Waiting", done: "Done" } as const;

const sections = Object.entries(SUBJECTS).map(([subject, [title, where]]) => {
  const rows = (Object.entries(CHECKS) as [string, CheckDef][]).filter(([code]) => code.slice(0, code.indexOf(".")) === subject);
  return [
    `## ${title}`,
    "",
    `Shown on the step **${where}**. Listed in the order they are tested: the first that applies is the status.`,
    "",
    "| Code | Kind | What the tool says |",
    "|---|---|---|",
    ...rows.map(([code, def]) => `| \`${code}\` | ${KIND_WORDS[def.kind]} | ${def.message} |`),
    "",
  ].join("\n");
});

const known = Object.keys(SUBJECTS);
const orphans = Object.keys(CHECKS).filter((code) => !known.includes(code.slice(0, code.indexOf("."))));
if (orphans.length > 0) {
  console.error(
    `These checks belong to no section of the catalogue: ${orphans.join(", ")}. Add their subject to tools/checks-catalogue.ts.`,
  );
  process.exit(1);
}

const document = `# The checks

This page is written by \`npm run docs:checks\` from the rule engine (\`packages/core/src/rules/catalogue.ts\`), version ${RULES_VERSION}. Do not edit it by hand.

Every record of a TARA has exactly one status at any time. It comes from a ladder: an ordered list of conditions, read from the top, where the first that is true decides. So the status is always the next thing to do, and when nothing on the ladder applies the record is done. The ladders themselves are in \`packages/core/src/rules/checks.ts\`, and are short enough to read.

A status is one of three kinds:

| Kind | Meaning | Colour |
|---|---|---|
| To do | An entry of this record is missing or does not fit. | Red |
| Waiting | The record is complete and waits for something else, usually a review. Work can go on. | Amber |
| Done | Nothing to do. | Green |

The code of a status is its stable name. It never changes meaning, so it can be used in tests and by other programs. The words can be improved.

A TARA can be released when no status is "to do" or "waiting", it has at least one risk, the release review is recorded, and three people have signed.

${sections.join("\n")}`;

if (process.argv.includes("--check")) {
  if (!existsSync(OUTPUT) || readFileSync(OUTPUT, "utf8") !== document) {
    console.error("docs/reference/checks.md is out of date. Run `npm run docs:checks` and commit the result.");
    process.exit(1);
  }
  console.log(`The catalogue of checks is up to date (${Object.keys(CHECKS).length} statuses).`);
} else {
  writeFileSync(OUTPUT, document);
  console.log(`Wrote docs/reference/checks.md (${Object.keys(CHECKS).length} statuses).`);
}
