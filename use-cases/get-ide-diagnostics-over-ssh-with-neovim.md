---
title: Get IDE Diagnostics and Format-on-Save over SSH with Neovim
slug: get-ide-diagnostics-over-ssh-with-neovim
description: Turn a bare terminal editor on a remote dev box into one that shows type and lint errors as you type and formats on save, so fewer pushes fail CI.
skills:
  - neovim
  - ruff
  - uv
category: development
tags:
  - remote-development
  - ssh
  - language-server
  - format-on-save
  - python
---

# Get IDE Diagnostics and Format-on-Save over SSH with Neovim

## The Problem

Priya Raman writes the route-scoring service at a 14-person delivery startup. The code runs against a 60 GB trips dataset that lives on a shared GPU server, so she works there over SSH instead of on her laptop. The server's policy does not allow the VS Code remote server, which leaves her with the Neovim 0.9 that came with the OS image and no configuration: no diagnostics, no go-to-definition, no formatter.

The cost shows up in CI. Every mistake the editor could have caught — an unused import, a misspelled name, a missing space around `->` — is found by the lint job about 11 minutes after the push. In the last two weeks, 9 of her 31 pushes failed on lint or type checks alone, roughly an hour and a half of waiting and re-pushing. Two teammates on the same server have the same setup, each with a half-finished config copied from a blog post that now prints deprecation warnings on start.

She wants the editor on the server to report the same problems CI reports, fix formatting on save, and be reproducible, so the other two can use the same config.

## The Solution

The agent installs a current Neovim (0.12, which has a built-in plugin manager), puts the Python language servers on `PATH` with uv, and writes a short `init.lua` that uses Neovim's own LSP client: nvim-lspconfig supplies the server definitions, `vim.lsp.enable` turns them on, and one `BufWritePre` autocommand formats through ruff. Ruff reads the same `pyproject.toml` rules that CI uses, so the editor and the pipeline agree. The agent checks everything headless — no interactive session needed — and commits the config with its plugin lockfile.

## Step-by-Step Walkthrough

### 1. Install a current Neovim

> Priya: "The server has nvim 0.9 from apt. Install a current release under /opt without touching the system package."

```bash
nvim --version | head -1
VER=v0.12.5
curl -LO https://github.com/neovim/neovim/releases/download/$VER/nvim-linux-x86_64.tar.gz
# GitHub records a SHA-256 digest for every release asset; compare before extracting
WANT=$(curl -s https://api.github.com/repos/neovim/neovim/releases/tags/$VER \
  | jq -r '.assets[] | select(.name == "nvim-linux-x86_64.tar.gz") | .digest' | cut -d: -f2)
echo "$WANT  nvim-linux-x86_64.tar.gz" | sha256sum -c -   # must print OK
sudo tar -C /opt -xzf nvim-linux-x86_64.tar.gz
echo 'export PATH="/opt/nvim-linux-x86_64/bin:$PATH"' >> ~/.bashrc
```

The agent puts `/opt/nvim-linux-x86_64/bin` first on `PATH` so the new binary wins over `/usr/bin/nvim`, opens a new shell and confirms that `nvim --version` now starts with `NVIM v0.12`.

### 2. Put the language servers on PATH

> Priya: "Install pyright and ruff for my user only."

```bash
uv tool install ruff
uv tool install pyright
command -v ruff pyright-langserver
```

`uv tool install` puts each tool in its own isolated environment under Priya's home directory and links the commands into `~/.local/bin`, so nothing needs `sudo` (a global `npm install -g` would write to the system Node prefix). The `ruff` binary includes the `ruff server` language server. The PyPI `pyright` package provides `pyright-langserver`, which is the command nvim-lspconfig starts; the wheel bundles pyright itself and, if no Node.js is on `PATH`, downloads a private one into `~/.cache/pyright-python` on first run.

### 3. Match the CI lint rules

> Priya: "Make sure the editor flags the same rules CI does."

The CI job runs `ruff check` and `ruff format --check`, so the rules live in `pyproject.toml` and the editor server picks them up automatically:

```toml
[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP"]
```

### 4. Write the config

> Priya: "Write ~/.config/nvim/init.lua: pyright for types, ruff for lint and formatting on save, errors shown inline."

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

The format check runs at save time on purpose: ruff registers its formatting capability after it attaches, so a check inside `LspAttach` would miss it.

### 5. Verify without opening the UI

> Priya: "Check the config loads cleanly and both servers are configured."

```bash
nvim --headless +qa
nvim --headless -c 'if v:errmsg != "" | cquit 1 | endif' -c qa && echo config-ok
nvim --headless "+checkhealth vim.lsp" "+write! lsp-health.txt" +qa
```

The first command clones nvim-lspconfig and writes `nvim-pack-lock.json`. The second exits non-zero if `init.lua` raised an error. The health report lists `pyright` (`pyright-langserver --stdio`) and `ruff` (`ruff server`) under "Enabled Configurations", with `pyproject.toml` among the root markers.

### 6. Share it

> Priya: "Put this in our team dotfiles repo so Marco and Jun get the same plugin versions."

The agent copies `init.lua` and `nvim-pack-lock.json` into the repo's `nvim/` folder and adds a README line: install, then run `nvim --headless +qa` once. The lockfile makes the other machines check out the same nvim-lspconfig revision.

## Real-World Example

On the first file Priya opened, `scoring/weights.py`, the editor showed three problems that would each have failed CI: an unused `import os`, a call to the misspelled `normalise_wieghts`, and a return type pyright reported as `float | None` where `float` was declared. Saving the file reformatted 23 lines to the team's 100-column style.

Over the next two weeks she pushed 28 times and one push failed lint — a rule added to CI that day. Marco and Jun deleted their copied configs, cloned the dotfiles repo and had the same setup in under five minutes each. The whole config is 25 lines, and the only plugin is nvim-lspconfig.

## Related Skills

- [neovim](/skills/neovim) — installs Neovim 0.12, writes `init.lua` with `vim.pack`, `vim.lsp.enable` and format-on-save, and verifies it headless.
- [ruff](/skills/ruff) — the linter and formatter behind the inline diagnostics and save-time formatting, configured once in `pyproject.toml` for both editor and CI.
- [uv](/skills/uv) — installs ruff as an isolated user tool with `uv tool install`.
