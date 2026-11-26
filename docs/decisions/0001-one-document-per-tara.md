# 0001: A TARA is one document in a folder

## Decided

A TARA is stored as one JSON document, `tara.json`, in a folder of its own, with the history of its changes beside it. There is no database.

## Why

- **The data must outlive the tool.** An assessment has to stay readable for ten years and more. A JSON file of a documented shape can be read by anything; a database needs the software that wrote it, in a version that still understands it.
- **The data must be separate from the tool.** With one folder, "where is my data?" has a one-word answer, and backing up, moving and restoring are copying.
- **It must run with nothing installed.** A tool that needs a database server is one that most people who could use it will never start.
- **A document is the natural unit.** A TARA is read and worked on as a whole, released as a whole, and signed as a whole. Its records refer to each other and to nothing outside it.
- **It can be put under version control**, beside the product it assesses, and compared line by line.

## What it costs

- One process per data folder. Changes to a TARA are made one at a time inside the process, which a database would do across processes.
- No queries across TARAs. Listing them means reading each document; with hundreds of TARAs that would want an index.
- The whole document is written for each change. A TARA is tens to hundreds of kilobytes, so this is a few milliseconds, but it would not suit documents a thousand times larger.

For an installation that outgrows this, storage sits behind an interface of eight methods (`packages/store/src/store.ts`), and the document format stays what it is.
