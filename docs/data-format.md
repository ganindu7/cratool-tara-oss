# The data

Everything you enter is kept in one folder, the data folder, as plain files. The tool's code holds no data, and your data depends on no particular version of the code. This page describes the files, so that you can back them up, move them, read them without the tool, and write them with another program.

## The data folder

By default it is `data`, next to the code. `TARA_DATA_DIR` puts it elsewhere.

```
data/
  taras/
    smart-thermostat-t1/        one folder per TARA, named by its ID
      tara.json                 the assessment: one JSON document
      history.jsonl             every change ever stored, one per line, oldest first
      files/
        releases/1-0/report.html    the report as it was issued, once released
  methods/                      scoring methods of your own, offered for new TARAs (optional)
  trash/
    smart-thermostat-t1-20261125181622/   a TARA that was removed, with its history
```

- **To back up**, copy the folder. **To restore or move**, copy it back. There is nothing else.
- **To put a TARA under version control**, commit its `tara.json`. It is written with stable formatting, so a change to one field is a change to one line.
- **Nothing is deleted.** Removing a TARA moves its folder to `trash/`. Empty the trash yourself when you are sure.

## The TARA document

`tara.json` is the whole assessment as one value. What is on disk, what the API sends, what the rule engine reads and what an export contains are all this one shape. It is defined in `packages/core/src/model/tara.ts`, which is short and commented, and is the authority; this page explains it.

```json
{
  "format": "open-tara/1.0",
  "writtenBy": { "tool": "TARA workbench", "version": "0.1.0", "rules": "1.0.0" },
  "id": "example-kettle",
  "seq": 0,
  "meta": { "title": "…", "revision": "1.0", "status": "draft", "…": "…" },
  "method": { "…": "this TARA's own copy of the scoring method" },
  "scope": { "configuration_id": { "decision": "CFG-KETTLE-K2-EU", "evidence": "KT-DOC-01 section 1" }, "…": {} },
  "items": [],
  "elements": [],
  "assets": [],
  "damages": [],
  "threats": [],
  "paths": [],
  "risks": [],
  "controls": [],
  "evidence": [],
  "goalClaims": [],
  "craDecisions": [],
  "references": [],
  "reviews": [],
  "reviewCount": 0,
  "signoffs": [],
  "changeLog": [],
  "counters": { "A": 4, "TS": 5 }
}
```

Three rules keep it simple.

**One ID per record.** The ID you see on screen, `TS003`, is the ID the links use. A threat that leads to a damage scenario says so in plain sight:

```json
{
  "id": "TS003",
  "category": "information_disclosure",
  "description": "The Wi-Fi password is read out of a kettle that was thrown away, returned or sold on.",
  "damageIds": ["DS-0003"]
}
```

An ID is given once and never changes. The number of a removed record is not given again (`counters` remembers the highest number given for each prefix), so a report, a review or a ticket written last year still points at the right record.

| Record                                          | ID                                    | Record           | ID                                           |
| ----------------------------------------------- | ------------------------------------- | ---------------- | -------------------------------------------- |
| Item                                            | `IT01`, or your own                   | Risk             | `R003`: follows its threat `TS003`           |
| Component, outside party, store, flow, boundary | `C01`, `EX01`, `ST01`, `DF01`, `TB01` | Control          | `CTL-001`                                    |
| Asset                                           | `A01`                                 | Control evidence | `EV-001`                                     |
| Damage scenario                                 | `DS-0001`                             | Goal, claim      | `CG01`, `CC01`                               |
| Threat scenario                                 | `TS001`                               | CRA decision     | `CRA-a` to `CRA-m`, `CRA-II-1` to `CRA-II-8` |
| Attack path                                     | `AP001`                               | Document         | `REF-01`, or your own                        |

**Only what a person entered is stored.** Impact, feasibility, risk values and every status are worked out by the rule engine each time and never written down. There is no stored value that could disagree with its inputs.

**An empty field is `null`.** Every field is always present. "Not entered yet" is allowed everywhere; the checks say what is missing.

Text fields cite a document by writing its ID, as in `"KT-DOC-05 section 2"`. Wherever the ID of a record appears in a text, the tool shows it as a link.

## Validation

A document is validated when it is read from disk, when it is imported, and after every change before it is stored. A file written by hand or by another program is held to the same standard as one changed on screen: it is a valid TARA, or it is refused with the reasons.

```
assets[A01].itemId: names an item that does not exist.
threats[TS004]: must have exactly one risk, and has 0.
elements[DF01]: a data flow runs between components, external interactors and data stores, not to TB01.
```

"Valid" is about form: the right fields, the right kinds of value, links that point at records that exist. Whether the assessment is complete is a different question, answered by [the checks](reference/checks.md). A valid TARA can be nearly empty.

## The history

Every change that is stored adds one line to `history.jsonl`:

```json
{
  "seq": 12,
  "at": "2026-11-25T18:20:01.512Z",
  "author": "Grace Example",
  "summary": "Changed AP003: factors: expertise",
  "delta": [{ "path": "paths/AP003/factors.expertise", "before": "expert", "after": "proficient" }],
  "checksum": "9f2c…"
}
```

`delta` names each place that changed, with what was there before and after. That one list gives three things:

- **A record of who changed what**, from what to what, and when.
- **Undo.** Undoing a change applies its delta backwards, as a new change. The history keeps both; nothing is ever removed from it.
- **Working at the same time.** Each change says which state the person was looking at (`seq`). If someone else has since changed the same field, the change is refused and the person sees the present state. Changes to different fields, even of the same record, both go through.

`checksum` is the SHA-256 of the document as stored by that change.

## Editing a file by hand

You can. Stop the tool or not, edit `tara.json`, and the tool reads it the next time it is asked.

- If the result is not a valid TARA, the tool says what is wrong and leaves the file alone. The start page shows the TARA with the reasons.
- If it is valid, it stands. The tool notices that the file no longer matches the last line of its history and adds a line that says so: "The file was changed outside the tool". What exactly changed is not recorded for such an edit, and it cannot be undone from the History panel.

For anything you want in the history, change the TARA through the tool or its [API](api.md). A change through the API is the same change as one on screen.

## How a change is stored

1. One change to a TARA is made at a time; others wait their turn.
2. The change is applied to a copy of the document, and the copy is validated as a whole.
3. The line is added to the history and written to disk.
4. The document is replaced in one step: written to a temporary file, flushed, and renamed over the old one. A reader sees the old document or the new one, never half of each.

If the process dies between steps 3 and 4, the history holds one change more than the document. The next change notices and completes it from the history first.

## Moving a TARA

There are two ways, and they differ on purpose.

**Copy its folder**, `data/taras/<id>`, into the data folder of another installation. The TARA arrives exactly as it was: its reviews, its signatures, its history, the arrangement of its diagram. This is a move, or a restore from a backup.

**Export it and take it in**, to pass an assessment to someone else. Under Export, "The TARA itself" downloads the document. On another installation, "Take one in from a file" on the start page reads it and shows what it would bring before anything is stored:

- what the file holds, and what the TARA will be called here;
- what it would collide with. Nothing that is here is ever replaced: where a TARA of the same document number and revision exists, the one that comes in is numbered `<number>-IMPORT`, and one of the same title is titled "… (imported)";
- what does not come with a file.

A file that travels is working material, not the record. So a TARA that is taken in is always a new draft, and these do not come with it:

| Does not come with a file      | Why                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signatures, and a release      | A signature is a person's statement, made where the work is done, for what was in front of them.                                                                  |
| Reviews as confirmed           | Each review keeps its reference and asks to be confirmed again, here, by someone who looked.                                                                      |
| The arrangement of the diagram | Where someone placed the elements is a way of looking at the records, not part of the assessment. The diagram is drawn anew from them, and can be arranged again. |
| The history                    | It belongs to the installation where the changes were made. The new history starts with a line that says which file the TARA came from.                           |

Everything else comes in whole: every record under its ID, every link, the scoring method, the scope, the decisions on the CRA requirements, the documents. Every value is worked out anew, and is the same.

## The format's version

**A file says what it is; the tool knows what it reads.** A document carries two facts about itself:

- `format`, its format and version: `open-tara/1.0`. The number before the point changes when a document of the old form can no longer be read as it is. The number after it changes when something is added that an earlier version of the tool can do without.
- `writtenBy`, the program that last stored it, with its version and that of its rules. A document written by hand has none.

A document says nothing about what it is compatible with. That is a relation between a file and a reader, and a file cannot know the readers that come after it. The rule is in the tool (`packages/core/src/model/validate.ts`), and it goes by the format, never by the tool's own number:

| The format of the document                                                 | What this version of the tool does                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The one it writes, or an earlier one with the same number before the point | Reads it whole. An earlier form is converted as it is read (`upgrade`).                                                     |
| A later one with the same number before the point, in the data folder      | Refuses it, and says to update the tool. Storing it again would lose what the later version added.                          |
| A later one with the same number before the point, taken in from a file    | Takes everything it knows, and says before anything is stored what the later version added that is not taken (`takeKnown`). |
| Another number before the point, or another format                         | Refuses it, and says which format it reads.                                                                                 |

A TARA must stay readable for longer than any one version of this tool. So a change to the format always comes with the step that converts the form before it.

The tool itself has one version number, in `package.json` at the root. It is shown beside the tool's name on every page, named in every document the tool stores, and printed in every report under "Made with".

## Scoring methods

A scoring method is a JSON file of the shape of `methods/open-tara-1.0.json`. Put your own into `data/methods/` and it is offered when a TARA is created. Each TARA carries its own copy, so changing or removing the file later changes no existing assessment. [The method](method.md) says what a method may and may not change.
