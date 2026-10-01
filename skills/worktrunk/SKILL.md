---
name: worktrunk
description: >-
  Sets up and drives Worktrunk (the `wt` CLI) so several branches, each in its own git worktree,
  can be worked on at once by people or AI coding agents. Use when a user says "run three agents
  in parallel on this repo", "give each task its own worktree", "set up worktrunk", "wt switch
  does not change directory", "add a hook that installs dependencies in new worktrees", "merge
  this worktree back and clean it up", or asks why a hook wants approval. Covers installation,
  the switch / list / merge / remove loop, the two config files and their real keys, hooks and
  their approval step, launching agents with -x, JSON output for scripts, and safe cleanup.
license: Apache-2.0
compatibility: "Git 2.43+; Worktrunk 0.80+ on macOS, Linux or Windows; bash, zsh, fish, nushell or PowerShell for directory switching"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: [git, worktree, parallel-agents, cli, workflow]
  repository: https://github.com/max-sixty/worktrunk
---

# Worktrunk

## Overview

A git worktree is a second checkout of one repository in another directory, on another branch.
That is the cheapest isolation available for parallel work: two agents editing two worktrees
cannot overwrite each other's files, yet they share history and can merge locally. Worktrunk's
`wt` binary wraps the bookkeeping. You name a branch and it derives the directory, runs the
project's setup hooks, optionally starts a program there, reports the state of every checkout in
one table, and lands a finished branch with tests run first and the leftovers removed.

Everything below was run against version 0.80.0 in a throwaway repository. Note that
`.worktrunk.toml` and keys such as `on_create` or `[create] copy` do not exist; the real files
and keys are in step 3 and step 4.

## Instructions

### 1. Check the ground

- `git --version` is 2.43 or later and `wt --version` answers. On Windows the command may be
  `git-wt`, because Windows Terminal owns the name `wt`.
- `wt config show` prints both config paths, pending hook approvals, and whether shell
  integration is installed. Read it before changing anything.
- Ask how finished work should land: a local merge into the default branch, or a pushed branch
  and a pull request. This decides step 7.

### 2. Install

Package managers: `brew install worktrunk` (macOS, Linux), `cargo install worktrunk` (any Rust
toolchain), `winget install max-sixty.worktrunk` (Windows). Otherwise take the release archive
and verify it before unpacking:

```bash
base=https://github.com/max-sixty/worktrunk/releases/latest/download
curl -fsSLO "$base/worktrunk-x86_64-unknown-linux-musl.tar.xz"
curl -fsSLO "$base/worktrunk-x86_64-unknown-linux-musl.tar.xz.sha256"
sha256sum -c worktrunk-x86_64-unknown-linux-musl.tar.xz.sha256
tar -xJf worktrunk-x86_64-unknown-linux-musl.tar.xz
install -m 0755 worktrunk-x86_64-unknown-linux-musl/wt "$HOME/.local/bin/wt"
```

Then `wt config shell install`, once. A child process cannot change its parent's directory, so
this adds a shell function that does the `cd`. It edits the user's shell startup file: propose
it, do not run it unasked.

### 3. Decide where worktrees live

The default puts each worktree beside the repository: branch `fix/csv-export` of
`~/code/ledger-api` becomes `~/code/ledger-api.fix-csv-export`. To change it, set one key in the
user config, `~/.config/worktrunk/config.toml` (create it with `wt config create`):

```toml
worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"
```

The default is `{{ repo_path }}/../{{ repo }}.{{ branch | sanitize }}`; a central folder would
be `~/worktrees/{{ repo }}/{{ branch | sanitize }}`. `sanitize` turns `/` into `-`. With the
in-repo layout, add `.worktrees/` to `.gitignore`; otherwise the main checkout shows it as
untracked.

### 4. Write the project hooks

Project settings go in `.config/wt.toml`, committed with the repository
(`wt config create --project` writes a commented starter). Hook names are fixed:

| Moment | Blocks until done | Runs detached |
|--------|-------------------|---------------|
| Any switch | `pre-switch` | `post-switch` |
| A worktree is created | `pre-start` | `post-start` |
| Worktrunk makes a commit | `pre-commit` | `post-commit` |
| `wt merge` | `pre-merge` | `post-merge` |
| A worktree is removed | `pre-remove` | `post-remove` |

A failing `pre-` hook cancels the operation. Use `pre-start` for anything the program launched
with `-x` needs at once (dependencies, env files) and `post-start` for slow or long-lived jobs
(dev server, cache copy). Each hook can be a string, a table of named commands that run
together, or `[[pre-merge]]` blocks that run in sequence.

```toml
[pre-start]
deps = "npm ci"

[post-start]
caches = "wt step copy-ignored"
dev = "npm run dev -- --port {{ branch | hash_port }}"

[pre-merge]
test = "npm test"
lint = "npm run lint"

[list]
url = "http://localhost:{{ branch | hash_port }}"
```

- `{{ branch | hash_port }}` maps a branch name to a stable port between 10000 and 19999, so
  every worktree gets its own dev server and `wt list` shows its URL.
- `wt step copy-ignored` copies gitignored files (`node_modules/`, `.env`, build output) from
  the main worktree into the new one, using copy-on-write on APFS, btrfs and XFS. A
  `.worktreeinclude` file with gitignore-style patterns narrows it; `--dry-run` previews it.
  Python virtual environments hold absolute paths, so recreate them instead of copying.
- Other variables: `{{ worktree_path }}`, `{{ primary_worktree_path }}`, `{{ default_branch }}`,
  `{{ target }}`. Values are shell-escaped already: do not quote them.

Project hooks are repository code, so Worktrunk asks before the first run and whenever a
command's text changes. Without a terminal the prompt cannot appear and the command fails:

```bash
wt hook show                        # read what would run
wt config approvals add             # the user approves; saved in ~/.config/worktrunk/approvals.toml
wt switch --create fix/csv-export --yes   # one-off bypass, nothing saved
```

An agent shows the hook commands to the user and gets a yes before using `--yes`. `--no-hooks`
skips them for one command.

### 5. Create worktrees and start work

| Command | Result |
|---------|--------|
| `wt switch --create feat/audit-log` | New branch from the default branch, new worktree, hooks run |
| `wt switch -c hotfix/tax --base release/2.4` | Same, branching from another base |
| `wt switch feat/audit-log` | Go to the branch's worktree, creating one if it has none |
| `wt switch pr:412` | Check out a GitHub pull request's branch (needs an authenticated `gh`) |
| `wt switch -` / `wt switch ^` | Previous worktree / default-branch worktree |
| `wt switch -c feat/x -x claude -- 'task text'` | Create, then run a program inside it |

`-x` names the program; every argument after `--` is passed to it, so a prompt with spaces stays
one argument. To keep several agents alive, start each in its own terminal multiplexer session:

```bash
tmux new-session -d -s audit-log \
  "wt switch --create feat/audit-log -x claude -- 'Record who changed each invoice and when'"
```

A non-interactive shell has no shell function, so `wt switch` creates the worktree but cannot
change directory. Ask for the path instead and address the worktree explicitly:

```bash
dir=$(wt switch --create fix/webhook-retry --no-cd --format=json | jq -r .path)
wt -C "$dir" list     # JSON keys: action, branch, path, created_branch, base_branch
```

### 6. Watch progress

`wt list` prints one row per worktree: `@` marks the current one, `^` the main one. Status uses
`+` staged, `!` modified, `?` untracked, `↑` ahead of the default branch, `↓` behind,
`↕` diverged, `✗` would conflict, `_` identical to it, `⊂` already contained in it.
`--full` adds CI status and needs `gh` or `glab`; `--branches` includes branches without a
worktree.

```bash
wt list --format=json | jq -r '.items[] | select(.default_branch.ahead > 0) | .branch'
wt list --format=json | jq -r '.items[] | select(.display.state == "would_conflict") | .branch'
wt step for-each -- git status --short
```

### 7. Land the work

Local merge, from inside the feature worktree or with `-C`: `wt merge` targets the default
branch, `wt merge develop` another. In order, it commits what is uncommitted, squashes the
branch to one commit, rebases onto the target, runs `pre-merge`, fast-forwards the target, then
removes the worktree and branch. Flags switch stages off: `--no-squash`, `--no-rebase`,
`--no-remove`, `--no-ff` (make a merge commit), `--stage tracked` (leave untracked files out).
Know these before running it:

- By default **untracked files are staged too**. Check `git status --short` first, or pass
  `--stage tracked`.
- The commit message comes from the command in `[commit.generation]` of the user config. With
  none configured the message is a plain `Changes to round.js`; if that is not acceptable,
  commit by hand first and run `wt merge --no-commit`, which requires a clean working tree.
- It merges into the local target and never fetches or pushes. Update the target beforehand and
  push afterwards if a remote should see it.
- A rebase conflict stops the command with the rebase open in that worktree. Resolve it or run
  `git rebase --abort`, then repeat.

Pull-request route: commit, `git push -u origin BRANCH`, open the request, and after it is merged
run `wt remove` in that worktree.

### 8. Clean up

`wt remove` (current worktree) or `wt remove feat/audit-log fix/tax` deletes the directory, and
the branch too when its content is already in the default branch. It refuses a worktree with
uncommitted changes and keeps an unmerged branch; `-f` and `-D` override those two checks and
destroy work, so use them only on the user's explicit word. Removal runs in the background
unless `--foreground` is given. `wt step prune --dry-run` previews removal of merged worktrees.

## Examples

### Example 1: Three agents on one Node service

Marta Olsen wants three independent changes to `~/code/ledger-api` built at once and merged
locally. The `.config/wt.toml` from step 4 is committed and approved (`wt config approvals add`).

```bash
cd ~/code/ledger-api
tmux new-session -d -s csv   "wt switch -c fix/csv-export       -x claude -- 'Quote fields containing commas in the CSV export; add a test'"
tmux new-session -d -s round "wt switch -c fix/invoice-rounding -x claude -- 'Round invoice totals half-even to 2 decimals; add tests'"
tmux new-session -d -s audit "wt switch -c feat/audit-log       -x claude -- 'Record who changed each invoice and when'"
wt list
```

```text
  Branch                Status   main↕  Path                                URL
@ main                    ^             .                                   http://localhost:12107
+ fix/csv-export          ↑      ↑2     ../ledger-api.fix-csv-export        http://localhost:13130
+ fix/invoice-rounding  ! ↑      ↑1     ../ledger-api.fix-invoice-rounding  http://localhost:15280
+ feat/audit-log        ?               ../ledger-api.feat-audit-log        http://localhost:16726
```

`fix/csv-export` is clean and ahead, so it goes first. She reads `git -C
../ledger-api.fix-csv-export diff main...` and merges:

```bash
wt -C ../ledger-api.fix-csv-export merge
```

`npm test` and `npm run lint` run as `pre-merge`; on success `main` advances by one squashed
commit and the worktree disappears. The next branch's own `wt merge` rebases it onto the new
`main`, which is where overlapping edits surface.

### Example 2: An agent isolating its own task, without shell integration

Asked to fix a retry bug while the user keeps editing `main`, an agent in a subprocess shell:

```bash
wt hook show                                   # shows pre-start "npm ci": user agrees
dir=$(wt switch -c fix/webhook-retry --no-cd --yes --format=json | jq -r .path)
# ... edit files under "$dir", run tests with: npm --prefix "$dir" test
git -C "$dir" add src/webhooks/retry.ts test/retry.test.ts
git -C "$dir" commit -m "fix: back off webhook retries exponentially"
wt -C "$dir" merge --no-commit --yes --format=json
```

```json
{ "branch": "fix/webhook-retry", "committed": false, "rebased": false, "removed": true,
  "squashed": false, "target": "main" }
```

The agent reports the commit now on `main`, the removed worktree and branch, and that nothing
was pushed.

## Guidelines

- Split work so branches touch different files. Worktrees stop agents overwriting each other on
  disk; they do nothing about two branches rewriting the same function.
- One branch can be checked out in one worktree only. To change what a worktree holds, use
  `git switch` inside it; `wt switch` moves between directories.
- Shared resources still collide: a fixed port, one local database, a global cache. Derive ports
  with `hash_port` and database names with `{{ branch | sanitize_db }}`.
- Background `post-` hooks do not print to the terminal. `wt hook post-start --foreground`
  re-runs one visibly, and `-v` on any command prints the resolved template variables.
- User-level hooks in `~/.config/worktrunk/config.toml` run in every repository with no approval
  prompt. Keep them small and never copy one from an untrusted source.
- Any user-config key can be set per command (`--config-set 'merge.squash=false'`) or by
  environment (`WORKTRUNK_MERGE__SQUASH=false`); nested keys are joined with two underscores.
- A dev server started by `post-start` outlives its worktree; stop it in a `pre-remove` hook.
- Every worktree repeats the working files and dependency trees; on filesystems without
  copy-on-write (ext4, NTFS) ten checkouts of a large repository can fill a disk.
- Skip Worktrunk for a single short task on a clean tree, and for work that needs separate
  machines or containers rather than separate directories.
