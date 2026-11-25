# 0008: A file says what it is; the tool knows what it reads

## Decided

A TARA document carries facts about itself: its format with a version (`open-tara/1.0`) and the program that last stored it, with that program's version and the version of its rules (`writtenBy`). It carries no statement of what it is compatible with.

Whether a document can be read is decided by the reader, from the format alone:

- the same number before the point, and the same or an earlier number after it: read whole;
- the same number before the point, a later number after it: in the data folder, refused with the advice to update the tool; taken in from a file, read for what this version knows, with what is not taken said before anything is stored;
- anything else: refused.

The tool has one version number, kept in `package.json` at the root, shown on every page and named in every document and report it makes.

## Why

- **Compatibility is a relation, not a property.** A file written today cannot know which versions will read it next year. A field such as "compatible with 0.3 and later" would be a guess at the time of writing and wrong soon after. The reader always knows what it can read.
- **The format decides, not the tool's number.** Most versions of the tool change no format. Tying readability to the tool's version would refuse files for no reason, or accept them by parsing a version out of a text.
- **A later file should still be useful.** Colleagues do not all update on the same day. A file from a newer version is taken for what the older one understands, and the person is told what did not come, instead of being refused outright.
- **But a stored document is not quietly reduced.** In the data folder the same file is refused: opening and storing it again with an older version would drop what the newer one added, and nobody would have been asked.
- **Which version made this?** It is the first question when a value looks wrong. It is answered on every screen, in every document and in every report.

## What it costs

- The store sets `writtenBy` on every write, so a document changes by that one field when a newer version of the tool first stores it. It is left out of the history: it is not a change to the assessment.
- Each change to the format needs its converting step, written and tested, for as long as old documents exist.
