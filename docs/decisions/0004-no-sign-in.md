# 0004: No sign-in of its own

## Decided

The tool has no accounts, passwords, sessions or roles. By default it can be reached from its own machine only. A person gives a name, which labels their changes. Where several people share an installation, sign-in is done by a reverse proxy in front of the tool, which passes on the verified name in a header (`TARA_USER_HEADER`).

## Why

- **The first use is one person on one machine.** There, sign-in is an obstacle with no benefit.
- **Organisations already have sign-in.** A second account system is one more thing to keep safe, and people's names in it would be less trustworthy than those the organisation already verifies.
- **A weak sign-in is worse than none**, because people would trust it. Storing passwords, resetting them, limiting attempts and protecting sessions is a product in itself. Not having it means not having its flaws.
- **It keeps the tool small.** There is no user table, no session store, no secret to configure.

## What it costs

- On a network, the tool must not be exposed without a proxy that signs people in. The tool says so when it is started on a network address, and the documentation says how.
- There are no roles: everyone who can reach the tool can do everything in it.
- Without the proxy, the names in the history are what people typed.

What the tool does do by itself is listed in [Security](../security.md): it refuses requests from other sites and under other host names, so that a page elsewhere cannot reach a tool on your machine through your browser.
