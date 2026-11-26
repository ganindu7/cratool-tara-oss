# Instructions for coding agents

You are working in the repository of Open TARA workbench, an open-source tool for threat analysis and risk assessment. This file tells you what the project is, the rules that must hold, and how to check your work. Read it before changing anything. People are welcome to read it too.

## What this is

A TypeScript monorepo with no build step for the server side: Node.js (22.18 or later) runs the `.ts` sources directly.

| Path                    | Holds                                                                                                | Depends on                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| `packages/core`         | The TARA document (`model/`), the only way to change it (`changes/`), and the rule engine (`rules/`) | nothing                       |
| `packages/store`        | Storage: the data folder, the history, conflicts                                                     | `core`                        |
| `packages/report`       | The report as content and as one HTML page                                                           | `core`                        |
| `apps/server`           | The HTTP API (Hono)                                                                                  | `core`, `store`, `report`     |
| `apps/web`              | The screens (React, Vite)                                                                            | `core`, and the API over HTTP |
| `methods/`, `examples/` | Data shipped with the tool                                                                           |                               |
| `docs/`, `site/`        | Documentation, and the script that publishes it as the website                                       |                               |
| `tools/`                | Scripts: dev, examples, licence inventory, generated docs, screenshots, the check in a real browser  |                               |

Start with `docs/architecture.md`. It explains the design in a few pages and walks through the common changes (adding a field, a check, a store).

## Commands

```sh
npm install
npm run dev               # server and screens, reloading; http://localhost:5173
npm test                  # all tests (Node's own test runner)
npm run typecheck
npm run lint              # Biome; `npm run format` applies its fixes
npm run check             # types, lint, tests, licences, generated docs. Your work is not done until this passes.
npm run check:browser     # uses the screens in a real browser (needs `npm run build` and Chrome). Run it after changing a screen.
npm run docs:checks       # rewrites docs/reference/checks.md after a change to the checks
npm run licenses          # rewrites THIRD_PARTY_LICENSES.md after a change to dependencies
npm run site              # builds the website into site/dist
npm run site:screenshots  # retakes docs/images/*.png from the running tool
```

Run a single test file with `node --test packages/core/test/changes.test.ts`.

## Rules that must hold

These are the project's invariants. A change that breaks one is wrong even if every test passes.

1. **`packages/core` stays pure.** No file access, no network, no clock, no randomness, no global state, and no dependency. Every function takes values and returns values. The time and the author are passed in.
2. **A TARA changes only through `applyChanges`** (`packages/core/src/changes/apply.ts`). Never mutate a `Tara` you were given: copy, change the copy, return it. Never write to a TARA from the server, the store, the screens or a script by any other path. Three things are not edits and have a function of their own, also in `packages/core`: an undo applies a stored delta backwards (`undoDelta`, `applyDelta`), and an import and a next revision make a new document (`asImported`, `nextRevision`). Their results are validated as a whole before they are stored, like any other.
3. **Only the store touches the data folder.** The server reads and writes nothing there itself: it asks the store, also for the scoring methods an installation keeps in it. What the server opens, when it starts, is what comes with the tool: the methods, the examples, the built screens. The screens never call anything but `/api`. Nothing but `packages/store` imports `node:fs` to read or write a stored TARA.
4. **Nothing that follows from the document is stored.** Scores, statuses, the report and the action plan are worked out each time. Do not add a field that caches a computed value.
5. **Every stored document is valid.** `validateTara` runs on every read and before every write. If you add a field, add it to the type, the schema table and `upgrade` (for existing files), and to the three examples.
6. **An ID is given once.** Never renumber, never reuse, never let a change alter the ID of an existing record.
7. **A released TARA is frozen.** No route and no change may alter one.
8. **Text a person typed is never trusted.** The report escapes it; links are made only for `http` and `https`; an ID that becomes part of a path is checked against its pattern first.
9. **No text of a licensed standard, anywhere.** Not ISO/SAE 21434, not any other: not in code, comments, the method, examples or docs. Cite clause numbers; never quote.
10. **No new dependency without a written reason.** See `docs/dependencies.md`. `packages/core`, `packages/store` and `packages/report` take none. If you add one elsewhere, run `npm run licenses` and include the changed inventory.
11. **No outgoing connections.** The tool sends nothing anywhere. No telemetry, no fonts or scripts from a network, no update check.
12. **No text is hidden silently.** Never cut a text with `slice` or with a CSS ellipsis. Use `cutText` from `packages/core`: it cuts after a whole word and marks the cut, and whatever shows the cut text also shows the ID of its record, which leads to the text in full. A title is shown whole, on as many lines as it needs.
13. **A file says what it is; the tool knows what it reads.** A document names its format and the program that wrote it, and never what it is compatible with. A change to the document format comes with its step in `upgrade` and, if it adds something an earlier version can do without, a higher number after the point of `FORMAT` (`docs/data-format.md`). The tool's version is read from the root `package.json` and from nowhere else.
14. **The examples stay complete.** Every example must validate and come out with no open check (`packages/core/test/rules.test.ts`). Their risk values are documented in `docs/examples.md`; a change that alters them is a change to the method and needs saying so.

## How to make a change

- **Behaviour and its documentation change together**, in the same commit. The website is built from `docs/`, so a stale page is a wrong page in public.
- **Find the layer first.** A rule about what an assessment needs belongs in `core/rules`. A rule about what a document may hold belongs in `core/model`. How it is stored: `store`. How it is shown: `web`. If a change seems to need the same logic in two layers, it belongs in `core`.
- **In the screens, what is shown and how it looks are kept apart.** What a step lists and asks for is data in `apps/web/src/steps.tsx`. Which records a drawing holds, where they stand and which lines join them is worked out by pure functions in `apps/web/src/views` and `apps/web/src/diagram`, with tests in `apps/web/test`. The components in `pages` and `ui` draw what they are given, and the look is in `styles`, where a colour or a size that recurs is named once.
- **A colour is named, never written where it is used.** `apps/web/src/styles/tokens.css` names every colour, corner, shadow and face, and says what each colour means: blue is what can be acted on, green is settled, yellow waits, red is to complete, plum is the route of an attack. Build with the roles (`accent`, `done`, `amber`, `todo`, `risk-1` to `risk-5`). The website loads the same file. The report repeats its colours in `packages/report/src/html.ts` and `svg.ts`: change them together.
- **Add the test with the change.** The rule engine is tested against the examples; the store against its contract; the API as the screens use it.
- **After changing a check**: update `catalogue.ts`, the ladder in `checks.ts`, a test, then `npm run docs:checks`, and raise `RULES_VERSION` if a result changes.
- **After changing a screen**: `npm run build && npm run site:screenshots`, look at the pictures, and commit them if they changed.
- **Use only erasable TypeScript syntax**: no `enum`, no `namespace`, no constructor parameter properties. Imports name the file with its `.ts` extension.

## Style

- A comment at the top of every file says what the file is for. A doc comment on every export says what it does, and why where that is not obvious. Comments say why, not what.
- Plain British English, short sentences, the tool's own terms: a TARA, a record, a step, a check, a change. No jargon where a plain word exists.
- Messages shown to people say what happened and what to do next. They do not apologise and are never vague. A refusal names the record and the reason.
- Names are whole words. Functions are short. If a function needs a comment in its middle to be followed, it wants splitting.
- Run `npm run format` rather than formatting by hand.

## What to leave alone

- `data/` is a person's own assessments. Never read from it for tests, never write to it, never commit it. Tests use a temporary folder or `MemoryStore`.
- `LICENSE` is the Apache License text, unchanged.
- `THIRD_PARTY_LICENSES.md` and `docs/reference/checks.md` are generated. Change their source and run the script.
- `methods/open-tara-1.0.json` is a published method. A change to its points, bands or matrix changes every assessment made with it: make a new version of the file instead.

## If you are helping someone with their assessment

When the task is the content of a TARA rather than the code of the tool:

- A TARA is `data/taras/<id>/tara.json`, in the format described in `docs/data-format.md`. Read it freely.
- Make changes through the API (`docs/api.md`), not by editing the file: a change through the API is validated, lands in the history under a name, and can be undone. Give your own name in `X-Tara-Author`, for example `Coding agent, for Ada`, so that the history says who did what.
- The action plan (`GET /api/taras/<id>/action-plan?format=md`) lists the work that follows from the assessment for the product's code.
- Never record a review, sign, or release on a person's behalf. Those are a person's statements about work they did. Draft the content; leave the confirming to them.
- Ratings are judgements. Propose them with your reasoning in the rationale field, and say plainly that they are proposals.
