---
name: model-router
description: >-
  Smart routing between multiple LLMs based on task complexity, cost, and
  capabilities. Use when a user asks to route between models, optimize LLM
  costs, select the best model for a task, build a model gateway, create a
  multi-model pipeline, or balance cost vs quality across LLM providers.
  Covers routing strategies, fallback chains, and cost optimization.
license: Apache-2.0
compatibility: "Requires at least one LLM provider (OpenAI, Anthropic, or local via Ollama/LM Studio)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["routing", "llm", "multi-model", "cost-optimization", "gateway"]
  use-cases:
    - "Route tasks to the cheapest model that meets quality requirements"
    - "Build fallback chains across multiple LLM providers"
    - "Optimize LLM spending by matching task complexity to model capability"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Model Router

## Overview

Intelligently route LLM requests to the optimal model based on task complexity, cost, latency, and capability requirements. Build multi-model pipelines that use expensive models only when needed, fall back gracefully across providers, and minimize costs while maintaining output quality. Supports OpenAI, Anthropic, local models (Ollama, LM Studio), and any OpenAI-compatible API.

## Instructions

When a user asks to route between models, determine the approach:

### Task A: Define a routing configuration

```python
from dataclasses import dataclass

@dataclass
class ModelConfig:
    name: str
    provider: str
    base_url: str
    api_key: str
    cost_per_1k_input: float   # USD per 1K input tokens
    cost_per_1k_output: float  # USD per 1K output tokens
    max_context: int
    strengths: list[str]       # Task types this model excels at

MODELS = {
    "gpt4o": ModelConfig(
        name="gpt-4o", provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="OPENAI_API_KEY",
        cost_per_1k_input=0.0025, cost_per_1k_output=0.01,
        max_context=128000,
        strengths=["reasoning", "code", "analysis", "creative"],
    ),
    "claude_sonnet": ModelConfig(
        name="claude-sonnet-4-20250514", provider="anthropic",
        base_url="https://api.anthropic.com/v1",
        api_key="ANTHROPIC_API_KEY",
        cost_per_1k_input=0.003, cost_per_1k_output=0.015,
        max_context=200000,
        strengths=["reasoning", "analysis", "long-context", "code"],
    ),
    "gpt4o_mini": ModelConfig(
        name="gpt-4o-mini", provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="OPENAI_API_KEY",
        cost_per_1k_input=0.00015, cost_per_1k_output=0.0006,
        max_context=128000,
        strengths=["summarization", "classification", "extraction", "simple-qa"],
    ),
    "local_llama": ModelConfig(
        name="llama3.1:8b", provider="ollama",
        base_url="http://localhost:11434/v1",
        api_key="ollama",
        cost_per_1k_input=0.0, cost_per_1k_output=0.0,
        max_context=8192,
        strengths=["summarization", "classification", "reformatting"],
    ),
}
```

### Task B: Implement complexity-based routing

```python
from openai import OpenAI

def classify_complexity(task: str) -> str:
    """Classify task complexity: low, medium, high."""
    low_indicators = ["summarize", "classify", "extract", "reformat", "translate simple",
                      "list", "count", "convert"]
    high_indicators = ["analyze", "reason", "compare", "evaluate", "create", "design",
                       "debug complex", "multi-step", "research"]

    task_lower = task.lower()
    if any(ind in task_lower for ind in high_indicators):
        return "high"
    if any(ind in task_lower for ind in low_indicators):
        return "low"
    return "medium"

ROUTING_TABLE = {
    "low": ["local_llama", "gpt4o_mini"],
    "medium": ["gpt4o_mini", "gpt4o"],
    "high": ["gpt4o", "claude_sonnet"],
}

def route_request(task: str, user_input: str) -> str:
    complexity = classify_complexity(task)
    model_chain = ROUTING_TABLE[complexity]

    for model_key in model_chain:
        config = MODELS[model_key]
        try:
            client = OpenAI(base_url=config.base_url, api_key=config.api_key)
            response = client.chat.completions.create(
                model=config.name,
                messages=[{"role": "user", "content": user_input}],
                temperature=0.3,
                max_tokens=2048,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Model {config.name} failed: {e}, trying next...")
            continue

    raise RuntimeError("All models in the routing chain failed")
```

### Task C: Cost-optimized routing with budget tracking

```python
import time
from dataclasses import dataclass, field

@dataclass
class UsageTracker:
    total_cost: float = 0.0
    requests_by_model: dict = field(default_factory=dict)
    daily_budget: float = 10.0  # USD

    def record(self, model_key: str, input_tokens: int, output_tokens: int):
        config = MODELS[model_key]
        cost = (input_tokens / 1000 * config.cost_per_1k_input +
                output_tokens / 1000 * config.cost_per_1k_output)
        self.total_cost += cost
        self.requests_by_model[model_key] = self.requests_by_model.get(model_key, 0) + 1
        return cost

    def budget_remaining(self) -> float:
        return self.daily_budget - self.total_cost

    def should_downgrade(self) -> bool:
        return self.budget_remaining() < self.daily_budget * 0.2

tracker = UsageTracker(daily_budget=10.0)

def cost_aware_route(task: str, user_input: str) -> str:
    complexity = classify_complexity(task)

    # Downgrade to cheaper models when budget is low
    if tracker.should_downgrade() and complexity != "high":
        model_chain = ["local_llama", "gpt4o_mini"]
    else:
        model_chain = ROUTING_TABLE[complexity]

    for model_key in model_chain:
        config = MODELS[model_key]
        try:
            client = OpenAI(base_url=config.base_url, api_key=config.api_key)
            response = client.chat.completions.create(
                model=config.name,
                messages=[{"role": "user", "content": user_input}],
                max_tokens=2048,
            )
            usage = response.usage
            cost = tracker.record(model_key, usage.prompt_tokens, usage.completion_tokens)
            print(f"[Router] {config.name} | ${cost:.4f} | Budget left: ${tracker.budget_remaining():.2f}")
            return response.choices[0].message.content
        except Exception:
            continue

    raise RuntimeError("All models failed")
```

### Task D: Capability-based routing

```python
TASK_TO_MODEL = {
    "summarization": "local_llama",
    "classification": "local_llama",
    "extraction": "gpt4o_mini",
    "code_generation": "gpt4o",
    "code_review": "claude_sonnet",
    "creative_writing": "gpt4o",
    "complex_analysis": "claude_sonnet",
    "long_document": "claude_sonnet",  # 200K context
    "translation": "gpt4o_mini",
    "simple_qa": "gpt4o_mini",
}

def capability_route(task_type: str, user_input: str) -> str:
    model_key = TASK_TO_MODEL.get(task_type, "gpt4o_mini")

    # Check context length requirements
    approx_tokens = len(user_input) // 4
    config = MODELS[model_key]
    if approx_tokens > config.max_context * 0.8:
        model_key = "claude_sonnet"  # Fall back to large context model

    config = MODELS[model_key]
    client = OpenAI(base_url=config.base_url, api_key=config.api_key)
    response = client.chat.completions.create(
        model=config.name,
        messages=[{"role": "user", "content": user_input}],
    )
    return response.choices[0].message.content
```

## Examples

### Example 1: Process mixed-complexity support tickets

**User request:** "Route support tickets to different models based on difficulty"

```python
tickets = load_tickets()
for ticket in tickets:
    if ticket["type"] == "password_reset":
        response = route_request("classify simple", ticket["text"])  # -> local model
    elif ticket["type"] == "bug_report":
        response = route_request("analyze complex bug", ticket["text"])  # -> GPT-4o
    elif ticket["type"] == "feature_request":
        response = route_request("summarize", ticket["text"])  # -> local model
```

### Example 2: Build a cost-optimized research pipeline

**User request:** "Analyze 1000 documents but keep costs under $5"

```python
tracker = UsageTracker(daily_budget=5.0)
for doc in documents:
    summary = cost_aware_route("summarize", doc["text"])  # Cheap model
    if "requires further analysis" in summary:
        analysis = cost_aware_route("analyze complex", doc["text"])  # Premium model
```

### Example 3: Multi-provider fallback chain

**User request:** "Set up LLM calls that automatically fail over between providers"

The routing table in Task B already implements this: if the primary model fails (rate limit, downtime), the router tries the next model in the chain automatically.

## Guidelines

- Start with a simple routing table and add complexity only as needed.
- Always implement fallback chains: no single provider has 100% uptime.
- Log every routing decision (model chosen, cost, latency) for optimization.
- Use local models (Ollama) as the first choice for high-volume, low-complexity tasks.
- Set daily and per-request budget limits to prevent cost overruns.
- Test routing accuracy on a sample: check if the complexity classifier sends tasks to the right tier.
- Cache responses for identical or near-identical inputs to avoid redundant API calls.
- Review routing logs weekly to identify tasks that could be downgraded to cheaper models.
- Keep API keys in environment variables, never in routing configuration files.
