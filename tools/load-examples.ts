// Puts the training examples into the data folder, without the server running.
//
//   npm run examples                  loads every example that is not there yet
//   npm run examples -- kettle        loads one: kettle, door-lock or gateway
//   npm run examples -- --replace     replaces the ones that are there with fresh copies
//
// `--replace` is the way back to a clean copy after trying things out. The copy that was there is moved to
// the trash folder of the data folder, not destroyed.

import { FileStore } from "@tara/store";
import { readConfig } from "../apps/server/src/config.ts";
import { loadExamples } from "../apps/server/src/library.ts";
import { WRITER } from "../apps/server/src/version.ts";

const config = readConfig();
const args = process.argv.slice(2);
const replace = args.includes("--replace");
const wanted = args.filter((arg) => !arg.startsWith("--"));

const examples = await loadExamples(config);
const unknown = wanted.filter((name) => !examples.some((e) => e.name === name));
if (unknown.length > 0) {
  console.error(`There is no example called ${unknown.join(", ")}. The examples are: ${examples.map((e) => e.name).join(", ")}.`);
  process.exit(1);
}

const store = new FileStore(config.dataDir, { writer: WRITER });
const by = { author: "npm run examples", summary: "Training example loaded" };
for (const example of examples.filter((e) => wanted.length === 0 || wanted.includes(e.name))) {
  const present = await store.exists(example.tara.id);
  if (present && !replace) {
    console.log(`= ${example.name}: already there, left as it is (--replace puts a fresh copy in its place)`);
    continue;
  }
  if (present) await store.remove(example.tara.id, by);
  await store.create(example.tara, by);
  console.log(`+ ${example.name}: ${example.tara.meta.title}`);
}
console.log(`Data folder: ${config.dataDir}`);
