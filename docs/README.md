# Documentation

These pages are the documentation of TARA workbench. They are kept with the code, as Markdown, and are published unchanged as the project's website: a change to the tool and the change to its documentation belong in the same commit.

## Using the tool

- [Getting started](getting-started.md): run the tool, read an example, start your own TARA.
- [The method](method.md): the steps of a TARA, how a risk value comes about, reviews and release.
- [The examples](examples.md): three worked TARAs of invented products, and what each one teaches.

## Your data

- [The data](data-format.md): the TARA document, the data folder, the history, backups, and editing a file by hand.
- [The checks](reference/checks.md): every status the tool can show, with its code. Written from the rule engine.

## Running it for others

- [Deployment](deployment.md): your own machine, a team server, and every setting.
- [Security](security.md): what the tool protects against, and what is left to you.

## Building on it

- [Architecture](architecture.md): how the code is laid out, how a change travels through it, and how to add a field, a check or a store.
- [The API](api.md): every route, with examples.
- [Dependencies](dependencies.md): what the project depends on, why, and how a dependency is added.
- [Decisions](decisions/README.md): the choices that shaped the tool, each with its reasons.
- [Roadmap](roadmap.md): what is not there yet.

## How these pages are written

Plain words, short sentences, and the tool's own terms: a "TARA" is one assessment, a "record" is one entry of it (an asset, a risk), a "step" is one screen of the method. Where the tool can show a thing, a page shows it with a picture taken from the tool itself (`npm run site:screenshots`). Pages that list what the code defines, such as the checks, are written by a script from the code, and a test fails when they fall behind.
