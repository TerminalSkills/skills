---
name: yazi
description: >-
  Yazi is a fast terminal file manager written in Rust with asynchronous I/O, file previews, tabs, bulk selection and Lua plugins. Use it when the user asks to "install yazi", "set up a terminal file manager", "make yazi change my shell directory on exit", "configure yazi keybindings", "add a yazi plugin", "show git status in yazi", or "preview images and PDFs in the terminal". Covers installing the yazi and ya binaries, the optional helper tools, the `y` shell wrapper, yazi.toml, keymap.toml, init.lua and `ya pkg`.
license: Apache-2.0
compatibility: "Linux, macOS or Windows terminal; `file` is required; optional ffmpeg, 7-Zip, jq, poppler, fd, ripgrep, fzf 0.53+, zoxide, ImageMagick for previews and search"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "yazi, file-manager, tui, terminal, rust"
  repository: https://github.com/sxyazi/yazi
---

# Yazi — terminal file manager with previews and plugins

## Overview

Yazi shows three panes (parent directory, current directory, preview), keeps the UI responsive while it copies, searches or generates thumbnails in the background, and is driven by Vim-style keys. It previews text with syntax highlighting, images, video thumbnails, PDFs, archives and JSON when the matching helper tools are installed.

Yazi is an interactive full-screen program: an agent cannot operate it, and it does not run in non-interactive scripts (started without a terminal it exits with "Not a tty"). The agent's job is the surroundings: installing `yazi` and `ya`, adding the shell wrapper so the shell follows the directory you left Yazi in, writing `~/.config/yazi/yazi.toml`, `keymap.toml` and `init.lua`, and installing plugins with `ya pkg`.

Releases ship two binaries that must have the same version: `yazi` (the UI) and `ya` (package manager and message tool).

## Instructions

### Installation

Prefer the package manager; it also pulls the helper tools.

```bash
brew install yazi ffmpeg-full sevenzip jq poppler fd ripgrep fzf zoxide resvg imagemagick-full   # macOS, Linux (Homebrew)
sudo pacman -S yazi ffmpeg 7zip jq poppler fd ripgrep fzf zoxide resvg imagemagick               # Arch
sudo snap install yazi --classic                                                                  # Snap
winget install sxyazi.yazi                                                                        # Windows
scoop install yazi                                                                                # Windows (Scoop)
```

Debian and Ubuntu users can use the project's own APT repository or a `.deb` from the releases page; the exact steps are on https://yazi-rs.github.io/docs/installation. As a fallback, download a release archive from https://github.com/sxyazi/yazi/releases (the release page lists a SHA-256 digest for each asset), check it, unzip it and put both `yazi` and `ya` on PATH:

```bash
sha256sum --check <<< "9b9c39decccf8cb0ff53a7d637d38f8a79d93bbd0099f4ea9c619ef6bb392f5d  yazi-x86_64-unknown-linux-musl.zip"
unzip yazi-x86_64-unknown-linux-musl.zip
install -m 0755 yazi-x86_64-unknown-linux-musl/yazi yazi-x86_64-unknown-linux-musl/ya ~/.local/bin/
yazi --version && ya --version
```

Helper tools and what they enable: `file` (file type detection, required), `ffmpeg` (video thumbnails), `7-Zip` (archive preview and extraction), `jq` (JSON preview), `poppler` (PDF preview), `fd` (key `s`, search by name), `ripgrep` (key `S`, search by content), `fzf` 0.53+ (key `z`, jump to a file or directory in the subtree), `zoxide` (key `Z`, jump to a frequently used directory), ImageMagick 7.1.1+ (fonts, HEIC, JPEG XL). Image preview depends on the terminal; see https://yazi-rs.github.io/docs/image-preview.

### Shell wrapper: change directory on exit

Run `yazi` directly and the shell stays where it was. The documented `y` function passes `--cwd-file`, then `cd`s into whatever directory Yazi was in when it quit. Add it to `~/.bashrc` or `~/.zshrc`:

```bash
function y() {
	local tmp cwd; tmp="$(mktemp -t "yazi-cwd.XXXXXX")"
	command yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ "$cwd" != "$PWD" ] && [ -d "$cwd" ] && builtin cd -- "$cwd" || builtin true
	command rm -f -- "$tmp"
}
```

Then use `y` instead of `yazi`. Quit with `q` to change the shell directory, or `Q` to quit without changing it. Fish, Nushell, PowerShell, cmd.exe, Xonsh, Elvish and POSIX sh versions are on https://yazi-rs.github.io/docs/quick-start.

### Keys worth telling the user

`h j k l` or arrows to move, `Space` to select, `v` for visual selection, `Enter` or `o` to open, `y`/`x`/`p` to copy, cut, paste, `d` to trash, `D` to delete permanently, `a` to create (end the name with `/` for a directory), `r` to rename, `.` to toggle hidden files, `f` to filter the current directory, `/` to find, `s`/`S` to search by name/content, `z` and `Z` to jump with fzf/zoxide, `Tab` for file info, `t` `t` for a new tab and `1`-`9` to switch tabs, `w` for the task manager, `~` or `F1` for help, `,` then a letter to sort (`,m` modified, `,s` size, `,n` natural).

### Configuration files

All live in `~/.config/yazi/` (Windows: `%AppData%\yazi\config\`); `YAZI_CONFIG_HOME` points Yazi at another directory. Your files override the shipped defaults, so write only what you change. Defaults are at https://github.com/sxyazi/yazi/tree/shipped/yazi-config/preset.

```toml
# ~/.config/yazi/yazi.toml
[mgr]
ratio          = [1, 3, 4]        # parent : current : preview
sort_by        = "natural"
sort_dir_first = true
show_hidden    = true
linemode       = "size"           # also: mtime, permissions, owner, btime

[open]
prepend_rules = [
	{ url = "*.json", use = "edit" },
]
```

For key bindings use `prepend_keymap` (wins over defaults) or `append_keymap` (only used if no default matches). Do not mix the array style and the `[[mgr.prepend_keymap]]` style for the same list.

```toml
# ~/.config/yazi/keymap.toml
[mgr]
prepend_keymap = [
	{ on = [ "g", "d" ], run = "cd ~/Downloads", desc = "Go to Downloads" },
	{ on = [ "g", "p" ], run = "cd ~/Pictures",  desc = "Go to Pictures" },
]
```

Openers in `yazi.toml` define commands such as `edit = [{ run = "$EDITOR %s", block = true, for = "unix" }]`; `%s` is the selected paths, `%s1` the first one. Use `block = true` for terminal programs and `orphan = true` for GUI programs that should outlive Yazi.

### Plugins with `ya pkg`

`ya pkg` clones from GitHub, copies the plugin into `~/.config/yazi/plugins/`, and pins the revision in `~/.config/yazi/package.toml`.

```bash
ya pkg add yazi-rs/plugins:git     # a plugin from a monorepo subdirectory
ya pkg add owner/some-plugin       # a plugin repo named some-plugin.yazi
ya pkg list
ya pkg upgrade
ya pkg install                     # restore everything listed in package.toml on a new machine
ya pkg delete yazi-rs/plugins:git
```

Each plugin's README says how to enable it. The `git` plugin shows Git status next to files:

```lua
-- ~/.config/yazi/init.lua
require("git"):setup {
	order = 1500,
}
```

```toml
# ~/.config/yazi/yazi.toml
[[plugin.prepend_fetchers]]
url   = "*"
run   = "git"
group = "git"

[[plugin.prepend_fetchers]]
url   = "*/"
run   = "git"
group = "git"
```

`init.lua` runs synchronously at startup, so keep it small. Own plugins are directories named `<name>.yazi` containing `main.lua`, bound with `run = "plugin <name>"` in `keymap.toml`.

## Examples

### Example 1 — Set up Yazi on a fresh Ubuntu laptop

**Request:** "Install yazi and make my terminal cd to wherever I end up when I quit it. I use bash."

**Steps:** install with the project's APT repository or the release archive above, install the fd, ripgrep, fzf, jq and poppler packages from apt for search and previews, append the `y` function to `~/.bashrc`, then run `source ~/.bashrc`.

```bash
yazi --version && ya --version
type y
```

**Result:** both binaries report the same version and `type y` prints the function. The user runs `y ~/projects`, moves to `invoicing/src`, presses `q`, and the prompt is now in `~/projects/invoicing/src`. Tell the user to try it themselves; the agent cannot press keys.

### Example 2 — Natural sorting, dotfiles and a Downloads shortcut

**Request:** "Show hidden files by default, sort numbered scans naturally, and let me jump to Downloads with `g d`."

Write the `yazi.toml` and `keymap.toml` snippets from the configuration section (`sort_by = "natural"`, `show_hidden = true`, the `g d` binding).

**Result:** a directory with `scan-2.pdf`, `scan-10.pdf` lists `scan-2.pdf` before `scan-10.pdf`, dotfiles appear, and `g` `d` jumps to `~/Downloads`. Press `.` to toggle hidden files temporarily.

### Example 3 — Git status in the file list

**Request:** "I want to see which files in my repo are modified while browsing."

```bash
ya pkg add yazi-rs/plugins:git
ya pkg list
```

Then add the `init.lua` and `[[plugin.prepend_fetchers]]` blocks from the plugin section. **Result:** `package.toml` now records `yazi-rs/plugins:git` with a revision, and after restarting Yazi, changed files in a repository carry a status sign on the right. On a second machine, `ya pkg install` restores the same plugin version.

## Guidelines

- Do not try to drive the UI or capture its output from an agent session; it needs a real terminal. Report what was configured and tell the user which keys to press.
- Keep `yazi` and `ya` on the same version; a mismatch breaks plugin commands.
- Config files only need your changes. Copying whole preset files freezes old defaults and hides improvements after an upgrade.
- Run `ya pkg add` only for plugins the user asked for: plugins are Lua code that runs with the user's permissions. Read the plugin's `main.lua` first if it is not from `yazi-rs`.
- `D` deletes permanently, `d` moves to the trash. Do not bind a key to a destructive command without a clear `desc`.
- Previews that silently do nothing are almost always a missing helper (`ffmpeg`, `poppler`, `jq`) or a terminal without image support, not a configuration error.
- Options can change between releases. When a copied snippet from an old blog post fails, check the docs for the installed version.
- For one-off "pick a file from a list" jobs in shell scripts use fzf instead; Yazi is for browsing and bulk file work.
