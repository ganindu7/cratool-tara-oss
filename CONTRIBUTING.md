# Contributing

Thank you for wanting to make this tool better. This page says how to propose a change and what a change needs before it can be merged.

## Before you start

- **A bug**: open an issue with what you did, what happened and what you expected. If it concerns the security of the tool, do not open an issue; see [SECURITY.md](SECURITY.md).
- **A small fix** (a typo, a wrong sentence, an obvious fault): send a pull request.
- **Anything larger**: open an issue first and say what you have in mind. It saves you from building something that cannot be merged. [The roadmap](docs/roadmap.md) says what is likely and what is not planned.

## Setting up

You need Node.js 22.18 or later.

```sh
git clone https://github.com/ganindu7/cratool-tara-oss.git
cd cratool-tara-oss
npm install
npm run dev        # http://localhost:5173
```

[Architecture](docs/architecture.md) explains how the code is laid out and walks through the common changes.

## What a change needs

1. **It passes `npm run check`**: types, lint, tests, the licence inventory, and the generated documents.
2. **It has a test** that fails without it.
3. **Its documentation is changed with it.** The website is built from `docs/`; a page that no longer matches the tool is wrong in public.
4. **It keeps the rules** listed in [AGENTS.md](AGENTS.md), "Rules that must hold". The short version: the rule engine stays pure, a TARA changes only through `applyChanges`, only the store touches the data, nothing computed is stored.
5. **It adds no dependency** without the reasons [Dependencies](docs/dependencies.md) asks for.
6. **It contains no text of a licensed standard**, and nothing you do not have the right to contribute.

If a screen changed, run `npm run build && npm run site:screenshots` and include the new pictures.

## How the code is written

- A comment at the top of each file says what it is for; a comment on each export says what it does and, where it matters, why.
- Plain words. Messages to people say what happened and what to do.
- `npm run format` formats; do not format by hand.

## Commits and pull requests

- One change per pull request. Say what it does and why in the description; link the issue.
- Commit messages say what changed in a sentence, as a person would say it: "A removed asset is taken out of the damage scenarios that named it".
- By contributing you agree that your contribution is licensed under the Apache License 2.0, as the rest of the project is (section 5 of the licence).

## Changes to the method

The scoring method and the checks decide what an assessment says. A change to either is discussed in an issue first, states which results it changes in the three examples, and raises `RULES_VERSION`.
