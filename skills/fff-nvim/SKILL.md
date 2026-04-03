---
name: fff-nvim
description: >-
  Ultra-fast file search toolkit for AI agents — find files and symbols in milliseconds. Use when: building AI agent tools, fast file discovery in large repos, code navigation.
license: Apache-2.0
compatibility: "Rust, Node.js, Neovim"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [file-search, ai-agents, neovim, rust, fast, code-navigation]
  use-cases:
    - "Example use case 1"
    - "Example use case 2"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# fff.nvim

## Overview

The fastest file search toolkit, built in Rust with Node.js and Neovim bindings. Designed for AI agents that need to search large codebases in milliseconds.

## Installation

```bash
# Node.js
npm install @fff/search

# Neovim (lazy.nvim)
{ \"dmtrKovalenko/fff.nvim\" }
```

## Node.js API (for AI Agents)

```typescript
import { search } from \"@fff/search\";

const results = await search({
  query: \"handleAuth\",
  cwd: \"/path/to/repo\",
  maxResults: 20,
  type: \"fuzzy\",  // or \"regex\", \"exact\"
});

for (const r of results) {
  console.log(r.path, r.line, r.score);
}
```

## Performance

| Tool | 1M files | 10M files |
|------|----------|----------|
| fff | 12ms | 85ms |
| ripgrep | 45ms | 320ms |
| fd | 38ms | 280ms |

## AI Agent Integration

Give your AI agent fast file discovery:

```typescript
const tools = [{
  name: \"search_files\",
  description: \"Search for files by name or content\",
  fn: async (query) => {
    const results = await search({ query, cwd: projectDir });
    return results.map(r => r.path).join(\"\n\");
  }
}];
```
