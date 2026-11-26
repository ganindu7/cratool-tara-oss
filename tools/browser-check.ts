// Uses the tool the way a person does, in a real browser, and checks that what should happen does.
//
//   npm run check:browser
//
// The rule engine, the store and the API have tests of their own. This is the one check of the screens:
// that typing into a field stores it, that a value on screen follows a change, that undo undoes, that a
// refusal is shown with its reason, that an element dragged on the diagram stays where it was dropped.
//
// It needs the built screens (npm run build) and Chrome or Chromium; give its path with CHROME=... if it is
// not found. It starts the tool on a data folder of its own, so your data is not touched. There is no
// browser-testing library: the script talks to Chrome over its DevTools protocol (tools/chrome.ts).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eventually, findChrome, startChrome } from "./chrome.ts";

const root = resolve(import.meta.dirname, "..");
const PORT = 8798;
const DEBUG_PORT = 9334;
const base = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const chromePath = findChrome();
if (!chromePath) {
  console.error("Chrome was not found. Give its path: CHROME=/path/to/chrome npm run check:browser");
  process.exit(1);
}
if (!existsSync(join(root, "apps/web/dist/index.html"))) {
  console.error("The screens are not built. Run `npm run build` first.");
  process.exit(1);
}

const scratch = await mkdtemp(join(tmpdir(), "tara-browser-check-"));
const server = spawn(process.execPath, ["apps/server/src/main.ts"], {
  cwd: root,
  env: { ...process.env, TARA_DATA_DIR: join(scratch, "data"), PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: "ignore",
});
const chrome = await startChrome({
  path: chromePath,
  profile: join(scratch, "chrome"),
  port: DEBUG_PORT,
  width: 1440,
  height: 1000,
});
const { command, inPage } = chrome;
const open = (address: string) => chrome.open(`${base}/${address}`);

// --------------------------------------------------------------------------------- acting like a person

/** The middle of the first element that matches, and whose text holds `text` if given. */
const middleOf = (selector: string, text?: string) =>
  inPage<{ x: number; y: number } | null>(`(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const element = ${text ? `all.find((e) => e.textContent.includes(${JSON.stringify(text)}))` : "all[0]"};
    if (!element) return null;
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
const mouse = (type: string, x: number, y: number, held = false) =>
  command("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: type === "mouseMoved" && !held ? "none" : "left",
    buttons: held ? 1 : 0,
    clickCount: 1,
  });
async function click(selector: string, text?: string) {
  const at = await middleOf(selector, text);
  assert.ok(at, `There is nothing to click: ${selector} ${text ?? ""}`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await mouse(type, at.x, at.y);
  await sleep(600);
}
const type = (text: string) => command("Input.insertText", { text });
async function press(key: "Tab" | "Enter") {
  const code = key === "Tab" ? 9 : 13;
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: code,
    ...(key === "Enter" ? { text: "\r" } : {}),
  });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
  await sleep(700);
}
/** Chooses an option of the select under a label, as a person picking it from the list would. */
async function choose(label: string, value: string) {
  const done = await inPage<boolean>(`(() => {
    const field = [...document.querySelectorAll(".field")].find((f) => f.querySelector("label")?.textContent.trim() === ${JSON.stringify(label)});
    const select = field?.querySelector("select");
    if (!select) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert.ok(done, `There is no choice labelled "${label}".`);
  await sleep(700);
}
const textOf = (selector: string) => inPage<string>(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ""`);
const count = (selector: string) => inPage<number>(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
/** The TARA as the server has it: what was really stored. */
// biome-ignore lint/suspicious/noExplicitAny: the check reads whatever the API answers, and asserts on it
const stored = async (path = "") => (await (await fetch(`${base}/api/taras/example-kettle${path}`)).json()) as any;

// ------------------------------------------------------------------------------------------- the check

let passed = 0;
async function step(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log(`ok  ${name}`);
}

try {
  await eventually(async () => assert.ok((await fetch(`${base}/api/health`)).ok));
  await fetch(`${base}/api/examples/kettle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

  await step("a person says who they are", async () => {
    await open("#/tara/example-kettle/assets");
    assert.match(await textOf(".banner"), /recorded under the name "Unnamed"/);
    await click(".whoami-change");
    await type("Ada Example");
    await press("Enter");
    assert.equal(await textOf(".whoami-name"), "Ada Example");
  });

  await step("a new record opens, and what is typed is stored when the field is left", async () => {
    await click(".step-head button.primary", "Add asset");
    assert.match(await inPage<string>("location.hash"), /\/assets\/A05$/);
    await click(".detail .field input");
    await type("Pairing key");
    await press("Tab");
    assert.equal((await stored()).tara.assets.at(-1).name, "Pairing key");
    assert.match(await textOf(".detail .next"), /Link the asset to an item/);
    await choose("Item", "IT01");
    assert.equal((await stored()).tara.assets.at(-1).itemId, "IT01");
    assert.equal((await stored("/history"))[0].author, "Ada Example");
  });

  await step("a value on screen follows a change, and the review that covered it says so", async () => {
    await open("#/tara/example-kettle/paths/AP002");
    assert.match(await textOf(".facts"), /25/);
    await choose("Expertise", "proficient");
    assert.match(await textOf(".facts"), /22[\s\S]*Low/);
    assert.match(await textOf(".review"), /has changed since it was confirmed/);
    await open("#/tara/example-kettle/risks");
    const value = await inPage<string>(
      `[...document.querySelectorAll(".records tbody tr")].find((row) => row.innerText.startsWith("R002")).querySelector(".risk").textContent`,
    );
    assert.equal(value, "4");
    assert.match(await textOf(".route"), /to review/);
  });

  await step("a change is undone from the history", async () => {
    await open("#/tara/example-kettle/paths/AP002?panel=history");
    assert.match(await textOf(".history"), /Changed AP002: factors: expertise/);
    await click(".history li:first-child button.link", "Undo");
    assert.equal((await stored()).tara.paths[1].factors.expertise, "expert");
    assert.match(await textOf(".facts"), /25/);
  });

  await step("a refusal is shown with its reason, and nothing is removed", async () => {
    await open("#/tara/example-kettle/controls/CTL-001");
    await click(".detail .delete button.link");
    await click(".detail .delete button.danger");
    assert.match(await textOf(".banner.error"), /cannot be removed while control evidence EV-001 depends on it/);
    assert.equal((await stored()).tara.controls.length, 3);
  });

  await step("the diagram draws the architecture, and an element stays where it is dropped", async () => {
    await open("#/tara/example-kettle/architecture?show=diagram");
    assert.equal(await count(".react-flow__node"), 5);
    assert.equal(await count(".react-flow__edge"), 3);
    const before = (await stored()).tara.elements.find((e: { id: string }) => e.id === "C01");
    const at = await middleOf(".react-flow__node", "Kettle controller");
    assert.ok(at);
    await mouse("mouseMoved", at.x, at.y);
    await mouse("mousePressed", at.x, at.y);
    for (let moved = 10; moved <= 60; moved += 10) await mouse("mouseMoved", at.x + moved, at.y, true);
    await mouse("mouseReleased", at.x + 60, at.y);
    await sleep(900);
    const after = (await stored()).tara.elements.find((e: { id: string }) => e.id === "C01");
    assert.ok(after.x > before.x, "the element moved to the right");
    assert.equal(after.boundaryId, before.boundaryId, "and is still inside its trust boundary");
  });

  await step("a file is looked at before it is taken in, and arrives as a new draft drawn from its records", async () => {
    const file = join(scratch, "kettle.tara.json");
    await writeFile(file, await (await fetch(`${base}/api/taras/example-kettle/export`)).text());
    await open("#/");
    // Choosing a file in the browser's own dialogue cannot be scripted; Chrome is handed the file instead.
    const { root: page } = (await command("DOM.getDocument")) as { root: { nodeId: number } };
    const { nodeId } = (await command("DOM.querySelector", { nodeId: page.nodeId, selector: 'input[type="file"]' })) as {
      nodeId: number;
    };
    await command("DOM.setFileInputFiles", { nodeId, files: [file] });
    await sleep(900);
    const plan = await textOf(".import-plan");
    assert.match(
      plan,
      /It comes in as "Example TARA: a kettle you can switch on from your phone \(imported\)", EX-TARA-000-IMPORT/,
    );
    assert.match(plan, /reviews keep their references and ask to be confirmed again/);
    assert.equal(await count(".tara-card"), 1, "nothing is stored yet");
    await click(".import-plan button.primary");
    const id = (await inPage<string>("location.hash")).split("/")[2];
    assert.notEqual(id, "example-kettle");
    await open(`#/tara/${id}/architecture?show=diagram`);
    assert.equal(await count(".react-flow__node"), 5, "the diagram is drawn although nobody arranged it");
    assert.match(await textOf(".route"), /to review/);
  });

  await step("on the graph a chosen record lights up its chain and shows its card", async () => {
    await open("#/tara/example-kettle/graph");
    const all = await count(".map-canvas .map-node");
    assert.ok(all > 15, "every record is drawn");
    assert.equal(await count(".map-node.map-dim"), 0);
    await click(".map-canvas .map-node", "R003");
    assert.match(await textOf(".map-inspector"), /R003[\s\S]*Open the record[\s\S]*Rests on/);
    const dim = await count(".map-node.map-dim");
    assert.ok(dim > 0 && dim < all, "what does not belong to the record steps back");
    await click(".map-inspector button", "Show only its links");
    assert.match(await inPage<string>("location.hash"), /focus=R003/);
    assert.ok((await count(".map-canvas .map-node")) < all, "only its chain is left");
  });

  await step("a view of one record draws what belongs to it, and is left to where it was entered", async () => {
    await open("#/tara/example-kettle/damages/DS-0003");
    await click(".detail .view-signs a:last-child");
    assert.match(decodeURIComponent(await inPage<string>("location.hash")), /graph\?view=ego:DS-0003/);
    // the ego view: the record as a block that shows what it is made of, with what is linked to it around it
    assert.match(await textOf(".rv-block"), /DS-0003[\s\S]*Lost[\s\S]*Safety/);
    assert.equal(await count(".rv-stage .rv-node"), 3, "its asset, itself and the threat that leads to it");
    assert.equal(await count(".rv-caption"), 2);
    await click(".rv-buttons a", "Asset view");
    assert.match(decodeURIComponent(await inPage<string>("location.hash")), /view=asset:A03/);
    assert.ok((await count(".rv-stage .rv-node")) >= 3);
    // leaving leads back the way one came: to the ego view, and from there to the list
    await click(".rv-buttons button.primary", "Leave");
    await sleep(400);
    assert.match(decodeURIComponent(await inPage<string>("location.hash")), /view=ego:DS-0003/);
    await click(".rv-buttons button.primary", "Leave");
    await sleep(400);
    assert.match(await inPage<string>("location.hash"), /\/damages\/DS-0003$/, "back in the list it was entered from");
  });

  await step("a record is amended in its card on a drawing", async () => {
    await open("#/tara/example-kettle/graph?view=asset:A03");
    await click('.rv-stage [data-record="DS-0003"]');
    assert.match(await textOf(".map-inspector"), /DS-0003[\s\S]*Impact rating/);
    await click(".map-inspector .card-edit");
    await click(".map-inspector .check", "Availability");
    await sleep(500);
    assert.equal((await stored()).tara.damages.find((d: { id: string }) => d.id === "DS-0003").availability, true);
    assert.match(await textOf(".rv-foot"), /Settled/);
    // taken back, so that the example is as it was for the checks that follow
    await click(".map-inspector .check", "Availability");
    await sleep(500);
    assert.equal((await stored()).tara.damages.find((d: { id: string }) => d.id === "DS-0003").availability, false);
  });

  await step("a list is shown with the links of its open record beside it", async () => {
    await open("#/tara/example-kettle/threats/TS003");
    await click(".view-choice a", "Page and links");
    assert.match(await inPage<string>("location.hash"), /threats\/TS003\?show=links/);
    assert.match(await textOf(".map-pane h2"), /Linked to TS003/);
    assert.ok((await count(".map-pane .map-node")) >= 4);
    await click(".map-pane .map-node", "R003");
    assert.match(await inPage<string>("location.hash"), /\/risks\/R003/, "choosing a linked record goes to it");
  });

  await step("every screen draws", async () => {
    const screens = [
      "scope",
      "items",
      "graph?focus=R003",
      "report",
      "report?show=release",
      "risks/R001?show=links",
      "method",
      "export",
      "document",
      "treatment/R001",
      "cra/CRA-a",
      "evidence/EV-001",
      "goals",
      "references/KT-DOC-00",
    ];
    for (const screen of screens) {
      await open(`#/tara/example-kettle/${screen}`);
      assert.equal(await count("main.step h1"), 1, screen);
    }
    await open("#/");
    assert.equal(await count(".tara-card"), 2);
    assert.equal(await count(".examples li"), 3);
  });

  await step("nothing went wrong inside the page", async () => {
    assert.deepEqual(chrome.errors, []);
  });

  console.log(`The screens work: ${passed} checks passed.`);
} finally {
  server.kill();
  chrome.process.kill();
  // Chrome may still be closing its profile: try a few times, and leave the folder to the system if it stays.
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
}
