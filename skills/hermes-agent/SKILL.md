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
  category: ai-tools
  tags: [agents, self-improving, hermes, adaptive, learning, nousresearch]
  use-cases:
    - "Build an agent that improves its responses based on feedback"
    - "Create an AI assistant that adapts to user preferences over time"
    - "Implement self-reflection loops in AI agent workflows"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Hermes Agent — Self-Improving AI Agents

## Overview

Inspired by [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (12k+ stars), this skill helps you build agents that **grow with usage** — capturing feedback, reflecting on their own behavior, and updating their instructions over time.

Unlike static assistants, a Hermes-style agent maintains a living system prompt. After each interaction, it evaluates its own performance, extracts lessons, and writes improvements back to its configuration. The agent you have in a week is smarter than the one you deployed on day one.

## Core Concepts

- **Self-reflection loop**: After each task, the agent evaluates what went well and what didn't
- **Instruction update**: Agent proposes changes to its own system prompt based on feedback
- **Memory layer**: Facts about the user and context are persisted and injected into future conversations
- **Feedback signals**: Explicit (thumbs up/down) and implicit (did the user ask for clarification?)

## Architecture

```
User Message
     ↓
[Memory Retrieval] ← Long-term memory store
     ↓
[Agent + Current System Prompt]
     ↓
[Response]
     ↓
[Reflection Engine] — Was this response good? What could improve?
     ↓
[Instruction Updater] — Propose system prompt changes
     ↓
[Memory Updater] — Extract and store new facts
```

## Python Implementation

### Installation

```bash
pip install anthropic langchain-anthropic chromadb
```

### Step 1: Agent State with Memory

```python
import json
import os
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
            "user_facts": [],
            "learned_preferences": [],
            "version": 1,
            "updated_at": datetime.now().isoformat()
        }

    def _save_config(self):
        self.config["updated_at"] = datetime.now().isoformat()
        with open(self.config_path, "w") as f:
            json.dump(self.config, f, indent=2)
```

### Step 2: Conversation with Memory Injection

```python
    def chat(self, user_message: str) -> str:
        # Inject user facts into system prompt
        user_facts = "\n".join(f"- {f}" for f in self.config["user_facts"])
        preferences = "\n".join(f"- {p}" for p in self.config["learned_preferences"])

        enriched_system = self.config["system_prompt"]
        if user_facts:
            enriched_system += f"\n\n## What I know about you:\n{user_facts}"
        if preferences:
            enriched_system += f"\n\n## Your preferences:\n{preferences}"

        self.memory.append({"role": "user", "content": user_message})

        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=2048,
            system=enriched_system,
            messages=self.memory
        )

        assistant_message = response.content[0].text
        self.memory.append({"role": "assistant", "content": assistant_message})

        return assistant_message
```

### Step 3: Self-Reflection After Each Turn

```python
    def reflect(self, user_message: str, response: str, feedback: str = None) -> dict:
        """Agent reflects on its own response and extracts improvements."""

        feedback_context = f"User feedback: {feedback}" if feedback else "No explicit feedback."

        reflection = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            system="You are a meta-cognitive reflection engine. Analyze agent interactions and extract improvements.",
            messages=[{
                "role": "user",
                "content": f"""Analyze this agent interaction:

USER: {user_message}
AGENT: {response}
{feedback_context}

Extract:
1. NEW_FACTS: Any facts about the user to remember (list, or empty)
2. PREFERENCES: Any preferences or style notes to remember (list, or empty)
3. INSTRUCTION_CHANGE: Should the system prompt change? If yes, provide the change (or null)
4. QUALITY_SCORE: 1-10 rating for this response

Return as JSON."""
            }]
        )

        try:
            return json.loads(reflection.content[0].text)
        except json.JSONDecodeError:
            return {"NEW_FACTS": [], "PREFERENCES": [], "INSTRUCTION_CHANGE": None, "QUALITY_SCORE": 5}
```

### Step 4: Applying Learned Instructions

```python
    def apply_reflection(self, reflection: dict):
        """Updates agent config based on reflection output."""

        # Add new user facts
        for fact in reflection.get("NEW_FACTS", []):
            if fact and fact not in self.config["user_facts"]:
                self.config["user_facts"].append(fact)

        # Add new preferences
        for pref in reflection.get("PREFERENCES", []):
            if pref and pref not in self.config["learned_preferences"]:
                self.config["learned_preferences"].append(pref)

        # Update system prompt if agent proposes a change
        instruction_change = reflection.get("INSTRUCTION_CHANGE")
        if instruction_change:
            update_response = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=512,
                system="Merge two system prompts into one improved version. Be concise.",
                messages=[{
                    "role": "user",
                    "content": f"""Current prompt: {self.config['system_prompt']}

Proposed change: {instruction_change}

Merge these into a single improved system prompt."""
                }]
            )
            self.config["system_prompt"] = update_response.content[0].text
            self.config["version"] += 1

        self._save_config()
```

### Step 5: Full Interaction Loop

```python
    def run(self, user_message: str, feedback: str = None) -> str:
        response = self.chat(user_message)
        reflection = self.reflect(user_message, response, feedback)
        self.apply_reflection(reflection)
        return response


# Usage
agent = HermesAgent()

# First interaction
response = agent.run("Help me write a Python script to parse CSV files")
print(response)

# With explicit feedback
response = agent.run(
    "Now add error handling",
    feedback="Good, but too verbose. I prefer concise code with minimal comments."
)
print(response)

# Agent has now learned your preferences — next response will be more concise
```

## TypeScript Implementation

```typescript
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

interface AgentConfig {
  systemPrompt: string;
  userFacts: string[];
  learnedPreferences: string[];
  version: number;
}

class HermesAgent {
  private client = new Anthropic();
  private config: AgentConfig;
  private memory: Array<{ role: "user" | "assistant"; content: string }> = [];

  constructor(private configPath = "agent_config.json") {
    this.config = this.loadConfig();
  }

  private loadConfig(): AgentConfig {
    if (fs.existsSync(this.configPath)) {
      return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
    }
    return {
      systemPrompt: "You are a helpful assistant.",
      userFacts: [],
      learnedPreferences: [],
      version: 1,
    };
  }

  async run(userMessage: string, feedback?: string): Promise<string> {
    // Build enriched system prompt
    const facts = this.config.userFacts.map((f) => `- ${f}`).join("\n");
    const prefs = this.config.learnedPreferences.map((p) => `- ${p}`).join("\n");
    const system = [
      this.config.systemPrompt,
      facts ? `\n## Known facts:\n${facts}` : "",
      prefs ? `\n## Preferences:\n${prefs}` : "",
    ].join("");

    this.memory.push({ role: "user", content: userMessage });

    const response = await this.client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system,
      messages: this.memory,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";
    this.memory.push({ role: "assistant", content: reply });

    // Async reflection — don't block the response
    this.reflect(userMessage, reply, feedback).then((r) => this.applyReflection(r));

    return reply;
  }
}
```

## Tips

- **Keep `user_facts` bounded**: Limit to 20-30 facts, periodically summarize or prune stale ones.
- **Version control your prompts**: Log each `INSTRUCTION_CHANGE` with a timestamp for rollback.
- **Guard against prompt injection**: Never let raw user input directly overwrite the system prompt — always route through the reflection LLM.
- **Quality threshold**: Only apply instruction changes when `QUALITY_SCORE < 7` to avoid degrading good behavior.
- **Batch reflections**: For high-volume agents, reflect every N turns rather than every turn to reduce API costs.
