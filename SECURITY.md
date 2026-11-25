# Security policy

## Reporting a vulnerability

Please report a vulnerability in TARA workbench privately, not in a public issue.

Use GitHub's private reporting: on the repository's page, open **Security**, then **Report a vulnerability**. Say what you found, how to reproduce it, and what an attacker could do with it.

You will get an answer within seven days. If the report is confirmed, a fix is prepared in private, released, and described in the changelog with credit to you, unless you prefer otherwise. Please give us a reasonable time to fix it before you publish.

## What counts

The tool is built for a person's own machine, or a team's server behind the organisation's sign-in. [docs/security.md](docs/security.md) says what it protects against. A flaw in any of those protections is a vulnerability, for example:

- a web page on another site reaching a tool that runs on the visitor's machine;
- text entered into a TARA running as script in the tool or in the report;
- a request that reads or writes outside the data folder;
- a change that gets past validation, or alters a released TARA.

These are not vulnerabilities, because the tool says plainly that it does not do them:

- that anyone who can reach the tool can read and change everything in it (it has no sign-in of its own);
- that someone who can write to the data folder can change the files.

## Supported versions

Fixes are made to the latest release.

## Dependencies

What the tool depends on is listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). If you find that a vulnerability in one of them affects the tool, report it the same way.
