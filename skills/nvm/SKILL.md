---
name: nvm
description: >-
  nvm (Node Version Manager) is a shell script that installs several Node.js versions side by side in your home directory and switches between them per terminal session or per project. Use this skill when a user asks to install or upgrade Node.js without sudo, run a project on a different Node version, pin a version with `.nvmrc`, move to the newest LTS, keep global npm packages when upgrading, or fix "nvm: command not found" in scripts, Docker and CI. Works on Linux, macOS and WSL with bash, zsh or other POSIX shells; not for native Windows.
license: Apache-2.0
compatibility: "Linux, macOS or WSL with bash/zsh (POSIX sh), curl or wget, and tar; git is used by the installer when present"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "nvm, nodejs, version-manager, nvmrc, shell"
  repository: https://github.com/nvm-sh/nvm
---
# nvm — install and switch Node.js versions per project

## Overview

nvm is a shell function, not a binary. Sourcing `nvm.sh` defines the `nvm` command, which downloads official Node.js builds (with checksum verification) into `~/.nvm/versions/node/` and rewrites `PATH` for the current shell. Each project can name its version in a `.nvmrc` file. Because it is a function, it only exists in shells that sourced the script. That explains most "command not found" problems in cron, Docker and CI.

nvm does not support native Windows (use WSL, or `nvm-windows`, a different project). If a team also needs Python, Go or Ruby versions from one file, see the `mise` skill. For what to do with Node once it is installed, see the `node` skill.

## Instructions

### Install (download, inspect, then run)

The installer is a script, so download it to a file, look at it, and run it. Use the pinned release tag (v0.41.0 was the latest release on 2026-11-05; check https://github.com/nvm-sh/nvm/releases):

```bash
curl -fsSLo nvm-install.sh https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh
sha256sum nvm-install.sh        # v0.41.0 gave 045932fe05f0d4247c946f2ec0ec4026dbfd8ce88a5f67ea28d8ea833227f48b when checked; note the value for your records
less nvm-install.sh             # it clones or downloads into ~/.nvm and edits one shell profile
bash nvm-install.sh
```

By default the installer appends a loader snippet to your shell profile (`~/.bashrc`, `~/.zshrc`, ...). To keep the profile untouched, run `PROFILE=/dev/null bash nvm-install.sh` and add the snippet yourself. To install elsewhere set `NVM_DIR` first. Open a new terminal, or load nvm into the current one:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm --version        # 0.41.0
```

`command -v nvm` prints `nvm` when it is loaded. `which nvm` finds nothing, because it is a function.

### Install and select versions

```bash
nvm ls-remote --lts          # every LTS release, latest per line marked "Latest LTS"
nvm version-remote --lts     # just the newest LTS, e.g. v26.13.0
nvm install --lts            # newest LTS
nvm install 24               # newest 24.x
nvm install 22.23.4          # exact version
nvm install 24 --no-progress # no download bar (use in logs and CI)
nvm use 24                   # switch this shell
nvm current                  # active version
nvm which 24                 # path of that version's node binary
nvm ls                       # installed versions, aliases, and the lts/* names
```

Version arguments are prefixes (`24` means the newest installed or available 24.x) and aliases such as `node` (latest release), `lts/*`, and `lts/krypton` (codenames are lowercase). If a version is not installed, `nvm use` prints ``You need to run `nvm install 24` to install and use it.`` (with that version number) instead of downloading it.

### Default version and aliases

```bash
nvm alias default 24         # used by every new terminal
nvm alias legacy 22          # your own name; then: nvm use legacy
nvm install 26 --default     # install and make it the default in one step
nvm use system               # go back to the Node installed by the OS
nvm deactivate               # remove nvm's versions from PATH in this shell
```

### Pin a version per project with `.nvmrc`

`.nvmrc` holds one line: `24`, `24.22.2`, `lts/krypton` or `lts/*`.

```bash
echo "lts/krypton" > .nvmrc     # or: nvm use 24 --save (writes the resolved v24.22.2)
nvm install                     # installs the version named in .nvmrc (no-op if present), then uses it
nvm use                         # switches to it; "No version provided and no .nvmrc file found" otherwise
```

nvm looks for `.nvmrc` in the current directory and walks up through parent directories. `nvm current` does not read `.nvmrc`, so run `nvm use` first. nvm does not switch automatically when you `cd`; the README documents optional shell hooks for that, which you must add to your own profile.

### Run one command on another version

```bash
nvm exec 22 node --version                # runs the command with Node 22 on PATH, shell stays unchanged
nvm run 22 scripts/migrate.js --dry-run   # node 22 running that script
nvm exec 22 npm test                      # test the project on an older line
```

`nvm exec` and `nvm run` do not change your current shell, which makes them the safe way to try a second version. Piping `nvm use` or `nvm install` into another command (`nvm use 24 | tail`) runs it in a subshell, so the switch is lost; run it on its own line.

### Upgrade and move global packages

```bash
nvm install 26 --reinstall-packages-from=24 --latest-npm   # new line, same global packages, newest npm
nvm install --lts --default                                  # follow the newest LTS
nvm uninstall 22.23.4                                        # delete one installed version
```

Global packages live inside each version's directory, so they are not shared between versions. `--reinstall-packages-from` copies the names of the globals from another installed version and reinstalls them. To always install some globals into every new version, list one package per line in `$NVM_DIR/default-packages` (`--skip-default-packages` turns that off for one install).

### Scripts, Docker and CI

A non-interactive shell never reads your profile, so source nvm in the script itself:

```bash
#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install --no-progress      # uses .nvmrc in the working directory
npm ci && npm test
```

In a Dockerfile, a pinned base image such as the official `node` image is simpler than nvm. If nvm is required, install it into `$NVM_DIR` and run `. "$NVM_DIR/nvm.sh" && nvm install` in the same `RUN` line, because each `RUN` starts a fresh shell.

## Examples

### Example 1: Open an old project on its own Node version

Request: "The billing-service repo breaks on my Node 26. It was built for 22."

```bash
cd ~/work/billing-service
cat .nvmrc            # 22
nvm install           # downloads 22.x if missing
nvm use
node --version        # v22.23.4
npm ci && npm test
```

Result: only this terminal runs Node 22; other terminals keep the default. Output of `nvm install`: `Found '.../.nvmrc' with version <22>`, then `Checksums matched!` and `Now using node v22.23.4`.

### Example 2: Move a laptop to the newest LTS and keep the tools

Request: "Upgrade me to the current LTS and keep my global CLIs."

```bash
nvm ls-remote --lts | tail -3
nvm install --lts --reinstall-packages-from=24 --latest-npm
nvm alias default 'lts/*'
node --version && npm ls -g --depth=0
```

Result: Node 26.x is installed next to 24.x, the globals from 24 are reinstalled, and new terminals start on 26. Rolling back is `nvm alias default 24`.

### Example 3: Fix "nvm: command not found" in a deploy script

Request: "deploy.sh fails with `nvm: command not found` over ssh."

The agent adds the three lines from "Scripts, Docker and CI" (`export NVM_DIR`, source `nvm.sh`, `nvm install --no-progress`) at the top of the script. The same script then works over ssh and in cron.

## Guidelines

- Never pipe the installer into a shell. Download, inspect, then run, and pin the release tag.
- nvm changes `PATH` per shell; an IDE or a systemd service started elsewhere will not see it. Point services at the full path from `nvm which <version>`.
- Do not mix with a system Node on the same `PATH`: `nvm use system` is the explicit switch back. The installer prints a note listing global packages of the system Node that nvm will not see.
- `nvm ls-remote` and `nvm install` need network access to nodejs.org; use `nvm install --offline <version>` only when archives are already cached.
- Uninstall everything by removing the loader lines from your profile and deleting `$NVM_DIR`; check the path first, since the directory contains every installed Node.
- Do not run `sudo npm install -g` under nvm: global packages already go to your home directory.
- Prefer `mise`, `fnm` or a pinned container image when a team wants one config for several languages or faster shell startup.
