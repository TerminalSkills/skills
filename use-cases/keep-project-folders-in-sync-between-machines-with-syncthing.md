---
title: Keep Project Folders in Sync Between Machines with Syncthing
slug: keep-project-folders-in-sync-between-machines-with-syncthing
description: Keep a freelancer's working folders identical on a desktop, a laptop and a home server over encrypted peer-to-peer sync, with no cloud subscription and a one-way copy for safety.
skills:
  - syncthing
  - systemd
  - ssh
category: productivity
tags:
  - file-sync
  - self-hosted
  - peer-to-peer
  - backup
  - remote-work
---

# Keep Project Folders in Sync Between Machines with Syncthing

## The Problem

Tomasz Nowak is a freelance motion designer. He works on a desktop at home and on a laptop at client sites, and his project folder, `~/Projects`, holds about 85 GB of After Effects files, fonts and exports. For two years he has carried it around on a USB drive and copied it by hand; twice he copied in the wrong direction and overwrote a day of work. Cloud sync would cost $20 a month for the storage he needs, and his clients' NDAs make him uneasy about putting footage on a third-party service. He also has an old mini-PC in a cupboard that could hold a safety copy.

He needs the two machines to stay identical without thinking about it, plus a copy on the mini-PC that nothing he deletes by accident can reach back and damage.

## The Solution

Run Syncthing on all three machines. Desktop and laptop share the folder two ways. The mini-PC receives a copy of the same folder as `receiveonly`, so it never pushes changes back. Everything goes over encrypted device-to-device connections with no account. The agent drives Syncthing through its command line and REST API. The `systemd` skill keeps it running on the mini-PC, and `ssh` provides a tunnel to its GUI so the interface is never exposed to the network.

## Step-by-Step Walkthrough

### Step 1: Install and start Syncthing on each machine

Prompt: "Install Syncthing 2.x on this desktop, generate its keys, and tell me its device ID. Do the same on the mini-PC over SSH."

```bash
# distribution packages can be older; install the 2.x release as the syncthing skill describes
syncthing --version      # must print v2.x, the cli subcommands below need it
syncthing generate
syncthing device-id
ssh minipc 'syncthing generate && syncthing device-id'
```

On the mini-PC the agent enables the packaged user service so it survives reboots:

```bash
ssh minipc 'sudo systemctl enable --now syncthing@tomasz.service && systemctl status syncthing@tomasz.service --no-pager | head -5'
```

The agent notes the three device IDs (desktop, laptop, minipc) and keeps them in shell variables `DESKTOP_ID`, `LAPTOP_ID`, `MINIPC_ID`.

### Step 2: Pair the devices

Prompt: "On the desktop, add the laptop and the mini-PC as devices. Use a fixed address for the mini-PC, 192.168.1.50."

```bash
syncthing cli config devices add --device-id "$LAPTOP_ID" --name laptop --addresses dynamic
syncthing cli config devices add --device-id "$MINIPC_ID" --name minipc --addresses tcp://192.168.1.50:22000
```

The same two `devices add` calls, with the other IDs, are run on the laptop and on the mini-PC (which only needs the desktop and the laptop). After a few seconds `syncthing cli show connections` lists the paired devices with `"connected": true`.

### Step 3: Share the folder, two ways between the computers and one way to the mini-PC

Prompt: "Share ~/Projects between desktop and laptop in both directions, and make the mini-PC receive-only."

On the desktop:

```bash
syncthing cli config folders add --id projects --label Projects --path "$HOME/Projects" --type sendreceive
syncthing cli config folders projects devices add --device-id "$LAPTOP_ID"
syncthing cli config folders projects devices add --device-id "$MINIPC_ID"
```

On the laptop, the same `folders add` with `--type sendreceive` and the desktop as device. On the mini-PC:

```bash
syncthing cli config folders add --id projects --label Projects --path /srv/backup/projects --type receiveonly
syncthing cli config folders projects devices add --device-id "$DESKTOP_ID"
```

The folder `--id` must match everywhere. The mini-PC never sends changes upstream, so a mistake there cannot damage the working copies.

### Step 4: Keep deleted and replaced files on the mini-PC

Prompt: "If I delete something by mistake, the mini-PC should still have the old version for 30 days."

```bash
ssh minipc 'syncthing cli config folders projects versioning type set staggered'
ssh minipc 'syncthing cli config folders projects versioning params set maxAge 2592000'
ssh minipc 'syncthing cli config folders projects versioning dump-json'
```

The last command shows `"type": "staggered"` and `"maxAge": "2592000"` (seconds, 30 days). Files that sync would delete or overwrite on the mini-PC are moved into the folder's `.stversions` directory instead.

### Step 5: Keep render caches out

Prompt: "Do not sync After Effects caches, render previews or OS junk."

```bash
export ST_URL=http://127.0.0.1:8384
curl -s -X POST -H "X-API-Key: $ST_KEY" -H "Content-Type: application/json" \
  -d '{"ignore": ["(?d).DS_Store", "(?d)Thumbs.db", "Adobe After Effects Auto-Save", "*.aep.tmp", "/_cache"]}' \
  "$ST_URL/rest/db/ignores?folder=projects"
```

`ST_KEY` comes from the Syncthing configuration of that machine. The same call is made on the laptop, because ignore patterns are per device.

### Step 6: Confirm the first sync is complete

Prompt: "Tell me when the mini-PC has everything."

```bash
curl -s -H "X-API-Key: $ST_KEY" "$ST_URL/rest/db/completion?folder=projects&device=$MINIPC_ID"
```

The agent repeats the call until the answer contains `"completion": 100` and `"needItems": 0`. With 85 GB on a gigabit LAN the first pass takes about 25 minutes.

### Step 7: Look at the GUI safely when needed

Prompt: "I want to see the web interface of the mini-PC from my laptop."

```bash
ssh -N -L 8385:127.0.0.1:8384 minipc
```

The mini-PC's interface stays on its own loopback address; the tunnel makes it available at `http://127.0.0.1:8385` on the laptop only for as long as the command runs. The agent also confirms with `syncthing cli config gui dump-json` that `address` is `127.0.0.1:8384`.

## Real-World Example

Tomasz finishes a title sequence on the desktop on Monday night and closes the lid. On Tuesday at a client's office he opens the laptop; the project is already there because the two devices synced as soon as the laptop joined the network. He edits the project, and the changes flow back to the desktop and to the mini-PC. On Thursday he deletes a folder of old exports by mistake on the laptop; the deletion reaches the desktop within seconds, but the mini-PC, which has file versioning switched on for the folder, still holds the old files in its `.stversions` directory and he restores them from there. He cancels the cloud storage subscription he never used up to the limit, and the USB drive goes into a drawer.

## Related Skills

- [syncthing](/skills/syncthing) — pairs devices, shares the folders, sets ignore patterns and checks completion.
- [systemd](/skills/systemd) — runs Syncthing as a service on the always-on mini-PC.
- [ssh](/skills/ssh) — runs the setup commands remotely and tunnels to the remote web interface.
