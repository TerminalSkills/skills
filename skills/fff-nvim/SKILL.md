---
name: fff-nvim
description: >-
  fff (Fast File Finder, fff.nvim) is a Rust file-search toolkit with typo-resistant path and content search, frecency ranking and an in-memory index, shipped as a Neovim picker, an MCP server for AI agents, Node and Bun, Rust and C libraries. Use when the user wants faster file search or grep for Claude Code, Codex or Cursor, a Telescope replacement in Neovim, or a search library for an agent tool.
license: MIT
compatibility: "Neovim (prebuilt binary or Rust toolchain), Node.js or Bun for the SDK, Linux, macOS, Windows"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["file-search", "ai-agents", "neovim", "rust", "mcp"]
  repository: https://github.com/dmtrKovalenko/fff
---

# fff (Fast File Finder)

## Overview

fff keeps a background-watched index of a repository in memory and answers path and content queries from it, so repeated searches are much faster than spawning ripgrep or fzf each time. It ranks by fuzzy score, git status and frecency (files you opened recently rank higher), falls back to fuzzy matching when an exact grep finds nothing, and is MIT licensed. Current release: v0.11.0 (September 2026).

It comes in several forms from one repository (`dmtrKovalenko/fff`; the old `fff.nvim` URL redirects):

| Form | Install | Use |
|------|---------|-----|
| MCP server `fff-mcp` | Homebrew or release binary | Gives Claude Code, Codex, Cursor, Cline, OpenCode a faster `find_files` / `grep` / `multi_grep` |
| Neovim plugin | lazy.nvim or `vim.pack` | Find-files and live-grep pickers |
| Node and Bun SDK | `npm install @ff-labs/fff-node` | Build agent tools or CLIs |
| Pi agent extension | `pi install npm:@ff-labs/pi-fff` | Replaces pi's grep and find |
| Rust crate / C library | `fff-search = "0.11"`, `cargo-c` | Embed in native programs |

There is no standalone `fff` command-line searcher; older notes that show `fff "query" --json` or `cargo install fff-search` describe something that does not exist.

## Instructions

### MCP server for AI agents

```bash
brew install dmtrKovalenko/fff/fff-mcp
fff-mcp --healthcheck            # prints base path, git and database status
```

Without Homebrew, download the `fff-mcp-<target>` binary from the GitHub release page and compare its SHA-256 with the value in the release or in the repository's `Formula/fff-mcp.rb` before running it. The README also offers a `curl | bash` installer; prefer the package or the verified binary.

Register it with your client by absolute path:

```bash
claude mcp add fff -- "$(brew --prefix)/bin/fff-mcp"
codex mcp add fff -- "$(brew --prefix)/bin/fff-mcp"
```

Useful flags: `[PATH]` (directory to index, default the working directory), `--no-watch`, `--no-update-check`, `--no-content-indexing`, `--max-cached-files N`, `--idle-timeout-secs` (default 3600), `--frecency-db` and `--history-db`. It refuses to index `~` or `/` unless `--enable-home-scan` or `--enable-root-scan` is passed. Tools exposed by the 0.11.0 binary: `find_files` (query), `grep` (query, context, output_mode) and `multi_grep` (patterns, constraints); all take `maxResults` and `cursor` for paging. Tell the agent in `CLAUDE.md`: "For file search or grep in this git repository, use the fff tools."

### Neovim plugin (lazy.nvim)

```lua
{
  "dmtrKovalenko/fff",
  build = function() require("fff.download").download_or_build_binary() end,
  lazy = false,   -- the plugin initialises itself lazily
  opts = { max_results = 100 },
  keys = {
    { "<leader>ff", function() require("fff").find_files() end, desc = "Find files (fff)" },
    { "<leader>fg", function() require("fff").live_grep() end, desc = "Live grep (fff)" },
    { "<leader>fw", function() require("fff").live_grep_under_cursor() end, mode = { "n", "x" }, desc = "Grep word/selection" },
  },
}
```

The package name changed from `fff.nvim` to `fff`; run `:Lazy clean` if you had the old one. `download_or_build_binary()` fetches a prebuilt library and falls back to `cargo build`. Commands: `:FFFScan`, `:FFFRefreshGit`, `:FFFClearCache [all|frecency|files]`, `:FFFHealth`, `:FFFDebug`, `:FFFOpenLog`. In the picker `<S-Tab>` cycles plain, regex and fuzzy grep, `<Tab>` multi-selects and `<C-q>` sends the selection to the quickfix list.

Query tokens work in both find and grep: `git:modified`, `test/`, `!test/`, globs such as `./**/*.{rs,lua}`, and in grep `*.md` or `src/main.rs`. Mix them: `git:modified src/**/*.rs !src/**/mod.rs controller`. Add a sibling `.ignore` file for picker-only exclusions; `.gitignore` is honoured.

### Node and Bun SDK

```bash
npm install @ff-labs/fff-node
```

Calls return `{ ok: true, value } | { ok: false, error }`; destroy the finder when done.

## Examples

### Example 1: Faster search for Claude Code

Request: "Make Claude Code find files and grep faster in this monorepo."

```bash
brew install dmtrKovalenko/fff/fff-mcp
claude mcp add fff -- "$(brew --prefix)/bin/fff-mcp" --no-update-check
echo 'For file search or grep in this git repository, use the fff tools.' >> CLAUDE.md
```

Result: the agent gets `find_files`, `grep` and `multi_grep`. A query such as `handler` returns `src/handler.rs git:staged_new` style lines with git status, and a zero-match grep retries as fuzzy. In a quick check on a two-file repository, `grep "TODO"` returned `src/handler.rs` with the matching line number and text.

### Example 2: Search tool for your own agent

Request: "Wrap fff as a search function in my TypeScript agent."

```typescript
import { FileFinder } from "@ff-labs/fff-node";

const created = FileFinder.create({ basePath: process.cwd(), aiMode: true });
if (!created.ok) throw new Error(created.error);
const finder = created.value;
await finder.waitForScan(10_000);

const files = finder.fileSearch("message handler", { pageSize: 10 });
const hits = finder.grep("TODO", { mode: "plain", smartCase: true, beforeContext: 1, afterContext: 1 });
const rust = finder.glob("**/*.rs", { pageSize: 100 });

if (hits.ok) for (const m of hits.value.items) console.log(`${m.relativePath}:${m.lineNumber} ${m.lineContent}`);
finder.destroy();
```

Result: `files.value.items` holds entries with `relativePath`, `gitStatus`, `size` and frecency scores; grep items add `lineNumber`, `col`, `lineContent`, `matchRanges` and `isDefinition`. Create one finder per repository and reuse it; the speed comes from the warm index.

### Example 3: Programmatic search inside Neovim

```lua
local r = require("fff").content_search("TODO", { mode = "plain", max_matches_per_file = 20 })
for _, m in ipairs(r.items) do
  print(string.format("%s:%d %s", m.relative_path, m.line_number, m.line_content))
end
```

Result: matches printed without opening the picker; `require("fff").file_search("button", { mode = "mixed" })` does the same for paths and directories.

## Guidelines

- fff trades memory for speed: it holds the index and file mmaps in RAM. On huge repositories use `--no-warmup`, `--max-cached-files` or `--no-content-indexing`.
- Use it for repeated searches in a long-lived process (an editor or an agent session); a one-off `rg` call is still fine for scripts.
- Frecency and query history are stored in local databases (Neovim defaults to its cache and data directories); `:FFFClearCache` resets them.
- `fff-mcp` checks for updates on startup unless `--no-update-check` is given.
- Pass an explicit project path to `fff-mcp` for agents launched from `~`, where indexing is refused by default.
- The README's Rust section may show an older crate version; check crates.io for the current `fff-search` release.
