# Deployment

The tool is one process and one folder. This page covers running it on your own machine, sharing it with a team, and what to think about before putting it anywhere wider.

## On your own machine

This is what the tool does when you give it no settings: it listens on `127.0.0.1`, so only this machine can reach it, and keeps its data in `./data`.

```sh
npm install
npm start                 # builds the screens once, then serves them and the API on http://localhost:8787
```

or

```sh
mkdir data                # yours, so that the tool in the container may write to it
docker compose up         # the same, in a container; data in ./data
```

In the container the tool runs as user 1000, not as root, and the `data` folder must belong to that user. On Linux, a folder that Docker makes itself belongs to root: make it yourself before the first start, and if `id -u` gives another number than 1000, set the `user:` line in `compose.yaml` to your own. [The README](../README.md) lists the day-to-day commands.

To update, stop it, `git pull`, and start it again (`docker compose up --build` with Docker). Your data is not touched by an update: it is in the data folder, which belongs to you and not to the tool.

## Settings

All settings are environment variables, and all are optional.

| Variable             | Default                  | Meaning                                                                                                                                                                        |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TARA_DATA_DIR`      | `./data`                 | Where every TARA is kept. Back this folder up.                                                                                                                                 |
| `HOST`               | `127.0.0.1`              | The address the tool listens on. `127.0.0.1` means this machine only; `0.0.0.0` means every network interface.                                                                 |
| `PORT`               | `8787`                   | The port.                                                                                                                                                                      |
| `TARA_ALLOWED_HOSTS` | this machine's own names | The host names the tool may be reached by, comma-separated. A request under any other name is refused. Set it whenever `HOST` is not `127.0.0.1`.                              |
| `TARA_USER_HEADER`   | not set                  | The request header in which a reverse proxy passes on the name of the signed-in person, for example `X-Forwarded-User`. When set, the name people type in the tool is ignored. |
| `TARA_WEB_DIST`      | `apps/web/dist`          | The folder of the built screens.                                                                                                                                               |

`.env.example` lists them. The tool does not read a `.env` file itself; with Node.js 22 you can start it with `node --env-file=.env apps/server/src/main.ts`.

## For a team

Several people can work in the same installation, and in the same TARA at the same time. Each change is stored at once; an open page learns of other people's changes within a few seconds; and when two people change the same field, the second is told and shown the present state instead of overwriting the first.

**The tool has no sign-in of its own.** Whoever can reach it can read and change every TARA in it, under any name they type. So on a network it belongs behind something that does sign people in. The usual way:

```
people ──HTTPS──▶ reverse proxy, with your organisation's sign-in ──▶ TARA workbench on 127.0.0.1:8787
```

1. Run the tool on the server, listening on `127.0.0.1` (the default). Nothing but the proxy on the same machine can reach it.
2. Put a reverse proxy in front that terminates HTTPS and requires sign-in: for example nginx or Caddy with oauth2-proxy, or the access proxy your organisation already uses.
3. Have the proxy pass the signed-in person's name in a header, and tell the tool which: `TARA_USER_HEADER=X-Forwarded-User`. The history, the reviews and the signatures then carry verified names. Make sure the proxy removes that header from incoming requests, so that nobody can send their own.
4. Tell the tool the name it is reached by: `TARA_ALLOWED_HOSTS=tara.example.org`.

A sketch for nginx with oauth2-proxy:

```nginx
server {
  listen 443 ssl;
  server_name tara.example.org;

  location / {
    auth_request /oauth2/auth;
    auth_request_set $user $upstream_http_x_auth_request_email;
    proxy_set_header X-Forwarded-User $user;   # set by the proxy, never taken from the request
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:8787;
  }
  # … the /oauth2/ locations of oauth2-proxy
}
```

With Docker, run the proxy as a second service in `compose.yaml` and do not publish the tool's port at all: the proxy reaches it over the compose network by its service name, `tara:8787`, and you set `TARA_ALLOWED_HOSTS` to the public name.

Everyone who can sign in can do everything. The tool has no roles. If some people should only read, give them the report.

### As a service

A systemd unit, for a server without Docker:

```ini
[Unit]
Description=TARA workbench
After=network.target

[Service]
User=tara
WorkingDirectory=/opt/tara-workbench
Environment=TARA_DATA_DIR=/var/lib/tara
Environment=TARA_ALLOWED_HOSTS=tara.example.org
Environment=TARA_USER_HEADER=X-Forwarded-User
ExecStart=/usr/bin/node apps/server/src/main.ts
Restart=on-failure
# The tool needs to write to its data folder and nowhere else.
ProtectSystem=strict
ReadWritePaths=/var/lib/tara
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Run `npm ci && npm run build` in `/opt/tara-workbench` once, and again after each update.

### One process

Run one process per data folder. The tool makes changes to a TARA one after the other inside its own process; two processes on the same folder would not see each other and could overwrite each other's work. One process is ample: a TARA is a small document, and the work per change is a few milliseconds.

## Backups

The data folder is the whole state. Back it up the way you back up any folder of documents: a nightly copy, a snapshot, `rsync`, `restic`.

- A copy taken while the tool runs is safe to restore from. Each `tara.json` is replaced in one step, so a copy never holds half a document. If a copy catches the history one change ahead of the document, the tool completes that change when it next opens the TARA.
- Test the restore once: copy the backup to another machine, point `TARA_DATA_DIR` at it, and open a TARA.
- A released TARA is part of a product's technical documentation, which the CRA asks manufacturers to keep for at least ten years after the product is placed on the market. Keep the released `tara.json` and the issued report (`files/releases/…/report.html`) with it. Both are plain files that need no tool to be read.

## Moving to the cloud

Nothing in the tool is tied to a place: it is a Node.js process that reads its settings from the environment and its data from a folder. Before you put it on a machine you do not control, decide these:

| Question             | What to do                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who can reach it?    | Keep it behind sign-in, as for a team. Never publish the port directly.                                                                                                                                          |
| Where is the data?   | A persistent volume mounted at `TARA_DATA_DIR`, encrypted at rest, in a region you are allowed to use. A container's own file system is lost when the container is replaced.                                     |
| How many copies run? | One. Platforms that start several copies of a service need to be told to run exactly one, or the store needs replacing by one built for it ([Architecture](architecture.md), "Keeping the data somewhere else"). |
| Who did what?        | With `TARA_USER_HEADER` the history carries the names your sign-in verified.                                                                                                                                     |
| What about roles?    | The tool has none. If you need them, that is the first thing to build.                                                                                                                                           |

An assessment of a product's weaknesses is sensitive. Treat an installation that holds real TARAs accordingly, and read [Security](security.md) first.
