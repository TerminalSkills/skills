---
name: swarm-intelligence
description: >-
  Build swarm intelligence systems where multiple AI agents collaborate to make predictions
  and solve complex problems. Use when: implementing ensemble AI predictions, building
  consensus-based decision systems, creating multi-agent prediction markets.
license: Apache-2.0
compatibility: "Python 3.10+ or Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [swarm-intelligence, multi-agent, prediction, ensemble, consensus]
  use-cases:
    - "Build a prediction system that uses 10 agents to forecast market trends"
    - "Create ensemble AI that combines multiple model opinions for better accuracy"
    - "Implement swarm-based decision making for complex business problems"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Swarm Intelligence

## Overview

Build systems where multiple AI agents independently analyze a problem, then converge on predictions through voting, debate, or weighted aggregation. Inspired by biological swarms and ensemble methods — the collective intelligence of diverse agents consistently outperforms any single agent.

### Core Patterns

1. **Prediction Swarm (Vote & Aggregate)** — Each agent analyzes independently with a different persona, then votes are aggregated
2. **Debate Swarm (Argue & Converge)** — Agents see each other's reasoning and update positions over multiple rounds
3. **Specialist Swarm (Divide & Conquer)** — Each agent handles a different domain aspect, then a synthesizer combines results

## Instructions

When a user asks to build a swarm intelligence system, prediction ensemble, or multi-agent decision system:

1. **Identify the pattern** — Is it prediction (vote), debate (converge), or specialist (divide)?
2. **Define agents** — Each agent needs a unique persona/perspective and clear role
3. **Choose aggregation** — Weighted voting, median, debate rounds, or synthesis
4. **Implement with LangGraph** — Use parallel nodes for agents, then aggregation node

### Prediction Swarm Implementation

```python
"""Prediction swarm: N agents vote independently, aggregator combines."""
import json, operator
from typing import Annotated, TypedDict
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

class SwarmState(TypedDict):
    question: str
    predictions: Annotated[list[dict], operator.add]
    final_answer: str

AGENT_PERSONAS = [
    {"name": "Optimist", "prompt": "You see opportunities and upside potential."},
    {"name": "Skeptic", "prompt": "You question assumptions and look for flaws."},
    {"name": "Analyst", "prompt": "You focus on data and historical patterns."},
    {"name": "Contrarian", "prompt": "You challenge consensus. Look for what others miss."},
    {"name": "Pragmatist", "prompt": "You focus on practical, real-world constraints."},
]

def make_agent_node(persona: dict):
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    def agent_fn(state: SwarmState) -> dict:
        response = llm.invoke(
            f"You are the {persona['name']}. {persona['prompt']}\n\n"
            f"Question: {state['question']}\n\n"
            f"Respond with JSON: {{\"prediction\": \"...\", \"confidence\": 0.0-1.0, \"reasoning\": \"...\"}}"
        )
        prediction = json.loads(response.content)
        prediction["agent"] = persona["name"]
        return {"predictions": [prediction]}
    return agent_fn

def aggregator(state: SwarmState) -> dict:
    predictions = state["predictions"]
    votes: dict[str, float] = {}
    reasoning_parts = []
    for p in predictions:
        votes[p["prediction"]] = votes.get(p["prediction"], 0) + p["confidence"]
        reasoning_parts.append(f"- {p['agent']} ({p['confidence']:.0%}): {p['reasoning']}")
    winner = max(votes, key=votes.get)
    avg_conf = sum(p["confidence"] for p in predictions) / len(predictions)
    return {"final_answer": f"**Prediction:** {winner}\n**Confidence:** {avg_conf:.0%}\n**Breakdown:**\n" + "\n".join(reasoning_parts)}

# Build the graph
builder = StateGraph(SwarmState)
for persona in AGENT_PERSONAS:
    builder.add_node(persona["name"], make_agent_node(persona))
    builder.add_edge("__start__", persona["name"])
builder.add_node("aggregator", aggregator)
for persona in AGENT_PERSONAS:
    builder.add_edge(persona["name"], "aggregator")
builder.add_edge("aggregator", END)
swarm = builder.compile()
```

### Debate Swarm (Multi-Round Convergence)

```python
"""Debate swarm: agents see each other's reasoning and update positions."""
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", temperature=0.5)
DEBATE_AGENTS = [
    {"name": "Bull", "bias": "optimistic"},
    {"name": "Bear", "bias": "pessimistic"},
    {"name": "Quant", "bias": "data-driven"},
]

def run_debate(question: str, rounds: int = 3) -> dict:
    history = []
    for round_num in range(1, rounds + 1):
        round_responses = []
        for agent in DEBATE_AGENTS:
            context = ""
            if history:
                context = "Previous positions:\n" + "\n".join(
                    f"- {r['agent']}: {r['position']} (conf: {r['confidence']})" for r in history[-1]
                )
            response = llm.invoke(
                f"You are {agent['name']}, a {agent['bias']} analyst.\n"
                f"Question: {question}\nRound {round_num}/{rounds}.\n{context}\n\n"
                f"State your position, confidence (0-1), and reasoning."
            )
            round_responses.append({"agent": agent["name"], "position": response.content[:200], "confidence": 0.7, "full": response.content})
        history.append(round_responses)
    final = llm.invoke(
        f"Question: {question}\n\nFinal positions after {rounds} rounds:\n"
        + "\n".join(f"- {r['agent']}: {r['full']}" for r in history[-1])
        + "\n\nSynthesize a consensus answer."
    )
    return {"rounds": history, "consensus": final.content}
```

### Aggregation Strategies

| Strategy | Best For | How It Works |
|----------|----------|--------------|
| **Majority Vote** | Binary/categorical predictions | Most common answer wins |
| **Weighted Vote** | Varying agent confidence | Weight by confidence scores |
| **Median** | Numerical predictions | Take the median value |
| **Debate** | Complex reasoning | Multiple rounds of argumentation |
| **Synthesis** | Open-ended analysis | LLM combines all perspectives |

## Examples

### Example 1: Market Trend Prediction

```python
result = swarm.invoke({"question": "Will AI agents replace 50% of SaaS tools by 2027?"})
print(result["final_answer"])
# Output:
# **Prediction:** Unlikely within that timeframe
# **Confidence:** 68%
# **Breakdown:**
# - Optimist (85%): AI agents will automate many workflows but full replacement takes longer
# - Skeptic (40%): Enterprise adoption is slow, regulatory hurdles remain
# - Analyst (65%): Historical tech adoption curves suggest 2029-2030
# - Contrarian (70%): The question is wrong — agents will augment, not replace
# - Pragmatist (55%): Integration complexity means gradual transition
```

### Example 2: Multi-Domain Business Analysis

```python
SPECIALISTS = {
    "market": "Analyze market size, competition, and demand signals.",
    "technical": "Assess technical feasibility and architecture risks.",
    "financial": "Model costs, revenue potential, and break-even timeline.",
    "legal": "Identify regulatory risks and compliance needs.",
}

def specialist_swarm(question: str) -> str:
    analyses = {}
    for domain, prompt in SPECIALISTS.items():
        response = llm.invoke(f"You are a {domain} specialist. {prompt}\n\nQuestion: {question}")
        analyses[domain] = response.content
    synthesis = llm.invoke(
        f"Specialist analyses for: {question}\n\n"
        + "\n\n".join(f"**{k.upper()}:**\n{v}" for k, v in analyses.items())
        + "\n\nSynthesize into a unified recommendation."
    )
    return synthesis.content

# Usage: specialist_swarm("Should we build a competitor to Notion using AI-native architecture?")
```

## Guidelines

1. **Diversity is key** — Agents with identical prompts add noise, not intelligence. Give each a distinct perspective
2. **Odd number of agents** — Avoids ties in voting (5, 7, or 9 agents work best)
3. **Confidence calibration** — Ask agents to self-report confidence; use it for weighting
4. **Cost control** — Parallel calls are fast but expensive. Use cheaper models for screening, expensive for synthesis
5. **Sweet spot is 5-7 agents** — Beyond 9, gains plateau due to diminishing returns
6. **Temperature variation** — Use different temperatures per agent (0.3 for analytical, 0.9 for creative)
7. **Use swarms for high-stakes decisions** — For simple tasks, a single agent is faster and cheaper

## Dependencies

```bash
pip install langgraph langchain-openai   # Python
npm install openai                        # Node.js
```
