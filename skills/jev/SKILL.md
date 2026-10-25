---
name: jev
description: >-
  Calls Jev, TypeSafe AI's "System One" model, which returns typed decisions (a choice, a score, or a yes/no probability) with calibrated probabilities instead of generated text. Use when a user asks to classify or route tickets, messages or documents, score leads or urgency, gate an agent action on a yes/no check, add a confidence threshold before acting, or get fast structured decisions through the TypeSafe API, LiteLLM or the Vercel AI Gateway.
license: Apache-2.0
compatibility: "A TypeSafe AI account and API key (TYPESAFE_API_KEY). Text input only. Examples use curl and Python 3.10+ with requests."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "jev, typesafe-ai, ai-agents, classification, routing"
---
# Jev

## Overview

Jev is TypeSafe AI's flagship **System One** model. The name comes from Kahneman's "System 1", fast and intuitive thinking. Jev does not write text: you give it a `state` (a string, object or array) and a set of typed questions, and it returns one typed answer per question, with probabilities software can act on. It never writes replies, code or explanations, and it takes text only (no images, audio or video).

Three question types ("primitives"):

| `type` | Use for | Answer fields |
|---|---|---|
| `choice` | Pick one option from a fixed set (up to 255) | `choice`, `probabilities`, `confidence` |
| `score` | Rate on an ordered scale of 2 to 10 described levels | `score`, `legend`, `probabilities`, `confidence` |
| `noul` | A yes/no question | `noul`, a probability from 0 (no) to 1 (yes) |

`noul` is spelled exactly that way (not "null"). Vercel's gateway calls the same primitive "boolean".

Source of truth: https://docs.typesafe.ai (API at https://docs.typesafe.ai/api.md, models at https://docs.typesafe.ai/models.md).

## Instructions

### 1. Get a key and call the endpoint

Create an API key in the TypeSafe console and keep it in the environment. Never paste it into code or commit it.

```bash
export TYPESAFE_API_KEY="<key from the TypeSafe console>"
```

`POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer $TYPESAFE_API_KEY` and `Content-Type: application/json`. The body has three required fields:

- `state`: the content to judge (string, object or array)
- `model`: `jev-latest`, or a pinned version such as `jev-1.13.0`
- `questions`: an object whose keys you choose; answers come back under the same keys. The model never sees the keys.

### 2. Write the questions

- Each question needs `type` and `instructions` (string, object or array).
- `choice` also needs `criteria`: a map of option name to description (a description may be `null`). Make descriptions separate confusable options, and add an `other` option if the set may not cover every input.
- `score` needs `criteria`: an ordered array of level descriptions, low to high. Level numbers are array positions starting at 0.
- `noul` takes only `instructions`. Phrase it so a high value means yes ("Does the message contain personal data?"). Optional `criteria` with `true` and `false` descriptions helps when the boundary is subtle.
- Ask one specific thing per question. Several questions in one request run in parallel.

### 3. Read the answers

The response is `{ "model", "answers", "usage": { "input_tokens", "output_tokens" } }`. `model` is the versioned id that actually answered.

- `confidence` (choice and score) runs from 0 to 1: 1 when all probability sits on one outcome, 0 when it is spread evenly. It measures how concentrated the distribution is, not whether the answer is correct.
- `noul` answers have no `confidence`. A value near 0.5 means doubt; if you want a confidence-style number use `abs(2*p - 1)`.
- `score` is the probability-weighted mean of the level numbers, so it can fall between levels (0.57 on level 1 and 0.43 on level 2 gives 1.43).

### 4. Gate actions on confidence

Use the answer to decide what, and the confidence to decide whether to act. The docs' confidence-routing pattern uses a floor of 0.6 and a higher bar for risky actions (above 0.85 for approving a transfer, otherwise ask for confirmation). Treat those numbers as starting points and tune them on your own labelled data.

### 5. Errors and limits

- `401` bad or missing key; `422` malformed request; `429` rate limit; `529` overloaded. Retry 429 and 529 with exponential backoff. The official SDKs (`typesafe-sdk` for Python, `@typesafe-ai/sdk` for Node 20+) retry by default.
- Context is 64k tokens per request, of which 32k is for `state` plus the longest question.
- Rate limits are listed as 100K tokens per second and 80 requests per second, and the docs say they adjust dynamically.
- Aliases (`jev-latest`, `jev-preview`) can move to a new release. Pin `jev-1.13.0` when results must stay stable.
- No streaming is documented.

### Other routes

- **LiteLLM** pass-through: set `TYPESAFE_API_KEY` on the proxy, then POST the same body to `/typesafe/v1/systemone` on the proxy with a LiteLLM virtual key. The TypeSafe response is returned unchanged. See https://docs.litellm.ai/docs/pass_through/typesafe.
- **Vercel AI Gateway**: model id `typesafe-ai/jev` (see https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe for the exact client and endpoint).

## Examples

### Example 1: Route a support ticket and escalate when unsure

```bash
curl -s https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "Subject: Charged twice for March\nBody: I was billed $49 twice on March 3 and your portal times out when I try to download the invoice. I need this fixed today, our accountant closes the books tomorrow.",
    "model": "jev-1.13.0",
    "questions": {
      "team": {
        "type": "choice",
        "instructions": "Which team should own this ticket?",
        "criteria": {
          "billing": "Charges, refunds, invoices, payment methods",
          "technical": "Bugs, outages, errors, integrations",
          "sales": "Pricing, plan changes, new purchases",
          "other": "Anything that fits none of the above"
        }
      },
      "frustration": {
        "type": "score",
        "instructions": "How frustrated is the customer?",
        "criteria": ["Calm or neutral", "Annoyed", "Very angry"]
      },
      "needs_same_day": {
        "type": "noul",
        "instructions": "The customer needs a resolution within 24 hours."
      }
    }
  }'
```

Route in Python, sending low-confidence tickets to a person:

```python
import os
import requests

def triage(ticket_text: str) -> dict:
    resp = requests.post(
        "https://api.typesafe.ai/v1/systemone",
        headers={"Authorization": f"Bearer {os.environ['TYPESAFE_API_KEY']}"},
        json={
            "state": ticket_text,
            "model": "jev-1.13.0",
            "questions": {
                "team": {
                    "type": "choice",
                    "instructions": "Which team should own this ticket?",
                    "criteria": {
                        "billing": "Charges, refunds, invoices",
                        "technical": "Bugs, outages, errors",
                        "sales": "Pricing and plan changes",
                        "other": "None of the above",
                    },
                },
                "needs_same_day": {
                    "type": "noul",
                    "instructions": "The customer needs a resolution within 24 hours.",
                },
            },
        },
        timeout=30,
    )
    resp.raise_for_status()
    answers = resp.json()["answers"]
    team = answers["team"]
    if team["confidence"] < 0.6 or team["choice"] == "other":
        queue = "human-triage"
    else:
        queue = team["choice"]
    return {"queue": queue, "priority": "high" if answers["needs_same_day"]["noul"] > 0.8 else "normal"}
```

A ticket whose `probabilities` read 0.61 billing and 0.35 technical has a confidence of about 0.42 with four options, so it lands in `human-triage` instead of being guessed.

### Example 2: Score a sales lead

```json
{
  "state": {"company": "Northwind Logistics", "employees": 240, "role": "VP Operations", "message": "We are replacing our dispatch software before Q1 and need pricing for 60 seats."},
  "model": "jev-1.13.0",
  "questions": {
    "intent": {
      "type": "score",
      "instructions": "How ready is this lead to buy?",
      "criteria": ["Just browsing", "Researching options", "Comparing vendors with a timeline", "Ready to purchase now"]
    }
  }
}
```

The answer carries `score` (for example 2.4), a `legend`, `probabilities` per level and a `confidence`. Send leads with score above 2 and confidence above 0.5 to a sales rep, and the rest to a nurture sequence. Check the `confidence` before trusting a borderline score.

### Example 3: A yes/no gate before an agent acts

```json
{
  "state": "Please delete every file in /var/backups older than 7 days and email me the list.",
  "model": "jev-1.13.0",
  "questions": {
    "destructive": {
      "type": "noul",
      "instructions": "Carrying out this request would permanently delete data."
    }
  }
}
```

If `answers.destructive.noul` is above 0.5, pause the agent and ask the user to confirm; near 0.5, treat it as unsure and ask too.

## Guidelines

- **Do not use Jev when you need prose.** It cannot draft a reply, summarise or explain. Use an LLM for text and Jev for the decision in front of it.
- **Confidence is a statistic, not a guarantee.** Calibration holds across many predictions, not for any single answer. Always build an escalation path (human queue, clarifying question, fallback model) for low confidence, and set stricter thresholds for destructive or costly actions.
- **Cost model.** The models page lists input tokens only at $42 per billion ($0.042 per million), with output tokens free. Every extra question re-reads the state through its own tokens, so several questions are cheap in latency but not free in tokens. Check the page for current prices before budgeting; Vercel's gateway and LiteLLM report spend from the same `usage` fields.
- **Expect change.** Aliases move, values in the docs are illustrative, and the docs say results can differ between Jev releases. Pin a versioned model id in production and keep a small labelled set to re-check thresholds after every upgrade. This is a young product: confirm access status, limits and any early-access terms in your TypeSafe account, since the docs pages I read do not state them.
- Keep questions single-purpose, put an `other` option in every `choice`, and combine conditions in code, not inside one question.
- Treat `state` as data you are sending to a third-party API; strip secrets and personal data you do not need to classify.
