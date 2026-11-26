// @tara/core: the TARA document, the only way to change it, and everything that follows from it.
//
//   model/    what a TARA is: the document, its schema, validation, IDs
//   changes/  how a TARA changes: the change operations, and the delta between two states
//   rules/    what follows from a TARA: scores, checks, reviews, the gap view, the action plan
//
// Nothing in this package reads a file, opens a connection or keeps state. Every function takes values
// and returns values, so all of it runs the same in the browser, on the server and in a test.

export * from "./changes/apply.ts";
export * from "./changes/change.ts";
export * from "./changes/delta.ts";
export * from "./changes/exchange.ts";
export * from "./model/cra.ts";
export * from "./model/create.ts";
export * from "./model/hash.ts";
export * from "./model/ids.ts";
export * from "./model/mentions.ts";
export * from "./model/method.ts";
export * from "./model/schema.ts";
export * from "./model/tara.ts";
export * from "./model/text.ts";
export * from "./model/validate.ts";
export * from "./rules/actions.ts";
export * from "./rules/arrange.ts";
export * from "./rules/catalogue.ts";
export * from "./rules/checks.ts";
export * from "./rules/columns.ts";
export * from "./rules/controls.ts";
export * from "./rules/coverage.ts";
export * from "./rules/flows.ts";
export * from "./rules/release.ts";
export * from "./rules/reviews.ts";
export * from "./rules/scoring.ts";
