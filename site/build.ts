// Builds the project's website into site/dist: the start page, and one page for every Markdown file in docs/.
//
//   npm run site
//
// The documentation is not copied or rewritten for the site: the pages are made from docs/*.md as they are,
// so what is on the website is what is in the repository. The navigation is read from docs/README.md, the
// same list a person reads on GitHub. GitHub Pages publishes site/dist on every change to main
// (.github/workflows/pages.yml).
//
// Every link the pages contain to another page or picture is checked: a link that leads nowhere fails the build.
// All links are relative, so the site works under any address without being told what it is.

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve } from "node:path";
import { marked } from "marked";

const root = resolve(import.meta.dirname, "..");
const docs = join(root, "docs");
const out = join(import.meta.dirname, "dist");

const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  version: string;
  repository: { url: string };
};
/** The address of the repository, for links to files that are not part of the documentation. */
const REPOSITORY = process.env.SITE_REPOSITORY ?? manifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

interface Page {
  /** The Markdown file, relative to docs/, with forward slashes: "decisions/README.md". */
  source: string;
  /** The page it becomes, relative to the site's docs/ folder: "decisions/index.html". */
  target: string;
  title: string;
  markdown: string;
}

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** A heading as the anchor it gets: "How a change travels" gives "how-a-change-travels". */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
/** README.md is the index of its folder; every other file keeps its name. */
const targetOf = (source: string): string => source.replace(/(^|\/)README\.md$/, "$1index.html").replace(/\.md$/, ".html");

async function markdownFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== "images") found.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith(".md")) found.push(relative(docs, path).split("\\").join("/"));
  }
  return found.sort();
}

async function readPages(): Promise<Page[]> {
  const pages: Page[] = [];
  for (const source of await markdownFiles(docs)) {
    const markdown = await readFile(join(docs, source), "utf8");
    const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim();
    if (!title) throw new Error(`docs/${source} has no "# Title" line.`);
    pages.push({ source, target: targetOf(source), title, markdown });
  }
  // The changelog lives at the root of the repository, where people look for it, and is a page of the site too.
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  pages.push({ source: "changelog.md", target: "changelog.html", title: "Changelog", markdown: changelog });
  return pages;
}

/** The navigation: the groups and links of docs/README.md, in its order. */
function readNavigation(index: Page, pages: Page[]): { group: string; entries: Page[] }[] {
  const groups: { group: string; entries: Page[] }[] = [];
  for (const line of index.markdown.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) groups.push({ group: (heading[1] as string).trim(), entries: [] });
    const link = /^- \[[^\]]+\]\(([^)#]+\.md)\)/.exec(line);
    const page = link && pages.find((p) => p.source === posix.normalize(link[1] as string));
    if (page && groups.length > 0) groups.at(-1)?.entries.push(page);
  }
  return groups.filter((g) => g.entries.length > 0);
}

/** The path from one page to another, both relative to docs/: from "decisions/index.html" to "method.html" is "../method.html". */
const pathBetween = (from: string, to: string): string => posix.relative(posix.dirname(from), to) || posix.basename(to);

interface Rendered {
  html: string;
  /** The h2 headings of the page, for "On this page". */
  sections: { id: string; text: string }[];
  /** Every local link and picture of the page, as a path relative to docs/. */
  links: string[];
}

/** One Markdown page as HTML, with its links pointed at the site's pages. */
function render(page: Page): Rendered {
  const sections: Rendered["sections"] = [];
  const links: string[] = [];
  const here = posix.dirname(page.source);
  /** Where a link of this page leads on the site. */
  const resolveLink = (href: string): string => {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    const [path = "", anchor] = href.split("#");
    const absolute = posix.normalize(posix.join(here, path));
    // A link out of docs/ leads to a file of the repository, which the site does not hold.
    if (absolute.startsWith("..")) return `${REPOSITORY}/blob/main/${absolute.replace(/^(\.\.\/)+/, "")}`;
    links.push(absolute);
    const target = absolute.endsWith(".md") ? targetOf(absolute) : absolute;
    return pathBetween(page.target, target) + (anchor ? `#${anchor}` : "");
  };

  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = marked.Parser.parseInline(tokens);
    const id = slug(text);
    if (depth === 2) sections.push({ id, text: text.replace(/<[^>]+>/g, "") });
    return depth === 1 ? `<h1>${text}</h1>\n` : `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  renderer.link = ({ href, tokens }) => `<a href="${escapeHtml(resolveLink(href))}">${marked.Parser.parseInline(tokens)}</a>`;
  renderer.image = ({ href, text }) =>
    `<figure><img src="${escapeHtml(resolveLink(href))}" alt="${escapeHtml(text)}" loading="lazy"><figcaption>${escapeHtml(text)}</figcaption></figure>`;
  // A table can be wider than a narrow screen: it scrolls inside its own frame, and the page does not.
  renderer.table = function (token) {
    return `<div class="table">${marked.Renderer.prototype.table.call(this, token)}</div>`;
  };
  const html = marked.parse(page.markdown, { renderer, async: false, gfm: true });
  // A picture alone in a paragraph is a figure, not a paragraph.
  return { html: html.replace(/<p>(<figure>.*?<\/figure>)<\/p>/gs, "$1"), sections, links };
}

function documentPage(page: Page, rendered: Rendered, navigation: ReturnType<typeof readNavigation>): string {
  const up = pathBetween(`docs/${page.target}`, "index.html").replace(/index\.html$/, "");
  const nav = navigation
    .map(
      (group) =>
        `<section><h2>${escapeHtml(group.group)}</h2><ul>${group.entries
          .map((entry) => {
            const current = entry.source === page.source;
            return `<li><a href="${pathBetween(page.target, entry.target)}"${current ? ' aria-current="page"' : ""}>${escapeHtml(entry.title)}</a></li>`;
          })
          .join("")}</ul></section>`,
    )
    .join("");
  const onThisPage =
    rendered.sections.length > 2
      ? `<nav class="on-this-page" aria-label="On this page"><h2>On this page</h2><ul>${rendered.sections
          .map((s) => `<li><a href="#${s.id}">${escapeHtml(s.text)}</a></li>`)
          .join("")}</ul></nav>`
      : "";
  const editPath = page.source === "changelog.md" ? "CHANGELOG.md" : `docs/${page.source}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · TARA workbench</title>
<link rel="icon" href="${up}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}assets/site.css">
</head>
<body class="doc">
<header class="masthead">
  <a class="brand" href="${up}index.html">TARA<span>workbench</span></a>
  <nav aria-label="Site">
    <a href="${pathBetween(page.target, "getting-started.html")}">Get started</a>
    <a href="${pathBetween(page.target, "index.html")}" aria-current="true">Documentation</a>
    <a href="${REPOSITORY}">GitHub</a>
  </nav>
</header>
<div class="doc-frame">
  <nav class="doc-nav" aria-label="Documentation">${nav}</nav>
  <main class="prose">
${rendered.html}
    <p class="edit"><a href="${REPOSITORY}/blob/main/${editPath}">This page is ${editPath} in the repository.</a></p>
  </main>
  ${onThisPage}
</div>
</body>
</html>
`;
}

// ------------------------------------------------------------------------------------------------- build

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "assets"), { recursive: true });

const pages = await readPages();
const index = pages.find((p) => p.source === "README.md");
if (!index) throw new Error("docs/README.md is missing: the navigation is read from it.");
const navigation = readNavigation(index, pages);
navigation.push({ group: "Project", entries: pages.filter((p) => p.source === "changelog.md") });

const known = new Set(pages.map((p) => p.source));
const pictures = new Set((await readdir(join(docs, "images")).catch(() => [])).map((name) => `images/${name}`));
const broken: string[] = [];
const unlisted = pages.filter(
  (p) => !navigation.some((g) => g.entries.includes(p)) && p.source !== "README.md" && !p.source.startsWith("decisions/0"),
);

for (const page of pages) {
  const rendered = render(page);
  for (const link of rendered.links) {
    if (!known.has(link) && !pictures.has(link)) broken.push(`docs/${page.source} links to ${link}, which does not exist.`);
  }
  const target = join(out, "docs", page.target);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, documentPage(page, rendered, navigation));
}
if (broken.length > 0) throw new Error(`Broken links:\n${broken.join("\n")}`);
for (const page of unlisted)
  console.warn(`docs/${page.source} is not linked from docs/README.md, so it is not in the navigation.`);

// The start page: written by hand (site/src/home.html), with the version filled in.
const home = (await readFile(join(import.meta.dirname, "src/home.html"), "utf8"))
  .replaceAll("{{version}}", manifest.version)
  .replaceAll("{{repository}}", REPOSITORY);
for (const [, href] of home.matchAll(/(?:href|src)="((?:docs|assets)\/[^"#]+)/g)) {
  const path = href as string;
  const isPage = path.startsWith("docs/") && path.endsWith(".html") && pages.some((p) => `docs/${p.target}` === path);
  const isPicture = path.startsWith("docs/images/") && pictures.has(path.slice("docs/".length));
  if (!isPage && !isPicture && !path.startsWith("assets/")) broken.push(`The start page links to ${path}, which does not exist.`);
}
if (broken.length > 0) throw new Error(`Broken links:\n${broken.join("\n")}`);
await writeFile(join(out, "index.html"), home);

await cp(join(import.meta.dirname, "src/site.css"), join(out, "assets/site.css"));
await cp(join(root, "apps/web/public/favicon.svg"), join(out, "assets/favicon.svg"));
await cp(join(docs, "images"), join(out, "docs/images"), { recursive: true });
// Tells GitHub Pages to publish the files as they are.
await writeFile(join(out, ".nojekyll"), "");

console.log(`Built the website: the start page and ${pages.length} pages of documentation, in site/dist.`);
