# Dependencies

Every dependency is someone else's code that runs with your assessments, has to be kept up to date, and has a licence that binds whoever distributes the tool. So there are few, each has a reason, and adding one is a decision.

## What ships with the tool

Two things run on the server and three in the browser. Everything else in the "shipped" list of [THIRD_PARTY_LICENSES.md](https://github.com/ganindu7/cratool-tara-oss/blob/main/THIRD_PARTY_LICENSES.md) is one of their own dependencies.

| Package              | Licence | Where   | Why it is here                                                                                                                                                                                                                                  | What it would take to do without                                                                      |
| -------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `hono`               | MIT     | Server  | Routing and request handling for the API. Small, without dependencies of its own, and runs on Node.js, Bun, Deno and the common cloud platforms, which keeps a later move open.                                                                 | About 200 lines on Node's own `http` module.                                                          |
| `@hono/node-server`  | MIT     | Server  | Connects Hono to Node.js and serves the built screens.                                                                                                                                                                                          | Part of the same 200 lines.                                                                           |
| `react`, `react-dom` | MIT     | Browser | The screens.                                                                                                                                                                                                                                    | A rewrite of `apps/web`.                                                                              |
| `@xyflow/react`      | MIT     | Browser | The canvas of the architecture diagram and of the graph: moving and zooming, dragging, resizing, joining elements. It brings `@xyflow/system`, `zustand`, `classcat`, `react-compiler-runtime` and nine small `d3` modules (ISC, BSD-3-Clause). | Writing a diagram editor. The views of one record and the figures of the report are drawn without it. |

`packages/core`, `packages/store` and `packages/report` have no dependencies at all. The rule engine, the validation, the storage and the report are this project's own code, including the SHA-256 that fingerprints reviewed content (so that the browser and the server agree without a library).

## What builds and tests it

None of this is part of the running tool.

| Package                        | Licence           | Why                                                                    |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------- |
| `typescript`                   | Apache-2.0        | Type checking. Nothing is compiled: Node.js runs the sources directly. |
| `vite`, `@vitejs/plugin-react` | MIT               | Building the screens and serving them while developing.                |
| `@biomejs/biome`               | MIT or Apache-2.0 | Formatting and linting, as one tool.                                   |
| `marked`                       | MIT               | Turning the Markdown documentation into the website's pages.           |
| `@types/*`                     | MIT               | Type declarations.                                                     |

Tests use Node's own test runner. There is no test framework, no bundler configuration to speak of, and no CSS framework.

Some build tools bring platform-specific parts under the MPL-2.0. That licence concerns whoever distributes those files; they are not distributed with the tool.

## The rules

1. **Accepted licences** for what ships: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0. Build tools may also be under MPL-2.0, CC-BY-4.0 or Python-2.0. Anything else needs a decision by a maintainer, recorded in `tools/licenses.ts` with the reason. Copyleft licences that would bind the tool's own code (GPL, AGPL) are not accepted for what ships.
2. **The inventory is generated.** `npm run licenses` writes `THIRD_PARTY_LICENSES.md` from `package-lock.json`, with the licence text of everything that ships. `npm run check` fails when the file is out of date or a licence is not on the list, so a new dependency cannot arrive unnoticed.
3. **Versions are exact.** `package-lock.json` is committed. CI, the image and a server install with `npm ci`, which takes exactly what it names; `npm install`, as the pages for working on the tool say, takes the same versions as long as the file is not changed.
4. **Nothing is loaded at run time.** No content delivery network, no web fonts, no analytics. What is in the repository and the lockfile is everything.

## Adding a dependency

Before proposing one, answer these in the pull request:

- What does it do that fifty lines of our own would not?
- What does it bring with it? (`npm ls <name>`)
- What is its licence, and those of what it brings?
- Who maintains it, and when was it last released?
- Does it run code at install time, or reach the network?
- Does it go into what ships, or only into the build?

Then add it, run `npm run licenses`, and commit the changed inventory with it. A reviewer reads the inventory's diff.

`packages/core` takes no dependency, ever. That is what makes it certain that the rules behave the same everywhere, and that the data format outlives any library.

## Keeping up

Dependabot proposes updates weekly (`.github/dependabot.yml`), grouped so that a week's npm updates are two pull requests, one for what ships and one for the tools; an update of a GitHub Action or of the image's base comes by itself. CI runs `npm audit` against the lockfile. A security fix in something that ships is applied without waiting for the week.

## Other material in the repository

| Material                                                                         | Where it comes from                                                                                                                                                                                              | Terms                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| The Open TARA method 1.0 (`methods/`)                                            | Built for this project from the Common Criteria's CEM:2022 (attack potential), the HEAVENS 2.0 paper (risk matrix values), and the structure of ISO/SAE 21434 clause 15. The file names the source of each part. | Apache-2.0, with the attributions in `NOTICE`. |
| Summaries of the CRA's essential requirements (`packages/core/src/model/cra.ts`) | Written for this project from Regulation (EU) 2024/2847.                                                                                                                                                         | Apache-2.0. The regulation is authoritative.   |
| The example TARAs (`examples/`)                                                  | Written for this project. The products and their documents are invented.                                                                                                                                         | Apache-2.0.                                    |
| The Apache License text (`LICENSE`)                                              | apache.org, unchanged.                                                                                                                                                                                           |                                                |

**No text of ISO/SAE 21434 or of any other licensed standard is in this repository, and none may be added**: not in code, not in the method, not in examples or documentation. Refer to a clause by its number; do not quote it. The `.gitignore` keeps a `references/` folder out, for people who hold a copy of a standard and want it near the code.
