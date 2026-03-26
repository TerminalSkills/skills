---
title: "Build a Self-Evolving AI Agent"
slug: build-self-evolving-ai-agent
description: "Create an AI agent that improves itself over time by reading, writing, and pruning its own context files — hierarchical memory with self-reflection."
skills: [openviking, hermes-agent, agent-memory]
category: data-ai
difficulty: advanced
time_estimate: "8 hours"
tags: [ai-agents, self-improvement, context-management, memory, reflection, autonomous]
---

# Build a Self-Evolving AI Agent

## The Problem

AI agents forget everything between sessions. Each conversation starts from scratch — no memory of past mistakes, no accumulated wisdom, no improvement over time. Fine-tuning is expensive and slow. RAG adds retrieval overhead but does not help the agent learn from its own behavior. There is no simple way to build an agent that gets measurably better at its job through experience.

Inspired by [OpenViking](https://github.com/openviking/openviking) (18k+ stars) — agents that maintain and evolve their own operational context.

## The Solution

Build an agent that maintains a hierarchical context system (global, project, task, subtask), reflects on each completed task to extract learnings, writes new instructions to its own context files, prunes stale or contradictory entries, and tracks performance over time. Pure context engineering — no retraining required.

```
Task Arrives
     ↓
Agent reads context hierarchy:
  project.md → task.md → subtask.md
     ↓
Agent executes task
     ↓
Self-reflection: what worked, what didn't
     ↓
Agent writes learnings to context files
     ↓
Context pruning: remove stale entries
     ↓
Performance tracked over time
```

## Step-by-Step Walkthrough

### 1. Hierarchical Context System

```python
from pathlib import Path
import json

class ContextManager:
    def __init__(self, base_dir: str = ".agent-context"):
        self.base = Path(base_dir)
        self.base.mkdir(exist_ok=True)

    def read_context(self, scope: str = "project") -> str:
        """Read context at a given scope level."""
        layers = {
            "global": self.base / "global.md",
            "project": self.base / "project.md",
            "task": self.base / "current-task.md",
            "subtask": self.base / "current-subtask.md",
        }
        # Build hierarchical context: global → project → task → subtask
        context_parts = []
        for level in ["global", "project", "task", "subtask"]:
            path = layers[level]
            if path.exists():
                context_parts.append(f"## {level.upper()} CONTEXT\n{path.read_text()}")
            if level == scope:
                break
        return "\n\n".join(context_parts)

    def write_context(self, scope: str, content: str, append: bool = False):
        """Agent writes to its own context."""
        path = self.base / f"{scope}.md"
        if append and path.exists():
            existing = path.read_text()
            path.write_text(existing + "\n\n" + content)
        else:
            path.write_text(content)

    def list_learnings(self) -> list[dict]:
        """Read all recorded learnings."""
        path = self.base / "learnings.json"
        if path.exists():
            return json.loads(path.read_text())
        return []

    def add_learning(self, learning: dict):
        """Record a new learning."""
        learnings = self.list_learnings()
        learnings.append({**learning, "timestamp": time.time(), "applied_count": 0})
        (self.base / "learnings.json").write_text(json.dumps(learnings, indent=2))
```

### 2. Self-Reflection After Each Task

```python
import anthropic, time

client = anthropic.Anthropic()

def reflect_on_task(ctx: ContextManager, task: str, result: str, success: bool):
    """Agent reflects on what it did and writes learnings."""
    context = ctx.read_context("project")

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        system="""You are a self-improving agent. After completing a task, reflect on:
1. What worked well (keep doing this)
2. What failed or was inefficient (avoid or fix)
3. What context was missing that would have helped
4. One concrete instruction to add to your context for next time

Return JSON: {worked: [string], failed: [string], missing_context: string, new_instruction: string}""",
        messages=[{"role": "user", "content": f"Context:\n{context}\n\nTask: {task}\nResult: {result}\nSuccess: {success}"}]
    )

    reflection = json.loads(response.content[0].text)

    # Write learnings
    ctx.add_learning({
        "task": task,
        "success": success,
        "instruction": reflection["new_instruction"],
        "missing_context": reflection["missing_context"]
    })

    # Update project context with new instruction
    if reflection["new_instruction"]:
        ctx.write_context("project", f"\n### Learned Rule\n{reflection['new_instruction']}", append=True)

    return reflection
```

### 3. Context Pruning

```python
def prune_context(ctx: ContextManager, max_lines: int = 200):
    """Agent removes outdated or low-value context entries."""
    project_ctx = ctx.read_context("project")
    learnings = ctx.list_learnings()

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system="""Review this agent's context and learnings. Identify:
1. Contradictory instructions (keep the newer one)
2. Redundant entries (merge into one)
3. Stale context (no longer relevant)
4. Rewrite the context file, keeping only what's valuable.

Return JSON: {pruned_context: string, removed_count: int, reason: string}""",
        messages=[{"role": "user", "content": f"Context:\n{project_ctx}\n\nLearnings:\n{json.dumps(learnings[-20:])}"}]
    )

    result = json.loads(response.content[0].text)
    ctx.write_context("project", result["pruned_context"])
    return result
```

### 4. Performance Tracking

```python
class PerformanceTracker:
    def __init__(self, path: str = ".agent-context/performance.json"):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {"iterations": []}

    def record(self, iteration: int, task: str, success: bool, time_taken: float, quality_score: float):
        self.data["iterations"].append({
            "iteration": iteration, "task": task, "success": success,
            "time_taken": time_taken, "quality": quality_score,
            "timestamp": time.time()
        })
        self.path.write_text(json.dumps(self.data, indent=2))

    def improvement_trend(self, window: int = 10) -> dict:
        recent = self.data["iterations"][-window:]
        older = self.data["iterations"][-window*2:-window] if len(self.data["iterations"]) > window else []

        if not older:
            return {"trend": "insufficient_data"}

        recent_avg = sum(r["quality"] for r in recent) / len(recent)
        older_avg = sum(r["quality"] for r in older) / len(older)

        return {
            "recent_quality": round(recent_avg, 2),
            "previous_quality": round(older_avg, 2),
            "improvement": round(recent_avg - older_avg, 2),
            "trend": "improving" if recent_avg > older_avg else "declining"
        }
```

### 5. The Evolution Loop

```python
async def evolution_loop(tasks: list[str], iterations: int = 50):
    ctx = ContextManager()
    tracker = PerformanceTracker()

    # Initial context
    ctx.write_context("project", "# Agent Context\nYou are a coding assistant. Complete tasks accurately.")

    for i, task in enumerate(tasks[:iterations]):
        # Read evolved context
        context = ctx.read_context("task")

        # Execute task with current context
        start = time.time()
        result = await execute_task(task, context)
        elapsed = time.time() - start

        # Evaluate quality (could be automated tests, human eval, or AI judge)
        quality = await evaluate_result(task, result)

        # Self-reflect and update context
        reflect_on_task(ctx, task, result, quality > 0.7)

        # Track performance
        tracker.record(i, task, quality > 0.7, elapsed, quality)

        # Prune context every 10 iterations
        if i % 10 == 9:
            prune_context(ctx)

        print(f"[Iter {i}] Quality: {quality:.2f} | Trend: {tracker.improvement_trend()['trend']}")
```

## Real-World Example

A development team deploys this self-evolving agent to handle code review for a Python monorepo. In the first 10 iterations, the agent flags generic style issues but misses domain-specific patterns. After each review, the reflection step captures learnings like "this codebase uses dataclasses instead of Pydantic — stop suggesting Pydantic migrations" and "the team prefers explicit error handling over broad try/except blocks." By iteration 30, the agent's quality score has improved from 0.55 to 0.82. The context pruning step at iteration 20 merged three redundant rules about import ordering into one concise instruction and removed a stale note about a deprecated API that was fixed weeks ago. The performance tracker shows a clear upward trend, and the team's code review turnaround time drops by 40%.

## Related Skills

- **[agent-memory](/skills/agent-memory)** — Persistent memory patterns for AI agents across sessions
- **[hermes-agent](/skills/hermes-agent)** — Agent framework for building autonomous AI workflows
- **[anthropic-sdk](/skills/anthropic-sdk)** — Claude API integration for self-reflection and context analysis
- **[langchain](/skills/langchain)** — Agent orchestration and chaining for multi-step reasoning
- **[crewai](/skills/crewai)** — Multi-agent collaboration framework with role-based agents

## What You'll Learn

- Hierarchical context management for AI agents
- Self-reflection patterns: agents that critique their own work
- Context pruning: keeping agent memory lean and relevant
- Performance tracking to measure actual improvement over time
- Building agents that evolve without retraining or fine-tuning
