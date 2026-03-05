---
name: portkey
category: AI & Machine Learning
tags: [ai-gateway, llm-routing, observability, caching, fallback, load-balancing]
version: 1.0.0
author: terminal-skills
---

# Portkey — AI Gateway & LLM Router

You are an expert in Portkey, the AI gateway that provides a unified interface for routing, caching, monitoring, and managing LLM API calls across multiple providers. You help developers build reliable, cost-efficient AI applications with automatic failover, semantic caching, and detailed analytics.

## Core Capabilities

### Unified API Gateway

Route LLM calls through a single interface with automatic provider management:

```typescript
// src/llm/client.ts — Configure Portkey as the AI gateway
import Portkey from "portkey-ai";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  // Virtual key — maps to your OpenAI/Anthropic/etc. API keys
  // Managed in Portkey dashboard, not in code
  virtualKey: process.env.PORTKEY_VIRTUAL_KEY,
});

// Use exactly like the OpenAI SDK — zero code changes
const response = await portkey.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain quantum computing in simple terms" },
  ],
  temperature: 0.7,
  max_tokens: 500,
});

console.log(response.choices[0].message.content);
// Portkey automatically logs: latency, tokens, cost, model, status
```

### Fallback and Load Balancing

Configure automatic failover across providers:

```typescript
// src/llm/resilient.ts — Multi-provider setup with fallback chain
import Portkey from "portkey-ai";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  config: {
    strategy: {
      mode: "fallback",        // Try providers in order; switch on failure
    },
    targets: [
      {
        // Primary: GPT-4o (fastest, preferred)
        virtual_key: process.env.OPENAI_VIRTUAL_KEY,
        override_params: { model: "gpt-4o" },
        weight: 1,
      },
      {
        // Fallback 1: Claude 3.5 Sonnet (if OpenAI is down)
        virtual_key: process.env.ANTHROPIC_VIRTUAL_KEY,
        override_params: { model: "claude-3-5-sonnet-20241022" },
        weight: 1,
      },
      {
        // Fallback 2: Gemini Pro (last resort)
        virtual_key: process.env.GOOGLE_VIRTUAL_KEY,
        override_params: { model: "gemini-1.5-pro" },
        weight: 1,
      },
    ],
    // Retry configuration
    retry: {
      attempts: 2,             // Retry twice before moving to next target
      on_status_codes: [429, 500, 502, 503],  // Retry on rate limits and server errors
    },
  },
});

// Load balancing across multiple API keys for the same provider
const loadBalanced = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  config: {
    strategy: {
      mode: "loadbalance",     // Distribute requests by weight
    },
    targets: [
      { virtual_key: "openai-key-1", weight: 3 },  // 60% of traffic
      { virtual_key: "openai-key-2", weight: 2 },  // 40% of traffic
    ],
  },
});
```

### Semantic Caching

Cache LLM responses to reduce cost and latency:

```typescript
// src/llm/cached.ts — Enable semantic caching for repeated queries
import Portkey from "portkey-ai";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.OPENAI_VIRTUAL_KEY,
  config: {
    cache: {
      mode: "semantic",        // Match semantically similar queries
      max_age: 3600,           // Cache TTL: 1 hour (seconds)
    },
  },
});

// First call: hits OpenAI, response is cached
const res1 = await portkey.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "What is Docker?" }],
});
// Latency: ~800ms, Cost: $0.002

// Second call with similar query: served from cache
const res2 = await portkey.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Explain Docker to me" }],
});
// Latency: ~50ms, Cost: $0.000 (cache hit)

// Simple (exact match) caching for deterministic queries
const exactCache = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.OPENAI_VIRTUAL_KEY,
  config: {
    cache: {
      mode: "simple",         // Exact prompt match only
      max_age: 86400,         // 24-hour TTL
    },
  },
});
```

### Guardrails and Content Moderation

Add input/output checks to LLM calls:

```typescript
// src/llm/safe.ts — Apply guardrails to all LLM interactions
import Portkey from "portkey-ai";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.OPENAI_VIRTUAL_KEY,
  config: {
    // Input guardrails — check before sending to LLM
    before_request_hooks: [
      {
        id: "pii-check",
        type: "guardrail",
        // Block requests containing PII (emails, phone numbers, SSNs)
        checks: [{ type: "pii_detection", action: "deny" }],
      },
    ],
    // Output guardrails — check LLM response before returning
    after_request_hooks: [
      {
        id: "toxicity-check",
        type: "guardrail",
        checks: [
          { type: "toxicity", threshold: 0.7, action: "deny" },
          { type: "regex", pattern: "(?i)(password|secret|api.key)", action: "flag" },
        ],
      },
    ],
  },
});

// If guardrails trigger, Portkey returns an error with details
try {
  const response = await portkey.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "My SSN is 123-45-6789, help me file taxes" }],
  });
} catch (error) {
  // GuardrailError: PII detected in input — request blocked
  console.error("Guardrail triggered:", error.message);
}
```

### Request Tracing and Analytics

Add metadata for debugging and cost tracking:

```typescript
// src/llm/traced.ts — Tag requests for filtering in dashboard
import Portkey from "portkey-ai";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.OPENAI_VIRTUAL_KEY,
});

// Tag every request with metadata for analytics
const response = await portkey.chat.completions.create(
  {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Summarize this report..." }],
  },
  {
    // Metadata appears in Portkey dashboard for filtering/grouping
    metadata: {
      user_id: "user-123",
      feature: "report-summary",
      environment: "production",
      _user: "user-123",           // Built-in: tracks per-user usage
      _prompt: "report-summary-v3", // Built-in: tracks prompt version performance
    },
    // Trace ID for correlating across multiple LLM calls in a chain
    traceId: "trace-abc-123",
    spanId: "span-summarize",
  }
);

// Query analytics via API
const analytics = await portkey.analytics.query({
  group_by: ["metadata.feature"],
  metrics: ["total_cost", "avg_latency", "request_count"],
  filters: {
    time_range: "last_7_days",
    "metadata.environment": "production",
  },
});
// Returns: { "report-summary": { cost: "$12.40", avg_latency: "1.2s", requests: 847 } }
```

### Python Integration

```python
# src/llm/client.py — Portkey with Python (OpenAI-compatible)
from portkey_ai import Portkey

portkey = Portkey(
    api_key="your-portkey-key",
    virtual_key="your-openai-vk",
)

# Drop-in replacement for openai.ChatCompletion
response = portkey.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)

# With fallback config
from portkey_ai import Portkey, createHeaders

portkey = Portkey(
    api_key="your-portkey-key",
    config={
        "strategy": {"mode": "fallback"},
        "targets": [
            {"virtual_key": "openai-vk", "override_params": {"model": "gpt-4o"}},
            {"virtual_key": "anthropic-vk", "override_params": {"model": "claude-3-5-sonnet-20241022"}},
        ],
    },
)
```

## Installation

```bash
# TypeScript/JavaScript
npm install portkey-ai

# Python
pip install portkey-ai

# Use with existing OpenAI SDK (just change base URL)
# No SDK needed — set OPENAI_BASE_URL=https://api.portkey.ai/v1
```

## Best Practices

1. **Always configure fallbacks** — Single-provider setups have single points of failure; add at least one fallback
2. **Use virtual keys** — Never put provider API keys in code; manage them in Portkey dashboard
3. **Enable caching for repeated patterns** — Customer support, FAQ bots, and search queries benefit most from semantic cache
4. **Tag everything** — Add user_id, feature, and environment metadata to every request for cost attribution
5. **Set budget alerts** — Configure per-feature and per-user spending limits in the dashboard
6. **Guardrails in production** — Always add PII detection and toxicity checks for user-facing applications
7. **Load balance API keys** — Distribute traffic across multiple keys to avoid rate limits
8. **Monitor latency percentiles** — P50 is misleading; track P95 and P99 to catch tail latency issues
