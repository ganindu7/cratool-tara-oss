# Changelog

What changed in each release, written for people who use the tool. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Two things have versions of their own, and a release says when either changes:

- the **document format** (`open-tara/1.0`): the number before the point changes when older documents have to be converted, which the tool does as it reads them; the number after it when something is added;
- the **rules** (`RULES_VERSION`, 1.0.0): when a rule changes a result, the release says which.

## Unreleased

- A record of the chain, from the architecture to the goals and claims, can be looked at as a drawing. Its ego view shows the record as a block that says what it is made of, with what is linked to it directly around it. Four more views follow the chain of the method from an element, an asset, a threat or a control.
- The graph shows the whole TARA or the chain of one record, with loose ends marked: records where the chain from item to decision stops short.
- A record that is chosen on a drawing shows its card: how it stands, its ratings drawn, what it is linked to. The record can be amended in the card.
- A step can be shown with the links of its open record beside the list ("Page and links").
- On the architecture diagram an asset stands inside the element it lives in, and is placed by dragging or by choosing where it goes. The diagram opens from four steps (Architecture, Assets, Attack paths, Controls); the highest risk at each element can be laid over it, and the route of an attack path is recorded by choosing its places in order.
- Elements that nobody placed are set out better: from the outside in, each trust boundary as a frame around what it holds, with the room each element really needs, and with joined elements level with one another so that lines are short and do not cross. A new element appears beneath an arranged drawing instead of on top of it.
- The report draws the data flows of its diagrams straight, curved or stepped, as the diagram is looked at when the report is made (`?lines=` on the report's address). A release keeps the report as it was drawn then.
- The workspace has a new look: a ribbon at the top, the steps as stops along a route with what is still to complete or to review under each, the list of a step with its open record beside it.
- The scope and the evidence for release are tables that are filled in; the Report step has a view of its own for sign-off and release, and a release is asked for twice.
- The addresses of the diagram changed: `.../architecture?show=diagram` takes the place of `.../diagram`.
- The screens, the website and the report share one look, with every colour named once. A colour means one thing: blue is what can be acted on, green is settled, yellow waits, red is to complete or deletes.
- Text and the marks of a status meet a contrast of 4.5 to 1: secondary text and the examples in empty fields are darker, and the numerals on the risk values 2 and 4 are dark instead of white. What steps back on a drawing is fainter on purpose.
- A status no longer rests on telling red from green. On a drawing, a record that is to complete is marked by a ring with a dot in it, as it is on the route of the steps.
- On the diagram the route of an attack path is drawn in plum, a colour of its own, so that what an attacker does is not mistaken for what is chosen, which stays blue.
- Data flows are drawn curved until you choose another way; they were straight. The report follows, also where it is asked for without `?lines=`. A browser that already kept a choice keeps it.
- The website has the look of the tool, and its tagline: Ship fast & secure.
- The tool is called Open TARA workbench: on its pages, on the website, in its reports and in the files it writes. A file written under the earlier name is read as before.
- An ID of your own choosing that has no digit in it, such as `REF-ISO`, is a link wherever a screen shows a text for reading, as it already was in the report.
- The History panel and the start page say how many entries they leave out where a list stops for room, and the History panel says when it shows only the last 200 changes.
- When it starts, the tool makes sure it can write its data folder, and says what to do if it cannot. Before, the first change failed with a fault.
- Fixed: changes sent after a `release` in the same request were made to the released TARA. A release is now the last change of a request.
- Fixed: undoing the addition of a record freed its ID for another record. An ID is given once, also after an undo.
- Fixed: an undo could put back a signature or a confirmed review that someone had taken away, in that person's name. That is refused: the person signs, or confirms the review, again.
- Fixed: a document whose change log, signatures or method descriptions were not text was accepted, and then broke the report. It is refused, with the place.
- Fixed: behind a proxy that serves the tool over HTTPS, the IDs in the report led to an `http` address. They lead into the tool by an address without a host.
- Fixed: opening a revision whose name is long failed. The ID of a revision always fits.
- Fixed: the limit on the size of a request was not applied to a body sent in pieces.
- Fixed: `npm run dev` did not start on Windows.
- Fixed: the report named 13 of the 19 rows of the scope and of the hand-over evidence differently from the screens ("Reassessment triggers" for "When this is assessed again"). A row has one name now, the one on screen.
- Fixed: in the report, with a scoring method that lists its impact categories or its factors in another order than the tool's, ratings stood under the wrong headings.
- Fixed: a change whose undo was itself undone still read "undone since" in the History panel, and could not be undone again.

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
