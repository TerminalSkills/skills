---
name: act
description: >-
  Runs GitHub Actions workflows on your own machine in Docker containers with act, so CI can be tested without pushing. Use when a user asks to test GitHub Actions workflows locally, debug a failing CI pipeline, pass secrets or inputs to a local run, or run workflows offline.
license: Apache-2.0
compatibility: 'Docker Engine required (podman is not supported); Linux, macOS, Windows'
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: development
  tags:
    - act
    - github-actions
    - ci
    - local
    - docker
  repository: https://github.com/nektos/act
---

# Act

## Overview

act reads `.github/workflows/`, pulls or builds the images the jobs need, and runs each job in a Docker container with the environment variables and filesystem layout GitHub uses. It is a fast feedback loop for workflow edits and a way to use workflows as a local task runner. Current release is v0.2.89 (June 2026). Docs: https://nektosact.com.

## Instructions

### Step 1: Install

Use a package manager: `brew install act` (macOS, Linux), `winget install nektos.act` or `choco install act-cli` (Windows), `pacman -Syu act` (Arch), `nix-shell -p act`, or the GitHub CLI extension `gh extension install https://github.com/nektos/gh-act`. Alternatively download the archive for your platform from the GitHub releases page and verify it against `checksums.txt` from the same release (`sha256sum -c`) before unpacking. Docker Engine must be running.

### Step 2: Pick runner images

The first run without configuration asks you to choose an image size and saves the choice to `~/.config/act/actrc`. Skip the prompt, which also hangs in non-interactive shells, by putting the mapping in a project `.actrc` (one flag per line):

```
-P ubuntu-latest=catthehacker/ubuntu:act-latest
--env-file .env
--action-offline-mode
```

`act-latest` is the "medium" image; it lacks many tools of the real GitHub runner. `catthehacker/ubuntu:full-latest` is closer but is about 17 GB to download (the prompt itself warns of 75 GB of free disk). On Apple Silicon add `--container-architecture linux/amd64`.

### Step 3: Run

```bash
act -l                              # list jobs and their events
act                                 # run the "on: push" workflows
act pull_request                    # run a specific event
act -j test                         # one job (its `needs` jobs run too)
act -W .github/workflows/ci.yml     # one workflow file
act workflow_dispatch --input target=production
act push --matrix node:22          # only matrix entries that include node 22
act -e event.json                   # custom event payload
```

### Step 4: Secrets, variables, local-only behavior

```bash
act --secret-file .secrets          # KEY=value lines; default file is .secrets
act -s NPM_TOKEN                    # take the value from your shell environment
act --var-file .vars                # values for ${{ vars.NAME }}
act --env-file .env                 # plain environment variables
```

act sets `ACT=true`, so a step can skip itself locally with `if: ${{ !env.ACT }}`. Job-level `if:` cannot see `env`; use an event file such as `{"act": true}` with `act -e event.json` and test `!github.event.act`.

### Step 5: Debug

```bash
act -n          # dry run: validates and prints the plan without creating containers
act --validate  # check workflow schema
act -g          # draw the job graph
act -v          # verbose logs
act -r          # keep the container after success to inspect state between runs
act --artifact-server-path .artifacts   # enable upload-artifact/download-artifact
```

## Examples

### Example 1: Reproduce a failing CI job before pushing

**User request:** "My `test` job fails on GitHub but I cannot see why. Run it locally."

```bash
printf -- '-P ubuntu-latest=catthehacker/ubuntu:act-latest\n' > .actrc
act -j test --secret-file .secrets -v
```

**Result:** act pulls the image on the first run, then streams each step as `[CI/test]  | ...`, ending with `Job failed` and the failing step's output, so the fix can be tried and rerun in seconds.

### Example 2: Run a deploy workflow with inputs and without side effects

**User request:** "Dry-run the deploy workflow for production but do not post to Slack"

Workflow step: `- if: ${{ !env.ACT }}` on the Slack notification.

```bash
printf 'AWS_REGION=eu-west-1\n' > .vars
printf 'NPM_TOKEN=npm_localdummy\n' > .secrets
act workflow_dispatch --input target=production
```

**Result:** The job log shows `target=production` and `region=eu-west-1`, the Slack step is skipped, and the run ends with `Job succeeded`.

## Guidelines

- Add `.secrets`, `.vars` and `.env` to `.gitignore`; use throwaway values locally, never production credentials.
- Not everything works: OIDC tokens, GitHub-hosted service features, `systemd`, many preinstalled tools and cross-run artifact downloads are missing or differ. A green local run is not proof for GitHub.
- Podman and other container engines are not supported; `--pull` is on by default, so images are fetched each run; add `--pull=false` or `--action-offline-mode` once images are cached.
- First pulls are large (the medium image is about 500 MB, the large one about 17 GB, the micro one under 200 MB but incompatible with many actions).
- Use `-P ubuntu-latest=-self-hosted` only when you accept jobs running directly on your host.
- Actions fetched by act may need a token to avoid GitHub rate limits; pass it with `-s GITHUB_TOKEN`.
- Delete leftover containers with `docker rm` after `-r` runs.
