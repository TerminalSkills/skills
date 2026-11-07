---
title: Run Projects on Different Node.js Versions with nvm
slug: run-projects-on-different-node-versions-with-nvm
description: Let a developer keep legacy and new Node.js projects on one laptop, pin each project's version in .nvmrc, and move to the current LTS without losing global tools.
skills:
  - nvm
  - node
  - mise
category: development
tags:
  - nodejs
  - version-manager
  - nvmrc
  - lts-upgrade
  - local-development
---

## The Problem

Priya Raman maintains three Node.js projects at a small logistics company. `billing-service` was built for Node 22 and breaks on newer releases, `tracking-api` is new and should use the current LTS, and a dashboard sits in between. The laptop has one system Node, installed years ago with sudo. Every project switch means reinstalling Node by hand, `npm ci` fails with native-module errors on the wrong version, and teammates report "works on my machine". Nobody knows how long the old line stays supported or when to move.

## The Solution

Install nvm so each Node version lives in her home directory, write a `.nvmrc` into every repository so the version travels with the code, and let the agent pick the target for new work from the official release schedule. The `nvm` skill covers installing, pinning and switching versions; the `node` skill supplies the schedule, the built-in test runner used to compare versions, and the `engines` check that makes a wrong version visible.

## Step-by-Step Walkthrough

### 1. Install nvm without piping a script into a shell

Prompt: "Install nvm on this laptop. Don't edit my shell profile, I'll do that myself."

```bash
curl -fsSLo nvm-install.sh https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh
less nvm-install.sh
PROFILE=/dev/null bash nvm-install.sh
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm --version
```

The agent reads the script before running it, then prints `0.41.0` and shows Priya the two loader lines to paste into `~/.zshrc`.

### 2. Find out which Node line to use

Prompt: "Which Node version should tracking-api use, and how long is 22 supported?"

```bash
nvm version-remote --lts
curl -s https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for line in ('v22', 'v24', 'v26'):
    print(line, d[line]['codename'], 'LTS from', d[line]['lts'], 'end of life', d[line]['end'])"
```

The newest LTS is Node 26 (Lithium, end of life 2029-04-30). Node 22 (Jod) is supported until 2027-04-30, so `billing-service` has a deadline.

### 3. Pin each project

Prompt: "Pin billing-service to 22 and tracking-api to the newest LTS."

```bash
cd ~/work/billing-service && echo 22 > .nvmrc && nvm install && node --version
cd ~/work/tracking-api && echo "lts/*" > .nvmrc && nvm install && node --version
```

Output: `v22.23.4` for the first repository and `v26.13.0` for the second. Both `.nvmrc` files are committed so teammates and CI run `nvm install` and get the same line.

### 4. Check what breaks on the newer line without switching

Prompt: "Will billing-service survive Node 26? Don't change my shell."

```bash
cd ~/work/billing-service
nvm install 26 --no-progress
nvm exec 26 node --test
```

The run shows 3 failing tests caused by a native module built for Node 22. The agent reports them as the upgrade work list instead of upgrading anything.

### 5. Make the default and keep global tools

Prompt: "Make the LTS my default and keep my global CLIs."

```bash
nvm install --lts --reinstall-packages-from=22 --latest-npm --default
nvm ls
```

New terminals start on Node 26, while `cd ~/work/billing-service && nvm use` still gives 22.

### 6. Optional: one config file for every language

Prompt: "The team also pins Python. Can one file cover both?"

```bash
mise use node@22      # writes [tools] node = "22" to mise.toml and installs it
mise exec -- node --version   # v22.23.4
```

The `mise` skill covers the rest; nvm remains the simpler choice when Node is the only runtime.

## Real-World Example

Priya's Monday started with a failing `npm ci` in `tracking-api`. The agent installed nvm, pinned each repository, and found that the dashboard already declared `"engines": { "node": ">=24" }`, so npm warned about it under Node 22. After the walkthrough, the three repositories carry `.nvmrc` files (22, 24 and `lts/*`), CI reads the same files with `nvm install`, and the Node 26 test run listed the three native-module failures to fix before the 2027 deadline. The switch between projects now takes `nvm use`, about a second, instead of a manual reinstall.

## Related Skills

- [nvm](/skills/nvm) — installs and switches Node versions, reads `.nvmrc`, upgrades while keeping global packages
- [node](/skills/node) — release schedule, `node --test` for the comparison run, `engines` and the built-in features of the newer line
- [mise](/skills/mise) — choose it instead of nvm when the same repository also needs Python, Go or other tool versions pinned in one `mise.toml`
