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
  category: ai-tools
  tags: [context-database, agent-memory, openviking, bytedance, file-system, context-management]
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
│   └── decisions/
│       ├── 2024-01-db.md   # Why we chose Postgres
│       └── 2024-02-auth.md # Auth architecture decision
├── task/
│   ├── current.md          # Active task context
│   └── history/
│       └── completed/      # Past task context for reference
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

## Context Manager Implementation

```python
"""File-system based context manager for AI agents."""
import os
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

class ContextManager:
    """Manages hierarchical context for AI agents."""

    def __init__(self, root: str = "./context"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def read(self, path: str) -> Optional[str]:
        """Read a context file."""
        full = self.root / path
        if full.is_file():
            return full.read_text()
        return None

    def write(self, path: str, content: str, metadata: Optional[dict] = None):
        """Write or update a context file with optional metadata header."""
        full = self.root / path
        full.parent.mkdir(parents=True, exist_ok=True)

        header = ""
        if metadata:
            meta = {**metadata, "updated": datetime.now(timezone.utc).isoformat()}
            header = f"<!-- meta: {json.dumps(meta)} -->\n\n"

        full.write_text(header + content)

    def list(self, path: str = "") -> list[str]:
        """List context entries at a path."""
        full = self.root / path
        if not full.is_dir():
            return []
        return [
            str(p.relative_to(self.root))
            for p in sorted(full.rglob("*"))
            if p.is_file()
        ]

    def delete(self, path: str):
        """Delete a context file (moves to .trash for safety)."""
        full = self.root / path
        if full.is_file():
            trash = self.root / ".trash" / path
            trash.parent.mkdir(parents=True, exist_ok=True)
            full.rename(trash)

    def search(self, query: str, path: str = "") -> list[tuple[str, str]]:
        """Search context files by content."""
        results = []
        for filepath in self.list(path):
            content = self.read(filepath)
            if content and query.lower() in content.lower():
                # Return path and matching snippet
                idx = content.lower().index(query.lower())
                snippet = content[max(0, idx - 50):idx + len(query) + 50]
                results.append((filepath, snippet))
        return results
```

## Hierarchical Context Delivery

```python
"""Load context based on scope: project → task → subtask."""

class ScopedContext:
    """Delivers context based on the agent's current scope."""

    SCOPE_RULES = {
        "project": [
            "project/README.md",
            "memory/facts.md",
            "memory/preferences.md",
            "skills/coding-style.md",
        ],
        "task": [
            "task/current.md",
        ],
        "subtask": [
            # Subtask-specific context loaded dynamically
        ],
    }

    def __init__(self, ctx: ContextManager):
        self.ctx = ctx

    def get_context(self, scope: str = "task", subtask_id: Optional[str] = None) -> str:
        """Build context string for the given scope level."""
        parts = []

        # Always include project-level context
        for path in self.SCOPE_RULES["project"]:
            content = self.ctx.read(path)
            if content:
                parts.append(f"## {path}\n{content}")

        # Include task context if scope >= task
        if scope in ("task", "subtask"):
            for path in self.SCOPE_RULES["task"]:
                content = self.ctx.read(path)
                if content:
                    parts.append(f"## {path}\n{content}")

        # Include subtask-specific context
        if scope == "subtask" and subtask_id:
            subtask_path = f"task/subtasks/{subtask_id}.md"
            content = self.ctx.read(subtask_path)
            if content:
                parts.append(f"## {subtask_path}\n{content}")

        # Always include lessons (agents should learn from past mistakes)
        lessons = self.ctx.read("memory/lessons.md")
        if lessons:
            parts.append(f"## Lessons Learned\n{lessons}")

        return "\n\n---\n\n".join(parts)

    def estimate_tokens(self, scope: str = "task") -> int:
        """Estimate token count for context at this scope."""
        context = self.get_context(scope)
        return len(context) // 4  # Rough estimate: 4 chars per token
```

## Self-Evolving Context

The key innovation: agents don't just read context — they update it based on what they learn.

```python
"""Agents that update their own context based on outcomes."""

class EvolvingAgent:
    """An agent that maintains and evolves its own context."""

    def __init__(self, ctx: ContextManager, llm):
        self.ctx = ctx
        self.llm = llm

    async def complete_task(self, task: str, result: str, success: bool):
        """After completing a task, update context with learnings."""

        # 1. Archive task context
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
        current = self.ctx.read("task/current.md")
        if current:
            self.ctx.write(f"task/history/{timestamp}.md", current)

        # 2. Extract lessons if task failed or had issues
        if not success:
            lesson = await self.llm.invoke(
                f"Task: {task}\nResult: {result}\n\n"
                "What went wrong? Extract a concise lesson to avoid this in the future."
            )
            existing = self.ctx.read("memory/lessons.md") or ""
            self.ctx.write(
                "memory/lessons.md",
                f"{existing}\n\n### {timestamp}\n{lesson.content}",
            )

        # 3. Update facts if new information was discovered
        new_facts = await self.llm.invoke(
            f"Task: {task}\nResult: {result}\n\n"
            "Were any new facts about the project/system discovered? "
            "If yes, list them. If no, say NONE."
        )
        if "NONE" not in new_facts.content:
            existing = self.ctx.read("memory/facts.md") or ""
            self.ctx.write(
                "memory/facts.md",
                f"{existing}\n\n### Discovered {timestamp}\n{new_facts.content}",
            )

    async def update_preferences(self, feedback: str):
        """Update user preferences based on feedback."""
        existing = self.ctx.read("memory/preferences.md") or ""
        updated = await self.llm.invoke(
            f"Current preferences:\n{existing}\n\n"
            f"New feedback: {feedback}\n\n"
            "Update the preferences document. Keep it concise and organized."
        )
        self.ctx.write("memory/preferences.md", updated.content)
```

## Integration with LangChain/LangGraph

```python
"""Use context manager as a LangChain tool."""
from langchain_core.tools import tool

ctx = ContextManager("./agent-context")

@tool
def read_context(path: str) -> str:
    """Read a context file. Use to recall project info, decisions, or lessons."""
    content = ctx.read(path)
    return content or f"No context found at {path}"

@tool
def write_context(path: str, content: str) -> str:
    """Write or update a context file. Use to save learnings, decisions, or facts."""
    ctx.write(path, content, metadata={"source": "agent"})
    return f"Context written to {path}"

@tool
def search_context(query: str) -> str:
    """Search all context files for relevant information."""
    results = ctx.search(query)
    if not results:
        return "No matching context found."
    return "\n".join(f"[{path}] ...{snippet}..." for path, snippet in results[:5])

@tool
def list_context(path: str = "") -> str:
    """List available context files at a path."""
    files = ctx.list(path)
    return "\n".join(files) if files else "No context files found."

# Add to your agent
tools = [read_context, write_context, search_context, list_context]
```

## Context Compaction

Over time, context files grow. Periodically compact them:

```python
async def compact_context(ctx: ContextManager, llm):
    """Compress verbose context files while preserving key information."""
    for path in ctx.list("memory"):
        content = ctx.read(path)
        if content and len(content) > 5000:
            compacted = await llm.invoke(
                f"Compact this context file, preserving all key facts and decisions. "
                f"Remove redundancy and outdated info. Keep it under 2000 chars.\n\n{content}"
            )
            ctx.write(path, compacted.content, metadata={"compacted": True})
```

## Best Practices

1. **Scope aggressively** — Don't load all context every time. Use hierarchical scoping to keep prompts focused
2. **Metadata headers** — Add timestamps and source info to context files for auditability
3. **Soft delete** — Move to `.trash` instead of deleting. Context that seems useless now may matter later
4. **Token budgeting** — Set a max token budget per scope level. Compact if exceeded
5. **Version context** — Use git or timestamps to track how context evolves over time
6. **Separate facts from opinions** — Keep factual knowledge separate from preferences and lessons
7. **Periodic cleanup** — Run compaction weekly. Context that hasn't been accessed in 30 days can be archived

## Dependencies

```bash
pip install langchain-core langchain-openai    # For LangChain integration
# No external deps needed for core ContextManager — it's pure Python + filesystem
```
