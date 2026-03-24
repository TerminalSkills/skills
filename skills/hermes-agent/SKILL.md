---
name: hermes-agent
description: >-
  Build self-improving AI agents using Hermes patterns — agents that learn from interactions,
  update their own instructions, and adapt their behavior over time. Use when: building agents
  that improve with usage, creating adaptive AI assistants, implementing agent self-reflection.
license: Apache-2.0
compatibility: "Python 3.10+ or Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [agents, self-improving, hermes, adaptive, learning]
---

# Hermes Agent — Self-Improving AI Agents

## Overview

Inspired by [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), this skill helps you build agents that **grow with usage** — capturing feedback, reflecting on their own behavior, and updating their instructions over time.

Unlike static assistants, a Hermes-style agent maintains a living system prompt. After each interaction, it evaluates its own performance, extracts lessons, and writes improvements back to its configuration.

### Core Concepts

- **Self-reflection loop**: After each task, the agent evaluates what went well and what didn't
- **Instruction update**: Agent proposes changes to its own system prompt based on feedback
- **Memory layer**: Facts about the user and context are persisted into future conversations
- **Feedback signals**: Explicit (thumbs up/down) and implicit (did the user ask for clarification?)

### Architecture

```
User Message -> [Memory Retrieval] -> [Agent + System Prompt] -> [Response]
     -> [Reflection Engine] -> [Instruction Updater] -> [Memory Updater]
```

## Instructions

### 1. Agent State with Memory

Create an agent class that loads and saves its own configuration, including a system prompt, user facts, and learned preferences:

```python
import json, os
from anthropic import Anthropic
from datetime import datetime

client = Anthropic()

class HermesAgent:
    def __init__(self, config_path="agent_config.json"):
        self.config_path = config_path
        self.memory = []
        self.config = self._load_config()

    def _load_config(self):
        if os.path.exists(self.config_path):
            with open(self.config_path) as f:
                return json.load(f)
        return {
            "system_prompt": "You are a helpful assistant.",
            "user_facts": [], "learned_preferences": [],
            "version": 1, "updated_at": datetime.now().isoformat()
        }

    def _save_config(self):
        self.config["updated_at"] = datetime.now().isoformat()
        with open(self.config_path, "w") as f:
            json.dump(self.config, f, indent=2)
```

### 2. Conversation with Memory Injection

Enrich the system prompt with known user facts and preferences before each call:

```python
    def chat(self, user_message: str) -> str:
        facts = "\n".join(f"- {f}" for f in self.config["user_facts"])
        prefs = "\n".join(f"- {p}" for p in self.config["learned_preferences"])
        system = self.config["system_prompt"]
        if facts:
            system += f"\n\n## Known facts:\n{facts}"
        if prefs:
            system += f"\n\n## Preferences:\n{prefs}"

        self.memory.append({"role": "user", "content": user_message})
        response = client.messages.create(
            model="claude-sonnet-4-20250514", max_tokens=2048,
            system=system, messages=self.memory
        )
        reply = response.content[0].text
        self.memory.append({"role": "assistant", "content": reply})
        return reply
```

### 3. Self-Reflection and Instruction Update

After each turn, use a cheap model to evaluate the response and extract improvements:

```python
    def reflect_and_update(self, user_msg, response, feedback=None):
        reflection = client.messages.create(
            model="claude-haiku-4-5", max_tokens=512,
            system="Analyze this agent interaction. Return JSON: NEW_FACTS (list), PREFERENCES (list), INSTRUCTION_CHANGE (str or null), QUALITY_SCORE (1-10).",
            messages=[{"role": "user", "content": f"USER: {user_msg}\nAGENT: {response}\n{'Feedback: ' + feedback if feedback else ''}"}]
        )
        try:
            r = json.loads(reflection.content[0].text)
        except json.JSONDecodeError:
            return
        for fact in r.get("NEW_FACTS", []):
            if fact and fact not in self.config["user_facts"]:
                self.config["user_facts"].append(fact)
        for pref in r.get("PREFERENCES", []):
            if pref and pref not in self.config["learned_preferences"]:
                self.config["learned_preferences"].append(pref)
        if r.get("INSTRUCTION_CHANGE") and r.get("QUALITY_SCORE", 10) < 7:
            merged = client.messages.create(
                model="claude-haiku-4-5", max_tokens=512,
                system="Merge two system prompts into one improved version.",
                messages=[{"role": "user", "content": f"Current: {self.config['system_prompt']}\nChange: {r['INSTRUCTION_CHANGE']}"}]
            )
            self.config["system_prompt"] = merged.content[0].text
            self.config["version"] += 1
        self._save_config()
```

### 4. Full Interaction Loop

```python
    def run(self, user_message, feedback=None):
        response = self.chat(user_message)
        self.reflect_and_update(user_message, response, feedback)
        return response
```

## Examples

### Example 1: Agent Learns Code Style Preferences

A developer uses the agent for Python help. Over several interactions, it learns their style:

```python
agent = HermesAgent()

# First interaction — agent has no context
response = agent.run("Write a function to retry HTTP requests with exponential backoff")
# Agent returns a standard implementation with comments

# Developer gives feedback
response = agent.run(
    "Now add timeout support",
    feedback="Too verbose. I prefer type hints, no comments, and single-letter vars for lambdas."
)
# Reflection extracts: PREFERENCES: ["prefers type hints", "minimal comments", "concise style"]

# Third interaction — agent now adapts automatically
response = agent.run("Write a function to batch process S3 objects")
# Agent returns concise code with type hints and no inline comments

# Check what the agent learned:
print(json.dumps(agent.config, indent=2))
# {
#   "system_prompt": "You are a concise Python assistant. Use type hints. Minimal comments.",
#   "user_facts": ["Works with AWS S3", "Building a data pipeline"],
#   "learned_preferences": ["prefers type hints", "minimal comments", "concise style"],
#   "version": 3
# }
```

### Example 2: Agent Remembers Project Context Across Sessions

A product manager uses the agent across a multi-week project:

```python
# Week 1: Agent learns the project
agent = HermesAgent(config_path="pm_agent.json")
agent.run("I'm building a B2B invoicing SaaS. Stack is Next.js + Supabase + Stripe.")
agent.run("Our target market is freelancers and small agencies in Europe.")
# Stored: ["Building B2B invoicing SaaS", "Next.js + Supabase + Stripe",
#   "Target: freelancers and small agencies in Europe"]

# Week 2: Agent already knows the context (reloads from disk)
agent2 = HermesAgent(config_path="pm_agent.json")
response = agent2.run("What pricing model should I use?")
# References invoicing SaaS, European market, freelancer audience automatically

# Week 3: Agent adapts to a pivot
agent3 = HermesAgent(config_path="pm_agent.json")
agent3.run("We dropped Supabase, moving to PlanetScale.",
    feedback="Update your knowledge — we switched databases.")
# Reflection updates user_facts: replaces "Supabase" with "PlanetScale"
```

## Guidelines

- **Keep user_facts bounded**: Limit to 20-30 facts; periodically summarize or prune stale ones
- **Version control prompts**: Log each INSTRUCTION_CHANGE with a timestamp for rollback
- **Guard against prompt injection**: Never let raw user input directly overwrite the system prompt — always route through the reflection LLM
- **Quality threshold**: Only apply instruction changes when QUALITY_SCORE < 7 to avoid degrading good behavior
- **Batch reflections**: For high-volume agents, reflect every N turns rather than every turn to reduce API costs
- **Separate config per use case**: Use different config_path values for different domains to avoid cross-contamination
