---
title: "Build a Self-Evolving AI Agent"
slug: build-self-evolving-ai-agent
description: "Create an AI agent that improves itself over time by reading, writing, and pruning its own context files — hierarchical memory with self-reflection."
skills: [openviking, hermes-agent, agent-memory, anthropic-sdk]
category: data-ai
difficulty: advanced
time_estimate: "8 hours"
tags: [ai-agents, self-improvement, context-management, memory, reflection, autonomous]
---

# Build a Self-Evolving AI Agent

## The Problem

AI agents forget everything between sessions. Each conversation starts from scratch: no memory of past mistakes, no accumulated wisdom, no improvement over time. Fine-tuning is expensive and slow. RAG adds retrieval overhead but does not help the agent learn from its own behavior. There is no simple way to build an agent that gets measurably better at its job through experience.

## The Solution

Build an agent that keeps a hierarchical context (global, project, task, subtask) in plain files, reflects on each finished task to extract a learning, writes the new rule back into its own context, periodically prunes stale or contradictory rules, and tracks quality over time. This is pure context engineering, with no retraining. The same idea is productized in [OpenViking](https://github.com/volcengine/OpenViking) (a context database for agents) and [Hermes Agent](https://github.com/NousResearch/hermes-agent) (an agent with a built-in learning loop); the last two steps show how to move to them.

```
Task arrives
     ↓
Agent reads context: global → project → task → subtask
     ↓
Agent executes; an evaluator scores the result
     ↓
Reflection: what worked, what failed, one new rule
     ↓
Rule appended to project context; every N tasks the context is pruned
     ↓
Quality tracked per iteration
```

## Step-by-Step Walkthrough

### 1. Install and set up

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install anthropic
export ANTHROPIC_API_KEY=...        # set in your shell, never in a file
```

### 2. The whole loop in one file

`ContextManager` reads the context levels and appends learnings. Reflection and pruning get structured output by forcing a single tool call, which returns a parsed dict instead of text you would have to `json.loads` (models often wrap JSON in prose or code fences). Pruning keeps a timestamped backup, because a model rewriting its own instructions can lose a rule you wanted.

```python
# evolve.py
import json
import shutil
import time
from pathlib import Path

import anthropic

MODEL = "claude-sonnet-5-5"
client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY from the environment


def ask_json(system: str, user: str, schema: dict, name: str) -> dict:
    """Force a structured answer by making the model call one tool with this schema."""
    resp = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user}],
        tools=[{"name": name, "description": "Return the result.", "input_schema": schema}],
        tool_choice={"type": "tool", "name": name},
    )
    return next(b.input for b in resp.content if b.type == "tool_use")


class ContextManager:
    LEVELS = ["global", "project", "task", "subtask"]

    def __init__(self, base_dir: str = ".agent-context"):
        self.base = Path(base_dir)
        self.base.mkdir(exist_ok=True)

    def read(self, scope: str = "project") -> str:
        """Concatenate global -> ... -> scope, skipping missing files."""
        parts = []
        for level in self.LEVELS:
            path = self.base / f"{level}.md"
            if path.exists():
                parts.append(f"## {level.upper()} CONTEXT\n{path.read_text()}")
            if level == scope:
                break
        return "\n\n".join(parts)

    def write(self, scope: str, content: str, append: bool = False):
        path = self.base / f"{scope}.md"
        if append and path.exists():
            content = path.read_text() + "\n\n" + content
        path.write_text(content)

    def add_learning(self, learning: dict):
        with (self.base / "learnings.jsonl").open("a") as f:
            f.write(json.dumps({**learning, "timestamp": time.time()}) + "\n")

    def learnings(self, last: int = 20) -> list[dict]:
        path = self.base / "learnings.jsonl"
        lines = path.read_text().splitlines() if path.exists() else []
        return [json.loads(line) for line in lines[-last:]]


REFLECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "worked": {"type": "array", "items": {"type": "string"}},
        "failed": {"type": "array", "items": {"type": "string"}},
        "missing_context": {"type": "string"},
        "new_instruction": {"type": "string", "description": "One concrete rule, or empty string"},
    },
    "required": ["worked", "failed", "missing_context", "new_instruction"],
}


def reflect_on_task(ctx: ContextManager, task: str, result: str, success: bool) -> dict:
    reflection = ask_json(
        "You are a self-improving agent. After a task, reflect on what worked, what failed, "
        "what context was missing, and give at most one concrete, reusable instruction.",
        f"Context:\n{ctx.read('project')}\n\nTask: {task}\nResult: {result}\nSuccess: {success}",
        REFLECTION_SCHEMA,
        "record_reflection",
    )
    ctx.add_learning({"task": task, "success": success, **reflection})
    if reflection["new_instruction"]:
        ctx.write("project", f"- {reflection['new_instruction']}", append=True)
    return reflection


PRUNE_SCHEMA = {
    "type": "object",
    "properties": {"pruned_context": {"type": "string"}, "removed_count": {"type": "integer"}, "reason": {"type": "string"}},
    "required": ["pruned_context", "removed_count", "reason"],
}


def prune_context(ctx: ContextManager) -> dict:
    """Merge duplicates, drop contradicted or stale rules. Keeps a backup of the old file."""
    path = ctx.base / "project.md"
    result = ask_json(
        "Rewrite this agent's project context. Merge redundant rules, keep the newer of two "
        "contradicting rules, remove stale entries. Keep the heading and every still-valid rule.",
        f"Context:\n{path.read_text()}\n\nRecent learnings:\n{json.dumps(ctx.learnings())}",
        PRUNE_SCHEMA,
        "rewrite_context",
    )
    shutil.copy(path, ctx.base / f"project.{int(time.time())}.bak.md")
    path.write_text(result["pruned_context"])
    return result


class PerformanceTracker:
    def __init__(self, path: str = ".agent-context/performance.json"):
        self.path = Path(path)
        self.rows = json.loads(self.path.read_text()) if self.path.exists() else []

    def record(self, iteration: int, task: str, quality: float, seconds: float):
        self.rows.append({"iteration": iteration, "task": task, "quality": quality, "seconds": seconds})
        self.path.write_text(json.dumps(self.rows, indent=2))

    def trend(self, window: int = 10) -> dict:
        recent, older = self.rows[-window:], self.rows[-2 * window:-window]
        if not older:
            return {"trend": "insufficient_data"}
        avg = lambda rows: sum(r["quality"] for r in rows) / len(rows)
        delta = avg(recent) - avg(older)
        return {"recent": round(avg(recent), 2), "previous": round(avg(older), 2),
                "improvement": round(delta, 2), "trend": "improving" if delta > 0 else "not improving"}


def run_agent(task: str, context: str) -> str:
    resp = client.messages.create(
        model=MODEL, max_tokens=2048, system=context,
        messages=[{"role": "user", "content": task}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def evolution_loop(tasks: list[str], evaluate, prune_every: int = 10):
    """`evaluate(task, result) -> float in [0, 1]`: unit tests, a rubric, or a separate judge model."""
    ctx, tracker = ContextManager(), PerformanceTracker()
    if not (ctx.base / "project.md").exists():
        ctx.write("project", "# Agent Context\nYou are a coding assistant. Complete tasks accurately.")
    for i, task in enumerate(tasks):
        start = time.time()
        result = run_agent(task, ctx.read("project"))
        quality = evaluate(task, result)
        tracker.record(i, task, quality, time.time() - start)
        reflect_on_task(ctx, task, result, quality >= 0.7)
        if (i + 1) % prune_every == 0:
            prune_context(ctx)
        print(f"[{i}] quality={quality:.2f} {tracker.trend()['trend']}")
```

### 3. Run it

`evaluate` is yours: unit tests for a coding agent, a rubric, or a second model acting as judge. Without a trustworthy score the agent cannot tell learning from drifting.

```python
from evolve import evolution_loop

def evaluate(task: str, result: str) -> float:
    return run_tests_for(task, result)      # your check, returns 0.0 - 1.0

evolution_loop(open("tasks.txt").read().splitlines(), evaluate)
```

Each iteration appends a line to `.agent-context/learnings.jsonl`, grows `project.md`, and adds a row to `performance.json`. Read `project.md` yourself every few runs: it is the agent's evolving instructions, and a rule you disagree with should be deleted by hand.

### 4. Keep humans in the loop

Self-written instructions can entrench a wrong belief. Put `.agent-context/` under git and review its diffs like code; the `.bak.md` files from pruning make a bad rewrite easy to undo. Keep rules the agent must never change in `global.md`, which this loop only reads and never writes.

### 5. Scale the memory with OpenViking

Files stop working when learnings number in the thousands. [OpenViking](https://github.com/volcengine/OpenViking) is a self-hosted context database that stores memories under `viking://` URIs and searches them by meaning. Start its server (`uv tool install openviking`, then `openviking-server init`), run `pip install openviking-sdk`, and commit each reflection as a session so memories are extracted for you:

```python
import os
from openviking_sdk import SyncHTTPClient

ov = SyncHTTPClient(url="http://127.0.0.1:1933", api_key=os.environ["OPENVIKING_API_KEY"])
ov.initialize()
ov.create_session(session_id="review-agent")
ov.session(session_id="review-agent").add_message(role="user", content=reflection["new_instruction"])
ov.session(session_id="review-agent").commit()       # extraction runs in the background
hits = ov.find("how does this team handle errors", limit=5)
```

The server needs an embedding model and a vision-language model configured, and extraction is asynchronous, so a search right after the commit may return nothing.

### 6. Or start from Hermes Agent

If you would rather configure than build, Hermes Agent already saves memories, writes its own skills, and prunes unused ones. Install a release tag with `uv` as described in the `hermes-agent` skill (do not pipe the project's `install.sh` into a shell), then gate what it learns:

```bash
hermes config set memory.write_approval true
hermes config set skills.write_approval true
hermes curator status            # usage stats, stale and archived skills
hermes curator run --dry-run     # preview what pruning would archive
```

## Real-World Example

A development team points this agent at code review for a Python monorepo, scoring each review by whether the human reviewer accepted its comments. Early reviews flag generic style issues and miss local conventions. After each review the reflection step records rules such as "this codebase uses dataclasses instead of Pydantic, so do not suggest Pydantic migrations" and "the team prefers explicit error handling over broad try/except". At the first prune, three redundant rules about import ordering are merged into one and a note about an already-fixed deprecated API is dropped. The team reads the diff of `project.md` in their weekly review, deletes one rule they disagree with, and watches the trend in `performance.json` to decide whether the loop is helping.

## Related Skills

- **[agent-memory](/skills/agent-memory)**: file, SQLite and vector memory patterns behind the context store
- **[openviking](/skills/openviking)**: self-hosted context database for large-scale agent memory
- **[hermes-agent](/skills/hermes-agent)**: an agent with a built-in learning loop to configure instead of build
- **[anthropic-sdk](/skills/anthropic-sdk)**: Claude API usage for reflection, pruning and the agent itself
