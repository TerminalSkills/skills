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

## Overview

Blazing-fast file search built in Rust, designed for AI agents and editor integration. Searches millions of files in milliseconds with fuzzy matching, regex, and smart filtering. Available as a CLI, Node.js API, and Neovim plugin.

## Instructions

### Installation

**Rust CLI:**
```bash
cargo install fff-search
```

**Node.js API:**
```bash
npm install fff-search
```

**Neovim Plugin (lazy.nvim):**
```lua
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
```

### CLI Usage

```bash
fff "component"                    # Basic fuzzy search
fff "handler" --dir ./src          # Search in specific directory
fff --regex "test_.*\.py$"         # Regex search
fff --grep "TODO|FIXME" --dir .    # Search file contents
fff "config" --hidden              # Include hidden files
fff "utils" --max-results 20       # Limit results
fff "service" --json               # JSON output (for AI agents)
fff "schema" --ext ts,tsx          # Filter by extension
fff "MyClass" --case-sensitive     # Case-sensitive search
```

### Node.js API

```javascript
const { FffSearch } = require("fff-search");

const searcher = new FffSearch({
  rootDir: process.cwd(),
  respectGitignore: true,
  hiddenFiles: false,
});

// Fuzzy file search
const results = await searcher.find("component", { maxResults: 10, threshold: 0.6 });

// Grep file contents
const grepResults = await searcher.grep("TODO", { extensions: ["ts", "js"], maxResults: 100 });
```

### Neovim Commands

```
:FffFind [query]    — Fuzzy file search (replaces Telescope find_files)
:FffGrep [pattern]  — Search file contents (replaces Telescope live_grep)
:FffRecent          — Recently opened/modified files
:FffBuffer          — Search open buffers
:FffGitFiles        — Search git-tracked files only
```

## Examples

### Example 1: AI Agent Tool Integration

**User request:** "Set up fff as a file search tool for an AI agent."

**Implementation:**
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

### Example 2: JSON Output for LLM Consumption

**User request:** "Find all handler files and return structured results."

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

## Guidelines

- Use `--json` output for structured results parseable by LLMs and AI agents
- Enable background indexing (`[index] enabled = true` in config) for instant results in large repos
- Use `--dir` to scope search to specific packages in monorepos
- fff replaces Telescope's file finder in Neovim with 10-50x faster results
- Use `--ext` to narrow searches by file type when working in polyglot repos
- Configure `~/.config/fff/config.toml` for persistent settings (gitignore, hidden files, max results)
