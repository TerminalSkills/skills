---
name: fzf
description: >-
  fzf is a command-line fuzzy finder that filters any list of lines, such as files, git branches, processes or command history, as you type and prints the selection. Use it when the user asks to "pick a file with fuzzy search", "add Ctrl-R fuzzy history", "preview files while searching", "choose a git branch interactively", "set up fzf key bindings", or when a script needs non-interactive fuzzy matching with `fzf --filter`. Covers install, shell integration, FZF_DEFAULT_COMMAND and FZF_DEFAULT_OPTS, preview windows, key bindings and scripting flags.
license: Apache-2.0
compatibility: "Linux, macOS or Windows terminal; bash, zsh, fish or Nushell for the key bindings; fzf 0.48+ for `fzf --bash`"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "fzf, fuzzy-finder, shell, terminal, cli"
  repository: https://github.com/junegunn/fzf
---

# fzf — fuzzy finder for any list in the terminal

## Overview

fzf reads lines from standard input, lets the user narrow them by typing a few characters of each word in any order, and prints the chosen line(s) on standard output. It has no idea what the lines mean, so the same binary picks files, git branches, Docker containers, log lines or history entries. The work an agent does with it is writing the pipeline around it: what produces the list, what `--preview` shows, what happens with the result, and the shell configuration that makes it permanent.

fzf is interactive, so an agent cannot drive the picker itself (there is no terminal to type into). Two things are agent-friendly: writing the setup for the user, and `fzf --filter`, which runs the same matching engine non-interactively and prints the ranked matches.

## Instructions

### Installation

Use the package manager first; check the version afterwards because some distributions ship an old fzf that lacks `fzf --bash`.

```bash
brew install fzf          # macOS, Linux (Homebrew)
sudo apt install fzf      # Debian 9+, Ubuntu 19.10+
sudo dnf install fzf      # Fedora
sudo pacman -S fzf        # Arch
winget install fzf        # Windows
fzf --version
```

Without root access, download the release archive for the platform from https://github.com/junegunn/fzf/releases, verify it against the `fzf_<version>_checksums.txt` file published with the release, and unpack the single `fzf` binary into a directory on PATH:

```bash
sha256sum --check --ignore-missing fzf_0.74.5_checksums.txt
tar -xzf fzf-0.74.5-linux_amd64.tar.gz
install -m 0755 fzf ~/.local/bin/fzf
```

### Shell integration

Add one line to the shell's startup file. It defines three key bindings and fuzzy completion.

```bash
# ~/.bashrc
eval "$(fzf --bash)"
# ~/.zshrc
source <(fzf --zsh)
# ~/.config/fish/config.fish
fzf --fish | source
```

What the bindings do:

- `Ctrl-T` pastes the selected files and directories onto the command line.
- `Ctrl-R` searches shell history and pastes the chosen command. `Tab` selects several; `Ctrl-R` again toggles sorting by relevance and chronological order.
- `Alt-C` changes into the selected directory.
- `vim **<Tab>` (also `cd **<Tab>`, `kill -9 **<Tab>`) opens the picker in place of normal completion.

To turn a binding off, set its command variable to an empty string while sourcing: `FZF_CTRL_R_COMMAND= FZF_ALT_C_COMMAND= eval "$(fzf --bash)"`.

### Choose what gets listed

With no input on a pipe, fzf runs `$FZF_DEFAULT_COMMAND`, and `Ctrl-T` runs `$FZF_CTRL_T_COMMAND`. When neither is set, fzf walks the current directory itself and skips `.git` and `node_modules`; `--walker` and `--walker-skip` tune that.

```bash
# Respect .gitignore, include dotfiles, skip .git
export FZF_DEFAULT_COMMAND='rg --files --hidden --glob "!.git"'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"

# Without ripgrep: built-in walker, skipping heavy directories
export FZF_CTRL_T_OPTS="--walker-skip .git,node_modules,target,dist"
```

### Defaults and previews

`FZF_DEFAULT_OPTS` applies to every invocation. Keep it short and put per-key-binding options in `FZF_CTRL_T_OPTS`, `FZF_CTRL_R_OPTS` and `FZF_ALT_C_OPTS`.

```bash
export FZF_DEFAULT_OPTS="--height=40% --layout=reverse --border --info=inline"

# Ctrl-T previews the file; Ctrl-/ cycles the preview between right, down and hidden
export FZF_CTRL_T_OPTS="
  --preview 'head -n 100 {}'
  --bind 'ctrl-/:change-preview-window(down|hidden|)'"
```

`{}` in a preview is the current line, quoted for the shell. `{1}`, `{2}` are fields (split by `--delimiter`), `{q}` is the query. `--preview-window` takes position, size and flags, for example `right,60%,border-left` or `up,30%`. `bat -n --color=always {}` is a nicer previewer when bat is installed.

### Common pipelines

```bash
# Open a file in the editor, do nothing if the user cancels
file=$(fzf --preview 'head -n 100 {}') && "${EDITOR:-vi}" "$file"

# Check out a branch
git branch --all --format='%(refname:short)' | fzf --height=40% | xargs -r git checkout

# Multi-select (Tab) and act on every choice; NUL-safe for odd file names
git ls-files -z | fzf --read0 --print0 -m | xargs -0 -r git add --

# Kill a process: keep the header line, search only the command column
ps -ef | fzf --header-lines=1 --nth=8.. --accept-nth=2 | xargs -r kill
```

`--accept-nth=2` prints only field 2 (the PID) of the chosen line; `--with-nth` changes what is displayed while the full line is still what is printed unless `--accept-nth` is given.

### Reload and become: live search

`--bind` can run commands on events. `reload(cmd)` replaces the list, `become(cmd)` replaces fzf with a command, `--disabled` turns off fzf's own matching so an external tool does the search on every keystroke.

```bash
# Search file contents with ripgrep as you type; Enter opens the match in vim
rg_fzf() {
  fzf --disabled --ansi --delimiter : \
      --bind "start:reload:rg --line-number --no-heading --color=always --smart-case {q} || true" \
      --bind "change:reload:sleep 0.1; rg --line-number --no-heading --color=always --smart-case {q} || true" \
      --preview 'head -n 200 {1}' --preview-window 'up,60%,+{2}+3/3,~3' \
      --bind 'enter:become(vim {1} +{2})'
}
```

### Non-interactive use in scripts

`--filter` prints the matches for a query, best first, and exits. It reads stdin, never opens a terminal, and exits 1 when nothing matched.

```bash
find src -type f | fzf --filter 'api users'      # prints src/api/users.ts
git branch --format='%(refname:short)' | fzf --filter 'feat login' | head -n 1
```

Other scripting flags: `-q` starts with a query, `-1` selects automatically when there is exactly one match, `-0` exits at once when there is none, `--expect=ctrl-v,ctrl-t` makes the pressed key the first output line, `--print-query` prints the typed query first.

Matching syntax in the query box: space separates AND terms, `'word` is exact, `^start`, `end$`, `!word` excludes, `a | b` is OR, and `-e` makes everything exact by default.

## Examples

### Example 1 — Fuzzy history and file picking in zsh

**Request:** "Make my shell fuzzy-search history with Ctrl-R and let me pick files with a preview using Ctrl-T. I use zsh and ripgrep."

**Steps:** confirm `fzf --version` is at least 0.48, then append this to `~/.zshrc`:

```bash
source <(fzf --zsh)
export FZF_DEFAULT_COMMAND='rg --files --hidden --glob "!.git"'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_DEFAULT_OPTS="--height=40% --layout=reverse --border"
export FZF_CTRL_T_OPTS="--preview 'head -n 100 {}' --bind 'ctrl-/:change-preview-window(down|hidden|)'"
export FZF_CTRL_R_OPTS="--no-sort"
```

**Result:** after `exec zsh`, `Ctrl-R` opens a bordered picker over history, `Ctrl-T` lists the repository files without anything from `.git` and shows the first 100 lines of the highlighted one, and `Ctrl-/` moves the preview below or hides it. Tell the user to open a new shell to try it, since the agent cannot press keys.

### Example 2 — Find the right file in a script without a terminal

**Request:** "In the deploy script, pick the Terraform file that best matches the environment name passed as `$1`."

```bash
#!/usr/bin/env bash
set -euo pipefail
env_name="${1:?usage: pick-tfvars.sh <environment>}"
match=$(find infra -name '*.tfvars' | fzf --filter "$env_name" | head -n 1)
[ -n "$match" ] || { echo "no tfvars file matches '$env_name'" >&2; exit 1; }
echo "using $match"
```

**Result:** with `infra/prod-eu.tfvars` and `infra/staging.tfvars`, `./pick-tfvars.sh prod` prints `using infra/prod-eu.tfvars`; `./pick-tfvars.sh qa` prints the error and exits 1. `fzf --filter` is deterministic, so the script is safe in CI.

### Example 3 — Interactive branch cleanup helper

**Request:** "Give me a command that lists local branches and lets me delete several at once."

```bash
git-prune-pick() {
  git branch --format='%(refname:short)' \
    | grep -vx -e main -e master \
    | fzf --multi --height=40% --header 'Tab to mark, Enter to delete' \
    | xargs -r git branch -d
}
```

**Result:** the picker never lists `main` or `master`, `Tab` marks branches, `Enter` runs `git branch -d` (the safe delete, which refuses unmerged branches) on all of them. Cancelling with `Esc` deletes nothing.

## Guidelines

- fzf needs a terminal for the interactive picker. In a non-interactive agent session use `--filter`, or write the function for the user to run.
- Always quote `{}` inside `--preview` and `--bind` strings with single quotes so the outer shell does not expand them. Wrap the command, do not interpolate untrusted file names into a string yourself.
- Use `--read0`/`--print0` with `xargs -0` when names may contain spaces or newlines. Use `xargs -r` so an empty selection (user pressed `Esc`) does not run the command with no arguments.
- Cancelling with `Esc` or `Ctrl-C` makes fzf exit with 130 and print nothing; check the exit status before using the output.
- A slow `FZF_DEFAULT_COMMAND` makes every picker slow: prefer `rg --files` or `fd` over `find` for large trees, and skip build directories.
- `FZF_DEFAULT_OPTS` is read on every call, including inside scripts. Keep layout flags there but do not put `--bind` actions that surprise other scripts.
- `--listen` starts an HTTP server that can send actions to a running fzf; leave it out unless asked, and never use `--listen-unsafe` on a shared machine.
- fzf is a filter, not a searcher: it is not the tool for grepping inside many large files (use ripgrep and feed fzf the results) and not for fuzzy search over millions of records (use a real index).
