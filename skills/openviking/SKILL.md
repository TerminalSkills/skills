---
name: openviking
description: >-
  Manage AI agent context (memory, resources, skills) using OpenViking's file system paradigm.
  Use when: building agents with persistent context, managing agent memories across sessions,
  implementing hierarchical context delivery for complex agent systems.
license: Apache-2.0
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [context-database, agent-memory, openviking, context-management, file-system]
  use-cases:
    - "Give AI agents organized, persistent context that survives across sessions"
    - "Build a context hierarchy: project → task → subtask with scoped memories"
    - "Implement self-evolving context that agents update based on what they learn"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenViking

## Overview

Manage AI agent context using a file-system paradigm — context is organized as files and directories that agents can read, write, and navigate. Inspired by ByteDance's OpenViking, this approach treats context like a filesystem: hierarchical, scoped, persistent, and self-evolving. Agents don't just consume context — they organize and update it.

## Core Concepts

```
context/
├── project/
│   ├── README.md          # Project overview (always loaded)
│   ├── architecture.md     # System design context
│   └── decisions/          # Architecture decision records
├── task/
│   ├── current.md          # Active task context
│   └── history/completed/  # Past task context for reference
├── memory/
│   ├── facts.md            # Known facts about the project
│   ├── lessons.md          # Lessons learned from mistakes
│   └── preferences.md      # User preferences and patterns
└── skills/
    ├── coding-style.md     # Code conventions
    └── tools.md            # Available tools and how to use them
```

**Key idea:** Context is not a flat prompt. It's a tree with scoping rules — agents see context relevant to their current scope, not everything at once.

## Instructions

When a user asks to build agent memory, persistent context, or hierarchical context systems:

1. **Design the context tree** — Map out what context exists and how it's organized
2. **Define scoping rules** — What context loads at each level (project, task, subtask)
3. **Implement CRUD** — Agents need to read, create, update, and delete context files
4. **Add self-evolution** — Agents update context based on outcomes and learnings

### Context Manager Implementation

```python
"""File-system based context manager for AI agents."""
import os, json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

class ContextManager:
    """Manages hierarchical context for AI agents."""

    def __init__(self, root: str = "./context"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def read(self, path: str) -> Optional[str]:
        full = self.root / path
        return full.read_text() if full.is_file() else None

    def write(self, path: str, content: str, metadata: Optional[dict] = None):
        full = self.root / path
        full.parent.mkdir(parents=True, exist_ok=True)
        header = ""
        if metadata:
            meta = {**metadata, "updated": datetime.now(timezone.utc).isoformat()}
            header = f"<!-- meta: {json.dumps(meta)} -->\n\n"
        full.write_text(header + content)

    def list(self, path: str = "") -> list[str]:
        full = self.root / path
        if not full.is_dir():
            return []
        return [str(p.relative_to(self.root)) for p in sorted(full.rglob("*")) if p.is_file()]

    def delete(self, path: str):
        full = self.root / path
        if full.is_file():
            trash = self.root / ".trash" / path
            trash.parent.mkdir(parents=True, exist_ok=True)
            full.rename(trash)

    def search(self, query: str, path: str = "") -> list[tuple[str, str]]:
        results = []
        for filepath in self.list(path):
            content = self.read(filepath)
            if content and query.lower() in content.lower():
                idx = content.lower().index(query.lower())
                snippet = content[max(0, idx - 50):idx + len(query) + 50]
                results.append((filepath, snippet))
        return results
```

### Hierarchical Context Delivery

```python
class ScopedContext:
    """Delivers context based on the agent's current scope."""

    SCOPE_RULES = {
        "project": ["project/README.md", "memory/facts.md", "memory/preferences.md", "skills/coding-style.md"],
        "task": ["task/current.md"],
        "subtask": [],
    }

    def __init__(self, ctx: ContextManager):
        self.ctx = ctx

    def get_context(self, scope: str = "task", subtask_id: Optional[str] = None) -> str:
        parts = []
        for path in self.SCOPE_RULES["project"]:
            content = self.ctx.read(path)
            if content:
                parts.append(f"## {path}\n{content}")
        if scope in ("task", "subtask"):
            for path in self.SCOPE_RULES["task"]:
                content = self.ctx.read(path)
                if content:
                    parts.append(f"## {path}\n{content}")
        if scope == "subtask" and subtask_id:
            content = self.ctx.read(f"task/subtasks/{subtask_id}.md")
            if content:
                parts.append(f"## Subtask: {subtask_id}\n{content}")
        lessons = self.ctx.read("memory/lessons.md")
        if lessons:
            parts.append(f"## Lessons Learned\n{lessons}")
        return "\n\n---\n\n".join(parts)
```

### Self-Evolving Context

Agents don't just read context — they update it based on what they learn:

```python
class EvolvingAgent:
    def __init__(self, ctx: ContextManager, llm):
        self.ctx = ctx
        self.llm = llm

    async def complete_task(self, task: str, result: str, success: bool):
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
        current = self.ctx.read("task/current.md")
        if current:
            self.ctx.write(f"task/history/{timestamp}.md", current)
        if not success:
            lesson = await self.llm.invoke(
                f"Task: {task}\nResult: {result}\n\nWhat went wrong? Extract a concise lesson."
            )
            existing = self.ctx.read("memory/lessons.md") or ""
            self.ctx.write("memory/lessons.md", f"{existing}\n\n### {timestamp}\n{lesson.content}")
        new_facts = await self.llm.invoke(
            f"Task: {task}\nResult: {result}\n\nAny new facts discovered? List them or say NONE."
        )
        if "NONE" not in new_facts.content:
            existing = self.ctx.read("memory/facts.md") or ""
            self.ctx.write("memory/facts.md", f"{existing}\n\n### Discovered {timestamp}\n{new_facts.content}")
```

## Examples

### Example 1: Setting Up Agent Memory for a Web App Project

```python
ctx = ContextManager("./my-project-context")

# Initialize project context
ctx.write("project/README.md", "# E-commerce Platform\nNext.js + Postgres + Stripe")
ctx.write("memory/facts.md", "- Database: PostgreSQL 16\n- Auth: NextAuth with Google OAuth")
ctx.write("memory/preferences.md", "- Use TypeScript strict mode\n- Prefer server components")
ctx.write("skills/coding-style.md", "- camelCase variables\n- Zod for validation")

# Agent reads scoped context for a task
scoped = ScopedContext(ctx)
context = scoped.get_context(scope="task")
# Returns: project README + facts + preferences + coding style + current task
```

### Example 2: LangChain Tool Integration

```python
from langchain_core.tools import tool

ctx = ContextManager("./agent-context")

@tool
def read_context(path: str) -> str:
    """Read a context file to recall project info, decisions, or lessons."""
    return ctx.read(path) or f"No context at {path}"

@tool
def write_context(path: str, content: str) -> str:
    """Save learnings, decisions, or facts to context."""
    ctx.write(path, content, metadata={"source": "agent"})
    return f"Written to {path}"

@tool
def search_context(query: str) -> str:
    """Search all context files for relevant information."""
    results = ctx.search(query)
    return "\n".join(f"[{p}] ...{s}..." for p, s in results[:5]) or "No matches."

tools = [read_context, write_context, search_context]
```

## Guidelines

1. **Scope aggressively** — Don't load all context every time. Use hierarchical scoping to keep prompts focused
2. **Metadata headers** — Add timestamps and source info to context files for auditability
3. **Soft delete** — Move to `.trash` instead of deleting. Context that seems useless now may matter later
4. **Token budgeting** — Set a max token budget per scope level. Compact if exceeded
5. **Version context** — Use git or timestamps to track how context evolves over time
6. **Separate facts from opinions** — Keep factual knowledge separate from preferences and lessons
7. **Periodic cleanup** — Run compaction weekly. Archive context not accessed in 30 days

## Dependencies

```bash
pip install langchain-core langchain-openai    # For LangChain integration
# No external deps needed for core ContextManager — it's pure Python + filesystem
```
