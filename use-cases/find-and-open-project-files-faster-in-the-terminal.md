---
title: Find and Open Project Files Faster with fzf and Yazi
slug: find-and-open-project-files-faster-in-the-terminal
description: Set up fuzzy file search, history search and a previewing file manager in the shell so a developer stops retyping paths and scrolling through ls output.
skills:
  - fzf
  - yazi
  - neovim
category: productivity
tags:
  - terminal
  - fuzzy-finder
  - file-manager
  - shell
  - developer-experience
---

# Find and Open Project Files Faster with fzf and Yazi

## The Problem

Priya Raman is a backend developer on a monorepo with about 4,200 tracked files: eleven services, a shared `libs/` directory, Terraform in `infra/`, and runbooks in `docs/`. Her day in the terminal is `ls`, `cd ../../services/billing/src`, `vim` plus a half-remembered path, and `Ctrl-R` hunting through a history with 30,000 lines for a `kubectl` command she ran last Tuesday. She opens files in the editor only to find out they were the wrong ones, because `config.ts` exists in nine places. She also works on a jump host with no GUI, where "just open the folder in Finder" is not an option.

She asks her agent to make the shell do the finding.

## The Solution

Two tools cover two different moments. **fzf** is for when she knows roughly what the thing is called: it turns any list (files, history, git branches, search hits) into a type-to-narrow picker with a preview. **Yazi** is for when she does not know what she is looking for yet: a three-pane file manager with previews, bulk copy and move, and a shell wrapper that leaves her shell in the directory she browsed to. The agent installs and configures both, wires fzf to ripgrep so results respect `.gitignore`, and opens the chosen file with Neovim. The two also cooperate: Yazi's `z` key uses fzf to jump into the current subtree.

## Step-by-Step Walkthrough

### 1. Install the tools and check versions

Prompt: "Install fzf and yazi on this Ubuntu box. I have no root on the jump host, so a user-level install is fine there."

The agent installs from the package manager on the laptop and from checksum-verified release archives on the jump host, then confirms the versions it needs:

```bash
fzf --version      # needs 0.48+ for `fzf --bash`; 0.53+ for Yazi's `z` key
yazi --version && ya --version
```

Both Yazi binaries must show the same version. Optional helpers (ripgrep, fd, jq, poppler) are installed where the package manager allows it, because they power content search and previews.

### 2. Wire fzf into bash

Prompt: "Give me Ctrl-R for history, Ctrl-T for files with a preview, and make it ignore `node_modules` and `.git`."

The agent appends this to `~/.bashrc` and explains that it is not testing the key presses, since it has no interactive terminal:

```bash
eval "$(fzf --bash)"
export FZF_DEFAULT_COMMAND='rg --files --hidden --glob "!.git"'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_DEFAULT_OPTS="--height=40% --layout=reverse --border"
export FZF_CTRL_T_OPTS="--preview 'head -n 100 {}' --bind 'ctrl-/:change-preview-window(down|hidden|)'"
```

What it can test is the list fzf will search. In the repo root:

```bash
rg --files --hidden --glob '!.git' | wc -l           # 4213 files, no .git internals
rg --files --hidden --glob '!.git' | fzf --filter 'billing config' | head -n 3
```

The second command prints the three best matches, `services/billing/src/config.ts` first, which proves that the nine `config.ts` files are now told apart by their directory.

### 3. Add a live content search

Prompt: "I also want to type a function name and land on the line in the editor."

The agent adds a function that lets ripgrep do the searching on every keystroke and fzf do the browsing, with the match shown in the preview and Neovim opened at the line on Enter:

```bash
rgv() {
  fzf --disabled --ansi --delimiter : \
      --bind "start:reload:rg --line-number --no-heading --color=always --smart-case {q} || true" \
      --bind "change:reload:sleep 0.1; rg --line-number --no-heading --color=always --smart-case {q} || true" \
      --preview 'head -n 200 {1}' --preview-window 'up,60%,+{2}+3/3,~3' \
      --bind 'enter:become(nvim {1} +{2})'
}
```

### 4. Install Yazi with the directory-following wrapper

Prompt: "Set up yazi so that when I quit it, my shell is in the folder I was browsing."

The agent adds the `y` function from the Yazi docs to `~/.bashrc`:

```bash
function y() {
	local tmp cwd; tmp="$(mktemp -t "yazi-cwd.XXXXXX")"
	command yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ "$cwd" != "$PWD" ] && [ -d "$cwd" ] && builtin cd -- "$cwd" || builtin true
	command rm -f -- "$tmp"
}
```

It then writes a small `~/.config/yazi/yazi.toml` so numbered runbooks sort sensibly and directories come first:

```toml
[mgr]
sort_by        = "natural"
sort_dir_first = true
show_hidden    = true
```

### 5. Show Git state while browsing

Prompt: "In yazi I want to see which files I've touched."

```bash
ya pkg add yazi-rs/plugins:git
ya pkg list
```

The agent adds `require("git"):setup { order = 1500 }` to `~/.config/yazi/init.lua` and the two `[[plugin.prepend_fetchers]]` blocks from the plugin's README to `yazi.toml`, and tells Priya to restart Yazi.

### 6. Hand over a cheat sheet

The agent finishes with the keys Priya will use, and the reminder that it could only verify the lists and configuration, not the interactive screens.

## Real-World Example

On her next ticket, "Billing webhooks retry too early," Priya presses `Ctrl-T` in the repo, types `webhook retry`, and previews `services/billing/src/webhooks/retry.ts` before opening it. She types `rgv backoffMs`, sees all four call sites with the matching line in the preview, and jumps straight to the one in the queue worker. To check how last quarter's incident runbooks were named, she runs `y docs/runbooks`, sorts naturally, presses `S` to search contents for "retry", copies two files to the new folder with `y` and `p`, and quits with `q`: her shell is now in `docs/runbooks/2026-q3`.

The first week she measures two things. A file she knows the name of takes about five seconds from thought to editor, down from roughly twenty, because she no longer types or tab-completes paths. `Ctrl-R` stops being something she gives up on. The setup is three small blocks in `~/.bashrc` plus two files in `~/.config/yazi/`, all in her dotfiles repository, so the jump host gets the same behavior after one `git pull` and `ya pkg install`.

## Related Skills

- [fzf](/skills/fzf) — fuzzy picker for files, history, branches and search hits, plus `--filter` for scripts
- [yazi](/skills/yazi) — terminal file manager with previews, bulk operations and plugins, and the shell wrapper
- [neovim](/skills/neovim) — the editor that opens the chosen file at the right line
