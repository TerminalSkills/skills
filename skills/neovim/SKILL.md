---
name: neovim
description: >-
  Neovim is a terminal text editor configured in Lua, with a built-in LSP client,
  Treesitter parsing and, since 0.12, a built-in plugin manager (vim.pack). Use
  this skill to install Neovim, write or repair an init.lua, add plugins, wire up
  language servers with vim.lsp.config and vim.lsp.enable, set up format-on-save,
  or run Neovim headless for scripted edits. Trigger phrases: "set up neovim",
  "fix my init.lua", "neovim LSP not working", "lspconfig deprecated warning",
  "add a plugin to nvim", "nvim --headless", "format on save in neovim".
license: Apache-2.0
compatibility: "Neovim 0.12+ for vim.pack (0.11+ for vim.lsp.config/enable); git for plugin installs; language servers installed separately"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["neovim", "lua", "lsp", "treesitter", "text-editor"]
  repository: https://github.com/neovim/neovim
---

# Neovim — Lua-configured terminal editor with built-in LSP

## Overview

Neovim (`nvim`) is a Vim-based editor that runs in a terminal and is configured with Lua. It ships an LSP client (diagnostics, go-to-definition, rename, formatting), Treesitter (syntax trees for highlighting, folding and queries) and, from 0.12, `vim.pack`, a Git-based plugin manager with a lockfile. The current stable line is 0.12.x (0.12.5 at the time of writing).

An agent cannot usefully drive the interactive UI, but it can do most of the setup work: install the binary, write `init.lua`, pin plugins, configure language servers, check the config for errors and run Neovim headless for batch edits. This skill covers those jobs.

## Instructions

### Installation

Package managers first; check the version afterwards, because distribution packages often lag behind and `vim.pack` needs 0.12.

```bash
brew install neovim            # macOS or Linux with Homebrew
winget install Neovim.Neovim   # Windows
sudo pacman -S neovim          # Arch
nvim --version | head -1       # expect NVIM v0.12.x
```

If the distro package is too old, use the official release archive (download, then extract as a separate step):

```bash
VER=v0.12.5
curl -LO https://github.com/neovim/neovim/releases/download/$VER/nvim-linux-x86_64.tar.gz
# GitHub records a SHA-256 digest for every release asset; compare before extracting
WANT=$(curl -s https://api.github.com/repos/neovim/neovim/releases/tags/$VER \
  | jq -r '.assets[] | select(.name == "nvim-linux-x86_64.tar.gz") | .digest' | cut -d: -f2)
echo "$WANT  nvim-linux-x86_64.tar.gz" | sha256sum -c -   # must print OK
sudo tar -C /opt -xzf nvim-linux-x86_64.tar.gz
echo 'export PATH="/opt/nvim-linux-x86_64/bin:$PATH"' >> ~/.bashrc
```

Prepending puts the new binary ahead of an older `/usr/bin/nvim`. Archives exist for `linux-arm64`, `macos-arm64` and `macos-x86_64` too.

### Config layout

- `~/.config/nvim/init.lua` — entry point (`:echo stdpath('config')` shows the real path).
- `~/.config/nvim/lua/<name>.lua` — modules loaded with `require('<name>')`.
- `~/.config/nvim/lsp/<server>.lua` — a language-server config returned as a table.
- `~/.config/nvim/after/lsp/<server>.lua` — overrides that win over plugin-provided configs.
- `~/.config/nvim/nvim-pack-lock.json` — the `vim.pack` lockfile; commit it with the config.

To try a config without touching the user's, set `NVIM_APPNAME`: Neovim then reads `~/.config/<name>` and keeps separate data and state directories.

```bash
NVIM_APPNAME=nvim-trial nvim
```

### Plugins with vim.pack (0.12+)

`vim.pack.add()` clones missing plugins into the data directory (`site/pack/core/opt`) and loads them. It needs `git` and is marked experimental in the docs.

```lua
vim.pack.add({
  'https://github.com/neovim/nvim-lspconfig',
  { src = 'https://github.com/nvim-treesitter/nvim-treesitter', version = 'main' },
})
```

- `vim.pack.update()` fetches updates and opens a review buffer: `:write` applies, `:quit` discards. `vim.pack.update(nil, { force = true })` skips the review.
- `vim.pack.update(nil, { target = 'lockfile' })` moves plugins back to the lockfile revisions.
- To remove a plugin, first delete it from the `add()` list and `:restart`, then run `vim.pack.del({ 'plugin-name' })`. `del()` refuses a plugin that is still loaded unless you pass `{ force = true }`.
- Build steps go in a `PackChanged` autocommand defined before `vim.pack.add()`.

Third-party managers such as lazy.nvim still work; do not mix two managers for the same plugin.

### Language servers (vim.lsp.config / vim.lsp.enable)

Neovim provides the client; servers are separate programs on `PATH`. nvim-lspconfig ships ready-made configs in its `lsp/` directory, so after installing it one line per server is enough:

```lua
vim.lsp.enable({ 'pyright', 'ruff', 'ts_ls', 'lua_ls' })
```

Customise with `vim.lsp.config()`; it merges over the plugin's defaults:

```lua
vim.lsp.config('lua_ls', {
  settings = { Lua = { runtime = { version = 'LuaJIT' } } },
})
vim.lsp.config('pyright', { root_markers = { 'pyproject.toml', '.git' } })
vim.lsp.config('*', {   -- fallback for fields a server's own config leaves unset
  capabilities = { textDocument = { semanticTokens = { multilineTokenSupport = true } } },
})
```

`'*'` has the lowest priority: nvim-lspconfig's `lsp/<server>.lua` files override it, so setting `root_markers` there changes nothing. Set root markers per server, as above, or in `after/lsp/<server>.lua`.

A server that nvim-lspconfig does not know needs `cmd`, `filetypes` and `root_markers`. The old `require('lspconfig').<server>.setup{}` framework is deprecated; replace each call with `vim.lsp.config` (settings) plus `vim.lsp.enable` (activation).

Built-in keymaps once a server attaches: `K` hover, `grn` rename, `grr` references, `gri` implementation, `gra` code action, `gO` document symbols, `CTRL-S` signature help in insert mode, and `CTRL-]` jumps to the definition through 'tagfunc'. `:lsp restart` and `:lsp stop` manage clients.

### Format on save and completion

Some servers (ruff, for example) register formatting only after they attach, so check capability when saving rather than inside `LspAttach`:

```lua
vim.api.nvim_create_autocmd('BufWritePre', {
  group = vim.api.nvim_create_augroup('my.format', {}),
  callback = function(ev)
    if #vim.lsp.get_clients({ bufnr = ev.buf, method = 'textDocument/formatting' }) > 0 then
      vim.lsp.buf.format({ bufnr = ev.buf, timeout_ms = 2000 })
    end
  end,
})

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('my.lsp', {}),
  callback = function(ev)
    local client = assert(vim.lsp.get_client_by_id(ev.data.client_id))
    if client:supports_method('textDocument/completion') then
      vim.lsp.completion.enable(true, client.id, ev.buf, { autotrigger = true })
    end
  end,
})
```

With several formatters attached, pass `name = 'ruff'` or a `filter` function to `vim.lsp.buf.format()`.

### Treesitter

Neovim bundles parsers for C, Lua, Markdown, Vimscript, Vimdoc and Treesitter queries. Other languages need parsers, usually from nvim-treesitter (its `main` branch requires Neovim 0.12, `tree-sitter-cli` and a C compiler; the old `master` branch is frozen).

```lua
require('nvim-treesitter').install({ 'python', 'typescript', 'tsx' })

vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'python', 'typescript', 'typescriptreact', 'lua' },
  callback = function(ev)
    -- pcall: the parser may not be installed yet (install() is asynchronous)
    if pcall(vim.treesitter.start, ev.buf) then
      vim.wo[0][0].foldexpr = 'v:lua.vim.treesitter.foldexpr()'
      vim.wo[0][0].foldmethod = 'expr'
    end
  end,
})
```

Without the `pcall`, every buffer of a language whose parser is missing raises "Parser could not be created". To install parsers before first use, for example on a new machine, wait for the install in a headless run:

```bash
nvim --headless -c "lua require('nvim-treesitter').install({ 'python', 'typescript', 'tsx' }):wait(300000)" -c qa
```

After updating nvim-treesitter, run `:TSUpdate` so parsers match the plugin.

### Headless and scripted use

```bash
nvim --headless +qa                                  # load the config, install vim.pack plugins, exit
nvim --headless "+checkhealth vim.lsp" "+write! lsp-health.txt" +qa
nvim --headless -c 'lua vim.pack.update(nil, { force = true })' -c qa
nvim -l scripts/report.lua src/app.lua               # run a Lua script with Neovim's API, then exit
```

- `nvim -l script.lua args…` skips the user config, exposes arguments as `arg[1]…`, and sends `print()` to stderr; use `io.write()` for stdout.
- `nvim --clean` starts with no user config or plugins — the fastest way to tell a config bug from a Neovim bug.
- `nvim --headless +qa` exits 0 even when `init.lua` fails. To get a failing exit code, test `v:errmsg`: `nvim --headless -c 'if v:errmsg != "" | cquit 1 | endif' -c qa`.

## Examples

### Example 1: Python IDE features over SSH

**User request:** "Set up Neovim on the build box for our `invoicing` Python service: pyright for types, ruff for lint and format on save."

```bash
uv tool install pyright   # PyPI wrapper; provides pyright-langserver
uv tool install ruff
```

`~/.config/nvim/init.lua`:

```lua
vim.g.mapleader = ' '
vim.o.number = true
vim.o.expandtab = true
vim.o.shiftwidth = 4
vim.o.undofile = true

vim.pack.add({ 'https://github.com/neovim/nvim-lspconfig' })
vim.lsp.enable({ 'pyright', 'ruff' })

vim.diagnostic.config({ virtual_text = true })
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Show diagnostic' })

vim.api.nvim_create_autocmd('BufWritePre', {
  group = vim.api.nvim_create_augroup('my.format', {}),
  callback = function(ev)
    if #vim.lsp.get_clients({ bufnr = ev.buf, method = 'textDocument/formatting' }) > 0 then
      vim.lsp.buf.format({ bufnr = ev.buf, timeout_ms = 2000 })
    end
  end,
})
```

```bash
nvim --headless +qa        # clones nvim-lspconfig and writes nvim-pack-lock.json
```

**Result:** opening `billing.py` inside the project (which has a `pyproject.toml`) attaches both servers with the project as root. Ruff flags "`os` imported but unused" and "Undefined name `totl`" inline, and `:w` rewrites `def total(items:list[float])->float:` as `def total(items: list[float]) -> float:` with two blank lines around top-level definitions.

### Example 2: Remove the lspconfig deprecation warning

**User request:** "After updating plugins I get 'The `require('lspconfig')` framework is deprecated, use vim.lsp.config'. Fix my config for TypeScript and Lua."

Old code:

```lua
require('lspconfig').ts_ls.setup({ on_attach = on_attach })
require('lspconfig').lua_ls.setup({ settings = { Lua = { diagnostics = { globals = { 'vim' } } } } })
```

Replacement (keep nvim-lspconfig installed — its `lsp/` configs are still used):

```lua
vim.lsp.config('lua_ls', {
  settings = { Lua = { diagnostics = { globals = { 'vim' } } } },
})
vim.lsp.enable({ 'ts_ls', 'lua_ls' })
-- on_attach logic moves into an LspAttach autocommand (see Instructions)
```

```bash
nvim --headless -c 'if v:errmsg != "" | cquit 1 | endif' -c qa && echo config-ok
```

**Result:** `config-ok` prints, the warning is gone, and `:checkhealth vim.lsp` lists `ts_ls` and `lua_ls` under "Enabled Configurations".

### Example 3: Rename a class across a folder without opening the UI

**User request:** "Rename `BillingClient` to `LedgerClient` in every file under `handlers/`."

```bash
nvim --clean --headless -c 'argdo %s/\<BillingClient\>/LedgerClient/ge | update' -c qa handlers/*.py
grep -rn "LedgerClient" handlers/
```

**Result:** `handlers/refunds.py` and `handlers/invoices.py` are rewritten; `handlers/health.py`, which had no match, is left untouched because `update` writes only modified buffers. `\<…\>` keeps `BillingClientError` from being changed. For symbol-aware renames that follow imports, use `grn` with a language server instead.

## Guidelines

- Check `nvim --version` before writing config: `vim.pack` needs 0.12, `vim.lsp.config`/`vim.lsp.enable` need 0.11. Current nvim-lspconfig requires 0.11.3 or newer.
- Language servers are not bundled. Install them with the ecosystem's package manager and confirm the binary (`pyright-langserver`, `ruff`, `typescript-language-server`) is on `PATH` for the process that starts Neovim.
- Root markers (`pyproject.toml`, `package.json`, `.git`…) decide the workspace root. Without one, most servers (pyright, ruff, lua_ls) still attach in single-file mode with no root, so cross-file features are weaker. Servers marked `workspace_required` (eslint, biome, tailwindcss) do not attach at all outside a project. `:checkhealth vim.lsp` shows the resolved `cmd`, filetypes and root markers.
- Put the user's own overrides in `vim.lsp.config()` or `after/lsp/`, not in the plugin directory; plugin updates overwrite it.
- Commit `nvim-pack-lock.json` so another machine installs the same plugin revisions; do not edit it by hand.
- Before editing someone's config, back it up by copying, or work under `NVIM_APPNAME`. Do not delete the data directory to "fix" plugins; use `vim.pack.del()` or `vim.pack.update(nil, { target = 'lockfile' })`.
- Plugins are code from third parties that runs with the user's permissions. Pin to tags with `version = vim.version.range('1.0')` where a plugin publishes semver tags, and review `vim.pack.update()` changes before `:write`.
- Headless regex edits are text replacements, not refactors: they ignore scope, strings and comments. Use them for mechanical changes and check the diff afterwards.
- Do not use this skill for editor-agnostic tasks (formatting in CI, linting) — call the formatter or linter directly; for VS Code or Zed, use their own settings.
