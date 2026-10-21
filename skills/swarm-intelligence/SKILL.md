---
name: swarm-intelligence
description: >-
  Build swarm intelligence systems where multiple AI agents collaborate to make predictions
  and solve complex problems. Use when: implementing ensemble AI predictions, building
  consensus-based decision systems, creating multi-agent prediction markets.
license: Apache-2.0
compatibility: "Python 3.10+, an LLM API key (OpenAI shown; any LangChain chat model works)"
metadata:
  author: terminal-skills
  version: "1.1.0"
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

Build systems where multiple AI agents independently analyze a problem, then converge on predictions through voting, debate, or weighted aggregation. The idea comes from ensemble methods: independent answers that err in different directions can cancel out. With LLMs the gain is not guaranteed. Results across studies are mixed, and sampling one strong model several times and taking the majority answer (self-consistency) often does as well as a swarm at the same cost. Measure on your own questions before relying on it.

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

Each agent returns a validated `Vote` (structured output), not free text that has to be parsed with `json.loads`. The fan-in edge `add_edge([...], "aggregator")` makes the aggregator wait for every agent.

```python
"""Prediction swarm: N agents vote independently, aggregator combines."""
import operator, os
from typing import Annotated, Literal, TypedDict
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END

MODEL = os.environ["SWARM_MODEL"]   # a current chat model id that supports structured output (gpt-4o-mini is deprecated, removal 2027-01-14)

class Vote(BaseModel):
    prediction: Literal["yes", "no"]
    confidence: float = Field(ge=0, le=1)
    reasoning: str

class SwarmState(TypedDict):
    question: str
    votes: Annotated[list[dict], operator.add]   # reducer merges parallel writes
    final_answer: str

AGENT_PERSONAS = [
    {"name": "Optimist", "prompt": "You see opportunities and upside potential."},
    {"name": "Skeptic", "prompt": "You question assumptions and look for flaws."},
    {"name": "Analyst", "prompt": "You focus on data and historical patterns."},
    {"name": "Contrarian", "prompt": "You challenge consensus. Look for what others miss."},
    {"name": "Pragmatist", "prompt": "You focus on practical, real-world constraints."},
]

def make_agent_node(persona: dict):
    llm = ChatOpenAI(model=MODEL).with_structured_output(Vote)
    def agent_fn(state: SwarmState) -> dict:
        vote = llm.invoke(
            f"You are the {persona['name']}. {persona['prompt']}\n\n"
            f"Question (answer yes or no): {state['question']}"
        )
        return {"votes": [{**vote.model_dump(), "agent": persona["name"]}]}
    return agent_fn

def aggregator(state: SwarmState) -> dict:
    tally: dict[str, float] = {}
    lines = []
    for v in state["votes"]:
        tally[v["prediction"]] = tally.get(v["prediction"], 0) + v["confidence"]
        lines.append(f"- {v['agent']} ({v['confidence']:.0%} {v['prediction']}): {v['reasoning']}")
    winner = max(tally, key=tally.get)
    share = tally[winner] / sum(tally.values())
    return {"final_answer": f"**Prediction:** {winner}\n**Weighted share:** {share:.0%}\n" + "\n".join(lines)}

builder = StateGraph(SwarmState)
for persona in AGENT_PERSONAS:
    builder.add_node(persona["name"], make_agent_node(persona))
    builder.add_edge(START, persona["name"])
builder.add_node("aggregator", aggregator)
builder.add_edge([p["name"] for p in AGENT_PERSONAS], "aggregator")
builder.add_edge("aggregator", END)
swarm = builder.compile()
```

### Debate Swarm (Multi-Round Convergence)

Agents see the previous round's positions, including their confidence, and may change their mind.

```python
"""Debate swarm: agents see each other's reasoning and update positions."""
from pydantic import BaseModel, Field
import os
from langchain_openai import ChatOpenAI

MODEL = os.environ["SWARM_MODEL"]   # same variable as above

class Position(BaseModel):
    position: str = Field(description="One-sentence stance")
    confidence: float = Field(ge=0, le=1)
    reasoning: str

llm = ChatOpenAI(model=MODEL)
debater = llm.with_structured_output(Position)
DEBATE_AGENTS = [
    {"name": "Bull", "bias": "optimistic"},
    {"name": "Bear", "bias": "pessimistic"},
    {"name": "Quant", "bias": "data-driven"},
]

def run_debate(question: str, rounds: int = 3) -> dict:
    history: list[list[dict]] = []
    for round_num in range(1, rounds + 1):
        context = ""
        if history:
            context = "Previous round:\n" + "\n".join(
                f"- {r['agent']} ({r['confidence']:.0%}): {r['position']}" for r in history[-1]
            )
        current = []
        for agent in DEBATE_AGENTS:   # all agents see the same previous round
            p = debater.invoke(
                f"You are {agent['name']}, a {agent['bias']} analyst.\n"
                f"Question: {question}\nRound {round_num}/{rounds}.\n{context}\n"
                "Update your stance only if another argument convinced you."
            )
            current.append({"agent": agent["name"], **p.model_dump()})
        history.append(current)
    final = llm.invoke(
        f"Question: {question}\n\nFinal positions after {rounds} rounds:\n"
        + "\n".join(f"- {r['agent']} ({r['confidence']:.0%}): {r['reasoning']}" for r in history[-1])
        + "\n\nSynthesize a consensus answer and say where the agents still disagree."
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
result = swarm.invoke({"question": "Will AI agents replace 50% of SaaS tools by 2027?", "votes": []})
print(result["final_answer"])
# Output (illustrative; real text varies by run and model):
# **Prediction:** no
# **Weighted share:** 83%
# - Optimist (55% no): Agents automate many workflows but full replacement takes longer
# - Skeptic (90% no): Enterprise adoption is slow, regulatory hurdles remain
# - Analyst (80% no): Historical tech adoption curves suggest 2029-2030
# - Contrarian (60% yes): Agents will hollow out per-seat SaaS faster than expected
# - Pragmatist (75% no): Integration complexity means gradual transition
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
2. **Odd number of agents** — Avoids ties in a plain majority vote; with confidence weighting, ties are rare anyway
3. **Confidence calibration** — Ask agents to self-report confidence; use it for weighting
4. **Cost control** — Parallel calls are fast but expensive. Use cheaper models for screening, expensive for synthesis
5. **No universal agent count** — Each agent adds cost and latency, and extra agents that share a model mostly repeat each other. Start with 3–5, then add agents only while accuracy on a set of questions with known answers keeps improving
6. **Different models beat different prompts** — Agents backed by the same model make correlated mistakes; mix model families where you can. Some newer models ignore or reject a custom `temperature`
7. **Use swarms for high-stakes decisions** — For simple tasks, a single agent is faster and cheaper
8. **Self-reported confidence is not a probability** — Treat the share as a rough signal and compare against known outcomes before trusting it

## Dependencies

```bash
pip install langgraph langchain-openai   # tested: langgraph 1.2, langchain-openai 1.7
export OPENAI_API_KEY="sk-your-key"   # read from the environment, never hard-code
export SWARM_MODEL="gpt-6-luna"  # replacement named on the deprecations page; see https://developers.openai.com/api/docs/models
```
