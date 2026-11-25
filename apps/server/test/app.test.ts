// The API, exercised the way the screens use it: requests in, answers out, against a store in memory.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { MemoryStore } from "@tara/store";
import { createApp } from "../src/app.ts";
import { readConfig } from "../src/config.ts";
import { loadExamples, loadMethods } from "../src/library.ts";
import { WRITER } from "../src/version.ts";

const config = readConfig({});
const methods = await loadMethods(config);
const examples = await loadExamples(config);

function tool(overrides: { allowedHosts?: string[]; userHeader?: string | null } = {}) {
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 25, 12, 0, tick++)).toISOString();
  const app = createApp({
    store: new MemoryStore({ clock, writer: WRITER }),
    config: { allowedHosts: overrides.allowedHosts ?? ["localhost"], userHeader: overrides.userHeader ?? null },
    methods,
    examples,
    clock,
  });
  /** Sends a request as the page would. */
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.request(`http://localhost${path}`, {
      method,
      headers: {
        host: "localhost",
        "x-tara-author": "Ada%20Example",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON: a report or a download
    }
    return { status: response.status, json, text, headers: response.headers };
  };
  return { app, call };
}

test("a TARA is created with the default method, read back, and listed", async () => {
  const { call } = tool();
  const made = await call("POST", "/api/taras", { title: "Smart thermostat T1", product: "Thermostat" });
  assert.equal(made.status, 201);
  assert.equal(made.json.tara.id, "smart-thermostat-t1");
  assert.equal(made.json.tara.method.source, "Open TARA method 1.0");
  assert.equal(made.json.tara.craDecisions.length, 21);
  // the same title again gets an ID of its own
  assert.equal((await call("POST", "/api/taras", { title: "Smart thermostat T1" })).json.tara.id, "smart-thermostat-t1-2");
  assert.equal((await call("GET", "/api/taras")).json.length, 2);
  assert.equal((await call("POST", "/api/taras", { title: " " })).status, 400);
  assert.equal((await call("GET", "/api/taras/nothing-here")).status, 404);
});

test("the tool says which version it is, and names itself in what it stores", async () => {
  const { call } = tool();
  const manifest = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  const config = (await call("GET", "/api/config")).json;
  assert.deepEqual([config.version, config.format], [manifest.version, "open-tara/1.0"]);
  assert.equal((await call("GET", "/api/health")).json.version, manifest.version);
  const made = (await call("POST", "/api/taras", { title: "Thermostat" })).json.tara;
  assert.deepEqual(made.writtenBy, { tool: "TARA workbench", version: manifest.version, rules: config.rules });
});

test("a product name that is here already, whatever its capitals, is that product", async () => {
  const { call } = tool();
  await call("POST", "/api/taras", { title: "Release 2.4", product: "Smart Thermostat T1" });
  const second = (await call("POST", "/api/taras", { title: "Release 2.5", product: "  smart thermostat t1 " })).json.tara;
  assert.equal(second.meta.product, "Smart Thermostat T1");
  assert.equal((await call("POST", "/api/taras", { title: "Other", product: "Door lock" })).json.tara.meta.product, "Door lock");
  assert.equal((await call("POST", "/api/taras", { title: "None" })).json.tara.meta.product, null);
});

test("changes are applied together, recorded with the person's name, and can be undone", async () => {
  const { call } = tool();
  await call("POST", "/api/taras", { title: "Thermostat" });
  const changed = await call("POST", "/api/taras/thermostat/changes", {
    baseSeq: 0,
    changes: [
      { op: "add", kind: "assets", values: { name: "Schedule" } },
      { op: "add", kind: "threats", values: { category: "tampering", description: "Someone changes the schedule" } },
    ],
  });
  assert.equal(changed.status, 200);
  assert.deepEqual([changed.json.tara.seq, changed.json.tara.assets[0].id, changed.json.tara.risks[0].id], [1, "A01", "R001"]);

  const history = (await call("GET", "/api/taras/thermostat/history")).json;
  assert.deepEqual(
    history.map((e: any) => [e.seq, e.author, e.summary]),
    [
      [1, "Ada Example", "Added asset A01; Added threat scenario TS001"],
      [0, "Ada Example", "Created"],
    ],
  );
  assert.deepEqual(history[0].records, ["A01", "TS001", "R001"]);

  const undone = await call("POST", "/api/taras/thermostat/undo", { seq: 1 });
  assert.deepEqual([undone.json.tara.seq, undone.json.tara.assets.length, undone.json.tara.risks.length], [2, 0, 0]);
  assert.equal((await call("POST", "/api/taras/thermostat/undo", { seq: 1 })).status, 409, "a change is undone once");
});

test("a refusal says why, changes nothing, and has the right status", async () => {
  const { call } = tool();
  await call("POST", "/api/taras", { title: "Thermostat" });
  const refused = await call("POST", "/api/taras/thermostat/changes", {
    baseSeq: 0,
    changes: [{ op: "set", kind: "assets", id: "A09", values: { name: "x" } }],
  });
  assert.equal(refused.status, 404);
  assert.match(refused.json.error, /There is no asset A09/);
  assert.equal(
    (await call("POST", "/api/taras/thermostat/changes", { baseSeq: 0, changes: [{ op: "add", kind: "risks" }] })).status,
    400,
  );
  assert.equal((await call("POST", "/api/taras/thermostat/changes", { baseSeq: 0, changes: [] })).status, 400);
  assert.equal((await call("GET", "/api/taras/thermostat")).json.tara.seq, 0);
});

test("two people changing the same field: the second is told, and gets the present state", async () => {
  const { call } = tool();
  await call("POST", "/api/taras", { title: "Thermostat" });
  await call("POST", "/api/taras/thermostat/changes", {
    baseSeq: 0,
    changes: [{ op: "add", kind: "assets", values: { name: "Schedule" } }],
  });
  const set = (name: string, who: string) =>
    call(
      "POST",
      "/api/taras/thermostat/changes",
      { baseSeq: 1, changes: [{ op: "set", kind: "assets", id: "A01", values: { name } }] },
      { "x-tara-author": who },
    );
  assert.equal((await set("Heating schedule", "Grace")).status, 200);
  const late = await set("Timetable", "Ada");
  assert.equal(late.status, 409);
  assert.match(late.json.error, /Grace changed this in the meantime/);
  assert.equal(late.json.tara.assets[0].name, "Heating schedule");
});

test("an open page learns of others' changes by asking whether the TARA moved on", async () => {
  const { call } = tool();
  await call("POST", "/api/taras", { title: "Thermostat" });
  assert.equal((await call("GET", "/api/taras/thermostat?ifSeq=0")).status, 204);
  await call("POST", "/api/taras/thermostat/changes", { baseSeq: 0, changes: [{ op: "add", kind: "assets" }] });
  assert.equal((await call("GET", "/api/taras/thermostat?ifSeq=0")).json.tara.seq, 1);
});

test("an example is loaded once; its report and action plan can be fetched", async () => {
  const { call } = tool();
  assert.equal((await call("GET", "/api/config")).json.examples.find((e: any) => e.name === "kettle").loaded, false);
  assert.equal((await call("POST", "/api/examples/kettle", {})).json.id, "example-kettle");
  assert.equal((await call("POST", "/api/examples/kettle", {})).status, 201, "loading it again leaves the loaded one as it is");
  assert.equal((await call("GET", "/api/taras")).json.length, 1);
  assert.equal((await call("GET", "/api/config")).json.examples.find((e: any) => e.name === "kettle").guide, "KT-DOC-00");
  assert.equal((await call("POST", "/api/examples/unknown", {})).status, 404);

  const report = await call("GET", "/api/taras/example-kettle/report");
  assert.equal(report.status, 200);
  assert.match(report.headers.get("content-type") ?? "", /text\/html/);
  assert.match(report.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.match(report.text, /kettle you can switch on from your phone/);
  assert.match(report.text, /http:\/\/localhost\/#\/tara\/example-kettle\/risks\/R003/, "IDs lead into the tool");
  const kept = await call("GET", "/api/taras/example-kettle/report?file");
  assert.match(kept.headers.get("content-disposition") ?? "", /attachment; filename="EX-TARA-000/);
  assert.doesNotMatch(kept.text, /#\/tara\/example-kettle/, "a report to keep has no links into the tool");

  assert.deepEqual((await call("GET", "/api/taras/example-kettle/action-plan")).json.actions, []);
  // the door lock has a control that is only proposed: its plan has work in it
  await call("POST", "/api/examples/door-lock", {});
  const plan = await call("GET", "/api/taras/example-door-lock/action-plan?format=md");
  assert.match(plan.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(plan.text, /^# Action plan: Example TARA: a smart door lock/);
  assert.match(plan.text, /### ACT-CTL-\d+: Implement:/);
});

test("a file is looked at before it is taken in, and what it would do is said", async () => {
  const { call } = tool();
  await call("POST", "/api/examples/kettle", {});
  const exported = await call("GET", "/api/taras/example-kettle/export");
  assert.match(exported.headers.get("content-disposition") ?? "", /\.tara\.json"/);
  const document = JSON.parse(exported.text);

  const plan = (await call("POST", "/api/taras/import/check", { document })).json;
  assert.equal(plan.title, "Example TARA: a kettle you can switch on from your phone (imported)");
  assert.equal(plan.documentNumber, "EX-TARA-000-IMPORT");
  assert.ok(plan.holds.includes("5 threat scenarios"));
  const notes = plan.notes.join(" ");
  assert.match(notes, /EX-TARA-000, revision 1\.0, is here already\. It is not replaced/);
  assert.match(notes, /reviews keep their references and ask to be confirmed again/);
  assert.match(notes, /arrangement of its diagram is not taken/);
  assert.equal((await call("GET", "/api/taras")).json.length, 1, "looking stores nothing");
});

test("an imported TARA is a new draft: every record and value, no signature, no confirmed review, no arrangement", async () => {
  const { call } = tool();
  await call("POST", "/api/examples/kettle", {});
  const document = JSON.parse((await call("GET", "/api/taras/example-kettle/export")).text);
  const imported = await call("POST", "/api/taras/import", { document, fileName: "kettle.tara.json" });
  assert.equal(imported.status, 201);
  const tara = imported.json.tara;
  assert.equal(tara.id, "example-tara-a-kettle-you-can-switch-on", "its ID follows from its title");
  assert.deepEqual([tara.seq, tara.meta.status, tara.signoffs.length], [0, "draft", 0]);
  assert.deepEqual(tara.threats, document.threats, "the records come in under their IDs");
  assert.deepEqual(tara.method, document.method);
  assert.ok(tara.reviews.length > 0 && tara.reviews.every((r: any) => r.reference === "KT-REV-01" && r.fingerprint === null));
  assert.ok(tara.elements.every((e: any) => e.x === null && e.y === null));
  assert.equal(
    (await call("GET", `/api/taras/${tara.id}/history`)).json[0].summary,
    "Imported from kettle.tara.json, as a new draft",
  );
  // the one that was here is as it was
  assert.equal((await call("GET", "/api/taras/example-kettle")).json.tara.reviews[0].fingerprint !== null, true);
  // a second import of the same file gets names of its own again
  const again = (await call("POST", "/api/taras/import/check", { document })).json;
  assert.deepEqual([again.documentNumber, again.title.endsWith("(imported 2)")], ["EX-TARA-000-IMPORT-2", true]);
});

test("a file written by a later version of the tool is taken for what this version knows, and that is said first", async () => {
  const { call } = tool();
  await call("POST", "/api/examples/kettle", {});
  const document = JSON.parse((await call("GET", "/api/taras/example-kettle/export")).text);
  assert.equal(document.writtenBy.tool, "TARA workbench", "an exported file says which program wrote it");
  const later = {
    ...document,
    format: "open-tara/1.2",
    writtenBy: { tool: "TARA workbench", version: "0.8.0", rules: "1.1.0" },
    attachments: [],
  };
  const plan = (await call("POST", "/api/taras/import/check", { document: later })).json;
  assert.match(
    plan.notes[0],
    /written by TARA workbench 0\.8\.0, in the format open-tara\/1\.2\. What that version added is not taken: attachments\./,
  );
  const taken = await call("POST", "/api/taras/import", { document: later });
  assert.equal(taken.status, 201);
  assert.equal(taken.json.tara.format, "open-tara/1.0");
  // another number before the point is not this format, and is refused
  assert.equal(
    (await call("POST", "/api/taras/import/check", { document: { ...document, format: "open-tara/2.0" } })).status,
    422,
  );
});

test("a file that is not a TARA is refused with what is wrong, and nothing is stored", async () => {
  const { call } = tool();
  for (const path of ["/api/taras/import/check", "/api/taras/import"]) {
    const invalid = await call("POST", path, { document: { format: "open-tara/1.0", id: "x" } });
    assert.equal(invalid.status, 422);
    assert.ok(invalid.json.problems.length > 0);
    assert.equal((await call("POST", path, { document: "not a document" })).status, 422);
  }
  assert.deepEqual((await call("GET", "/api/taras")).json, []);
});

test("sign, release and next revision: the released TARA is frozen and its report kept as issued", async () => {
  const { call } = tool();
  await call("POST", "/api/examples/kettle", {});
  let seq = 0;
  const change = async (who: string, ...changes: unknown[]) => {
    const answer = await call("POST", "/api/taras/example-kettle/changes", { baseSeq: seq, changes }, { "x-tara-author": who });
    if (answer.json?.tara) seq = answer.json.tara.seq;
    return answer;
  };
  assert.equal((await change("Ada", { op: "release" })).status, 409, "not without signatures");
  await change("Ada", { op: "sign", role: "author" });
  await change("Grace", { op: "sign", role: "reviewer" });
  await change("Linus", { op: "sign", role: "approver" });
  const released = await change("Linus", { op: "release" });
  assert.equal(released.json.tara.meta.status, "released");
  assert.equal((await change("Ada", { op: "setMeta", values: { title: "Changed" } })).status, 409);
  assert.equal((await call("POST", "/api/taras/example-kettle/undo", {})).status, 409, "a release is not undone");
  assert.match((await call("GET", "/api/taras/example-kettle/report")).text, /Ada/, "the report as issued names who signed");

  assert.equal((await call("POST", "/api/taras/example-kettle/revisions", { revision: "1.0", reason: "x" })).status, 400);
  const next = await call("POST", "/api/taras/example-kettle/revisions", { revision: "1.1", reason: "New software release" });
  assert.equal(next.json.id, "example-kettle-rev-1-1");
  const draft = (await call("GET", `/api/taras/${next.json.id}`)).json.tara;
  assert.deepEqual([draft.meta.status, draft.meta.revision, draft.signoffs.length, draft.threats.length], ["draft", "1.1", 0, 5]);
  assert.equal(
    (await call("POST", "/api/taras/example-kettle/revisions", { revision: "1.2", reason: "Again" })).status,
    409,
    "one open revision at a time",
  );
});

test("a TARA is removed only when its title is typed, and is then gone from the list", async () => {
  const { call } = tool();
  await call("POST", "/api/taras", { title: "Thermostat" });
  assert.equal((await call("DELETE", "/api/taras/thermostat", { confirmTitle: "thermo" })).status, 400);
  assert.equal((await call("DELETE", "/api/taras/thermostat", { confirmTitle: "Thermostat" })).status, 200);
  assert.deepEqual((await call("GET", "/api/taras")).json, []);
});

test("the name of the person comes from the page, or from the proxy's header when one is set up", async () => {
  const asked = tool();
  await asked.call("POST", "/api/taras", { title: "Thermostat" }, { "x-tara-author": encodeURIComponent("Zoë Ångström") });
  assert.equal((await asked.call("GET", "/api/taras/thermostat/history")).json[0].author, "Zoë Ångström");

  const proxied = tool({ userHeader: "x-forwarded-user" });
  await proxied.call(
    "POST",
    "/api/taras",
    { title: "Thermostat" },
    { "x-tara-author": "Mallory", "x-forwarded-user": "grace@example.org" },
  );
  assert.equal((await proxied.call("GET", "/api/taras/thermostat/history")).json[0].author, "grace@example.org");
  assert.equal((await proxied.call("GET", "/api/config")).json.author, "Unnamed");
});

test("a request from another site, or to another host name, is refused", async () => {
  const { call } = tool();
  const fromElsewhere = await call("POST", "/api/taras", { title: "Thermostat" }, { origin: "https://evil.example" });
  assert.equal(fromElsewhere.status, 403);
  assert.equal((await call("POST", "/api/taras", { title: "Thermostat" }, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await call("POST", "/api/taras", { title: "Thermostat" }, { origin: "http://localhost" })).status, 201);
  // a name that merely resolves to this machine is not one of the tool's own
  assert.equal((await call("GET", "/api/taras", undefined, { host: "rebind.evil.example" })).status, 421);
  // a body that is not JSON cannot be sent by a plain form
  const { app } = tool();
  const form = await app.request("http://localhost/api/taras", {
    method: "POST",
    headers: { host: "localhost", "content-type": "text/plain", "content-length": "20" },
    body: '{"title":"Sneaky"}',
  });
  assert.equal(form.status, 415);
  assert.equal((await call("GET", "/api/nothing")).status, 404);
});
