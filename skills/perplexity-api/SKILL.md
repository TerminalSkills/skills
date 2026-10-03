---
name: perplexity-api
description: >-
  Perplexity API gives LLM answers grounded in live web search, with cited sources. Use when you
  need up-to-date information in AI responses, research assistants, fact-checking,
  current events coverage, or any task requiring knowledge beyond an LLM's training cutoff.
  Returns cited sources alongside answers.
license: Apache-2.0
compatibility: "Python 3.9+ with the perplexityai SDK, or Node.js with @perplexity-ai/perplexity_ai"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: data-ai
  tags: ["perplexity", "web-search", "llm", "real-time", "citations"]
  use-cases:
    - "Build a research assistant that cites current web sources"
    - "Fact-check content against up-to-date web information"
    - "Answer questions about recent news, events, or product updates"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Perplexity API

## Overview

Perplexity's API returns LLM answers grounded in live web search, with citations. Sonar Chat Completions (`/chat/completions`, models `sonar`, `sonar-pro`, `sonar-reasoning-pro`) reached end of support on 27 September 2026: sync and streaming calls are still being served by reformulating them as Agent API requests, but async requests no longer work. New code should use the **Agent API** (`client.responses.create`). `sonar-reasoning` and `r1-1776` are deprecated.

## Setup

```bash
pip install perplexityai          # Python
npm install @perplexity-ai/perplexity_ai   # TypeScript
export PERPLEXITY_API_KEY="pplx-..."       # read automatically by the SDK
```

## Instructions

### Basic query with web search

Pick a `preset` (tuned model + search depth) or a specific `model`.

```python
from perplexity import Perplexity

client = Perplexity()  # uses PERPLEXITY_API_KEY
response = client.responses.create(
    preset="fast",
    input="What changed in the latest Python release?",
)
print(response.output_text)
```

| Preset | Replaces | Tools | Use for |
|---|---|---|---|
| `fast` | `sonar`, `sonar-pro` | web_search | quick factual lookups, minimal latency |
| `low` | `sonar-reasoning-pro` | web_search, fetch_url | everyday questions needing current info |
| `medium` | (new) | web_search, fetch_url | multi-step research across many sources |
| `high` | `sonar-deep-research` | web_search, fetch_url | exhaustive, institutional-grade research |
| `xhigh` | (new) | web_search, finance_search, sandbox | open-ended agentic work with code execution |

Presets are dynamic: Perplexity tunes the model behind each name over time. Copy a preset's values inline if you need frozen behavior, and override any single parameter (model, tools, `max_steps`) while keeping the rest.

### Choose a model, enable web search, add instructions

```python
response = client.responses.create(
    model="openai/gpt-5.6-sol",
    input="Summarize this week's AI regulation news in the EU.",
    tools=[{"type": "web_search"}],
    instructions="Use web_search for current events. Keep queries brief. Cite sources.",
    max_output_tokens=2048,
)
print(response.output_text)
```

The Agent API also exposes models from Anthropic, Google and xAI under `provider/model` ids; check the models page for the current list.

### Citations and search results

```python
print(response.output_text)

for r in response.search_results:       # title, url, date, snippet
    print(r.title, r.url)

# Inline citation annotations live on the message content
for item in response.output:
    if item.type == "message":
        for part in item.content:
            for note in getattr(part, "annotations", []) or []:
                print(note)
```

### Streaming and background mode

```python
for event in client.responses.create(preset="fast", input="Top tech news today", stream=True):
    if event.type == "response.output_text.delta":
        print(event.delta, end="")

job = client.responses.create(preset="high", input="Full market analysis of EU battery makers", background=True)
```

Use `background=True` for long jobs and poll by response id; this replaces async Sonar requests.

### Migrating old Sonar code

```python
# before
client.chat.completions.create(model="sonar", messages=[{"role": "user", "content": q}])
# after
client.responses.create(preset="fast", input=q)
```

`messages`/`choices` become `input`/`output`; `max_tokens` becomes `max_output_tokens`, `search_domain_filter` and `search_recency_filter` move into the `web_search` tool's `filters`, and `reasoning_effort` becomes `reasoning.effort`. `search_language_filter`, `stream_mode`, video results and regex `response_format` have no equivalent. Read text from `response.output_text` instead of `choices[0].message.content`. For multi-turn chats pass earlier turns in `input` as the docs describe for conversation context.

### TypeScript

```typescript
import Perplexity from '@perplexity-ai/perplexity_ai';

const client = new Perplexity();
const response = await client.responses.create({ preset: 'low', input: 'Compare Postgres 17 and 18 release notes' });
console.log(response.output_text);
```

## Examples

### Example 1: Research assistant with sources

Request: "Answer 'which EU countries passed AI laws this year' and list the sources."

```python
response = client.responses.create(preset="low", input="Which EU countries passed national AI laws this year?")
print(response.output_text)
for r in response.search_results:
    print("-", r.title, r.url)
```

Result: a cited paragraph, then one line per source page.

### Example 2: Retry on rate limits

Request: "Make my lookup tolerant of 429s."

```python
import time
import perplexity

def ask(q, retries=3):
    for attempt in range(retries):
        try:
            return client.responses.create(preset="fast", input=q).output_text
        except perplexity.RateLimitError:
            time.sleep(2 ** attempt)
    raise RuntimeError("rate limit retries exhausted")
```

Result: the call backs off 1s, 2s, 4s before giving up.

## Guidelines

- Do not start new projects on `/chat/completions` or the `openai` SDK with `base_url="https://api.perplexity.ai"`; it works only through a compatibility layer being phased out.
- Search runs per request, so expect seconds of latency; `fast` is cheapest, `high`/`xhigh` cost far more.
- Tool calls (web search, URL fetch) are billed per call on top of tokens; check `response.usage` for cost.
- For exact prices or stock quotes, call a primary data API rather than trusting a summary.
- Keep the API key in the environment, never in source.
- Exact error class names are in the SDK reference; verify them there before relying on them. The REST endpoint is `POST https://api.perplexity.ai/v1/agent`.
