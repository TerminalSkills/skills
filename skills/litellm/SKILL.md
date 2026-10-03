---
name: litellm
description: >-
  LiteLLM is a Python SDK and self-hosted proxy that calls 100+ LLM providers (OpenAI, Anthropic,
  Google Gemini, Mistral, Bedrock, Ollama and more) through one OpenAI-compatible interface. Use
  when someone asks to "switch between LLM providers", "LiteLLM", "unified LLM API", "LLM proxy",
  "call Claude and GPT with the same code", "LLM load balancing", "fallbacks between models", or
  "multi-model AI gateway". Covers SDK calls, Router, fallbacks, virtual keys, budgets and spend tracking.
license: Apache-2.0
compatibility: "Python 3.9+. Proxy mode serves any OpenAI client (Node.js, Go, curl). Optional PostgreSQL for keys and spend tracking."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["llm", "proxy", "litellm", "gateway", "multi-model"]
  repository: https://github.com/BerriAI/litellm
---

# LiteLLM

## Overview

LiteLLM gives you one function, `completion()`, for 100+ providers, always returning an OpenAI-format response. Switch providers by changing the model string `provider/model`. As a proxy server (AI gateway) it adds an OpenAI-compatible HTTP endpoint, load balancing, fallbacks, virtual API keys, budgets, rate limits and spend tracking for teams.

**Security first.** On 24 March 2026 PyPI releases `1.82.7` and `1.82.8` were malicious (a credential stealer, live about 40 minutes, since yanked). Versions up to 1.82.6 and releases from 1.83.0 on are clean, and the official Docker image was not affected. Always pin an exact version (`litellm==1.103.2`, or whichever release you have reviewed), commit a lock file, and install in a virtual environment or container rather than a machine that holds cloud credentials.

## Instructions

### Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install 'litellm==1.103.2'          # SDK only
pip install 'litellm[proxy]==1.103.2'   # SDK + proxy server (adds the `litellm` server command)
```

Docker alternative for the proxy: `docker.litellm.ai/berriai/litellm` (also on `ghcr.io/berriai/litellm`). Prefer a `-stable` tag and pin it. Images on GHCR are signed with cosign; the README shows how to verify.

### SDK

Set provider keys in environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`); LiteLLM picks them up.

```python
from litellm import completion

msgs = [{"role": "user", "content": "Summarize RFC 9110 in two sentences."}]

r = completion(model="openai/gpt-4o-mini", messages=msgs)
r = completion(model="anthropic/claude-sonnet-4-5", messages=msgs)
r = completion(model="gemini/gemini-flash-latest", messages=msgs)
r = completion(model="ollama/llama3.1", messages=msgs, api_base="http://localhost:11434")

print(r.choices[0].message.content)   # same shape for every provider
```

Always include the `provider/` prefix. Model IDs change often; take the exact string from https://docs.litellm.ai/docs/providers. `stream=True`, tools/function calling and `response_format` work across providers where the upstream model supports them. For tests, pass `mock_response="ok"` to get a canned reply without any API call.

### Router (in-process load balancing and fallbacks)

```python
import os
from litellm import Router

router = Router(
    model_list=[
        {"model_name": "smart", "litellm_params": {
            "model": "anthropic/claude-sonnet-4-5", "api_key": os.environ["ANTHROPIC_API_KEY"]}},
        {"model_name": "fast", "litellm_params": {
            "model": "openai/gpt-4o-mini", "api_key": os.environ["OPENAI_API_KEY"]}},
    ],
    fallbacks=[{"smart": ["fast"]}],
    num_retries=2,
    routing_strategy="simple-shuffle",
)
r = router.completion(model="smart", messages=msgs)
```

Several entries with the same `model_name` form one pool that is load balanced. Valid `routing_strategy` values: `simple-shuffle` (default, recommended), `latency-based-routing`, `least-busy`, `cost-based-routing`, and the Redis-backed `usage-based-routing` and `usage-based-routing-v2`. There are also `context_window_fallbacks` (prompt too long) and `content_policy_fallbacks`.

### Proxy server

```yaml
# litellm_config.yaml
model_list:
  - model_name: smart
    litellm_params:
      model: anthropic/claude-sonnet-4-5
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: smart            # same name = load balanced pool
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY
  - model_name: fast
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY

router_settings:
  routing_strategy: simple-shuffle
  num_retries: 3
  request_timeout: 30
  fallbacks: [{"smart": ["fast"]}]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY   # must start with "sk-"
  database_url: os.environ/DATABASE_URL       # PostgreSQL, needed for virtual keys and spend
```

```bash
export LITELLM_MASTER_KEY=sk-$(openssl rand -hex 24)
litellm --config litellm_config.yaml --port 4000
curl http://localhost:4000/health   # health endpoint
```

```bash
docker run --rm -p 4000:4000 \
  -v "$PWD/litellm_config.yaml:/app/config.yaml" \
  -e OPENAI_API_KEY -e ANTHROPIC_API_KEY -e LITELLM_MASTER_KEY -e DATABASE_URL \
  docker.litellm.ai/berriai/litellm:main-stable --config /app/config.yaml
```

Verify the exact tag on the docs quickstart before using it. Any OpenAI client works against the proxy:

```typescript
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://localhost:4000/v1", apiKey: process.env.LITELLM_KEY });
const r = await client.chat.completions.create({
  model: "smart",
  messages: [{ role: "user", content: "Explain monads simply." }],
});
```

### Virtual keys, budgets and spend

With `database_url` set, create per-user or per-team keys with limits, instead of handing out the master key:

```bash
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"models": ["smart", "fast"], "max_budget": 25, "rpm_limit": 100, "tpm_limit": 50000, "user_id": "dana.okafor"}'
```

The response contains the new key (`sk-...`). Teams: `POST /team/new`; users: `POST /user/new`. Spend is computed per request and stored in the database; read it with `GET /key/info?key=...`, `/user/info?user_id=...`, `/team/info?team_id=...` and `GET /spend/logs`.

## Examples

### Example 1: Claude with GPT fallback

User: "My app calls Claude, but when Anthropic returns 529 overloaded I want it to fall back to GPT automatically."

Create a `Router` with `smart` (Claude) and `fast` (GPT) deployments, `fallbacks=[{"smart": ["fast"]}]` and `num_retries=2`. Call `router.completion(model="smart", ...)`. Result: normal requests hit Claude; when it errors after retries, the same call returns a GPT answer in the same response shape.

### Example 2: Team gateway with budgets

User: "Set up an LLM proxy for the data team: each person gets their own key, capped at $25."

Write the config above with `database_url` and `master_key`, start it with Docker next to a PostgreSQL container, then call `/key/generate` per person with `max_budget: 25`. Result: each engineer uses `http://llm.internal:4000/v1` with their own key; requests over budget are rejected, and `/key/info` shows spend so far.

## Guidelines

- Pin the version and verify what you install; see the March 2026 incident above. Never `pip install litellm` unpinned in CI or on a developer machine with cloud credentials.
- Read provider keys with `os.environ/NAME` in the proxy config; never write real keys into YAML.
- Do not expose the proxy to the internet without a master key, TLS and a reverse proxy; keep the master key for admins only.
- `usage-based-routing*` needs Redis; plain `simple-shuffle` does not.
- Put fallbacks and routing settings under `router_settings`.
- Feature support (tools, vision, JSON mode, caching) varies by provider; check the provider page.
- For a single provider with no need for routing or budgets, use that provider's own SDK instead.
