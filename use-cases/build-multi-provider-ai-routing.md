---
title: "Build a Multi-Provider AI Router for Cost and Latency Optimization"
slug: build-multi-provider-ai-routing
description: "Build an AI router that selects the best LLM provider per task type with automatic fallback chains and cost tracking."
skills: [groq, perplexity-api, azure-openai, aws-bedrock, mistral-api]
category: data-ai
tags: [llm-routing, multi-provider, cost-optimization, ai-infrastructure]
---

# Build a Multi-Provider AI Router

## The Problem

You are an AI product engineer building a production feature, and different tasks have very different requirements: code autocomplete needs low latency, a research question needs fresh web data, and an enterprise report must stay on infrastructure your compliance review approved. One provider for everything is either too slow, too expensive or out of bounds. You also want a fallback when a provider rate-limits or goes down, and you want to see what each provider costs.

## The Solution

A small Python router that classifies each request, tries providers in a configured order for that task type, falls back on error, and records cost and observed latency per provider.

```
request -> classify_task -> ROUTING_RULES[task] -> provider 1 -> (error) -> provider 2 ...
   coding     Groq (gpt-oss-120b) -> Codestral -> Mistral Small
   research   Perplexity Agent API (fast effort level: web search, cited answers)
   enterprise Azure OpenAI -> Amazon Bedrock (only vendors your compliance review approved)
   general    Mistral Small -> Groq (gpt-oss-20b)
```

Model ids and prices below were checked against each vendor's docs on 2026-10-24. Model lineups change quickly (Groq shut down `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 2026-08-16, and Perplexity retired the Sonar chat models in favour of its Agent API), so keep ids and prices in one file.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install groq mistralai openai perplexityai boto3
export GROQ_API_KEY=... MISTRAL_API_KEY=... PERPLEXITY_API_KEY=...
export AZURE_OPENAI_API_KEY=... AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
export AZURE_OPENAI_DEPLOYMENT=your-deployment-name
# Amazon Bedrock: no key variable. boto3 reads the standard AWS credential chain (AWS_PROFILE, SSO, instance or task role).
export AWS_DEFAULT_REGION=eu-central-1 BEDROCK_MODEL_ID=eu.anthropic.claude-sonnet-5-5
```

Bedrock needs model access in your AWS account and IAM permission `bedrock:InvokeModel` on the model and its inference profile. Anthropic models on Bedrock have no in-Region id, so `BEDROCK_MODEL_ID` is a geo inference profile (`eu.` keeps requests in EU Regions; `us.` and `global.` also exist). Amazon's own `amazon.nova-2-lite-v1:0` works too, with the same `eu.`/`us.` prefixes. Ids come from the model cards in the Bedrock user guide.

The Mistral SDK (v2 and later) imports as `from mistralai.client import Mistral`. Perplexity's SDK is the `perplexity` module from the `perplexityai` package; the `effort` parameter needs version 0.46.0 or later (earlier versions call it `preset`).

### Step 2: Routing configuration

```python
from dataclasses import dataclass
from enum import Enum

class TaskType(Enum):
    CODING = "coding"
    RESEARCH = "research"
    ENTERPRISE = "enterprise"
    GENERAL = "general"

@dataclass(frozen=True)
class ProviderConfig:
    name: str                                    # groq | mistral | perplexity | azure_openai | bedrock
    model: str                                   # model id, effort level, or env var holding the Azure deployment / Bedrock model id
    usd_per_m: tuple[float, float] | None = None  # (input, output) per 1M tokens; None = provider reports cost or unknown

# Prices copied from each vendor's pricing page; re-check them, they change.
PROVIDERS = {
    "groq_gpt_oss_120b": ProviderConfig("groq", "openai/gpt-oss-120b", (0.15, 0.60)),
    "groq_gpt_oss_20b": ProviderConfig("groq", "openai/gpt-oss-20b", (0.075, 0.30)),
    "codestral": ProviderConfig("mistral", "codestral-latest", (0.30, 0.90)),
    "mistral_small": ProviderConfig("mistral", "mistral-small-latest", (0.15, 0.60)),
    "perplexity_fast": ProviderConfig("perplexity", "fast"),  # Agent API effort level; the response includes its cost
    "azure_openai": ProviderConfig("azure_openai", "AZURE_OPENAI_DEPLOYMENT"),  # env var holding your deployment name
    "bedrock": ProviderConfig("bedrock", "BEDROCK_MODEL_ID"),  # env var holding the model or inference profile id
}

# Task type -> providers in order of preference. Enterprise lists only providers your compliance review
# approved; failing over to one it did not cover would defeat the point. Drop "bedrock" if Azure is the only one.
ROUTING_RULES = {
    TaskType.CODING: ["groq_gpt_oss_120b", "codestral", "mistral_small"],
    TaskType.RESEARCH: ["perplexity_fast"],
    TaskType.ENTERPRISE: ["azure_openai", "bedrock"],
    TaskType.GENERAL: ["mistral_small", "groq_gpt_oss_20b"],
}
```

Groq and Mistral bill per token, so cost is computed from `usd_per_m`. Perplexity's response carries its own cost, and the Azure price depends on your deployment and region, so add it to `usd_per_m` once you know it. The same goes for Bedrock, whose price depends on the model and inference profile.

### Step 3: Providers, router and classifier

Groq, Mistral and Azure return the same usage fields through their SDKs; Bedrock's `Converse` call has its own response shape. Azure uses the stock `OpenAI` client with the `/openai/v1/` base URL (no `api-version`), and `model` is your deployment name. Perplexity goes through its Agent API with the `fast` effort level, the migration guide's mapping for `sonar-pro`.

```python
import logging, os, re, time
import boto3
from dataclasses import dataclass
from groq import Groq
from mistralai.client import Mistral
from openai import OpenAI
from perplexity import Perplexity
from config import TaskType, PROVIDERS, ROUTING_RULES

log = logging.getLogger("router")

@dataclass
class RouteResult:
    content: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    cost_usd: float | None

def _usage(resp):  # Groq, Mistral and Azure (OpenAI SDK) share this shape
    return resp.choices[0].message.content, resp.usage.prompt_tokens, resp.usage.completion_tokens

def call_groq(model, messages):
    return _usage(Groq(api_key=os.environ["GROQ_API_KEY"]).chat.completions.create(model=model, messages=messages)) + (None,)

def call_mistral(model, messages):
    return _usage(Mistral(api_key=os.environ["MISTRAL_API_KEY"]).chat.complete(model=model, messages=messages)) + (None,)

def call_azure(model, messages):
    # Azure's v1 API: the stock OpenAI client, /openai/v1/ base URL, no api-version; `model` is your deployment name
    client = OpenAI(api_key=os.environ["AZURE_OPENAI_API_KEY"],
                    base_url=os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/") + "/openai/v1/")
    return _usage(client.chat.completions.create(model=os.environ[model], messages=messages)) + (None,)

def call_bedrock(model, messages):
    # Converse API: one request shape for every Bedrock model. Region and credentials come from the standard AWS chain.
    resp = boto3.client("bedrock-runtime").converse(
        modelId=os.environ[model],
        messages=[{"role": m["role"], "content": [{"text": m["content"]}]} for m in messages],
        inferenceConfig={"maxTokens": 1024},
    )
    blocks = resp["output"]["message"]["content"]  # reasoning models may also return reasoningContent blocks
    text = "".join(b["text"] for b in blocks if "text" in b)
    return text, resp["usage"]["inputTokens"], resp["usage"]["outputTokens"], None

def call_perplexity(effort, messages):
    # Sonar chat completions are retired; web-grounded answers now come from the Agent API
    resp = Perplexity(api_key=os.environ["PERPLEXITY_API_KEY"]).responses.create(effort=effort, input=messages[-1]["content"])
    cost = resp.usage.cost.total_cost if resp.usage and resp.usage.cost else None
    return resp.output_text, resp.usage.input_tokens, resp.usage.output_tokens, cost

CALLERS = {"groq": call_groq, "mistral": call_mistral, "perplexity": call_perplexity, "azure_openai": call_azure, "bedrock": call_bedrock}

class Stats:
    """Per-provider spend, call counts and an exponential moving average of observed latency."""
    def __init__(self):
        self.cost, self.calls, self.latency = {}, {}, {}
    def record(self, key, cost, ms):
        self.calls[key] = self.calls.get(key, 0) + 1
        self.cost[key] = self.cost.get(key, 0.0) + (cost or 0.0)
        self.latency[key] = ms if key not in self.latency else 0.8 * self.latency[key] + 0.2 * ms
    def summary(self):
        return {"calls": self.calls, "cost_usd": {k: round(v, 6) for k, v in self.cost.items()},
                "avg_latency_ms": {k: round(v) for k, v in self.latency.items()}}

stats = Stats()

def call_provider(key, messages) -> RouteResult:
    cfg = PROVIDERS[key]
    start = time.perf_counter()
    content, tin, tout, cost = CALLERS[cfg.name](cfg.model, messages)
    ms = (time.perf_counter() - start) * 1000
    if cost is None and cfg.usd_per_m:
        cost = (tin * cfg.usd_per_m[0] + tout * cfg.usd_per_m[1]) / 1e6
    stats.record(key, cost, ms)
    return RouteResult(content, key, cfg.model, tin, tout, round(ms, 1), None if cost is None else round(cost, 6))

def route(messages, task_type=TaskType.GENERAL, prefer_fast=False) -> RouteResult:
    keys = list(ROUTING_RULES[task_type])
    if prefer_fast:  # providers we have not measured yet keep their configured order, after measured ones
        keys.sort(key=lambda k: stats.latency.get(k, float("inf")))
    errors = []
    for key in keys:
        try:
            return call_provider(key, messages)
        except Exception as e:  # rate limit, timeout, 5xx, missing credentials
            log.warning("%s failed: %s", key, e)
            errors.append(f"{key}: {e}")
    raise RuntimeError("All providers failed: " + "; ".join(errors))

RULES = [
    (TaskType.CODING, r"\b(code|function|debug|implement|refactor|python|typescript|sql|regex)\b"),
    (TaskType.RESEARCH, r"\b(latest|current|recent|news|today|this week|search|look up)\b"),
    (TaskType.ENTERPRISE, r"\b(compliance|audit|policy|regulation|hipaa|soc ?2|gdpr)\b"),
]

def classify_task(text: str) -> TaskType:
    return next((t for t, pat in RULES if re.search(pat, text.lower())), TaskType.GENERAL)
```

`prefer_fast` sorts by the latency the router has actually measured, so there are no guessed latency numbers in the config.

### Step 4: Try it

```python
import json
from router import route, classify_task, stats
from config import TaskType

def ask(text: str) -> str:
    task = classify_task(text)
    r = route([{"role": "user", "content": text}], task, prefer_fast=task == TaskType.CODING)
    print(f"[{task.value}] {r.provider} ({r.model}) {r.latency_ms} ms, cost: {r.cost_usd}")
    return r.content

if __name__ == "__main__":
    for q in ["Write a Python function that parses JSON with error handling",
              "What changed in the news about EU AI regulation this week?",
              "Draft a SOC 2 evidence checklist for our SaaS",
              "Explain the CAP theorem"]:
        print(ask(q), "\n")
    print(json.dumps(stats.summary(), indent=2))
```

Output looks like this (provider names, latencies and costs depend on your account and the day):

```console
$ python main.py
[coding] groq_gpt_oss_120b (openai/gpt-oss-120b) 410.2 ms, cost: 0.00031
...
{
  "calls": {"groq_gpt_oss_120b": 1, "perplexity_fast": 1, "azure_openai": 1, "mistral_small": 1},
  "cost_usd": {"groq_gpt_oss_120b": 0.00031, "perplexity_fast": 0.0094, "azure_openai": 0.0, "mistral_small": 0.00012},
  "avg_latency_ms": {"groq_gpt_oss_120b": 410, "perplexity_fast": 5100, "azure_openai": 900, "mistral_small": 700}
}
```

`azure_openai` shows 0.0 until you give it a price. The numbers above are illustrative, not benchmarks.

### Step 5: Extend it

- Budget caps: check `stats.cost` before calling an expensive provider and skip it past a limit.
- Caching: hash the messages and return a stored answer for identical prompts.
- A better classifier: replace the regex rules with a call to a cheap model, but measure it, since keyword rules are fast and free.
- Observability: ship `RouteResult` fields to your metrics system.

## Real-World Example

A support-tooling team routes four kinds of traffic through this router. Developer questions go to Groq first for speed; "what changed this week" questions go to Perplexity so answers cite live sources; compliance drafts go only to the Azure deployment and the Bedrock EU inference profile their security team approved, and fail loudly if both are down rather than leaking to another vendor; everything else goes to Mistral Small. After a week they read `stats.summary()` and move the general traffic to the cheaper Groq model when its measured latency and quality are acceptable.

## Related Skills

- [groq](/skills/groq) - Fast inference for the coding path
- [perplexity-api](/skills/perplexity-api) - Web-grounded answers through the Agent API
- [azure-openai](/skills/azure-openai) - The enterprise path
- [aws-bedrock](/skills/aws-bedrock) - The enterprise path on AWS: Converse API, inference profiles, IAM
- [mistral-api](/skills/mistral-api) - General and code models
