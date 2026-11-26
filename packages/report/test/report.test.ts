// The report, tested on the training examples and on an empty TARA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CUT, createTara, cutText, type Method, parseTara, SCOPE_NAMES, type Tara } from "@tara/core";
import { escapeHtml } from "../src/escape.ts";
import { type Block, buildReport, type Report, renderHtml, reportFileName, SECTION_ORDER } from "../src/index.ts";

const fromRoot = (path: string) => new URL(`../../../${path}`, import.meta.url);
const EXAMPLES = ["kettle", "door-lock", "gateway"] as const;
const example = (name: (typeof EXAMPLES)[number]): Tara =>
  parseTara(JSON.parse(readFileSync(fromRoot(`examples/${name}.json`), "utf8")));
const method: Method = JSON.parse(readFileSync(fromRoot("methods/open-tara-1.0.json"), "utf8"));
const emptyTara = (): Tara => createTara({ id: "empty", title: "Thermostat", method, now: "2026-11-25T10:00:00.000Z" });

const made = { generatedAt: "2026-11-25T18:00:00.000Z", generatedBy: "Ada Example" };
const TOOL = "http://localhost:8787/#/tara/example-kettle";

type Table = Extract<Block, { kind: "table" }>;
/** The table of a report with a given caption. */
function tableOf(report: Report, caption: string): Table {
  const found = report.sections.flatMap((s) => s.blocks).find((b): b is Table => b.kind === "table" && b.caption === caption);
  assert.ok(found, `the report has a table "${caption}"`);
  return found;
}
const section = (report: Report, key: string) => report.sections.find((s) => s.key === key);

test("the report builds and renders for every example and for a new, empty TARA", () => {
  for (const tara of [...EXAMPLES.map(example), emptyTara()]) {
    const report = buildReport(tara, made);
    const html = renderHtml(report);
    assert.ok(html.startsWith("<!doctype html>"), tara.id);
    assert.ok(html.trimEnd().endsWith("</html>"), tara.id);
    assert.equal(report.sections.length, SECTION_ORDER.length);
  }
});

test("the sections come in the documented order, with the titles the guides refer to", () => {
  const report = buildReport(example("kettle"), made);
  assert.deepEqual(
    report.sections.map((s) => s.title),
    [
      "Summary",
      "Where this document answers the CRA",
      "Document control",
      "Scope and applicability",
      "Method",
      "Item definition",
      "Assets and damage scenarios",
      "Impact ratings",
      "Threat scenarios",
      "Attack paths",
      "Attack feasibility ratings",
      "Risk values",
      "Risk treatment decisions",
      "Cybersecurity goals and claims",
      "Controls and control evidence",
      "Review and verification record",
      "CRA essential requirements",
      "Open points at the time of export",
      "References",
      "Traceability",
    ],
  );
  // each heading is in the page, numbered, in the same order
  const html = renderHtml(report);
  let from = 0;
  report.sections.forEach((s, i) => {
    const at = html.indexOf(`<h2 id="${s.key}">${i + 1}&ensp;`, from);
    assert.ok(at > from, `heading ${i + 1} follows the one before`);
    from = at;
  });
});

test("the kettle's risks show the values 4, 3, 5, 2, 1", () => {
  const rows = tableOf(buildReport(example("kettle"), made), "Risk of each threat scenario").rows;
  assert.deepEqual(
    rows.map((row) => [row[0], row[6]]),
    [
      ["R001", "4"],
      ["R002", "3"],
      ["R003", "5"],
      ["R004", "2"],
      ["R005", "1"],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row[7]),
    Array(5).fill("Reviewed"),
  );
});

test("a rating stands under the heading of what it rates, whatever order a method lists its parts in", () => {
  const kettle = example("kettle");
  const turned = structuredClone(kettle);
  turned.method.impact_categories.reverse();
  turned.method.feasibility_factors.reverse();
  for (const caption of ["Impact rating of each damage scenario", "Attack potential of each path that is not screened out"]) {
    const [asShipped, asTurned] = [kettle, turned].map((tara) => tableOf(buildReport(tara, made), caption));
    assert.deepEqual(
      asTurned?.columns.map((column) => column.header),
      asShipped?.columns.map((column) => column.header),
      caption,
    );
    assert.deepEqual(asTurned?.rows, asShipped?.rows, caption);
  }
});

test("a row of the scope has one name, on screen and in the report", () => {
  // The screens take the names from core too (apps/web/src/scopeLabels.ts): an open point reads the same in both.
  const open = tableOf(buildReport(emptyTara(), made), "Open points").rows.map((row) => row.join(" "));
  for (const name of Object.values(SCOPE_NAMES))
    assert.ok(
      open.some((row) => row.includes(name)),
      name,
    );
});

test("a finished example has no open points; a new TARA lists what it needs", () => {
  const finished = section(buildReport(example("kettle"), made), "open");
  assert.match(JSON.stringify(finished?.blocks), /No points are open/);
  const fresh = buildReport(emptyTara(), made);
  const points = tableOf(fresh, "Open points").rows;
  assert.ok(points.some((row) => row[0] === "Scope" && row[3] === "Input needed"));
  assert.match(JSON.stringify(section(fresh, "items")?.blocks), /No item is defined yet/);
});

test("work that follows from the assessment is listed: the door lock's proposed control", () => {
  const actions = tableOf(buildReport(example("door-lock"), made), "Work that follows from the assessment").rows;
  assert.deepEqual(
    actions.map((row) => row[0]),
    ["ACT-CTL-005"],
  );
});

test("a draft is marked as a draft, an example as an example, and a released TARA shows its release and signatures", () => {
  const draft = renderHtml(buildReport(example("kettle"), made));
  assert.match(draft, /<span class="mark draft">Draft<\/span>/);
  assert.match(draft, /DRAFT\. This assessment is not released\./);
  assert.match(draft, /<span class="mark example">Training example<\/span>/);
  assert.match(draft, /Revision 1\.0, draft/);

  const released = example("kettle");
  released.meta.status = "released";
  released.meta.releasedAt = "2026-11-24T09:30:00.000Z";
  released.meta.example = false;
  released.signoffs = [
    {
      role: "author",
      name: "Ada Lovelace",
      roleTitle: "Security engineer",
      evidenceRef: null,
      signedAt: "2026-11-23T10:00:00.000Z",
      fingerprint: null,
    },
    {
      role: "approver",
      name: "Grace Hopper",
      roleTitle: null,
      evidenceRef: null,
      signedAt: "2026-11-24T09:00:00.000Z",
      fingerprint: null,
    },
  ];
  const report = buildReport(released, made);
  const html = renderHtml(report);
  assert.equal(report.draft, false);
  assert.match(html, /<span class="mark released">Released<\/span>/);
  assert.match(html, /RELEASED\. Revision 1\.0 as frozen at release on 2026-11-24\./);
  assert.doesNotMatch(html, /mark draft|mark example|DRAFT\./);
  const signoff = tableOf(report, "Sign-off").rows;
  assert.deepEqual(
    signoff.map((row) => [row[0], row[1], row[4]]),
    [
      ["Author", "Ada Lovelace", "2026-11-23"],
      ["Reviewer", "-", "-"],
      ["Approver", "Grace Hopper", "2026-11-24"],
    ],
  );
  assert.equal(section(report, "open")?.title, "Open points");
});

test("text from the TARA is escaped, and only http and https addresses become links", () => {
  const tara = example("kettle");
  tara.meta.title = 'Kettle <script>alert("title")</script>';
  (tara.assets[0] as { name: string }).name = '<img src=x onerror="alert(1)"> & more';
  (tara.threats[0] as { description: string }).description = "</td><script>alert(2)</script>";
  // values a hand-edited file could hold: validation refuses them, the report must still not link them
  (tara.controls[0] as { workLink: string }).workLink = "javascript:alert(3)";
  (tara.references[0] as { location: string }).location = "javascript:alert(4)";
  (tara.references[1] as { location: string }).location = 'https://example.org/doc?a=1&b="2"';
  const html = renderHtml(buildReport(tara, { ...made, generatedBy: "<b>Mallory</b>" }));

  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<b>Mallory/);
  assert.doesNotMatch(html, /href\s*=\s*["']?\s*javascript:/i);
  assert.doesNotMatch(html, /onerror\s*=\s*"/i);
  assert.ok(html.includes("&#60;script&#62;alert(&#34;title&#34;)&#60;/script&#62;"));
  assert.ok(html.includes("javascript:alert(3)"), "the address is still shown, as text");
  assert.ok(
    html.includes('href="https://example.org/doc?a=1&#38;b="'),
    "an https address is a link, cut before the quotation mark",
  );
  // every attribute of the page is closed by its own quotation mark: none of the hostile text ends one early
  assert.doesNotMatch(html, /title="[^"]*<[^"]*"/);
});

test("the page loads nothing from elsewhere and runs nothing", () => {
  for (const name of EXAMPLES) {
    const html = renderHtml(buildReport(example(name), made));
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'/);
    // url(#…) names something inside the page (an arrowhead); any other url() would fetch
    for (const forbidden of [
      /<script/i,
      /<link/i,
      /<img/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /@import/i,
      /\ssrc\s*=/i,
      /url\((?!#)/i,
      /\son[a-z]+\s*=\s*["']/i,
    ]) {
      assert.doesNotMatch(html, forbidden, `${name}: ${forbidden}`);
    }
    // what is left of web addresses once the reader's own hyperlinks and hover texts are set aside: nothing
    const withoutLinks = html.replace(/<a class="out"[^>]*>/g, "").replace(/ title="[^"]*"/g, "");
    assert.doesNotMatch(withoutLinks, /https?:\/\//, name);
  }
});

test("with the tool's address IDs lead into the tool; without it they lead to where the record is defined", () => {
  const kettle = example("kettle");
  const kept = renderHtml(buildReport(kettle, made));
  assert.match(kept, /<a class="rec" href="#rec-TS001" title="[^"]*">TS001<\/a>/);
  assert.match(kept, /<tr id="rec-TS001">/);
  assert.match(kept, /<tr id="rec-CRA-a">/);
  assert.doesNotMatch(kept, /localhost/);
  assert.doesNotMatch(kept, /target="_top"/);

  const live = renderHtml(buildReport(kettle, { ...made, toolUrl: `${TOOL}/` }));
  assert.match(
    live,
    /<a class="rec" href="http:\/\/localhost:8787\/#\/tara\/example-kettle\/threats\/TS001" target="_top" title="[^"]*">TS001<\/a>/,
  );
  assert.ok(live.includes(`href="${TOOL}/risks/R003"`));
  assert.ok(live.includes(`href="${TOOL}/architecture/DF01"`));
  assert.ok(live.includes(`href="${TOOL}/goals/CG01"`));
  assert.ok(live.includes(`href="${TOOL}/references/KT-DOC-05"`));
  assert.ok(live.includes(`<a class="rec" href="${TOOL}/cra/CRA-a" target="_top"`), "a CRA requirement leads to its decision");
  assert.doesNotMatch(live, /href="#rec-/);
});

test("an ID is a link only where it stands alone", () => {
  const tara = example("kettle");
  (tara.threats[0] as { description: string }).description = "See AP001, not XAP001 or AP0019 or AP001-b.";
  const html = renderHtml(buildReport(tara, made));
  assert.match(html, /See <a class="rec" href="#rec-AP001"[^>]*>AP001<\/a>, not XAP001 or AP0019 or AP001-b\./);
});

test("the data flow diagram is drawn as arranged, with its trust boundary, and is laid out when nothing was placed", () => {
  const arranged = renderHtml(buildReport(example("kettle"), made));
  assert.match(arranged, /Item <a[^>]*>IT01<\/a>: data flow diagram/);
  assert.match(arranged, /stroke-dasharray="7 5"/);
  assert.match(arranged, /As arranged on the diagram in the tool/);

  const unplaced = example("kettle");
  for (const element of unplaced.elements) Object.assign(element, { x: null, y: null, w: null, h: null });
  const html = renderHtml(buildReport(unplaced, made));
  // Nobody arranged it (a TARA taken in from a file, say): it is laid out from the records, boundary and all.
  assert.match(html, /Laid out from the lists below/);
  assert.match(html, /stroke-dasharray="7 5"/, "the trust boundary is drawn around what is in it");
  assert.match(html, /marker-end="url\(#tip\)"/, "the flows are drawn, with their arrowheads");
});

test("no box of a figure hides text: a cut text ends after a whole word, with a mark, and its ID leads to it in full", () => {
  const tara = example("kettle");
  const long =
    "From any device on the same Wi-Fi, a guest's phone for instance, send the switch-on command over and over until the kettle obeys, " +
    "which as first built it does for whoever asks, without any check of who is asking.";
  (tara.paths[0] as { description: string }).description = long;
  const html = renderHtml(buildReport(tara, made));

  // In the trace of its risk the box has no room for all of it: the text is cut after a whole word, and marked.
  const shown = /(From any device on the same Wi-Fi[^<…]*)…/.exec(html)?.[1]?.replaceAll("&#39;", "'");
  assert.ok(shown, "the box shows the start of the text, and the mark");
  // what follows the cut in the full text is a space or a comma, never the rest of a word
  assert.ok(long.startsWith(shown) && /[\s,;:.]/.test(long[shown.length] ?? ""), `cut at the end of a word: "${shown}"`);
  assert.equal(cutText(long, 60).endsWith(CUT), true);
  // the row that defines the attack path holds the text whole, and the box's ID leads to it
  assert.ok(html.includes(escapeHtml(long)), "the whole text stands in the report");
  assert.match(html, /<a class="rec" href="#rec-AP001"[^>]*>AP001<\/a>/);
  // nothing in a figure is clipped by its box
  assert.doesNotMatch(html, /overflow:hidden/);
  assert.doesNotMatch(html, /text-overflow:ellipsis/);
});

test("what the mark of a cut text means is said under a figure, once in a section", () => {
  const note = "A text that ends in … is cut short for room. The ID in the same box leads to where it stands in full.";
  const times = (text: string) => text.split(note).length - 1;
  const sections = renderHtml(buildReport(example("gateway"), made))
    .split("<section>")
    .slice(1);
  assert.ok(
    sections.some((section) => times(section) === 1),
    "the gateway's traces hold texts that no box has room for",
  );
  for (const section of sections) assert.ok(times(section) <= 1, "said once in a section, not under each figure");

  // a report in which every text fits does not say it
  const short = example("kettle");
  for (const kind of ["damages", "threats", "paths"] as const) {
    for (const record of short[kind]) (record as { description: string }).description = "Short.";
  }
  for (const control of short.controls) Object.assign(control, { name: "Short", description: "Short." });
  for (const goal of short.goalClaims) (goal as { statement: string }).statement = "Short.";
  for (const asset of short.assets) (asset as { name: string }).name = "Short";
  assert.equal(times(renderHtml(buildReport(short, made))), 0);
});

/** The data flow diagram of a report: as content, and as it is drawn. */
function diagramOf(tara: Tara, options: Parameters<typeof buildReport>[1] = made) {
  const report = buildReport(tara, options);
  const blocks = report.sections.flatMap((section) => section.blocks);
  const figure = blocks.flatMap((block) => (block.kind === "figure" && block.figure.type === "network" ? [block.figure] : []))[0];
  assert.ok(figure, "the report has a data flow diagram");
  const drawn = renderHtml(report)
    .split('<figure class="drawing">')
    .find((each) => each.includes("data flow diagram</figcaption>"));
  assert.ok(drawn);
  /** The lines of the diagram, as the paths they are drawn with. */
  const lines = [...drawn.matchAll(/<path d="(M [^"]+)" fill="none"/g)].map((found) => found[1] as string);
  return { figure, drawn, lines };
}

test("the data flows of the diagram are drawn the way the report is asked for: straight, curved or stepped", () => {
  const flows = example("gateway").elements.filter((e) => e.kind === "data_flow").length;
  const straight = diagramOf(example("gateway"), { ...made, lines: "straight" });
  assert.equal(straight.figure.lines, "straight");
  assert.equal(straight.lines.length, flows, "one line for each data flow");
  for (const line of straight.lines) assert.match(line, /^M [-\d. ]+ L [-\d. ]+$/);

  const curved = diagramOf(example("gateway"), { ...made, lines: "curved" });
  assert.equal(curved.lines.length, flows);
  for (const line of curved.lines) assert.match(line, /^M [-\d. ]+ C [-\d. ]+$/);
  const unasked = diagramOf(example("gateway"));
  assert.equal(unasked.figure.lines, "curved", "curved, where nothing is asked for");
  assert.deepEqual(unasked.lines, curved.lines);

  const stepped = diagramOf(example("gateway"), { ...made, lines: "stepped" });
  assert.equal(stepped.lines.length, flows);
  for (const line of stepped.lines) assert.doesNotMatch(line, / C /);
  assert.ok(
    stepped.lines.some((line) => / Q /.test(line)),
    "a stepped line turns its corners",
  );

  // whichever way it is drawn, a line starts and ends on the sides of its two elements, and carries its ID
  for (const { figure, drawn, lines } of [straight, curved, stepped]) {
    const onASide = (x: number, y: number) =>
      figure.nodes.some(({ place: at }) => {
        const across = x >= at.x - 0.5 && x <= at.x + at.w + 0.5;
        const down = y >= at.y - 0.5 && y <= at.y + at.h + 0.5;
        const onEdge =
          [at.x, at.x + at.w].some((edge) => Math.abs(x - edge) < 0.6) ||
          [at.y, at.y + at.h].some((edge) => Math.abs(y - edge) < 0.6);
        return across && down && onEdge;
      });
    for (const line of lines) {
      const numbers = (line.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      assert.ok(onASide(numbers[0] ?? 0, numbers[1] ?? 0), `${figure.lines}: ${line} starts on a side`);
      assert.ok(onASide(numbers.at(-2) ?? 0, numbers.at(-1) ?? 0), `${figure.lines}: ${line} ends on a side`);
    }
    assert.match(drawn, />DF01</);
  }
});

test("several data flows between the same two elements stand side by side, however they are drawn", () => {
  const tara = example("kettle");
  const first = tara.elements.find((e) => e.kind === "data_flow");
  assert.ok(first);
  tara.elements.push({ ...first, id: "DF09", sourceId: first.targetId, targetId: first.sourceId });
  for (const lines of ["straight", "curved", "stepped"] as const) {
    const drawn = diagramOf(tara, { ...made, lines }).lines;
    assert.equal(new Set(drawn).size, drawn.length, `${lines}: no line lies on another`);
  }
});

test("an element that holds many assets is drawn taller, and the diagram is arranged for it", () => {
  const tara = example("kettle");
  for (const element of tara.elements) Object.assign(element, { x: null, y: null, w: null, h: null });
  for (let n = 5; n <= 40; n++) {
    tara.assets.push({
      id: `A${n}`,
      name: `Asset ${n}`,
      itemId: "IT01",
      elementIds: ["C01"],
      variant: null,
      coverageRationale: "None applies.",
    });
  }
  const { figure } = diagramOf(tara);
  const controller = figure.nodes.find((node) => node.id === "C01");
  const others = figure.nodes.filter((node) => node.id !== "C01");
  assert.ok(controller && others.every((node) => controller.place.h > node.place.h), "the controller is the tallest");
  for (const a of figure.nodes) {
    for (const b of figure.nodes) {
      if (a.id >= b.id) continue;
      const [p, q] = [a.place, b.place];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${a.id} and ${b.id} overlap`);
    }
  }
  const frame = figure.frames[0];
  assert.ok(
    frame && controller.place.y >= frame.y && controller.place.y + controller.place.h <= frame.y + frame.h,
    "and its boundary holds it",
  );
});

test("every asset that lives in an element is drawn in it: none is behind a count", () => {
  const tara = example("kettle");
  for (let n = 5; n <= 11; n++) {
    tara.assets.push({
      id: `A${String(n).padStart(2, "0")}`,
      name: `Asset ${n}`,
      itemId: "IT01",
      elementIds: ["C01"],
      variant: null,
      coverageRationale: "None applies.",
    });
  }
  const html = renderHtml(buildReport(tara, made));
  const diagram = html.split('<figure class="drawing">').find((figure) => figure.includes("data flow diagram</figcaption>"));
  assert.ok(diagram, "the report has the data flow diagram");
  for (let n = 5; n <= 11; n++)
    assert.ok(diagram.includes(`>A${String(n).padStart(2, "0")}<`), `A${n} is drawn in the controller`);
  assert.doesNotMatch(html, /and \d+ more/);
});

test("the report says which version of the tool and of its rules made it", () => {
  const html = renderHtml(buildReport(example("kettle"), { ...made, madeWith: "Open TARA workbench 0.1.0, rules 1.0.0" }));
  assert.match(html, /Made with<\/t[dh]>\s*<td[^>]*>Open TARA workbench 0\.1\.0, rules 1\.0\.0/);
});

test("the name of the report as a file holds letters, digits, dots and hyphens only", () => {
  const kettle = example("kettle");
  assert.equal(reportFileName(kettle), "EX-TARA-000-rev-1.0-draft");
  kettle.meta.status = "released";
  assert.equal(reportFileName(kettle), "EX-TARA-000-rev-1.0");
  kettle.meta.documentNumber = 'Doc / 7 (ä) "x"\r\n';
  kettle.meta.revision = "2.0 β";
  assert.match(reportFileName(kettle), /^[A-Za-z0-9.-]+$/);
  kettle.meta.documentNumber = null;
  assert.equal(
    reportFileName({ ...kettle, meta: { ...kettle.meta, revision: "1.1", status: "draft" } }),
    "example-kettle-rev-1.1-draft",
  );
});
