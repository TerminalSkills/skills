---
title: "Build a Swarm Intelligence Prediction System"
slug: build-swarm-intelligence-prediction-system
description: "Create a prediction system where 10+ AI agents analyze data from different perspectives and converge on a consensus prediction using weighted voting."
skills: [swarm-intelligence, anthropic-sdk, langgraph]
category: data-ai
difficulty: advanced
time_estimate: "8 hours"
tags: [ai-agents, swarm-intelligence, prediction, multi-agent, consensus, vc-screening]
---

# Build a Swarm Intelligence Prediction System

## The Problem

VC analysts face 50+ pitch decks per week and need to screen deals quickly. A single AI opinion is unreliable — it lacks the diversity of perspectives that a real investment committee brings. There is no way to simulate the "10 partners in a room" dynamic where specialists in market timing, unit economics, technical moats, and founder evaluation each weigh in independently and then converge on a verdict.

Inspired by [MiroFish](https://github.com/mirofish/mirofish) (42k+ stars) — multi-agent deliberation for complex decisions.

## The Solution

Build a swarm of 10 specialized AI agents, each with a unique analytical lens (optimist, pessimist, data-driven, contrarian, etc.), that independently evaluate the same input. A weighted aggregation layer combines their scores, measures consensus confidence via standard deviation, and surfaces dissenting opinions. Agent weights adapt over time based on prediction accuracy.

```
Pitch Deck → Parser → 10 Agent Perspectives → Independent Analysis
                                                      ↓
                                          Aggregation Layer
                                          (weighted voting)
                                                      ↓
                                    Confidence Score + Final Verdict
```

## Step-by-Step Walkthrough

### 1. Define Agent Perspectives

Each agent gets a unique system prompt that shapes how it evaluates data:

```python
AGENT_PERSPECTIVES = {
    "optimist": {
        "prompt": "You see potential everywhere. Focus on upside scenarios, market tailwinds, and founder strengths. Rate generously.",
        "weight": 1.0
    },
    "pessimist": {
        "prompt": "You've seen 1000 startups fail. Focus on risks, burn rate, competition, and why this will likely fail. Be harsh.",
        "weight": 1.0
    },
    "data_driven": {
        "prompt": "Only facts matter. Analyze TAM/SAM/SOM, unit economics, growth rates, and comparable exits. Ignore narrative.",
        "weight": 1.2
    },
    "contrarian": {
        "prompt": "If everyone loves it, you hate it. If everyone hates it, dig deeper. Challenge consensus assumptions.",
        "weight": 0.8
    },
    "trend_follower": {
        "prompt": "Map this startup to current macro trends. AI, climate, biotech — is this riding a wave or fighting the current?",
        "weight": 1.0
    },
    "technical_expert": {
        "prompt": "Evaluate the technical moat. Is the tech defensible? Can a FAANG team replicate this in 6 months?",
        "weight": 1.1
    },
    "market_timer": {
        "prompt": "Is the timing right? Too early, too late, or perfect? Analyze market readiness and adoption curves.",
        "weight": 0.9
    },
    "founder_judge": {
        "prompt": "Focus exclusively on the founding team. Track record, domain expertise, team composition, and grit signals.",
        "weight": 1.1
    },
    "unit_economist": {
        "prompt": "LTV/CAC, margins, payback period, scalability of economics. Can this be a profitable business at scale?",
        "weight": 1.2
    },
    "exit_strategist": {
        "prompt": "Who buys this company? At what multiple? Is there a clear path to IPO or acquisition? Analyze exit scenarios.",
        "weight": 1.0
    }
}
```

### 2. Independent Agent Analysis

Each agent analyzes the same input independently — no cross-talk:

```python
import anthropic
import asyncio

client = anthropic.AsyncAnthropic()

async def run_agent(perspective: str, config: dict, pitch_data: str) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=config["prompt"] + "\n\nRespond with JSON: {score: 1-10, reasoning: string, key_factors: [string], red_flags: [string]}",
        messages=[{"role": "user", "content": f"Evaluate this startup:\n\n{pitch_data}"}]
    )
    result = parse_json(response.content[0].text)
    result["perspective"] = perspective
    result["weight"] = config["weight"]
    return result

async def swarm_analyze(pitch_data: str) -> list:
    tasks = [
        run_agent(name, config, pitch_data)
        for name, config in AGENT_PERSPECTIVES.items()
    ]
    return await asyncio.gather(*tasks)
```

### 3. Weighted Aggregation & Consensus

```python
def aggregate_predictions(results: list) -> dict:
    total_weight = sum(r["weight"] for r in results)
    weighted_score = sum(r["score"] * r["weight"] for r in results) / total_weight

    scores = [r["score"] for r in results]
    std_dev = (sum((s - weighted_score)**2 for s in scores) / len(scores)) ** 0.5

    # Confidence: high consensus = high confidence
    confidence = max(0, 1 - (std_dev / 5))  # normalize to 0-1

    # Collect all red flags across agents
    all_flags = []
    for r in results:
        all_flags.extend(r.get("red_flags", []))

    return {
        "final_score": round(weighted_score, 2),
        "confidence": round(confidence, 2),
        "verdict": "PASS" if weighted_score >= 7 else "REVIEW" if weighted_score >= 5 else "SKIP",
        "agent_scores": {r["perspective"]: r["score"] for r in results},
        "consensus_flags": deduplicate(all_flags),
        "dissent": [r for r in results if abs(r["score"] - weighted_score) > 2]
    }
```

### 4. Adaptive Weights from Track Record

Agents that predicted well in the past get more weight:

```python
def update_weights(agent_name: str, predicted_score: float, actual_outcome: float):
    error = abs(predicted_score - actual_outcome)
    accuracy = max(0, 1 - error / 10)

    # Exponential moving average
    history = load_agent_history(agent_name)
    history["accuracy_ema"] = 0.7 * history["accuracy_ema"] + 0.3 * accuracy
    AGENT_PERSPECTIVES[agent_name]["weight"] = 0.5 + history["accuracy_ema"]
    save_agent_history(agent_name, history)
```

### 5. Run It

```python
pitch = """
Company: DataMesh AI
Stage: Series A, raising $8M
Team: 2 ex-Google ML engineers, 1 ex-Stripe PM
Product: Real-time data pipeline orchestration with AI-driven optimization
Traction: $400K ARR, 15 enterprise customers, 3x QoQ growth
Market: $12B data infrastructure market
"""

results = asyncio.run(swarm_analyze(pitch))
verdict = aggregate_predictions(results)

print(f"Score: {verdict['final_score']}/10")
print(f"Confidence: {verdict['confidence']:.0%}")
print(f"Verdict: {verdict['verdict']}")
print(f"Dissenting agents: {[d['perspective'] for d in verdict['dissent']]}")
```

## Real-World Example

A Series A fund uses this system to screen 200 deals over a quarter. For a developer tools startup (DataMesh AI), the swarm returns a score of 7.4/10 with 78% confidence. The optimist and trend_follower rate it 9/10 (strong AI tailwind, experienced team), while the pessimist gives it 4/10 (crowded market, no clear moat against Databricks). The contrarian flags that "every AI infrastructure play gets overhyped" but the unit_economist notes strong LTV/CAC of 5.2x. The dissent report highlights the pessimist and contrarian as outliers. After 6 months of tracking outcomes, the data_driven and unit_economist agents prove most accurate, and their weights automatically increase from 1.2 to 1.45, while the optimist's weight drops from 1.0 to 0.72 due to consistently overrating deals.

## Related Skills

- **[anthropic-sdk](/skills/anthropic-sdk)** — Claude API integration for running parallel agent analyses
- **[langgraph](/skills/langgraph)** — Graph-based agent orchestration for multi-step deliberation workflows
- **[crewai](/skills/crewai)** — Multi-agent collaboration framework with role-based specialization
- **[langchain](/skills/langchain)** — Agent chaining and tool integration for complex evaluation pipelines
- **[n8n](/skills/n8n)** — Workflow automation for connecting pitch deck ingestion to the swarm

## What You'll Learn

- Multi-agent orchestration with async parallel execution
- Weighted consensus algorithms for AI decision-making
- Self-improving systems via feedback loops on agent accuracy
- Prompt engineering for diverse analytical perspectives
- Building production prediction pipelines with confidence scoring
