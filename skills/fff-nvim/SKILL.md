---
name: fff-nvim
description: >-
  Use fff (Fast File Finder) — a blazing-fast file search tool built in Rust
  with Node.js bindings, optimized for AI agents and Neovim integration.
  Supports fuzzy matching, regex, gitignore-aware filtering, and sub-millisecond
  search across large codebases. Use when tasks involve fast file discovery,
  AI agent tooling, or Neovim file navigation.
license: MIT
compatibility: "Rust 1.70+, Node.js 18+, Neovim 0.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["file-search", "ai-agents", "neovim", "rust", "fast"]
---

# fff (Fast File Finder)

Blazing-fast file search built in Rust, designed for AI agents and editor integration. Searches millions of files in milliseconds with fuzzy matching, regex, and smart filtering.

## Installation

### From Cargo (Rust CLI)

```bash
cargo install fff-search

# Verify
fff --version
```

### From npm (Node.js API)

```bash
# Installs native Rust bindings via NAPI
npm install fff-search
pnpm add fff-search
yarn add fff-search
```

### Neovim Plugin

```lua
-- lazy.nvim
{
  "fff-nvim/fff.nvim",
  build = "cargo build --release",
  config = function()
    require("fff").setup({
      respect_gitignore = true,
      hidden_files = false,
      max_results = 100,
      fuzzy_threshold = 0.6,
    })
  end,
  keys = {
    { "<leader>ff", "<cmd>FffFind<cr>",   desc = "Find files (fff)" },
    { "<leader>fg", "<cmd>FffGrep<cr>",   desc = "Grep content (fff)" },
    { "<leader>fr", "<cmd>FffRecent<cr>", desc = "Recent files (fff)" },
  },
}

-- packer.nvim
use {
  "fff-nvim/fff.nvim",
  run = "cargo build --release",
  config = function() require("fff").setup() end,
}
```

## CLI Usage

```bash
# Basic fuzzy search
fff "component"

# Search in specific directory
fff "handler" --dir ./src

# Regex search
fff --regex "test_.*\.py$"

# Search file contents (grep mode)
fff --grep "TODO|FIXME" --dir .

# Include hidden files
fff "config" --hidden

# Ignore gitignore rules
fff "build" --no-gitignore

# Limit results
fff "utils" --max-results 20

# Output as JSON (for AI agents)
fff "service" --json

# Filter by extension
fff "schema" --ext ts,tsx

# Case-sensitive search
fff "MyClass" --case-sensitive
```

### JSON Output (for AI Agents)

```bash
$ fff "handler" --json
[
  {
    "path": "src/api/handler.ts",
    "score": 0.95,
    "line": null,
    "modified": "2024-03-15T10:30:00Z"
  },
  {
    "path": "src/ws/messageHandler.ts",
    "score": 0.82,
    "line": null,
    "modified": "2024-03-14T08:15:00Z"
  }
]
```

## Node.js API

```javascript
const { FffSearch } = require("fff-search");

// Initialize searcher
const searcher = new FffSearch({
  rootDir: process.cwd(),
  respectGitignore: true,
  hiddenFiles: false,
});

// Fuzzy file search
const results = await searcher.find("component", {
  maxResults: 10,
  threshold: 0.6,
});
// [{ path: 'src/components/Button.tsx', score: 0.89 }, ...]

// Regex search
const regexResults = await searcher.find(/test_.*\.py$/, {
  maxResults: 50,
});

// Grep file contents
const grepResults = await searcher.grep("TODO", {
  extensions: ["ts", "js"],
  maxResults: 100,
});
// [{ path: 'src/utils.ts', line: 42, content: '// TODO: refactor' }, ...]

// Watch for file changes
const watcher = searcher.watch("src/**/*.ts", (event) => {
  console.log(`${event.type}: ${event.path}`);
});
```

### AI Agent Tool Integration

```javascript
const fileSearchTool = {
  name: "search_files",
  description: "Search for files by name or content in the project",
  parameters: {
    query:      { type: "string", description: "Search query (fuzzy or regex)" },
    mode:       { type: "string", enum: ["filename", "content"], default: "filename" },
    extensions: { type: "array", items: { type: "string" }, optional: true },
  },
  execute: async ({ query, mode, extensions }) => {
    const searcher = new FffSearch({ rootDir: process.cwd() });
    if (mode === "content") {
      return searcher.grep(query, { extensions, maxResults: 20 });
    }
    return searcher.find(query, { maxResults: 20 });
  },
};
```

## Benchmarks

Tested on linux-kernel repo (~80,000 files):

```
Tool              | Cold      | Warm   | Memory
------------------|-----------|--------|--------
fff               | 12ms      | 3ms    | 15MB
fd                | 180ms     | 45ms   | 25MB
find + grep       | 2,400ms   | 800ms  | 40MB
ripgrep (files)   | 95ms      | 22ms   | 20MB
fzf               | 250ms     | 60ms   | 35MB
```

Tested on monorepo (~500,000 files):

```
Tool              | Cold      | Warm   | Memory
------------------|-----------|--------|--------
fff               | 85ms      | 18ms   | 45MB
fd                | 1,200ms   | 280ms  | 80MB
find + grep       | 15,000ms  | 4,500ms| 120MB
```

### Why So Fast?

- **Rust core** — Zero-cost abstractions, no GC pauses
- **Parallel traversal** — rayon work-stealing parallelism
- **Memory-mapped I/O** — Avoids syscall overhead
- **Incremental indexing** — Watches filesystem events, updates index in background
- **SIMD fuzzy matching** — Vectorized string comparison on supported CPUs

## Configuration

```toml
# ~/.config/fff/config.toml

[search]
max_results = 100
fuzzy_threshold = 0.6
case_sensitive = false
respect_gitignore = true
hidden_files = false

[ignore]
patterns = [
  "node_modules",
  ".git",
  "target",
  "dist",
  "__pycache__",
  "*.pyc",
]

[index]
enabled = true      # Background indexing for instant results
watch = true
max_file_size = "10MB"

[output]
format = "text"     # text, json, path-only
color = true
relative_paths = true
```

## Neovim Commands

```
:FffFind [query]    — Fuzzy file search (replaces Telescope find_files)
:FffGrep [pattern]  — Search file contents (replaces Telescope live_grep)
:FffRecent          — Recently opened/modified files
:FffBuffer          — Search open buffers
:FffGitFiles        — Search git-tracked files only
```

## Tips

- **AI agents**: Use `--json` output for structured results parseable by LLMs
- **Large repos**: Enable background indexing for instant results after warmup
- **Monorepos**: Use `--dir` to scope search to specific packages
- **Neovim**: fff replaces Telescope's file finder with 10–50× faster results
- **CI scripts**: Use fff to verify file existence or find test files by pattern
