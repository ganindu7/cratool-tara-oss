# Architecture

This page is for people who want to read the code or build on it. It says how the tool is laid out, how a change travels through it, and how to make the changes people most often want.

## Three ideas

**The data is one document.** A TARA is one JSON value of a documented shape ([The data](data-format.md)). It is what is stored, what is sent, what the rules read and what is exported. There is no second representation to keep in step.

**There is one way to change it.** Every edit, from the screens, the API or a test, is a small value called a change, applied by one function, `applyChanges`. That function works on a copy, validates the result as a whole, and either returns a valid TARA or refuses with a reason. Three things are not edits and have a function of their own, in the same package: an undo applies a stored delta backwards, and an import and a next revision make a new document. Each result is validated as a whole before it is stored. Nothing outside `packages/core` writes to a TARA.

**Everything else is worked out.** Impact, feasibility, risk values, statuses, the report and the action plan are pure functions of the document. They are never stored, so they can never be out of date.

## The parts

```
                    ┌──────────────────────────────────────────────┐
  browser           │  apps/web        the screens (React)         │
                    │  shows the TARA, works out its statuses,     │
                    │  sends changes                               │
                    └───────────────────────┬──────────────────────┘
                                            │  HTTP, JSON: /api
                    ┌───────────────────────▼──────────────────────┐
  server            │  apps/server     the API (Hono)              │
                    │  who is asking; refusals into HTTP           │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
          ┌─────────────────▼───────────┐   ┌──────────────▼──────────────┐
          │  packages/store             │   │  packages/report            │
          │  reads, writes, history     │   │  the report as content,     │
          │  the only code that touches │   │  and as one web page        │
          │  the data folder            │   │                             │
          └─────────────────┬───────────┘   └──────────────┬──────────────┘
                            │                              │
                    ┌───────▼──────────────────────────────▼───────┐
                    │  packages/core                               │
                    │  model/    what a TARA is, and validation    │
                    │  changes/  how a TARA changes                │
                    │  rules/    what follows from a TARA          │
                    │  pure functions; no files, no network,       │
                    │  no dependencies                             │
                    └──────────────────────────────────────────────┘
```

Dependencies point downwards only. `core` knows nothing of the others. The screens import `core` too: they run the same rule engine as the server, so a status appears as you type and is the same status the report will show.

| Package           | Its one job                                                  | It must never                                                                                       |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `packages/core`   | Say what a TARA is, how it changes, and what follows from it | Read a file, call the network, keep state, or depend on a library                                   |
| `packages/store`  | Keep TARAs and their history                                 | Decide anything about the content of a TARA                                                         |
| `packages/report` | Turn a TARA into a report                                    | Compute a value the rule engine does not give it                                                    |
| `apps/server`     | Turn requests into calls and refusals into answers           | Read or write the data folder, or change a TARA itself                                              |
| `apps/web`        | Show and edit                                                | Call anything but the API, or keep anything but the person's name and how they prefer to see things |

There is no build step for the server or the packages. Node.js runs the TypeScript sources directly, which is why the code uses only syntax that can be erased: no enums, no namespaces, no constructor parameter properties. The screens are built with Vite.

## The screens

`apps/web/src` is laid out by what a file is for.

| Path        | Holds                                                                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `steps.tsx` | The steps of the method as data: which records a step lists, the columns of its list, the fields of its form. One screen shows them all.                                                                                                                    |
| `pages/`    | The screens: the start page, the frame of a TARA, a step that lists records, the scope, the report, the graph, the view of one record, the diagram, and the three smaller steps in one file.                                                                |
| `ui/`       | What every screen is made of: fields, the marks of a status, the review box, the signs that lead to a drawing, the ratings as they are drawn.                                                                                                               |
| `views/`    | Where the records of a drawing stand and which lines join them, for the graph and the views of one record. No screen code: it is tested like the rule engine.                                                                                               |
| `diagram/`  | The architecture diagram: what it holds and where, worked out without screen code, and beside that the components that draw it. Where its elements stand when nobody placed them, and the shape of a line, come from core, so that screen and report agree. |
| `styles/`   | The look, in parts. Every colour, corner, shadow and face is named once, in `styles/tokens.css`, which also says what each colour means.                                                                                                                    |

The website loads the same `styles/tokens.css` (the build copies it beside `site/src/site.css`), so the screens and the site cannot drift apart. The report is one self-contained page from a package that depends on nothing, so it repeats the colours it uses: `packages/report/src/html.ts` and `svg.ts`. A colour that changes in `tokens.css` changes there too.

What the screens and the report must agree on is worked out once, in core: the shape of a line on the diagram, where a text is cut, and which words of a text are the IDs of records and so become links (`model/mentions.ts`).

Two rules keep this tidy. What a drawing shows is worked out by a pure function and drawn by a component, never both in one place: `views/ego.ts` says what stands around a record and where, `pages/RecordView.tsx` draws it. And a step is data: to add a column or a field, change its entry in `steps.tsx`, not a screen.

Everything a person can look at has an address. `#/tara/<id>/<step>/<record>` is one record of one step; what follows a `?` says how it is shown: `?show=links` with its links beside the list, `?show=diagram` as a drawing (`?over=` names what is laid over it), `?show=release` for sign-off and release on the Report step, `?panel=` for the history or what is left. On the Graph step, `?view=asset:A01` is the view of one record and `?focus=R003` the graph of one record's chain.

## How a change travels

Say you change the expertise of attack path AP002.

1. The field on screen reports the new value. The page sends `POST /api/taras/example-kettle/changes` with `{ "baseSeq": 4, "changes": [{ "op": "set", "kind": "paths", "id": "AP002", "values": { "factors.expertise": "proficient" } }] }`. `baseSeq` is the number of the last change the page has seen.
2. The server works out who is asking and calls `store.update` with a function that applies the changes. It reads and writes nothing in the data folder itself: what it opens, when it starts, is what comes with the tool (the scoring methods, the examples, the built screens).
3. The store queues the update behind any other for the same TARA, reads the document, and calls that function.
4. `applyChanges` (`packages/core/src/changes/apply.ts`) copies the TARA, looks the field up in the schema, checks the value against it, writes it into the copy, validates the whole copy, and returns it with a one-line summary.
5. The store compares the old and the new document. The difference is the **delta**: `paths/AP002/factors.expertise`, before `expert`, after `proficient`. If someone else changed that same place after change 4, the update is refused as a conflict.
6. The store writes the delta to the history, then replaces the document in one step.
7. The server answers with the whole TARA. The page shows it and works out every status again. The path now has 22 points, risk R002 has the value 4, and the reviews that covered the old value say so.

The same seven steps serve every edit, including moving a box on the diagram and signing the assessment.

## The schema

`packages/core/src/model/schema.ts` describes every kind of record in one table: its fields, what each may hold, and how its IDs are formed.

```ts
threats: {
  noun: "threat scenario",
  id: { prefix: "TS", digits: 3 },
  fields: {
    category: { type: "method", list: "threat_categories" },
    description: text,
    damageIds: refs("damages"),
  },
},
```

Validation, the change operations and the removal rules all read this table. A field is described once, so it cannot be validated one way and changed another. The table also says what happens when a record is removed: an ordinary link (`refs`, `ref`) is simply taken away with its target, while a record that cannot exist without another (a field marked `owned`) blocks the removal until it is removed first.

## Common changes

### Adding a field

Say an asset should record its owner.

1. In `packages/core/src/model/tara.ts`, add `owner: string | null;` to `Asset`, with a comment that says what it is.
2. In `schema.ts`, add `owner: text,` to the fields of `assets`.
3. In `apps/web/src/steps.tsx`, add the field to the form of the assets step: `{ name: "owner", label: "Owner", widget: "text" }`.
4. If the report should show it, add it to the assets table in `packages/report/src/sections/`.
5. Existing documents do not have the field. Give `upgrade` in `validate.ts` a step that adds `owner: null` to every asset, and add `owner` to the three example files.

The rest follows: the field is validated, can be set through the API, shows in the history, and can be undone.

If the field should matter to a review, add it to that review's content in `rules/reviews.ts`, and raise `RULES_VERSION`.

### Adding a check

1. Add the status to the catalogue, `packages/core/src/rules/catalogue.ts`: `"asset.owner": todo("Name the asset's owner"),`.
2. Add a rung to the ladder of that kind of record in `rules/checks.ts`, at the place where it belongs in the order: `[isBlank(asset.owner), "asset.owner"],`.
3. Add a test in `packages/core/test/`. The examples must still come out with no check open, so they need the new field filled in.
4. Run `npm run docs:checks` to rewrite the catalogue page, and raise `RULES_VERSION`.

### Changing the scoring method

That is data, not code: see [The method](method.md). The rule engine reads the bands, the points and the matrix from the TARA's own method.

### Keeping the data somewhere else

`packages/store/src/store.ts` defines `Store`: ten methods. `FileStore` implements them on a folder and `MemoryStore` in memory; the second is under a hundred lines and is the shortest complete example. A store on PostgreSQL or an object store is a third implementation.

What every store must do is in `packages/store/test/store.test.ts`, which runs the same tests against each store. Add yours to the list at its top. The logic that is the same for all stores (working out the delta, detecting a conflict, making the history entry) is in `commit.ts`, so a new store only has to read and write.

Then construct it in `apps/server/src/main.ts` in place of `FileStore`.

### Adding sign-in

The tool has none on purpose ([Security](security.md)). The place for it is in front of the tool: a reverse proxy that signs people in and passes their name in a header, which the tool reads when `TARA_USER_HEADER` is set. If you need permissions inside the tool, the one place every request passes is `authorOf` and the guards at the top of `apps/server/src/app.ts`.

### Adding an export

The report shows the pattern: a pure function from a `Tara` (and its `assess` result) to a text, in its own package or file, called from one route in `apps/server/src/app.ts`. The action plan (`rules/actions.ts`) is the smallest example.

## Tests

```sh
npm test         # all of them
npm run check    # types, lint, tests, licences, and that generated documents are up to date
npm run check:browser   # the screens, in a real browser; needs `npm run build` and Chrome
```

| Where                    | What is tested                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/test`     | The model, every change operation and its refusals, deltas and undo, and the rule engine against the three examples, whose values are documented        |
| `packages/store/test`    | The contract of a store, for each store; for the file store also a crash between two writes, a file edited by hand, and updates sent at the same moment |
| `packages/report/test`   | That the report builds for every example, escapes what a person typed, and loads nothing from elsewhere                                                 |
| `apps/server/test`       | The API as the screens use it, including conflicts, release, and requests from another site                                                             |
| `apps/web/test`          | Where the records of a drawing stand: the graph, the views of one record and the diagram, on the three examples and on small TARAs made for the purpose |
| `tools/browser-check.ts` | The screens, used in a real browser: typing, choosing, undoing, the graph and the views of a record, dragging on the diagram (`npm run check:browser`)  |

The tests use Node's own test runner; there is no test framework to learn.

## Conventions

- A comment at the top of every file says what the file is for. A comment on every export says what it does and, where it is not obvious, why.
- Comments say why, not what. They are part of the documentation and are written with the same care.
- Messages to people say what happened and what to do, in the tool's own words. They never apologise and are never vague.
- No text is hidden silently. Where there is not room for all of a text, it is cut with `cutText`: after a whole word, with a mark, and beside the ID of its record, which leads to the text in full. This holds for the screens and for the figures of the report. A list that stops for room says how many it leaves out.
- The version of the tool is read from `package.json` at the root and from nowhere else. The version of the document format and of the rules are in `packages/core`.
- No dependency is added without a reason that is written down ([Dependencies](dependencies.md)).
