// The versions of the document format, the program a document names as its writer, and cutting a text for room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CUT, cutText, FORMAT, parseTara, readFormat, takeKnown, upgrade, validateTara } from "../src/index.ts";
import { example } from "./helpers.ts";

test("a document says which format it is in, with a number before the point and one after", () => {
  assert.equal(FORMAT, "open-tara/1.0");
  assert.deepEqual(readFormat({ format: "open-tara/1.0" }), { major: 1, minor: 0 });
  assert.deepEqual(readFormat({ format: "open-tara/1" }), { major: 1, minor: 0 });
  assert.deepEqual(readFormat({ format: "open-tara/2.7" }), { major: 2, minor: 7 });
  assert.equal(readFormat({ format: "something-else/1.0" }), null);
  assert.equal(readFormat("text"), null);
});

test("an earlier form of the format is brought up to the present one and read whole", () => {
  const early = { ...example("kettle"), format: "open-tara/1" };
  assert.match(validateTara(early).join(" "), /This version of the tool reads "open-tara\/1\.0"/);
  const read = parseTara(upgrade(early));
  assert.equal(read.format, FORMAT);
  assert.deepEqual(read.threats, example("kettle").threats);
});

test("a stored document written by a later version of the tool is refused, with what to do", () => {
  const later = {
    ...example("kettle"),
    format: "open-tara/1.4",
    writtenBy: { tool: "TARA workbench", version: "0.9.0", rules: "1.2.0" },
  };
  const problems = validateTara(upgrade(later));
  assert.equal(problems.length, 1);
  assert.match(
    problems[0] ?? "",
    /written by a later version of the tool \(TARA workbench 0\.9\.0\)\. This version reads "open-tara\/1\.0"\. Update the tool/,
  );
  // another number before the point is another format altogether
  assert.match(
    validateTara(upgrade({ ...example("kettle"), format: "open-tara/2.0" })).join(" "),
    /This version of the tool reads/,
  );
});

test("taken in from a file, a later form is read for what this version knows, and what it does not know is named", () => {
  const kettle = example("kettle") as unknown as Record<string, unknown>;
  const later = {
    ...kettle,
    format: "open-tara/1.3",
    writtenBy: { tool: "TARA workbench", version: "0.9.0", rules: "1.2.0" },
    attachments: [{ id: "F01" }],
    assets: (kettle.assets as Record<string, unknown>[]).map((asset) => ({ ...asset, owner: "Someone" })),
  };
  const { document, notTaken } = takeKnown(later);
  const read = parseTara(upgrade(document));
  assert.deepEqual(read.assets, example("kettle").assets);
  assert.equal("attachments" in read, false);
  assert.equal(notTaken.length, 1);
  assert.match(
    notTaken[0] ?? "",
    /written by TARA workbench 0\.9\.0, in the format open-tara\/1\.3\. What that version added is not taken: asset: owner; attachments\./,
  );
  // a document of this version's own form is given back as it is, with nothing to say
  assert.deepEqual(takeKnown(example("kettle")), { document: example("kettle"), notTaken: [] });
});

test("a document may name the program that wrote it, and must do so in full if it does", () => {
  const named = { ...example("kettle"), writtenBy: { tool: "TARA workbench", version: "0.1.0", rules: "1.0.0" } };
  assert.deepEqual(validateTara(named), []);
  assert.deepEqual(validateTara(example("kettle")), [], "a document written by hand names no writer");
  assert.match(
    validateTara({ ...example("kettle"), writtenBy: { tool: "x" } }).join(" "),
    /writtenBy: must name the tool, its version and the version of its rules/,
  );
});

test("a text that has no room is cut after a whole word and marked; one that fits is left alone", () => {
  assert.equal(cutText("Open a discarded kettle", 40), "Open a discarded kettle");
  const cut = cutText("Open a discarded kettle, connect to the memory chip and read what is on it.", 40);
  assert.equal(cut, `Open a discarded kettle, connect to the${CUT}`);
  // one character less of room, and the last word no longer fits: it goes, whole
  assert.equal(
    cutText("Open a discarded kettle, connect to the memory chip and read what is on it.", 39),
    `Open a discarded kettle, connect to${CUT}`,
  );
  assert.ok(cut.length <= 40);
  // the mark follows a word, not a comma or a bracket left hanging
  assert.equal(cutText("One, two, three, four, five, six, seven", 16), `One, two, three${CUT}`);
  // runs of spaces and line breaks count as one space
  assert.equal(cutText("a  b\n\nc", 10), "a b c");
  // a single word that is too long is cut inside it: there is nowhere else
  assert.equal(cutText("Supercalifragilisticexpialidocious", 12), `Supercalifr${CUT}`);
});
