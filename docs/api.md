# The API

The screens do everything through this API, and so can another program. Everything is under `/api`, takes and gives JSON, and needs no key: the tool has no sign-in of its own ([Security](security.md)).

A request that changes something must send `Content-Type: application/json`. Give your name in the header `X-Tara-Author` (URL-encoded if it has other than plain characters); it is recorded with the change.

```sh
api=http://localhost:8787/api
```

## Refusals

A request the tool will not carry out is answered with a status and a sentence:

```json
{ "error": "There is no asset A09. Someone may have removed it." }
```

| Status   | Meaning                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400      | The request itself is wrong: an unknown field, a value of the wrong kind.                                                                                                                        |
| 404      | It names a TARA or a record that does not exist.                                                                                                                                                 |
| 409      | It does not fit the TARA as it is: someone else changed the same place (the answer then carries `tara`, the present state), something depends on what is to be removed, or the TARA is released. |
| 415      | A body was sent that is not JSON.                                                                                                                                                                |
| 422      | A document to import is not a valid TARA; `problems` lists what is wrong.                                                                                                                        |
| 403, 421 | The request came from another site, or named a host the tool is not set up to be reached by.                                                                                                     |

Nothing is ever half done: a refused request has changed nothing.

## The installation

| Route              | Gives                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`  | `{ status, version, rules, format, taras }`                                                                                                                         |
| `GET /api/config`  | The version of the tool, of its rules and of the document format it writes; the scoring methods and examples on offer; and the person's name if a proxy supplies it |
| `GET /api/methods` | The scoring methods, with their content                                                                                                                             |

## TARAs

| Route                          | Does                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/taras`               | Lists the TARAs, most recently changed first                                                                                                                                                                    |
| `POST /api/taras`              | Creates one. Body: `{ title, product?, documentNumber?, organisation?, methodId? }`. A product name that a TARA here has already, whatever its capitals, is taken as that product. Gives `{ tara }`             |
| `POST /api/taras/import/check` | Says what taking in a TARA document would do, and stores nothing. Body: `{ document }`. Gives the title and number it would get, what it holds, and `notes`: what is renamed and what does not come with a file |
| `POST /api/taras/import`       | Takes the document in, as a new draft ([The data](data-format.md#moving-a-tara)). Body: `{ document, fileName? }`. Gives `{ tara, notes }`                                                                      |
| `POST /api/examples/:name`     | Loads an example (`kettle`, `door-lock`, `gateway`) unless it is there. Gives `{ id }`                                                                                                                          |
| `GET /api/taras/:id`           | Gives `{ tara }`. With `?ifSeq=N`, answers 204 if the TARA is still at change N                                                                                                                                 |
| `DELETE /api/taras/:id`        | Moves the TARA to the trash. Body: `{ confirmTitle }`, the title typed again                                                                                                                                    |

```sh
curl -s -X POST $api/taras -H 'Content-Type: application/json' -H 'X-Tara-Author: Ada' \
  -d '{"title": "Smart thermostat T1", "product": "Thermostat"}'
```

## Changing a TARA

There is one route for every edit:

```
POST /api/taras/:id/changes
{ "baseSeq": 12, "changes": [ … ] }
```

`changes` is a list; they are made together or not at all. `baseSeq` is the `seq` of the TARA you were looking at. If someone has since changed the same place, the answer is 409 with the present state. Leave `baseSeq` out and the change is applied to whatever is there.

The answer is `{ tara, notes }`: the whole TARA after the change, and anything worth knowing that is not a refusal.

| Change                                                                                        | What it does                                                                                                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "op": "add", "kind": "assets", "values": { "name": "Schedule" } }`                         | Adds a record. The tool gives it its ID. For items and documents you may give your own: `"id": "DOC-7"`.                                    |
| `{ "op": "set", "kind": "assets", "id": "A01", "values": { "name": "Timetable" } }`           | Changes the named fields of a record.                                                                                                       |
| `{ "op": "remove", "kind": "assets", "id": "A01" }`                                           | Removes a record and takes it out of every link. Refused while another record depends on it.                                                |
| `{ "op": "setScope", "key": "intended_use", "values": { "decision": "…", "evidence": "…" } }` | Changes a scope field or a row of hand-over evidence.                                                                                       |
| `{ "op": "setMeta", "values": { "title": "…", "revision": "1.1" } }`                          | Changes the document's details.                                                                                                             |
| `{ "op": "setControlState", "id": "CTL-001", "state": "built" }`                              | Sets where a control stands, on every risk that uses it: `proposed`, `planned`, `built`, `implemented`, `verified`.                         |
| `{ "op": "review", "kind": "attack_path", "subjectId": "AP001", "reference": "REV-01" }`      | Records a review and confirms it if the record is ready. For `scope` and `release`, `subjectId` is `null` and `decision` gives the outcome. |
| `{ "op": "clearReview", "kind": "attack_path", "subjectId": "AP001" }`                        | Removes a review.                                                                                                                           |
| `{ "op": "setMethod", "method": { … } }`                                                      | Replaces the scoring method.                                                                                                                |
| `{ "op": "sign", "role": "author", "roleTitle": "Security engineer" }`                        | Signs as `author`, `reviewer` or `approver`, in the name given in `X-Tara-Author`.                                                          |
| `{ "op": "unsign", "role": "author" }`                                                        | Withdraws a signature.                                                                                                                      |
| `{ "op": "release" }`                                                                         | Releases the TARA. Refused, with what is missing, until it can be.                                                                          |

The kinds of record are `items`, `elements`, `assets`, `damages`, `threats`, `paths`, `risks`, `controls`, `evidence`, `goalClaims`, `craDecisions` and `references`. Their fields are those of the document ([The data](data-format.md)); a value inside a group is named with a dot, as in `"ratings.safety": 2` or `"factors.expertise": "expert"`.

A risk is made with its threat scenario and cannot be added or removed by itself. Its fields are set like any other record's.

```sh
curl -s -X POST $api/taras/smart-thermostat-t1/changes -H 'Content-Type: application/json' -H 'X-Tara-Author: Ada' -d '{
  "baseSeq": 0,
  "changes": [
    { "op": "add", "kind": "items", "values": { "name": "Thermostat" } },
    { "op": "add", "kind": "assets", "values": { "name": "Heating schedule", "itemId": "IT01" } },
    { "op": "add", "kind": "threats", "values": { "category": "tampering", "description": "Someone other than the owner changes the schedule" } }
  ]
}'
```

## History and undo

| Route                        | Does                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/taras/:id/history` | The changes, newest first, each with `seq`, `at`, `author`, `summary`, `delta`, the `records` it touched and whether it was `undone`. `?limit=N` |
| `POST /api/taras/:id/undo`   | Takes a change back, as a new change. Body: `{ seq }`, or nothing for the last change. Refused if the same place was changed again since.        |

## Revisions

| Route                           | Does                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /api/taras/:id/revisions` | Opens the next revision of a released TARA. Body: `{ revision, reason }`. Gives `{ id }` of the new draft. |

## What comes out

| Route                            | Gives                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/taras/:id/report`      | The report as one web page, with IDs that lead into the tool. `?file`: a page to keep, as a download, with links inside the document only. A released TARA gives the report as it was issued. |
| `GET /api/taras/:id/export`      | The TARA document, as a download                                                                                                                                                              |
| `GET /api/taras/:id/action-plan` | The work that follows from the assessment, as `{ actions }`. `?format=md`: as a Markdown document                                                                                             |

## Working out statuses yourself

The API sends the document, not the statuses: they follow from it. In TypeScript, the rule engine gives them:

```ts
import { assess, openFindings } from "@tara/core";

const { tara } = await (await fetch(`${api}/taras/example-kettle`)).json();
const assessment = assess(tara);
console.log(assessment.checks.scores.risks.get("TS003")?.value); // 5
console.log(openFindings(assessment.checks)); // what is still open
```

For another language, the report and the action plan carry the worked-out values.
