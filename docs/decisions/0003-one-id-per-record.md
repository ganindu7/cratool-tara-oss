# 0003: One ID per record

## Decided

A record has one ID: the one people see, such as `TS003`. Links between records use it. It is given once by the tool, never changes, and is never given to another record, even after the first is removed.

## Why

- **The document is readable.** `"damageIds": ["DS-0003"]` can be read, written and reviewed by a person. A second, internal key would make every link opaque.
- **An ID means one thing for good.** Reports, review minutes, tickets and commit messages cite record IDs. If IDs were renumbered or reused, those citations would silently point at something else.
- **Less to go wrong.** With two identifiers, something has to keep them in step, and every screen and export has to translate.

## What it costs

- Numbers have gaps after records are removed. The document's details list the IDs that were withdrawn.
- An ID cannot be corrected. Where a person chooses an ID (an item, a document), the tool says so before it is given.
- Records cannot be merged across TARAs by ID. Each TARA has its own.
