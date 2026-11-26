# Roadmap

What the tool does not do yet, roughly in the order it is likely to be built. Nothing here is promised. If one of these matters to you, say so in an issue, or build it: [Architecture](architecture.md) says where each would go.

## Likely next

- **Files attached to documents.** A reference names where a document is kept, but the tool does not hold the file. Holding it, with its checksum, would let a released TARA carry its evidence with it.
- **PDF from the tool.** The report is a web page laid out for print, and the browser prints it to PDF. A PDF made by the tool itself would spare that step.
- **Several items in one diagram.** A TARA can have more than one item, but the diagram draws the first.
- **A richer editor for the scoring method.** A method is replaced as a whole file today. Editing the wording, the points and the matrix on screen, with the same validation, would be friendlier.
- **Exchange with other TARA tools.** The TARA document is already a file other programs can read and write. An export to, and an import from, an open exchange format for risk data such as RDX would let an assessment move between tools that do not know this format.

## Later, perhaps

- **Access for agents.** The TARA is a plain document and the API is open on your own machine, so a coding agent can already read the assessment and the action plan. A dedicated, read-only connection for agents, such as a Model Context Protocol server, would make that a one-line setup.
- **Libraries shared between TARAs.** Controls, attack paths and documents that several assessments of related products have in common.
- **Roles.** Who may read, edit, review and approve. Today everyone who can reach the tool can do everything, and sign-in belongs to the proxy in front ([Security](security.md)).
- **A store for a database.** For installations that outgrow one process and one folder. The interface is there; the second implementation is not.
- **Other languages.** The tool's own words are in English and in the code.

## Not planned

- **Scoring by the tool.** Suggesting ratings, threats or controls automatically. An assessment is a judgement that a person signs; the tool's job is to keep it complete, consistent and traceable.
- **Text of licensed standards.** The tool refers to clauses by number and contains no text of ISO/SAE 21434.
- **An account system of its own.**
