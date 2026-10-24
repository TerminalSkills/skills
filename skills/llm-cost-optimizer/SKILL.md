---
name: llm-cost-optimizer
description: >-
  Cuts LLM API spend by measuring cost per feature and user, routing easy requests to cheaper models, using provider prompt caching, adding a semantic response cache, and using the batch APIs. Use when someone asks to "reduce AI costs", "track LLM spending", "my OpenAI or Anthropic bill is too high", "set up model routing", "cache LLM responses", "compare model costs", or "set budget alerts for AI".
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Examples use Anthropic and OpenAI model IDs and pricing checked 2026-10-24."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["cost", "optimization", "llm", "caching", "routing"]
---

# LLM Cost Optimizer

## Overview

LLM bills grow with traffic, prompt length and model tier. Work in this order: measure, cache the stable prefix, move easy work to a cheaper model, defer non-urgent work to batch, then add a response cache. Prices and model IDs change often; the figures below are from the vendors' pricing pages on 2026-10-24 and belong in a config file you update, not in code you forget.

Checked facts that matter for the code below:

- Anthropic (platform.claude.com pricing): `claude-sonnet-5-5` $2 input / $10 output per million tokens (MTok), cache reads $0.10, 5-minute cache writes $2.50; `claude-haiku-5-5` $0.10 / $0.50 for prompts up to 100,000 tokens (higher above that), cache reads $0.01, writes $0.125. Cache writes cost 1.25x (5 min) or 2x (1 h) base input; reads cost 0.1x on most models and 0.05x on Sonnet 5.5 and Opus 5.5. The Batch API is 50% off input and output.
- Anthropic usage fields: `input_tokens` counts only tokens after the last cache breakpoint. Total input is `cache_read_input_tokens + cache_creation_input_tokens + input_tokens`.
- Anthropic minimum cacheable prompt: 512 tokens for the 5.x models above, 1,024 for Sonnet 5, 4,096 for Haiku 4.5. Shorter prompts are processed uncached with no error; both cache fields read 0.
- OpenAI (developers.openai.com pricing): `gpt-6-luna` $0.10 / $0.50 per MTok (cached input $0.01), `gpt-6.1-sol` $2 / $10 (cached $0.10). `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` and `gpt-4.1-mini` snapshots are on the deprecation list with removal on 2027-01-14 (suggested replacement `gpt-6-luna`). OpenAI's Batch API is 50% cheaper with a 24-hour completion window. OpenAI caches automatically, but on GPT-5.6 and later (including both models above) a cache write costs 1.25x the input price for the default 30-minute lifetime (2.5x for `12h`), so cached input is billed as write, read or plain input. The prices above are the short-context rates; input over the long-context threshold costs about double.
- Retired Anthropic IDs that old code still uses: `claude-sonnet-4-20250514`, `claude-opus-4-20250514` (both retired 2026-06-15), `claude-3-5-haiku-20241022`, `claude-3-haiku-20240307`. `claude-sonnet-4-5-20250929` retires 2026-11-30.

## Instructions

### Strategy 1: Cost tracking

Wrap every call and record normalised usage. Providers report differently, so convert first:

- Anthropic: `input_tokens` -> `inputTokens`, `cache_read_input_tokens` -> `cacheReadTokens`, `cache_creation_input_tokens` -> `cacheWriteTokens`.
- OpenAI Responses API: `input_tokens` includes cached tokens, so `inputTokens = input_tokens - cached_tokens - cache_write_tokens` (fields under `input_tokens_details`).

```typescript
// cost-tracker.ts
interface Price { input: number; output: number; cacheRead: number; cacheWrite: number } // USD per 1M tokens

// Source: vendor pricing pages, 2026-10-24. Update when prices change.
export const PRICING: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5":  { input: 0.1, output: 0.5,  cacheRead: 0.01, cacheWrite: 0.125 }, // prompts <= 100k tokens
  "gpt-6.1-sol":       { input: 2.0, output: 10.0, cacheRead: 0.1, cacheWrite: 2.5 },  // short-context rates, 30m cache write
  "gpt-6-luna":        { input: 0.1, output: 0.5,  cacheRead: 0.01, cacheWrite: 0.125 },
};

export interface Usage {
  model: string; feature: string; userId?: string;
  inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number;
}

export class CostTracker {
  private entries: (Usage & { costUsd: number; at: Date })[] = [];
  private budgets = new Map<string, number>();            // feature -> monthly USD
  private alerted = new Set<string>();

  constructor(private onAlert: (msg: string) => void = console.warn) {}

  cost(u: Usage): number {
    const p = PRICING[u.model];
    if (!p) throw new Error(`No price for model ${u.model}`);  // fail loudly: a missing price hides spend
    return (u.inputTokens * p.input + u.cacheReadTokens * p.cacheRead +
            u.cacheWriteTokens * p.cacheWrite + u.outputTokens * p.output) / 1_000_000;
  }

  setBudget(feature: string, monthlyUsd: number) { this.budgets.set(feature, monthlyUsd); }

  track(u: Usage, now = new Date()): number {
    const costUsd = this.cost(u);
    this.entries.push({ ...u, costUsd, at: now });
    const budget = this.budgets.get(u.feature);
    if (budget) {
      const spent = this.monthlySpend(u.feature, now);
      for (const level of [0.8, 1.0]) {
        const key = `${u.feature}:${level}:${now.getUTCFullYear()}-${now.getUTCMonth()}`;
        if (spent >= budget * level && !this.alerted.has(key)) {
          this.alerted.add(key);
          this.onAlert(`${u.feature} reached ${level * 100}% of $${budget} (spent $${spent.toFixed(2)})`);
        }
      }
    }
    return costUsd;
  }

  monthlySpend(feature?: string, now = new Date()): number {
    return this.entries
      .filter((e) => e.at.getUTCFullYear() === now.getUTCFullYear() && e.at.getUTCMonth() === now.getUTCMonth())
      .filter((e) => !feature || e.feature === feature)
      .reduce((s, e) => s + e.costUsd, 0);
  }
}
```

Persist entries to a database in production (this class keeps them in memory) and have the backend aggregate by feature, model and user.

### Strategy 2: Cache the stable prefix

Put the long, unchanging part (tool definitions, system prompt, reference documents) first and the variable user turn last. With Anthropic, add a top-level `cache_control: {"type": "ephemeral"}` to the request (automatic caching) or put it on a specific content block; use the 1-hour TTL (`"ttl": "1h"`, 2x write price) when requests are more than five minutes apart. Check `cache_read_input_tokens` on the response: if both cache fields are 0 the prompt was below the minimum or the prefix changed (a timestamp or request ID inside the system prompt is the usual cause). OpenAI enables caching by default; keep the prefix identical and read `cached_tokens` and `cache_write_tokens` under `input_tokens_details` (GPT-5.6 and later bill the write, so a prefix that never repeats costs 1.25x instead of saving money).

### Strategy 3: Route by task, validated on your data

```typescript
// model-router.ts
export type Tier = "cheap" | "strong";
const MODELS = { cheap: "claude-haiku-5-5", strong: "claude-sonnet-5-5" } as const;

const CHEAP_TASKS = new Set(["classify", "extract", "summarize", "translate", "format", "route"]);

export function pickModel(task: string, promptChars: number, opts: { needsTools?: boolean } = {}) {
  const tier: Tier =
    CHEAP_TASKS.has(task) && promptChars < 40_000 && !opts.needsTools ? "cheap" : "strong";
  return { tier, model: MODELS[tier] };
}
```

Route on an explicit `task` label your code assigns, not on keywords in user text. Before sending a task class to the cheap tier, run 50-100 real examples through both models and compare quality; keep the strong model as the fallback when a cheap-tier answer fails validation (schema check, low-confidence flag).

### Strategy 4: Semantic cache for repeated questions

```python
# semantic_cache.py
import time
from typing import Callable, Optional
import numpy as np

class SemanticCache:
    """Reuse answers to near-identical questions. embed() is injected: any embedding API."""

    def __init__(self, embed: Callable[[str], list[float]], threshold: float = 0.95, ttl_seconds: int = 3600):
        self.embed, self.threshold, self.ttl = embed, threshold, ttl_seconds
        self.items: list[dict] = []   # use Redis or a vector database in production
        self.stats = {"hits": 0, "misses": 0, "saved_usd": 0.0}

    def get(self, query: str, scope: str) -> Optional[str]:
        """scope isolates tenants/users so one customer never receives another's answer."""
        q = np.asarray(self.embed(query), dtype=float)
        now, best, best_score = time.time(), None, 0.0
        for it in self.items:
            if it["scope"] != scope or now - it["at"] > self.ttl:
                continue
            score = float(q @ it["vec"] / (np.linalg.norm(q) * np.linalg.norm(it["vec"])))
            if score > best_score:
                best, best_score = it, score
        if best and best_score >= self.threshold:
            self.stats["hits"] += 1
            self.stats["saved_usd"] += best["cost_usd"]
            return best["response"]
        self.stats["misses"] += 1
        return None

    def set(self, query: str, scope: str, response: str, cost_usd: float) -> None:
        self.items.append({"scope": scope, "vec": np.asarray(self.embed(query), dtype=float),
                           "response": response, "cost_usd": cost_usd, "at": time.time()})
```

Only cache answers that do not depend on live data or the individual user. For embeddings, `text-embedding-3-small` costs $0.02 per MTok on OpenAI's price list.

### Strategy 5: Batch the non-urgent work

Nightly classification, evaluation runs, backfills and report generation do not need an instant answer. Anthropic's Message Batches API and OpenAI's Batch API (`completion_window: "24h"`) both charge 50% less. Batch and caching discounts stack on Anthropic.

## Examples

### Example 1: "Our support bot costs $3K/month on one big model. Most questions are the same 40 FAQs."

1. Add `CostTracker.track()` around the call with `feature: "support-bot"` and log a week of traffic.
2. Move the 6,000-token policy text into a cached system prefix; check `cache_read_input_tokens` is non-zero from the second request.
3. Add `SemanticCache` with `scope` set to the customer's tenant ID and threshold 0.95; review the first 100 hits by hand.
4. Send `classify`/`extract` steps to `claude-haiku-5-5` via `pickModel`.

Measure the result from your own tracker: the savings depend on how repetitive the traffic is, so report the measured before/after cost per conversation rather than a promised percentage.

### Example 2: "Cap each team at $500/month and warn me at 80%"

```typescript
const tracker = new CostTracker((msg) => fetch(process.env.SLACK_WEBHOOK_URL!, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg }),
}));
tracker.setBudget("team-growth", 500);
tracker.track({ model: "claude-sonnet-5-5", feature: "team-growth", inputTokens: 1200,
                cacheReadTokens: 8000, cacheWriteTokens: 0, outputTokens: 600 });
```

That call costs (1200 x 2.0 + 8000 x 0.1 + 600 x 10) / 1,000,000 = $0.0092. The alert fires once at 80% and once at 100% per month. To enforce the cap rather than only warn, check `monthlySpend` before the call and refuse or downgrade the model.

## Guidelines

- Measure first; a tracker with real per-feature numbers beats any rule of thumb.
- Look up prices on the vendor pricing page each quarter and update `PRICING`; throw on unknown models instead of returning $0.
- Do not hard-code retired model IDs; check the vendor's deprecations page when you pin a model.
- Newer Claude tokenizers produce about 30% more tokens for the same text than older ones (Anthropic pricing page), so re-measure cost per request after a model upgrade.
- Cache scope matters for privacy: never share a response cache across users or tenants unless the answers are public.
- Do not route safety-critical, legal or medical answers to the cheap tier without evaluation.
- Self-hosting open models only pays off at sustained high volume once GPU, ops and quality costs are counted.
