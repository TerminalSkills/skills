---
name: lazygit
description: >-
  lazygit is a keyboard-driven terminal interface for Git that makes staging
  single lines, interactive rebase, cherry-picking, bisecting and undoing
  mistakes a matter of a few keypresses. Use when a user asks to install
  lazygit, configure its config.yml, add custom commands or change
  keybindings, set up delta as its diff renderer, or wants to know which keys
  to press to squash, amend, cherry-pick or undo commits in lazygit.
license: Apache-2.0
compatibility: "Git 2.32+ and a terminal on macOS, Linux, Windows or FreeBSD; optional: gh CLI for pull request features, delta for diffs"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["git", "terminal-ui", "interactive-rebase", "lazygit", "developer-tools"]
  repository: https://github.com/jesseduffield/lazygit
---
# lazygit — Terminal UI for everyday and advanced Git

## Overview

lazygit shows files, branches, commits and stashes as panels in the terminal and turns multi-step Git operations into single keys. It is a program for a person at a keyboard. An agent's part is to install it, write and validate its configuration, add custom commands that fit the team's workflow, and tell the user exactly which keys to press. For Git work the agent performs itself, it uses the `git` command line.

## Instructions

### Installation

```bash
brew install lazygit                           # macOS and Linux
winget install -e --id=JesseDuffield.lazygit   # Windows
choco install lazygit                          # Windows, alternative
go install github.com/jesseduffield/lazygit@latest
conda install -c conda-forge lazygit
lazygit --version
```

On Windows, Scoop works too: `scoop bucket add extras`, then `scoop install lazygit`. Linux distributions package it as well: `apt install lazygit` (Debian 13 and Ubuntu 25.10 or later), `pacman -S lazygit` (Arch), `xbps-install -S lazygit` (Void), and on Fedora `dnf copr enable dejan/lazygit` followed by `dnf install lazygit`. Binaries for every platform are on https://github.com/jesseduffield/lazygit/releases. lazygit refuses to start with Git older than 2.32.0.

### Starting it (for the user)

```bash
lazygit                                  # inside a repository
lazygit --path ~/code/storefront-web     # another repository
lazygit log                              # open focused on a panel: status, branch, log or stash
lazygit --filter src/checkout/           # only history that touches this path
lazygit --screen-mode half               # normal, half or full
```

### Find and inspect the configuration

```bash
lazygit --print-config-dir    # directory that holds config.yml
lazygit --config              # print every option with its default value
```

Default locations of `config.yml`: `~/.config/lazygit/` on Linux, `~/Library/Application Support/lazygit/` on macOS, `%LOCALAPPDATA%\lazygit\` on Windows. Settings can also live per repository in `.git/lazygit.yml`, and a `.lazygit.yml` in any parent directory applies to all repositories below it. These override the global file. `LG_CONFIG_FILE` or `--use-config-file` selects other files; a comma-separated list is merged in order.

### Write config.yml

Include only the settings that differ from the defaults.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/jesseduffield/lazygit/master/schema/config.json
gui:
  nerdFontsVersion: "3"
  showFileTree: true
  sidePanelWidth: 0.3
git:
  mainBranches: [main, develop]
  disableForcePushing: true
  diffRenderers:
    - command: delta --dark --paging=never
  commitPrefix:
    - pattern: "^\\w+\\/(\\w+-\\w+).*"
      replace: "[$1] "
os:
  editPreset: vscode
update:
  method: never
notARepository: quit
```

- `editPreset` accepts `vim`, `nvim`, `nvim-remote`, `lvim`, `emacs`, `nano`, `micro`, `vscode`, `sublime`, `bbedit`, `kakoune`, `helix`, `xcode`, `zed` and `acme`.
- `diffRenderers` is a list; the user cycles through the entries with the pipe key. Besides a `command`, an entry can set `type` (`stdinFilter`, `extDiff` or `rawGit`), `name`, `colorArg` and `args`.
- `commitPrefix` builds a commit message prefix from the branch name: on `feature/PAY-482-gift-cards` the message starts with `[PAY-482] `.
- `nerdFontsVersion` needs a Nerd Font in the terminal; leave it out otherwise.

### Custom commands

```yaml
customCommands:
  - key: <ctrl+g>
    context: files
    description: Conventional commit
    prompts:
      - type: menu
        title: Commit type
        key: Type
        options:
          - value: feat
            description: new user-facing behaviour
          - value: fix
            description: bug fix
          - value: chore
            description: tooling, dependencies
      - type: input
        title: Scope (optional)
        key: Scope
      - type: input
        title: Subject
        key: Subject
    command: >-
      git commit -m {{ printf "%s%s: %s" .Form.Type
      (and .Form.Scope (printf "(%s)" .Form.Scope)) .Form.Subject | quote }}
    loadingText: Committing
  - key: <ctrl+u>
    context: localBranches
    description: Open pull request with gh
    command: gh pr create --fill --head {{ .SelectedLocalBranch.Name | quote }}
    output: terminal
```

| Field | Meaning |
|---|---|
| `key` | Key that triggers the command. Without it, the command is reachable from the `?` menu. |
| `context` | Panel where the key is active: `status`, `files`, `worktrees`, `submodules`, `localBranches`, `remotes`, `remoteBranches`, `tags`, `commits`, `reflogCommits`, `subCommits`, `commitFiles`, `stash` or `global`. Several can be listed, separated by commas. |
| `command` | Shell command, written as a Go template. |
| `prompts` | Questions asked first. Types: `input`, `confirm`, `menu`, `menuFromCommand`. Answers are available as `.Form.` plus the prompt's `key`. |
| `output` | `none`, `terminal` (suspends lazygit, for commands that need input), `log`, `logWithPty` or `popup`. |
| `description`, `loadingText`, `outputTitle` | Labels shown in the interface. |
| `after` | `checkForConflicts: true` checks for merge conflicts when the command ends. |

Template objects: `SelectedCommit`, `SelectedCommitRange` (`.From`, `.To`), `SelectedFile`, `SelectedPath`, `SelectedLocalBranch`, `SelectedRemoteBranch`, `SelectedRemote`, `SelectedTag`, `SelectedStashEntry`, `SelectedCommitFile`, `SelectedWorktree`, `SelectedSubmodule`, `CheckedOutBranch`. Common fields are `.SelectedCommit.Hash`, `.SelectedFile.Name` and `.SelectedLocalBranch.Name`. Always pipe values through `quote`. To test a new command, wrap it in `echo` and set `output: popup`.

### Keybindings

```yaml
keybinding:
  universal:
    quit: [q, <ctrl+c>]
    openRecentRepos: <f4>
  commits:
    moveDownCommit: <alt+j>
    moveUpCommit: <alt+k>
  files:
    ignoreFile: <disabled>
```

A binding is a single character (`A` means shift+a), a named key such as `<enter>`, `<esc>`, `<space>`, `<tab>`, `<f5>`, `<up>`, or a modified key such as `<ctrl+s>` or `<alt+enter>`. A list binds several keys; `<disabled>` removes a binding. Section names are `universal`, `status`, `files`, `branches`, `commits`, `stash`, `commitFiles`, `main`, `submodules`, `commitMessage` and `amendAttribute`.

### Validate the configuration

lazygit publishes a JSON schema for `config.yml`. Check a file against it before handing it to the user (needs `pip install jsonschema pyyaml`):

```python
import json
import sys
import urllib.request

import jsonschema
import yaml

SCHEMA_URL = "https://raw.githubusercontent.com/jesseduffield/lazygit/master/schema/config.json"

with urllib.request.urlopen(SCHEMA_URL) as response:
    schema = json.load(response)
with open(sys.argv[1], encoding="utf-8") as handle:
    config = yaml.safe_load(handle)

errors = list(jsonschema.Draft202012Validator(schema).iter_errors(config))
for error in errors:
    print("/".join(map(str, error.path)) or "(root)", "-", error.message)
sys.exit(1 if errors else 0)
```

Saved as `check_lazygit_config.py`, it is run with the path to `config.yml` and prints nothing when the file is valid. For a typo such as `disableForcePushin` it reports `git - Additional properties are not allowed ('disableForcePushin' was unexpected)`.

### Key sequences to give the user

Default keys. Panels are reached with `1` to `5` or the arrow keys; `?` lists every key for the current panel.

| Goal | Panel | Keys |
|---|---|---|
| Stage a file, or all files | Files | `space`, `a` |
| Stage single lines | Files | `enter` on the file, then `space` per line, `v` to start a range, `a` for the hunk |
| Commit staged changes | Files | `c`, type the message, `enter` |
| Push, pull | any | `P`, `p` |
| Squash the newest commits into one | Commits | select the newest, `v`, move down to extend the selection, `s`, `enter` to confirm |
| Reword a commit | Commits | `r` |
| Add staged changes to an older commit | Commits | `A` |
| Interactive rebase | Commits | `i`, then `s` squash, `f` fixup, `d` drop, `e` edit, `ctrl+k` and `ctrl+j` to move, `m` to continue or abort |
| Fixup commit for a reviewed branch | Commits | `F` to create, `S` later to squash all of them |
| Cherry-pick | Commits | `C` to copy, check out the target branch (`space` in Local branches), `V` to paste, `enter` to confirm |
| Rebase onto another branch | Local branches | `r` on the target branch |
| Create a worktree | Local branches | `w` |
| Bisect | Commits | `b` |
| Undo, redo | any | `z`, `Z` |

## Examples

### Example 1: Configure lazygit for a team workflow

**Request:** "Set up lazygit on my Mac: delta for diffs, VS Code as the editor, never allow force pushes, and give me a shortcut for conventional commits."

```bash
brew install lazygit git-delta
lazygit --version
lazygit --print-config-dir
```

The agent writes `config.yml` into the printed directory (`~/Library/Application Support/lazygit`), combining the `git`, `os` and `customCommands` blocks shown above, and runs the schema check on the file.

**Result:** `lazygit --version` prints a line containing `version=0.65.1` and the detected Git version. When the user opens lazygit, diffs are rendered by delta, `e` opens the file in VS Code, and `ctrl+g` in the Files panel asks for type, scope and subject. Choosing `feat`, entering `checkout` and `add gift card field` creates the commit `feat(checkout): add gift card field`. With the scope left empty the message is `feat: add gift card field`.

### Example 2: Tell the user how to clean up a branch before review

**Request:** "I have three work-in-progress commits on feature/PAY-482-gift-cards. How do I turn them into one commit in lazygit?"

The agent first checks the state with plain Git:

```bash
git log --oneline -4
```

```text
1fd000e wip: validation
70c9ada wip: form field
728cf30 feat(checkout): add gift card model
2066e55 chore: bump stripe sdk
```

Then it answers with the exact keys: open `lazygit`, press `4` for the Commits panel, select `wip: validation` at the top, press `v`, press `j` once so both `wip` commits are selected, press `s` and confirm with `enter`. Press `r` to reword the combined commit. If the result is wrong, `z` and `enter` undo it.

**Result:** `git log --oneline -2` now shows one commit on top of `chore: bump stripe sdk`. It carries the message of `feat(checkout): add gift card model` with the two `wip` messages appended in the body.

## Guidelines

- **The agent cannot operate lazygit.** It is a full-screen interactive program that needs a real terminal and a person reading the screen. Do not start it from an agent shell and do not try to script keystrokes into it. For your own staging, commits, rebases and cherry-picks use plain `git` commands; use lazygit knowledge to configure the tool and to instruct the user.
- **Validate before saving.** A value of the wrong type, an unrecognized key such as `<shift+a>`, or an unknown custom command context stops lazygit at startup with an error, while a misspelled option name is ignored silently and simply has no effect. The schema check catches both. Read the existing config before changing it: append to `customCommands`, do not replace the list.
- **A `.lazygit.yml` in the repository root is not read.** Only parent directories and `.git/lazygit.yml` count, and `.git/` is not versioned. To share settings, keep the file in a repository and copy it into place on each machine.
- **Custom commands run in the user's shell with the user's rights.** Keep them short and readable, quote every template value, and never add a command that deletes data or pushes with force without a `confirm` prompt.
- **Key collisions.** A custom key replaces a built-in key in the same context. A custom key in the `global` context loses against a built-in key defined for a specific panel. Check `?` in the panel or the default list from `lazygit --config`.
- **Modifier keys depend on the terminal.** Combinations beyond plain letters and `ctrl` plus a letter need a modern terminal such as Ghostty, kitty, WezTerm, Alacritty, iTerm2 or Windows Terminal. macOS Terminal.app does not pass them on, and tmux needs `extended-keys` switched on.
- **Undo has limits.** `z` walks back through the reflog, so it covers commits, rebases and checkouts. It cannot restore discarded working-tree changes or stashes, cannot undo a push, and is unavailable in the middle of a rebase (press `m` and abort instead).
- **Warn before destructive keys.** `D` in the Files panel opens the reset menu, which includes discarding every uncommitted change; `d` discards a file or drops a commit. Tell the user what a key does before recommending it.
- **Pull request icons and `G`** work for github.com only after the user has run `gh auth login` once.
- **Third-party packages.** Most distribution packages are maintained by volunteers, not by the lazygit project. Prefer Homebrew, winget or the official release binaries when the source matters.
- **When not to use it:** in CI, in scripts, over connections without a terminal, or for anything that must be repeatable. Those cases call for plain Git commands.
