---
name: helicone
description: |
  LLM observability proxy that sits between your app and LLM providers. Logs every request,
  enables caching, rate limiting, and provides cost analytics. Works with OpenAI, Anthropic,
  and other providers with a one-line integration change.
license: Apache-2.0
compatibility:
  - python 3.8+
  - typescript/node 18+
  - any HTTP client
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - llm-proxy
    - observability
    - caching
    - rate-limiting
    - cost-analytics
---

# Helicone

## Proxy Integration (OpenAI Python)

```python
# helicone_proxy.py — Route OpenAI calls through Helicone proxy for logging
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-openai-key",
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": "Bearer sk-helicone-xxxx",
    },
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

## Proxy Integration (Anthropic)

```python
# helicone_anthropic.py — Route Anthropic calls through Helicone proxy
from anthropic import Anthropic

client = Anthropic(
    api_key="sk-ant-xxxx",
    base_url="https://anthropic.helicone.ai",
    default_headers={
        "Helicone-Auth": "Bearer sk-helicone-xxxx",
    },
)

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explain caching."}],
)
```

## Custom Properties and User Tracking

```python
# custom_properties.py — Add metadata to requests for filtering in the dashboard
from openai import OpenAI

client = OpenAI(
    base_url="https://oai.helicone.ai/v1",
    default_headers={"Helicone-Auth": "Bearer sk-helicone-xxxx"},
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Help me with billing"}],
    extra_headers={
        "Helicone-User-Id": "user-123",
        "Helicone-Session-Id": "session-abc",
        "Helicone-Property-Feature": "support-chat",
        "Helicone-Property-Environment": "production",
        "Helicone-Property-Ticket-Id": "T-5678",
    },
)
```

## Caching

```python
# caching.py — Enable response caching to reduce costs on repeated queries
from openai import OpenAI

client = OpenAI(
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": "Bearer sk-helicone-xxxx",
        "Helicone-Cache-Enabled": "true",
    },
)

# First call hits the API
response1 = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "What is 2+2?"}],
)

# Second identical call returns cached response (no API cost)
response2 = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "What is 2+2?"}],
)

# Custom cache bucket for grouping
response3 = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Summarize our FAQ"}],
    extra_headers={"Helicone-Cache-Bucket-Max-Size": "3"},
)
```

## Rate Limiting

```python
# rate_limiting.py — Apply rate limits per user or globally via headers
from openai import OpenAI

client = OpenAI(
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": "Bearer sk-helicone-xxxx",
        "Helicone-RateLimit-Policy": "10;w=60;s=user",  # 10 req per 60s per user
    },
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
    extra_headers={
        "Helicone-User-Id": "user-123",
    },
)
```

## Retries and Fallbacks

```python
# retries.py — Configure automatic retries on failures
from openai import OpenAI

client = OpenAI(
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": "Bearer sk-helicone-xxxx",
        "Helicone-Retry-Enabled": "true",
        "Helicone-Retry-Num": "3",
        "Helicone-Retry-Factor": "2",  # Exponential backoff factor
    },
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Analyze this data"}],
)
```

## Async Logging (Node.js)

```typescript
// helicone_async.ts — Use async logging to avoid proxy latency in the request path
import OpenAI from "openai";
import { HeliconeAsyncLogger } from "@helicone/helicone";

const logger = new HeliconeAsyncLogger({
  apiKey: "sk-helicone-xxxx",
});
logger.init();

const openai = new OpenAI();

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

// Log asynchronously — no added latency to user requests
await logger.log(response, {
  userId: "user-123",
  properties: { feature: "chat" },
});
```

## Feedback and Scoring

```bash
# Score a request via the Helicone API for quality tracking
curl -X POST https://api.helicone.ai/v1/request/{request-id}/feedback \
  -H "Authorization: Bearer sk-helicone-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"rating": true}'
```

```python
# scoring_api.py — Score requests programmatically
import requests

def score_request(request_id: str, rating: bool):
    requests.post(
        f"https://api.helicone.ai/v1/request/{request_id}/feedback",
        headers={"Authorization": "Bearer sk-helicone-xxxx"},
        json={"rating": rating},
    )
```

## Key Concepts

- **Proxy mode**: Change `base_url` to route through Helicone — zero code changes otherwise
- **Async logging**: Log after the fact for zero-latency overhead in production
- **Headers-based config**: All features controlled via HTTP headers — no SDK lock-in
- **Cost tracking**: Automatic token counting and cost calculation per request, user, and model
- **Custom properties**: Tag requests with arbitrary key-value pairs for filtering and analytics
- **Cache**: Reduce costs by caching identical requests; configurable TTL and bucket sizes
