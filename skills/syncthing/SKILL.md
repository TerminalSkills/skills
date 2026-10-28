---
name: syncthing
description: >-
  Syncthing keeps folders identical across your own computers and servers over encrypted peer-to-peer connections, with no cloud account or central server. Use when a user wants to "sync a folder between two machines", "replace Dropbox with something self-hosted", "back up a laptop folder to a server", "add a device or folder from the command line", "check whether a remote device is fully synced", or "ignore files in a synced folder". Covers installation, headless setup, the syncthing cli and the REST API.
license: Apache-2.0
compatibility: "Linux, macOS or Windows; Syncthing 2.x (CLI subcommands `syncthing cli`); Docker optional"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "syncthing, file-sync, peer-to-peer, self-hosted, backup"
  repository: https://github.com/syncthing/syncthing
---

# Syncthing — continuous peer-to-peer folder sync

## Overview

Syncthing runs as a background service on each machine. Every machine has a device ID derived from its certificate. Two devices sync a folder only after each has added the other's device ID and shared the folder with it. Traffic is TLS-encrypted between devices, and devices find each other through discovery servers, the local network, or fixed addresses you provide. Nothing is stored in a third-party cloud.

An agent works with Syncthing through three interfaces, never by clicking the GUI:

- `syncthing generate` / `serve` / `device-id` / `paths` to create keys and run the service.
- `syncthing cli ...` (version 2.x) to read status and change the configuration of a running instance.
- The REST API on the GUI address, authenticated with the `X-API-Key` header, for completion, scans and ignore patterns.

Folder types: `sendreceive` (two-way), `sendonly` (this device is the source of truth, remote changes are not applied), `receiveonly` (this device never pushes changes out). Syncthing is file synchronization, not versioned backup: a deletion on one side is replicated unless you enable file versioning on the folder.

## Instructions

### Installation

Prefer the system package manager (`apt install syncthing`, `brew install syncthing`, `dnf install syncthing`, `pacman -S syncthing`). Packages can lag behind; check with `syncthing --version`. The `cli` subcommands below need 2.x.

For a pinned release, download the tarball and the signed checksum list from the project's GitHub releases, compare, then extract:

```bash
VER=v2.1.7
cd "$(mktemp -d)" || exit 1
curl -fsSLO https://github.com/syncthing/syncthing/releases/download/$VER/syncthing-linux-amd64-$VER.tar.gz
curl -fsSLO https://github.com/syncthing/syncthing/releases/download/$VER/sha256sum.txt.asc
grep "syncthing-linux-amd64-$VER.tar.gz" sha256sum.txt.asc && sha256sum syncthing-linux-amd64-$VER.tar.gz
tar xzf syncthing-linux-amd64-$VER.tar.gz
install -m 0755 syncthing-linux-amd64-$VER/syncthing "$HOME/.local/bin/syncthing"
syncthing --version
```

The two hashes must be identical. Docker works too (`docker run -d --name syncthing -p 127.0.0.1:8384:8384 -p 22000:22000/tcp -v syncthing-config:/var/syncthing syncthing/syncthing`), but then paths in `folders add` are paths inside the container.

### First start and service

```bash
syncthing generate                 # creates keys and config.xml, prints the device ID
syncthing device-id                # show this device's ID again
syncthing paths                    # where config, keys and database live
syncthing serve --no-browser       # run in the foreground
```

On Linux, run it as a user service so it starts on login or boot: the packages ship `syncthing@.service`; `systemctl enable --now syncthing@alice.service` runs it as user `alice`. The unit starts `/usr/bin/syncthing`, so a tarball install needs the binary copied there (or a systemd drop-in that changes `ExecStart`); the tarball also contains the unit files under `etc/linux-systemd/`. Config and keys are in the config directory shown by `syncthing paths`. Use `--home=DIR` (or `STHOMEDIR`) to run an isolated instance, which is also the safest way to test.

### Lock down the GUI and API

By default the GUI and REST API listen on `127.0.0.1:8384` without a password. Keep that address. Do not set it to `0.0.0.0` unless a password is set and TLS is on, because the API key gives full control, including reading and changing every synced folder.

```bash
syncthing generate --gui-user=alice --gui-password=-      # reads the password from stdin
# or, on a running instance
syncthing cli config gui user set alice
syncthing cli config gui password set "$SYNCTHING_GUI_PASSWORD"   # stored as a bcrypt hash
syncthing cli config gui raw-use-tls set true                     # GUI restarts on https
```

Changing the GUI user, password or TLS setting restarts the GUI listener, and a command sent in that instant fails with `connection refused`. Run these one at a time, pause a second between them, set the password before enabling TLS, and re-run a failed one. After TLS is on, plain `http://` requests no longer work. To reach the GUI of a remote server, use an SSH tunnel (`ssh -L 8384:127.0.0.1:8384 server`) rather than exposing it.

For private setups you may also turn off services that contact the public internet: `syncthing cli config options global-ann-enabled set false`, `relays-enabled set false`, `natenabled set false`. Then devices need explicit addresses (below).

### Pair two devices and share a folder

Do each step on both machines. Exchange only device IDs, never keys.

```bash
# on desktop (source of the photos)
syncthing cli config devices add --device-id "$LAPTOP_ID" --name laptop --addresses dynamic
syncthing cli config folders add --id photos-2026 --label Photos --path "$HOME/Pictures/2026" --type sendonly
syncthing cli config folders photos-2026 devices add --device-id "$LAPTOP_ID"

# on laptop
syncthing cli config devices add --device-id "$DESKTOP_ID" --name desktop --addresses dynamic
syncthing cli config folders add --id photos-2026 --label Photos --path "$HOME/Pictures/2026" --type receiveonly
syncthing cli config folders photos-2026 devices add --device-id "$DESKTOP_ID"
```

`--addresses` takes `dynamic` (discovery) or fixed ones such as `tcp://192.168.1.20:22000`. The folder `id` must be the same on both sides. `syncthing cli config devices list` and `... folders list` show what is configured; `... folders photos-2026 dump-json` shows one folder in full. The `cli` command reads the GUI address and API key from the same config directory, so pass `--home` when you used it for `serve`. Changes apply to the running instance at once.

Instead of creating the folder by hand on the second device, the agent can add the device, then let the first device share: the second sees a pending request (`syncthing cli show pending folders`) and accepts by running the `folders add` above.

### Check status

```bash
syncthing cli show system              # myID, uptime, listen status
syncthing cli show connections         # connected: true/false, address, crypto
syncthing cli show pending devices     # devices that tried to connect and are not yet accepted
syncthing cli errors show              # pending errors
```

REST calls need the API key. Read it from the config (`syncthing cli config gui dump-json`, field `apiKey`, or `config.xml`) into an environment variable instead of pasting it into commands or logs:

```bash
export ST_URL=http://127.0.0.1:8384
export ST_KEY=...   # from the GUI settings or config.xml
curl -s -H "X-API-Key: $ST_KEY" "$ST_URL/rest/system/ping"
curl -s -H "X-API-Key: $ST_KEY" "$ST_URL/rest/db/status?folder=photos-2026"
curl -s -H "X-API-Key: $ST_KEY" "$ST_URL/rest/db/completion?folder=photos-2026&device=$LAPTOP_ID"
```

A request without the header is answered with `CSRF Error`. `db/status` returns `state` (`idle`, `scanning`, `syncing`), `globalFiles`, `localFiles`, `needFiles`, `errors`. `db/completion` returns `completion` as a percentage plus `needBytes` and `needItems` for that remote device: synced means `completion` 100 and `needItems` 0. Trigger a rescan with `curl -X POST -H "X-API-Key: $ST_KEY" "$ST_URL/rest/db/scan?folder=photos-2026"`.

### File versioning

Syncing replicates deletions, so keep old versions on the device that acts as the safety copy. Versioning keeps files that a sync would delete or overwrite in `.stversions` inside the folder.

```bash
syncthing cli config folders photos-2026 versioning type set staggered
syncthing cli config folders photos-2026 versioning params set maxAge 2592000   # seconds, 30 days
syncthing cli config folders photos-2026 versioning dump-json
```

Other types are `simple`, `trashcan` and `external`; see the versioning docs for their parameters.

### Ignore patterns

Patterns live in `.stignore` at the folder root and are never synced themselves. Use the API to read or replace them:

```bash
curl -s -X POST -H "X-API-Key: $ST_KEY" -H "Content-Type: application/json" \
  -d '{"ignore": ["(?d).DS_Store", "*.tmp", "/raw-exports"]}' \
  "$ST_URL/rest/db/ignores?folder=photos-2026"
curl -s -H "X-API-Key: $ST_KEY" "$ST_URL/rest/db/ignores?folder=photos-2026"
```

The POST writes `.stignore` and returns the expanded patterns. `*.tmp` matches in any directory, a leading `/` anchors to the folder root, `!` negates, `(?d)` allows Syncthing to delete the ignored file when it blocks removal of a directory, and `(?i)` makes a pattern case-insensitive. The first matching line wins, so put negations before the general pattern. Ignoring a file does not delete it from other devices that already have it.

## Examples

### Example 1: Mirror a laptop's Documents folder to a home server as a one-way copy

Request: "Copy ~/Documents from my laptop to the NAS, but a deletion on the NAS must never touch the laptop."

On the laptop (`LAPTOP_ID` and `NAS_ID` come from `syncthing device-id` on each machine):

```bash
syncthing cli config devices add --device-id "$NAS_ID" --name nas --addresses tcp://192.168.1.50:22000
syncthing cli config folders add --id docs-laptop --label Documents --path "$HOME/Documents" --type sendonly
syncthing cli config folders docs-laptop devices add --device-id "$NAS_ID"
```

On the NAS:

```bash
syncthing cli config devices add --device-id "$LAPTOP_ID" --name laptop --addresses dynamic
syncthing cli config folders add --id docs-laptop --label Documents --path /srv/backup/laptop-documents --type receiveonly
syncthing cli config folders docs-laptop devices add --device-id "$LAPTOP_ID"
```

Check with `syncthing cli show connections` (the other device shows `"connected": true`) and `curl -s -H "X-API-Key: $ST_KEY" "$ST_URL/rest/db/completion?folder=docs-laptop&device=$NAS_ID"` on the laptop. When the answer shows `"completion": 100`, the copy is finished. If someone edits a file on the NAS, the folder shows as locally changed; it is not sent back.

### Example 2: Keep source-only junk out of a shared project folder

Request: "Two of us sync ~/work/site. Do not sync node_modules, build output or .env, but sync everything else."

```bash
curl -s -X POST -H "X-API-Key: $ST_KEY" -H "Content-Type: application/json" \
  -d '{"ignore": ["node_modules", "/dist", ".env", "*.log"]}' \
  "$ST_URL/rest/db/ignores?folder=site-work"
```

The response lists the expanded patterns and `error: null`. Run the same call on the other machine: `.stignore` is not synced, so each side keeps its own. Afterwards `curl ... /rest/db/status?folder=site-work` shows the `globalFiles` count dropping to the files that are still shared.

## Guidelines

- Verify the device ID you add. Anyone whose ID you accept and share a folder with can read it (and write to it unless it is `sendonly` on your side).
- Pick the folder type deliberately. `sendreceive` propagates deletions both ways; use `sendonly` plus `receiveonly` for one-way copies. Syncthing is not a backup by itself: turn on file versioning for the folder, and keep a real backup too.
- Never expose the GUI/API on a public interface; it controls the whole machine's synced data. Keep `127.0.0.1`, or use TLS and a password, or an SSH tunnel.
- Keep the API key in an environment variable. Do not print the config or paste the key into logs; the same file holds the key.
- `cli` subcommands exist in 2.x. If `syncthing cli --help` fails, upgrade or use the REST API (`/rest/config/devices`, `/rest/config/folders`).
- Do not point two folders at nested paths, and do not move a synced folder's files around while the service is stopped unless you recreate the `.stfolder` marker that Syncthing uses to detect an unmounted disk.
- Do not use it for live databases or files that are written constantly; sync a dump or snapshot instead. For tens of millions of tiny files, check RAM first.
- Without discovery or relays two devices behind separate NATs may not connect; open TCP/UDP 22000 or give a reachable address.
