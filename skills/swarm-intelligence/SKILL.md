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
  category: ai-tools
  tags: [swarm-intelligence, multi-agent, prediction, ensemble, consensus, mirofish]
  use-cases:
    - "Build a prediction system that uses 10 agents to forecast market trends"
    - "Create ensemble AI that combines multiple model opinions for better accuracy"
    - "Implement swarm-based decision making for complex business problems"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Swarm Intelligence

## Overview

Build systems where multiple AI agents independently analyze a problem, then converge on predictions through voting, debate, or weighted aggregation. Inspired by biological swarms and ensemble methods — the collective intelligence of diverse agents consistently outperforms any single agent.

## Core Patterns

### 1. Prediction Swarm (Vote & Aggregate)

Each agent analyzes independently with a different prompt/persona, then votes are aggregated:

```
[Agent-Optimist] ──→ prediction + confidence
[Agent-Skeptic]  ──→ prediction + confidence  ──→ [Aggregator] ──→ final prediction
[Agent-Analyst]  ──→ prediction + confidence
[Agent-Contrarian]──→ prediction + confidence
```

### 2. Debate Swarm (Argue & Converge)

Agents see each other's reasoning and can update their positions over multiple rounds:

```
Round 1: Independent analysis
Round 2: Read others' reasoning → update position
Round 3: Final position with confidence
```

### 3. Specialist Swarm (Divide & Conquer)

Each agent handles a different aspect of the problem:

```
[Market Agent]  ──→ market analysis
[Tech Agent]    ──→ technical feasibility  ──→ [Synthesizer] ──→ holistic answer
[Risk Agent]    ──→ risk assessment
[History Agent] ──→ historical patterns
```

## Instructions

When a user asks to build a swarm intelligence system, prediction ensemble, or multi-agent decision system:

1. **Identify the pattern** — Is it prediction (vote), debate (converge), or specialist (divide)?
2. **Define agents** — Each agent needs a unique persona/perspective and clear role
3. **Choose aggregation** — Weighted voting, median, debate rounds, or synthesis
4. **Implement with LangGraph** — Use parallel nodes for agents, then aggregation node

## Implementation with LangGraph

### Prediction Swarm

```python
"""Prediction swarm: N agents vote independently, aggregator combines."""
import json
import operator
from typing import Annotated, TypedDict
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

class SwarmState(TypedDict):
    question: str
    predictions: Annotated[list[dict], operator.add]
    final_answer: str

AGENT_PERSONAS = [
    {"name": "Optimist", "prompt": "You see opportunities and upside potential. Analyze with a bullish lens."},
    {"name": "Skeptic", "prompt": "You question assumptions and look for flaws. Analyze with a bearish lens."},
    {"name": "Analyst", "prompt": "You focus on data and historical patterns. Be purely quantitative."},
    {"name": "Contrarian", "prompt": "You challenge the consensus view. Look for what everyone else is missing."},
    {"name": "Pragmatist", "prompt": "You focus on practical, real-world constraints. What actually happens?"},
]

def make_agent_node(persona: dict):
    """Create an agent node with a specific persona."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)

    def agent_fn(state: SwarmState) -> dict:
        response = llm.invoke(
            f"You are the {persona['name']}. {persona['prompt']}\n\n"
            f"Question: {state['question']}\n\n"
            f"Respond with JSON: {{\"prediction\": \"your prediction\", "
            f"\"confidence\": 0.0-1.0, \"reasoning\": \"brief reasoning\"}}"
        )
        prediction = json.loads(response.content)
        prediction["agent"] = persona["name"]
        return {"predictions": [prediction]}

    return agent_fn

def aggregator(state: SwarmState) -> dict:
    """Aggregate predictions using confidence-weighted voting."""
    predictions = state["predictions"]

    # Group by prediction, weight by confidence
    votes: dict[str, float] = {}
    reasoning_parts = []
    for p in predictions:
        pred = p["prediction"]
        votes[pred] = votes.get(pred, 0) + p["confidence"]
        reasoning_parts.append(f"- {p['agent']} ({p['confidence']:.0%}): {p['reasoning']}")

    winner = max(votes, key=votes.get)
    total_conf = sum(p["confidence"] for p in predictions) / len(predictions)

    return {
        "final_answer": (
            f"**Prediction:** {winner}\n"
            f"**Swarm Confidence:** {total_conf:.0%}\n"
            f"**Agent Breakdown:**\n" + "\n".join(reasoning_parts)
        )
    }

# Build the graph
builder = StateGraph(SwarmState)

# Add parallel agent nodes
for persona in AGENT_PERSONAS:
    builder.add_node(persona["name"], make_agent_node(persona))
    builder.add_edge("__start__", persona["name"])

# All agents feed into aggregator
builder.add_node("aggregator", aggregator)
for persona in AGENT_PERSONAS:
    builder.add_edge(persona["name"], "aggregator")
builder.add_edge("aggregator", END)

swarm = builder.compile()

# Run it
result = swarm.invoke({"question": "Will AI agents replace 50% of SaaS tools by 2027?"})
print(result["final_answer"])
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
                prev = history[-1]
                context = "Previous round positions:\n" + "\n".join(
                    f"- {r['agent']}: {r['position']} (confidence: {r['confidence']})"
                    for r in prev
                )

            response = llm.invoke(
                f"You are {agent['name']}, a {agent['bias']} analyst.\n"
                f"Question: {question}\n"
                f"Round {round_num}/{rounds}.\n"
                f"{context}\n\n"
                f"State your position, confidence (0-1), and reasoning. "
                f"If others made good points, you may update your view."
            )
            round_responses.append({
                "agent": agent["name"],
                "position": response.content[:200],
                "confidence": 0.7,  # Parse from response in production
                "full": response.content,
            })

        history.append(round_responses)

    # Final synthesis
    final = llm.invoke(
        f"Question: {question}\n\n"
        f"After {rounds} rounds of debate, here are the final positions:\n"
        + "\n".join(f"- {r['agent']}: {r['full']}" for r in history[-1])
        + "\n\nSynthesize a final consensus answer."
    )
    return {"rounds": history, "consensus": final.content}
```

### Specialist Swarm (Domain Experts)

```python
"""Specialist swarm: each agent covers a different domain."""

SPECIALISTS = {
    "market": "Analyze market size, competition, and demand signals.",
    "technical": "Assess technical feasibility, architecture complexity, and risks.",
    "financial": "Model costs, revenue potential, and break-even timeline.",
    "legal": "Identify regulatory risks, compliance needs, and IP concerns.",
}

def specialist_swarm(question: str) -> str:
    analyses = {}
    for domain, prompt in SPECIALISTS.items():
        response = llm.invoke(
            f"You are a {domain} specialist. {prompt}\n\nQuestion: {question}"
        )
        analyses[domain] = response.content

    # Synthesize
    synthesis = llm.invoke(
        f"You received specialist analyses for: {question}\n\n"
        + "\n\n".join(f"**{k.upper()}:**\n{v}" for k, v in analyses.items())
        + "\n\nSynthesize into a unified recommendation with clear action items."
    )
    return synthesis.content
```

## Node.js Implementation

```typescript
/**
 * Lightweight swarm using parallel Promise.all
 */
import OpenAI from "openai";

const openai = new OpenAI();

interface AgentResult {
  agent: string;
  prediction: string;
  confidence: number;
  reasoning: string;
}

const personas = [
  { name: "Optimist", system: "You focus on opportunities and upside." },
  { name: "Skeptic", system: "You question everything and find risks." },
  { name: "Analyst", system: "You rely on data and historical patterns." },
];

async function swarmPredict(question: string): Promise<string> {
  const results: AgentResult[] = await Promise.all(
    personas.map(async (p) => {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${p.system} Respond as JSON: {prediction, confidence, reasoning}` },
          { role: "user", content: question },
        ],
      });
      const data = JSON.parse(res.choices[0].message.content!);
      return { agent: p.name, ...data };
    })
  );

  // Weighted aggregation
  const weighted = results.reduce((acc, r) => {
    acc[r.prediction] = (acc[r.prediction] || 0) + r.confidence;
    return acc;
  }, {} as Record<string, number>);

  const winner = Object.entries(weighted).sort((a, b) => b[1] - a[1])[0][0];
  const avgConf = results.reduce((s, r) => s + r.confidence, 0) / results.length;

  return `Prediction: ${winner} (${(avgConf * 100).toFixed(0)}% avg confidence)\n` +
    results.map((r) => `  ${r.agent}: ${r.prediction} (${(r.confidence * 100).toFixed(0)}%) — ${r.reasoning}`).join("\n");
}
```

## Aggregation Strategies

| Strategy | Best For | How It Works |
|----------|----------|--------------|
| **Majority Vote** | Binary/categorical predictions | Most common answer wins |
| **Weighted Vote** | When agent confidence varies | Weight by confidence scores |
| **Median** | Numerical predictions | Take the median value |
| **Debate** | Complex reasoning tasks | Multiple rounds of argumentation |
| **Synthesis** | Open-ended analysis | LLM combines all perspectives |

## Best Practices

1. **Diversity is key** — Agents with identical prompts add noise, not intelligence. Give each a distinct perspective, model, or temperature
2. **Odd number of agents** — Avoids ties in voting (5, 7, or 9 agents)
3. **Confidence calibration** — Ask agents to self-report confidence; use it for weighting
4. **Cost control** — Parallel calls are fast but expensive. Use cheaper models for initial screening, expensive models for final synthesis
5. **Diminishing returns** — 5-7 agents is usually the sweet spot. Beyond 9, gains plateau
6. **Temperature variation** — Use different temperatures per agent (0.3 for analytical, 0.9 for creative)
7. **Model mixing** — Combine GPT-4o, Claude, Gemini for true diversity of thought

## When to Use Swarms vs Single Agent

- **Use swarms:** High-stakes predictions, ambiguous problems, when you need calibrated confidence
- **Use single agent:** Simple tasks, low latency requirements, cost-sensitive applications
- **Hybrid:** Single agent for routine work, swarm for important decisions

## Dependencies

```bash
pip install langgraph langchain-openai   # Python
npm install openai                        # Node.js
```
