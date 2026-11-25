// What every store must do, run against each store that comes with the tool; then what only the file store does.
import assert from "node:assert/strict";
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyChanges,
  applyDelta,
  type Change,
  createTara,
  InvalidTara,
  invertDelta,
  type Method,
  Refusal,
  type Tara,
} from "@tara/core";
import { Conflict, FileStore, MemoryStore, NotFound, OUTSIDE_THE_TOOL, type Store } from "../src/index.ts";

const method: Method = JSON.parse(await readFile(new URL("../../../methods/open-tara-1.0.json", import.meta.url), "utf8"));
const ada = { author: "Ada", summary: "Created" };
const newTara = (id = "thermostat"): Tara => createTara({ id, title: "Thermostat", method, now: "2026-11-25T10:00:00.000Z" });
/** A clock that moves on a second each time it is asked, so that entries have an order. */
const clock = () => {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 10, 25, 12, 0, tick++)).toISOString();
};
/** A change to make in store.update: applies the given changes with the rule engine. */
const making =
  (...changes: Change[]) =>
  (current: Tara) =>
    applyChanges(current, changes, { author: "Ada", now: "2026-11-25T12:00:00.000Z" });

async function fileStore(): Promise<{ store: FileStore; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "tara-store-"));
  return { store: new FileStore(root, { clock: clock() }), root };
}

const STORES: [name: string, make: () => Promise<Store>][] = [
  ["MemoryStore", async () => new MemoryStore({ clock: clock() })],
  ["FileStore", async () => (await fileStore()).store],
];

for (const [name, make] of STORES) {
  test(`${name}: a TARA that is created can be read, listed and found`, async () => {
    const store = await make();
    const created = await store.create(newTara(), ada);
    assert.equal(created.seq, 0);
    assert.deepEqual(await store.read("thermostat"), created);
    assert.equal(await store.exists("thermostat"), true);
    assert.equal(await store.exists("other"), false);
    assert.deepEqual(
      (await store.list()).map((s) => [s.id, s.title, s.method]),
      [["thermostat", "Thermostat", "Open TARA method 1.0"]],
    );
    await assert.rejects(store.read("other"), NotFound);
    await assert.rejects(store.create(newTara(), ada), Refusal);
  });

  test(`${name}: an update is stored with the next seq and a line in the history that says what changed`, async () => {
    const store = await make();
    await store.create(newTara(), ada);
    const updated = await store.update(
      "thermostat",
      { author: "Ada", summary: "" },
      making({ op: "add", kind: "assets", values: { name: "Schedule" } }),
    );
    assert.equal(updated.seq, 1);
    assert.equal(updated.assets[0]?.name, "Schedule");
    assert.deepEqual(await store.read("thermostat"), updated);
    const history = await store.history("thermostat");
    assert.deepEqual(
      history.map((e) => [e.seq, e.author, e.summary]),
      [
        [0, "Ada", "Created"],
        [1, "Ada", "Added asset A01"],
      ],
    );
    assert.ok(history[1]?.delta.some((d) => d.path === "assets/A01"));
  });

  test(`${name}: an update that changes nothing stores nothing`, async () => {
    const store = await make();
    await store.create(newTara(), ada);
    const same = await store.update("thermostat", { author: "Ada", summary: "Nothing" }, (current) => current);
    assert.equal(same.seq, 0);
    assert.equal((await store.history("thermostat")).length, 1);
  });

  test(`${name}: a change that is refused or not valid leaves the stored TARA as it was`, async () => {
    const store = await make();
    await store.create(newTara(), ada);
    await assert.rejects(
      store.update("thermostat", { author: "Ada", summary: "" }, making({ op: "set", kind: "assets", id: "A09", values: {} })),
      Refusal,
    );
    await assert.rejects(
      store.update("thermostat", { author: "Ada", summary: "Broken" }, (current) => ({
        ...current,
        assets: [{ id: "A01" }] as never,
      })),
      InvalidTara,
    );
    assert.equal((await store.read("thermostat")).seq, 0);
    assert.equal((await store.history("thermostat")).length, 1);
  });

  test(`${name}: two people changing different things both succeed; changing the same thing is a conflict`, async () => {
    const store = await make();
    await store.create(newTara(), ada);
    const base = await store.update(
      "thermostat",
      { author: "Ada", summary: "" },
      making({ op: "add", kind: "assets", values: { name: "Schedule" } }),
    );
    // Grace and Ada both look at seq 1. Grace changes the name.
    await store.update(
      "thermostat",
      { author: "Grace", summary: "", baseSeq: base.seq },
      making({ op: "set", kind: "assets", id: "A01", values: { name: "Heating schedule" } }),
    );
    // Ada changes another field of the same record: no conflict, and Grace's name stays.
    const merged = await store.update(
      "thermostat",
      { author: "Ada", summary: "", baseSeq: base.seq },
      making({ op: "set", kind: "assets", id: "A01", values: { variant: "All" } }),
    );
    assert.deepEqual([merged.assets[0]?.name, merged.assets[0]?.variant], ["Heating schedule", "All"]);
    // Ada, still looking at seq 1, changes the name too: refused, with the present state.
    await assert.rejects(
      store.update(
        "thermostat",
        { author: "Ada", summary: "", baseSeq: base.seq },
        making({ op: "set", kind: "assets", id: "A01", values: { name: "Timetable" } }),
      ),
      (error: unknown) =>
        error instanceof Conflict && /Grace changed this in the meantime/.test(error.message) && error.current.seq === 3,
    );
    assert.equal((await store.read("thermostat")).assets[0]?.name, "Heating schedule");
  });

  test(`${name}: a change is undone by applying its delta backwards, as a new change`, async () => {
    const store = await make();
    await store.create(newTara(), ada);
    await store.update(
      "thermostat",
      { author: "Ada", summary: "" },
      making({ op: "add", kind: "assets", values: { name: "Schedule" } }),
    );
    await store.update(
      "thermostat",
      { author: "Ada", summary: "" },
      making({ op: "set", kind: "assets", id: "A01", values: { name: "Timetable" } }),
    );
    const last = (await store.history("thermostat")).at(-1);
    assert.ok(last);
    const undone = await store.update(
      "thermostat",
      { author: "Ada", summary: `Undid: ${last.summary}`, undoes: last.seq },
      (current) => applyDelta(current, invertDelta(last.delta)),
    );
    assert.equal(undone.assets[0]?.name, "Schedule");
    const history = await store.history("thermostat");
    assert.equal(history.length, 4, "the history keeps both the change and its undoing");
    assert.equal(history.at(-1)?.undoes, last.seq);
  });

  test(`${name}: a removed TARA is gone from the list, and a text can be kept beside a TARA`, async () => {
    const store = await make();
    await store.create(newTara(), ada);
    await store.writeFile("thermostat", "releases/1.0/report.html", "<p>report</p>");
    assert.equal(await store.readFile("thermostat", "releases/1.0/report.html"), "<p>report</p>");
    assert.equal(await store.readFile("thermostat", "releases/9.9/report.html"), null);
    await assert.rejects(store.writeFile("thermostat", "../outside.txt", "x"), /not a usable file name/);
    await store.remove("thermostat", { author: "Ada" });
    assert.deepEqual(await store.list(), []);
    await assert.rejects(store.read("thermostat"), NotFound);
  });
}

test("a store that is told who it is names itself in every document it stores", async () => {
  const writer = { tool: "TARA workbench", version: "9.9.9", rules: "1.0.0" };
  const root = await mkdtemp(join(tmpdir(), "tara-store-"));
  for (const store of [new MemoryStore({ clock: clock(), writer }), new FileStore(root, { clock: clock(), writer })]) {
    const created = await store.create(newTara(), ada);
    assert.deepEqual(created.writtenBy, writer);
    const updated = await store.update("thermostat", { author: "Ada", summary: "" }, making({ op: "add", kind: "assets" }));
    assert.deepEqual(updated.writtenBy, writer);
    // naming the writer is not a change to the assessment: the history holds the asset and nothing else
    assert.deepEqual(
      (await store.history("thermostat"))
        .at(-1)
        ?.delta.map((d) => d.path)
        .filter((path) => !path.startsWith("counters/")),
      ["assets/A01"],
    );
  }
  await rm(root, { recursive: true });
});

// ------------------------------------------------------------------------------------------ the file store only

test("FileStore: the data is a readable JSON document and a history with one line per change", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  await store.update(
    "thermostat",
    { author: "Ada", summary: "" },
    making({ op: "add", kind: "assets", values: { name: "Schedule" } }),
  );
  const document = JSON.parse(await readFile(join(root, "taras/thermostat/tara.json"), "utf8"));
  assert.equal(document.format, "open-tara/1.0");
  assert.equal(document.assets[0].name, "Schedule");
  const lines = (await readFile(join(root, "taras/thermostat/history.jsonl"), "utf8")).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(
    await readdir(join(root, "taras/thermostat")),
    ["history.jsonl", "tara.json"],
    "no temporary file is left behind",
  );
  await rm(root, { recursive: true });
});

test("FileStore: an ID can never name a place outside the data folder", async () => {
  const { store, root } = await fileStore();
  for (const id of ["../etc", "a/b", "..", "", "UPPER", "x".repeat(80)]) {
    await assert.rejects(store.read(id), NotFound, id);
    assert.equal(await store.exists(id), false);
  }
  await rm(root, { recursive: true });
});

test("FileStore: a removed TARA is moved to the trash with its history", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  await store.remove("thermostat", { author: "Ada" });
  const [kept] = await readdir(join(root, "trash"));
  assert.match(kept ?? "", /^thermostat-\d{14}$/);
  assert.deepEqual((await readdir(join(root, "trash", kept ?? ""))).sort(), ["history.jsonl", "tara.json"]);
  // the ID is free again
  await store.create(newTara(), ada);
  await rm(root, { recursive: true });
});

test("FileStore: a change that reached the history and not the document is completed before the next one", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  const before = await readFile(join(root, "taras/thermostat/tara.json"), "utf8");
  await store.update(
    "thermostat",
    { author: "Ada", summary: "" },
    making({ op: "add", kind: "assets", values: { name: "Schedule" } }),
  );
  // as if the process had died after writing the history: the document is the old one again
  await writeFile(join(root, "taras/thermostat/tara.json"), before);
  const reopened = new FileStore(root, { clock: clock() });
  const next = await reopened.update(
    "thermostat",
    { author: "Ada", summary: "" },
    making({ op: "add", kind: "assets", values: { name: "Setpoint" } }),
  );
  assert.deepEqual(
    next.assets.map((a) => [a.id, a.name]),
    [
      ["A01", "Schedule"],
      ["A02", "Setpoint"],
    ],
  );
  assert.deepEqual(
    (await reopened.history("thermostat")).map((e) => e.seq),
    [0, 1, 2],
  );
  await rm(root, { recursive: true });
});

test("FileStore: a document edited in the file is accepted if valid, and the history says it happened", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  const path = join(root, "taras/thermostat/tara.json");
  const edited = JSON.parse(await readFile(path, "utf8"));
  edited.meta.title = "Edited by hand";
  await writeFile(path, JSON.stringify(edited));
  assert.equal((await store.read("thermostat")).meta.title, "Edited by hand");
  // someone who was looking at the old state is told, rather than writing over the edit
  await assert.rejects(
    store.update("thermostat", { author: "Ada", summary: "", baseSeq: 0 }, making({ op: "setMeta", values: { title: "Mine" } })),
    Conflict,
  );
  const history = await store.history("thermostat");
  assert.deepEqual(
    history.map((e) => [e.seq, e.author, e.external ?? false]),
    [
      [0, "Ada", false],
      [1, OUTSIDE_THE_TOOL, true],
    ],
  );
  await rm(root, { recursive: true });
});

test("FileStore: a document that is not a valid TARA is refused when read, and listed with what is wrong", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  const path = join(root, "taras/thermostat/tara.json");
  const damaged = JSON.parse(await readFile(path, "utf8"));
  damaged.assets = [{ id: "A01", name: "Half an asset" }];
  await writeFile(path, JSON.stringify(damaged));
  await assert.rejects(store.read("thermostat"), InvalidTara);
  assert.match((await store.list())[0]?.problem ?? "", /assets\[A01\]\.itemId: is missing/);
  await writeFile(path, "{ not json");
  await assert.rejects(store.read("thermostat"), /not readable as JSON/);
  await rm(root, { recursive: true });
});

test("FileStore: a last history line cut short by a crash is left out", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  await appendFile(join(root, "taras/thermostat/history.jsonl"), '{"seq":1,"at":"2026');
  assert.equal((await new FileStore(root).history("thermostat")).length, 1);
  await rm(root, { recursive: true });
});

test("FileStore: updates of one TARA sent at the same moment are stored one after the other", async () => {
  const { store, root } = await fileStore();
  await store.create(newTara(), ada);
  await Promise.all(
    Array.from({ length: 12 }, (_, n) =>
      store.update(
        "thermostat",
        { author: "Ada", summary: "" },
        making({ op: "add", kind: "assets", values: { name: `Asset ${n}` } }),
      ),
    ),
  );
  const tara = await store.read("thermostat");
  assert.equal(tara.seq, 12);
  assert.deepEqual(
    tara.assets.map((a) => a.id),
    Array.from({ length: 12 }, (_, n) => `A${String(n + 1).padStart(2, "0")}`),
  );
  assert.deepEqual(
    (await store.history("thermostat")).map((e) => e.seq),
    Array.from({ length: 13 }, (_, n) => n),
  );
  await rm(root, { recursive: true });
});
