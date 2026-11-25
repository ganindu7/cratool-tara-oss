// The inventory of everything this project depends on, with its licence: THIRD_PARTY_LICENSES.md.
//
//   npm run licenses           writes the file
//   npm run licenses:check     fails if the file is out of date, or if a dependency has a licence that is not
//                              on the list below (run by `npm run check` and in CI)
//
// The inventory is read from package-lock.json, so it names exactly the versions that are installed. For
// what ships with the tool, the licence texts themselves are included, because those licences ask that
// their notice travels with every copy.
//
// Adding a dependency is a decision, not a side effect: docs/dependencies.md says what to weigh.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const OUTPUT = join(root, "THIRD_PARTY_LICENSES.md");

/** Licences a dependency may have. Anything else needs a decision by a person, recorded here with the reason. */
const ALLOWED_SHIPPED = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
];
/** Tools that build and test the project but are not part of what is distributed may also be under these. */
const ALLOWED_TOOLING = [...ALLOWED_SHIPPED, "MPL-2.0", "CC-BY-4.0", "Python-2.0"];

interface Package {
  name: string;
  version: string;
  license: string;
  shipped: boolean;
  folder: string;
}

/** True when a licence expression is acceptable: every part joined by AND, at least one joined by OR. */
function allowed(expression: string, list: string[]): boolean {
  const clean = expression.replace(/[()]/g, " ").trim();
  if (/\sAND\s/.test(clean)) return clean.split(/\sAND\s/).every((part) => allowed(part, list));
  if (/\sOR\s/.test(clean)) return clean.split(/\sOR\s/).some((part) => allowed(part, list));
  return list.includes(clean);
}

/**
 * Type declarations come along as dependencies of the libraries they describe. They are read by the type
 * checker and never reach the running tool, so they count as tooling.
 */
const isTypesOnly = (name: string) => name.startsWith("@types/") || name === "csstype";

function readPackages(): Package[] {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
    packages: Record<string, { version?: string; license?: string; dev?: boolean; link?: boolean }>;
  };
  const packages: Package[] = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    // The project's own packages are links; what is installed lives under node_modules.
    if (!path.includes("node_modules/") || entry.link) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    packages.push({
      name,
      version: entry.version ?? "?",
      license: entry.license ?? "UNKNOWN",
      shipped: !entry.dev && !isTypesOnly(name),
      folder: join(root, path),
    });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** The licence text a package carries, if it carries one. */
function licenceText(folder: string): string | null {
  if (!existsSync(folder)) return null;
  const file = readdirSync(folder).find((name) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name));
  return file ? readFileSync(join(folder, file), "utf8").trim() : null;
}

function render(packages: Package[]): string {
  const shipped = packages.filter((p) => p.shipped);
  const tooling = packages.filter((p) => !p.shipped);
  const table = (rows: Package[]) =>
    [
      "| Package | Version | Licence |",
      "|---|---|---|",
      ...rows.map((p) => `| \`${p.name}\` | ${p.version} | ${p.license} |`),
    ].join("\n");
  const count = (rows: Package[]) => {
    const totals = new Map<string, number>();
    for (const p of rows) totals.set(p.license, (totals.get(p.license) ?? 0) + 1);
    return [...totals]
      .sort((a, b) => b[1] - a[1])
      .map(([licence, n]) => `${licence} (${n})`)
      .join(", ");
  };
  const texts = shipped.map((p) => {
    const text = licenceText(p.folder);
    return `### ${p.name} ${p.version}\n\n${text ? `\`\`\`\n${text}\n\`\`\`` : `Licence: ${p.license}. The package carries no licence file; see its repository.`}`;
  });
  return `# Third-party software

This file is written by \`npm run licenses\` from \`package-lock.json\`. Do not edit it by hand.

TARA workbench itself is under the Apache License 2.0 (see \`LICENSE\` and \`NOTICE\`). It builds on the open-source
software listed here. Thank you to the people who wrote it.

## Shipped with the tool

These ${shipped.length} packages are part of what runs: the server loads them, or they are built into the screens.
Licences: ${count(shipped)}.

${table(shipped)}

## Used to build and test

These ${tooling.length} packages build, check and test the project. Nothing of them is part of the running tool.
Licences: ${count(tooling)}.

${table(tooling)}

## Licence texts of what is shipped

${texts.join("\n\n")}
`;
}

const packages = readPackages();
const problems = packages
  .filter((p) => !allowed(p.license, p.shipped ? ALLOWED_SHIPPED : ALLOWED_TOOLING))
  .map(
    (p) =>
      `${p.name}@${p.version}: "${p.license}" is not an accepted licence for ${p.shipped ? "a shipped dependency" : "a build tool"}.`,
  );
const document = render(packages);

if (process.argv.includes("--check")) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
  if (current !== document)
    problems.push("THIRD_PARTY_LICENSES.md is out of date. Run `npm run licenses` and commit the result.");
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(
    `Licences: ${packages.filter((p) => p.shipped).length} shipped and ${packages.filter((p) => !p.shipped).length} build-time packages, all accepted.`,
  );
} else {
  writeFileSync(OUTPUT, document);
  console.log(`Wrote THIRD_PARTY_LICENSES.md (${packages.length} packages).`);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
}
