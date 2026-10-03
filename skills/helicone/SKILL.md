---
name: helicone
description: >-
  Helicone is an LLM observability platform and proxy that sits between your app and providers such as OpenAI and Anthropic, logging every request with cost, latency and user metadata, and adding caching, rate limits and retries through HTTP headers. Use when asked to "add Helicone", "log LLM requests", "track LLM cost per user", "cache OpenAI responses" or "monitor my LLM calls". Note: Helicone joined Mintlify in March 2026 and is in maintenance mode.
license: Apache-2.0
compatibility: "Python 3.8+, Node.js 18+, or any HTTP client; a Helicone account and API key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/Helicone/helicone
  tags:
    - llm-proxy
    - observability
    - caching
    - rate-limiting
    - cost-analytics
---

# Helicone

## Overview

Helicone logs LLM traffic. You point an SDK at a Helicone URL (proxy mode) or send logs to it afterwards (async mode), and the dashboard shows every request with tokens, cost, latency, user, session and custom properties. Features such as caching, rate limits and retries are switched on with `Helicone-*` request headers, so there is no SDK to adopt.

Status as of October 2026: Helicone was acquired by Mintlify on 3 March 2026 and runs in maintenance mode (security fixes, new models, bug fixes, no new features). The hosted service and the open-source repository still work, and the legacy provider proxies are documented as "maintained but no longer actively developed". For a new long-lived project, weigh that before depending on it, and keep your integration to headers and a base URL so it is easy to remove.

## Instructions

1. Create a Helicone API key in the dashboard and export it next to your provider key:
   ```bash
   export HELICONE_API_KEY="sk-helicone-..."
   export OPENAI_API_KEY="sk-proj-..."
   ```
2. Pick an integration mode.
   - **Provider proxy** (legacy but still working): OpenAI `https://oai.helicone.ai/v1`, Anthropic `https://anthropic.helicone.ai`. Your provider key stays in the SDK; add the `Helicone-Auth: Bearer <HELICONE_API_KEY>` header.
   - **AI Gateway**: `https://ai-gateway.helicone.ai` is OpenAI-compatible and routes to many providers by model name; the Helicone key is the API key. Use it for multi-provider apps.
   - **Async logging**: your calls go straight to the provider and are reported afterwards. No added latency, but cache, rate limits and retries are not available.
3. Add metadata headers to requests you want to filter later: `Helicone-User-Id`, `Helicone-Session-Id`, `Helicone-Session-Path`, `Helicone-Session-Name`, and `Helicone-Property-<Name>` for custom properties. Header values must be strings.
4. Turn on features by header (see the examples). The headers only work in proxy or gateway mode.
5. Open the dashboard and filter by user, session, property or model to find expensive or failing requests.

## Examples

### Example 1: Log OpenAI calls with user and feature tags

Request: "Send our OpenAI calls through Helicone and tag them per user and feature so I can see cost by feature."

```python
# helicone_openai.py
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    base_url="https://oai.helicone.ai/v1",
    default_headers={"Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}"},
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Why was I charged twice this month?"}],
    extra_headers={
        "Helicone-User-Id": "user-48213",
        "Helicone-Session-Id": "9b2f6d1e-3c7a-4e55-8f0b-2a6d9c41e7aa",
        "Helicone-Session-Name": "Billing support",
        "Helicone-Property-Feature": "support-chat",
        "Helicone-Property-Environment": "production",
    },
)
print(response.choices[0].message.content)
```

Result: the request appears in the Requests view within seconds, filterable by `Feature = support-chat`, with cost computed from token counts.

### Example 2: Cache, retry and rate-limit in one client

Request: "Cache repeated prompts, retry failures three times and limit each user to 100 calls an hour."

```python
# helicone_features.py
import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ["ANTHROPIC_API_KEY"],
    base_url="https://anthropic.helicone.ai",  # the SDK appends /v1/messages
    default_headers={
        "Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}",
        "Helicone-Cache-Enabled": "true",
        "Cache-Control": "max-age=3600",          # cache for one hour (default is 7 days)
        "Helicone-Retry-Enabled": "true",
        "Helicone-Retry-Num": "3",                # default is 5
        "Helicone-Retry-Factor": "2",             # exponential backoff multiplier
        "Helicone-RateLimit-Policy": "100;w=3600;s=user",
    },
)

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=512,
    messages=[{"role": "user", "content": "Summarize our refund policy in two sentences."}],
    extra_headers={"Helicone-User-Id": "user-48213"},
)
print(message.content[0].text)
```

Result: an identical second call returns instantly with response header `Helicone-Cache: HIT`; a user's 101st call within the hour gets HTTP 429.

### Example 3: Async logging from Node.js and feedback scores

Request: "I don't want a proxy in the request path. Log asynchronously, and let users thumbs-up answers."

```typescript
// helicone-async.ts
import OpenAI from "openai";
import { HeliconeAsyncLogger } from "@helicone/async";

const logger = new HeliconeAsyncLogger({
  apiKey: process.env.HELICONE_API_KEY!,
  providers: { openAI: OpenAI },
});
logger.init(); // call before creating the OpenAI client

const openai = new OpenAI();
const reply = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Draft a short shipping delay notice." }],
});
```

To score an answer, set your own UUID in the `Helicone-Request-Id` header when making the call (proxy mode), then:

```bash
curl -X POST "https://api.helicone.ai/v1/request/7f1c2d9a-5b3e-4c8a-9e21-0d4a6b8c1f33/feedback" \
  -H "Authorization: Bearer $HELICONE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rating": true}'
```

## Guidelines

- Never hard-code keys; read `HELICONE_API_KEY` and provider keys from the environment. The proxy sees every prompt and response, so do not send regulated data to the hosted service without reviewing your obligations; self-hosting from the repository is the alternative.
- Proxy mode adds a network hop and makes Helicone a dependency of every call. For latency-critical paths use async logging, accepting that cache, rate limits and retries do not apply.
- The cache is keyed on the full request. Use `Helicone-Cache-Seed` to separate caches per user or tenant, `Helicone-Cache-Bucket-Max-Size` (default 1, up to 20) to store several different answers for the same prompt, and `Helicone-Cache-Ignore-Keys` to exclude volatile fields.
- Rate-limit policy format is `quota;w=<seconds>;u=<request|cents>;s=<user|property>`; the window is at least 60 seconds. Omit `s` for a global limit.
- Do not rely on the `helicone-id` response header for feedback; it is not always present. Set `Helicone-Request-Id` yourself.
- Check that tags show up after the first call; a typo in a `Helicone-Property-` header silently creates a new property.
- Maintenance mode means new providers or features may arrive slowly; consider the AI Gateway or another observability tool if you need fast-moving support.
