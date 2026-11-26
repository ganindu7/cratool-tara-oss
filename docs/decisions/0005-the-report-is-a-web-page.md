# 0005: The report is a web page

## Decided

The report is one self-contained HTML page: its styles and drawings are inside it, it contains no script, and it loads nothing from elsewhere. It is laid out for A4, so a browser prints it to PDF. The tool does not produce PDF itself.

## Why

- **It needs nothing.** A typesetting system would be a large thing to install, to keep working on three operating systems, and to put into the image.
- **One file that will open in thirty years.** HTML with inline SVG is as durable as formats get.
- **It can be read where the work is done**, with every ID a link to its record, and kept as a file where IDs link within the document.
- **It cannot disagree with the screens.** The report is built from the same results of the same rule engine.

## What it costs

- Page breaks, headers and footers are up to the browser's print dialogue. They are good, not perfect.
- Organisations with a house style for documents get the tool's plain one. The report's content is built separately from its layout (`packages/report`), so another layout is an addition, not a rewrite.
