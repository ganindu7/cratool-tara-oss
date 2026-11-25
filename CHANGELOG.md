# Changelog

What changed in each release, written for people who use the tool. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Two things have versions of their own, and a release says when either changes:

- the **document format** (`open-tara/1.0`): the number before the point changes when older documents have to be converted, which the tool does as it reads them; the number after it when something is added;
- the **rules** (`RULES_VERSION`, 1.0.0): when a rule changes a result, the release says which.

## Unreleased

## 0.1.0

The first release.

- The steps of a TARA, from scope to CRA requirements, with a check on every record that says what it still needs.
- The architecture as a data flow diagram with trust boundaries; overlays for assets, controls, gaps and attack paths.
- Risk values worked out from impact and attack feasibility, with the Open TARA method 1.0.
- Reviews that remember what they covered and ask to be confirmed again when it changes.
- Sign-off by author, reviewer and approver; release; next revision.
- The report as one self-contained web page, laid out for print.
- A history of every change, with undo.
- The action plan: the work that follows from an assessment.
- Three worked examples: a kettle, a door lock and a remote service gateway.
- Data as plain files: one JSON document and one history per TARA.
- Passing a TARA on as a file: what a file would bring is shown before it is taken in, and it arrives as a new draft under names that collide with nothing.
- Every document and report names the version of the tool that made it; a file from a later version is taken in for what this version knows, and what is not taken is said first.
- No text is hidden: where a figure or a list has no room for all of a text, it is cut after a whole word and marked, beside the ID that leads to it in full.
