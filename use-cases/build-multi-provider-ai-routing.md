# Build a Multi-Provider AI Router

**Persona:** AI product engineer optimizing costs and reliability across multiple LLM providers.

You're building a production AI feature and realize that different tasks have wildly different requirements: a code autocomplete needs sub-200ms latency, a research query needs fresh web data, and an enterprise report needs SOC2-compliant infrastructure. Using one provider for everything is either too slow, too expensive, or non-compliant. The solution is an AI router that selects the best provider based on task type, latency, and cost.

---

## Architecture Overview

```
User Request
     │
     ▼
  AI Router
     │
     ├─ Task: coding        → Groq (llama-3.3-70b) or Codestral
     ├─ Task: research      → Perplexity (sonar-pro)
     ├─ Task: enterprise    → Azure OpenAI or AWS Bedrock
     ├─ Task: embedding     → Cohere Embed v3
     └─ Task: general       → Mistral Small (cost-efficient)
          │
          ▼
     Fallback Chain
     (provider errors → next provider)
          │
          ▼
     Cost Tracker
```

---

## Step 1: Install Dependencies

```bash
pip install groq openai mistralai cohere boto3 azure-identity
```

---

## Step 2: Define the Router Configuration

```python
# config.py
from dataclasses import dataclass
from enum import Enum

class TaskType(Enum):
    CODING = "coding"
    RESEARCH = "research"
    ENTERPRISE = "enterprise"
    EMBEDDING = "embedding"
    GENERAL = "general"

@dataclass
class ProviderConfig:
    name: str
    model: str
    cost_per_1k_input: float   # USD per 1k input tokens
    cost_per_1k_output: float  # USD per 1k output tokens
    avg_latency_ms: int
    supports_streaming: bool = True

# Provider cost and latency profiles (approximate, check current pricing)
PROVIDERS = {
    "groq_llama70b": ProviderConfig(
        name="groq",
        model="llama-3.3-70b-versatile",
        cost_per_1k_input=0.00059,
        cost_per_1k_output=0.00079,
        avg_latency_ms=200,
    ),
    "groq_llama8b": ProviderConfig(
        name="groq",
        model="llama-3.1-8b-instant",
        cost_per_1k_input=0.00005,
        cost_per_1k_output=0.00008,
        avg_latency_ms=100,
    ),
    "codestral": ProviderConfig(
        name="mistral",
        model="codestral-latest",
        cost_per_1k_input=0.00020,
        cost_per_1k_output=0.00060,
        avg_latency_ms=400,
    ),
    "perplexity_sonar_pro": ProviderConfig(
        name="perplexity",
        model="sonar-pro",
        cost_per_1k_input=0.00300,
        cost_per_1k_output=0.01500,
        avg_latency_ms=3000,
        supports_streaming=True,
    ),
    "mistral_small": ProviderConfig(
        name="mistral",
        model="mistral-small-latest",
        cost_per_1k_input=0.00020,
        cost_per_1k_output=0.00060,
        avg_latency_ms=600,
    ),
    "azure_gpt4o": ProviderConfig(
        name="azure_openai",
        model="gpt-4o",
        cost_per_1k_input=0.00250,
        cost_per_1k_output=0.01000,
        avg_latency_ms=800,
    ),
}

# Routing rules: task type → ordered list of provider keys (first = preferred)
ROUTING_RULES = {
    TaskType.CODING: ["groq_llama70b", "codestral", "mistral_small"],
    TaskType.RESEARCH: ["perplexity_sonar_pro", "azure_gpt4o"],
    TaskType.ENTERPRISE: ["azure_gpt4o", "groq_llama70b"],
    TaskType.GENERAL: ["mistral_small", "groq_llama8b", "azure_gpt4o"],
}
```

---

## Step 3: Implement Provider Clients

```python
# providers.py
import os
from groq import Groq
from mistralai import Mistral
from openai import OpenAI, AzureOpenAI

def get_groq_client():
    return Groq(api_key=os.environ["GROQ_API_KEY"])

def get_mistral_client():
    return Mistral(api_key=os.environ["MISTRAL_API_KEY"])

def get_perplexity_client():
    return OpenAI(
        api_key=os.environ["PERPLEXITY_API_KEY"],
        base_url="https://api.perplexity.ai",
    )

def get_azure_client():
    return AzureOpenAI(
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_version="2024-10-21",
    )
```

---

## Step 4: Build the Router

```python
# router.py
import time
import logging
from dataclasses import dataclass, field
from typing import Optional
from config import TaskType, PROVIDERS, ROUTING_RULES
from providers import get_groq_client, get_mistral_client, get_perplexity_client, get_azure_client

logger = logging.getLogger(__name__)

@dataclass
class RouteResult:
    content: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    cost_usd: float
    citations: list = field(default_factory=list)

class CostTracker:
    def __init__(self):
        self.total_cost = 0.0
        self.calls_by_provider: dict[str, int] = {}
        self.cost_by_provider: dict[str, float] = {}

    def record(self, provider: str, cost: float):
        self.total_cost += cost
        self.calls_by_provider[provider] = self.calls_by_provider.get(provider, 0) + 1
        self.cost_by_provider[provider] = self.cost_by_provider.get(provider, 0.0) + cost

    def summary(self) -> dict:
        return {
            "total_cost_usd": round(self.total_cost, 6),
            "calls_by_provider": self.calls_by_provider,
            "cost_by_provider": {k: round(v, 6) for k, v in self.cost_by_provider.items()},
        }

cost_tracker = CostTracker()

def calculate_cost(provider_key: str, input_tokens: int, output_tokens: int) -> float:
    config = PROVIDERS[provider_key]
    return (input_tokens / 1000 * config.cost_per_1k_input +
            output_tokens / 1000 * config.cost_per_1k_output)

def call_provider(provider_key: str, messages: list[dict], **kwargs) -> RouteResult:
    config = PROVIDERS[provider_key]
    start = time.time()

    if config.name == "groq":
        client = get_groq_client()
        resp = client.chat.completions.create(model=config.model, messages=messages, **kwargs)
        content = resp.choices[0].message.content
        in_tok, out_tok = resp.usage.prompt_tokens, resp.usage.completion_tokens

    elif config.name == "mistral":
        client = get_mistral_client()
        resp = client.chat.complete(model=config.model, messages=messages)
        content = resp.choices[0].message.content
        in_tok = resp.usage.prompt_tokens
        out_tok = resp.usage.completion_tokens

    elif config.name == "perplexity":
        client = get_perplexity_client()
        resp = client.chat.completions.create(model=config.model, messages=messages)
        content = resp.choices[0].message.content
        in_tok, out_tok = resp.usage.prompt_tokens, resp.usage.completion_tokens
        citations = getattr(resp, "citations", [])

    elif config.name == "azure_openai":
        client = get_azure_client()
        resp = client.chat.completions.create(model=config.model, messages=messages, **kwargs)
        content = resp.choices[0].message.content
        in_tok, out_tok = resp.usage.prompt_tokens, resp.usage.completion_tokens

    latency = (time.time() - start) * 1000
    cost = calculate_cost(provider_key, in_tok, out_tok)
    cost_tracker.record(config.name, cost)

    return RouteResult(
        content=content,
        provider=config.name,
        model=config.model,
        input_tokens=in_tok,
        output_tokens=out_tok,
        latency_ms=round(latency, 1),
        cost_usd=round(cost, 6),
    )

def route(
    messages: list[dict],
    task_type: TaskType = TaskType.GENERAL,
    prefer_fast: bool = False,
) -> RouteResult:
    """Route a request to the best provider for the task type."""
    providers = ROUTING_RULES.get(task_type, ROUTING_RULES[TaskType.GENERAL])

    # If speed is critical, sort by latency
    if prefer_fast:
        providers = sorted(providers, key=lambda p: PROVIDERS[p].avg_latency_ms)

    for provider_key in providers:
        try:
            logger.info(f"Trying provider: {provider_key}")
            result = call_provider(provider_key, messages)
            logger.info(f"Success: {provider_key} | {result.latency_ms}ms | ${result.cost_usd}")
            return result
        except Exception as e:
            logger.warning(f"Provider {provider_key} failed: {e}. Trying next...")
            continue

    raise RuntimeError("All providers failed")
```

---

## Step 5: Classify Task Type

```python
# classifier.py
from config import TaskType

CODING_KEYWORDS = ["code", "function", "debug", "implement", "refactor", "python", "typescript", "sql"]
RESEARCH_KEYWORDS = ["latest", "current", "recent", "news", "today", "2025", "now", "search", "find out"]
ENTERPRISE_KEYWORDS = ["compliance", "audit", "report", "policy", "regulation", "hipaa", "soc2"]

def classify_task(user_message: str) -> TaskType:
    msg_lower = user_message.lower()
    if any(kw in msg_lower for kw in CODING_KEYWORDS):
        return TaskType.CODING
    if any(kw in msg_lower for kw in RESEARCH_KEYWORDS):
        return TaskType.RESEARCH
    if any(kw in msg_lower for kw in ENTERPRISE_KEYWORDS):
        return TaskType.ENTERPRISE
    return TaskType.GENERAL
```

---

## Step 6: Wire It Together

```python
# main.py
from router import route, cost_tracker
from classifier import classify_task
from config import TaskType

def ai_assistant(user_message: str, stream: bool = False) -> str:
    task = classify_task(user_message)
    print(f"[Router] Task type: {task.value}")

    result = route(
        messages=[{"role": "user", "content": user_message}],
        task_type=task,
        prefer_fast=(task == TaskType.CODING),
    )

    print(f"[Router] Provider: {result.provider}/{result.model} | "
          f"{result.latency_ms}ms | ${result.cost_usd}")
    return result.content

# Example usage
print(ai_assistant("Write a Python function to parse JSON with error handling"))
print(ai_assistant("What are the latest AI model releases this week?"))
print(ai_assistant("Generate a SOC2 compliance checklist for our SaaS"))
print(ai_assistant("Explain the CAP theorem"))

# Print cost summary
print("\n=== Cost Summary ===")
import json
print(json.dumps(cost_tracker.summary(), indent=2))
```

---

## Expected Output

```
[Router] Task type: coding
[Router] Provider: groq/llama-3.3-70b-versatile | 312ms | $0.000023

[Router] Task type: research
[Router] Provider: perplexity/sonar-pro | 2847ms | $0.000891

[Router] Task type: enterprise
[Router] Provider: azure_openai/gpt-4o | 756ms | $0.000450

=== Cost Summary ===
{
  "total_cost_usd": 0.001364,
  "calls_by_provider": {"groq": 1, "perplexity": 1, "azure_openai": 1},
  "cost_by_provider": {"groq": 0.000023, "perplexity": 0.000891, "azure_openai": 0.00045}
}
```

---

## Extensions

- **Latency-based routing**: Ping all providers asynchronously and use the fastest responder.
- **Budget caps**: Stop routing to expensive providers when monthly budget threshold is hit.
- **A/B testing**: Route a percentage of traffic to experimental models for quality comparison.
- **Caching**: Hash prompts and cache responses for identical queries.
- **Observability**: Send `RouteResult` metrics to DataDog or Grafana for dashboards.
