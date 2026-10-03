---
name: originality-ai
description: >-
  Calls the Originality.ai API to score text for AI authorship and to check it
  for plagiarism. Use when auditing SEO content, verifying freelancer
  submissions, building an editorial review queue, or when a user asks to
  "check if this article is AI-written" or "run an originality check".
license: Apache-2.0
compatibility: "Requires Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["ai-detection", "plagiarism", "originality", "content-moderation", "seo"]
---

# Originality.ai API Integration

## Overview

Originality.ai scores text for AI authorship and checks it for plagiarism through a credit-based HTTP API. Scans are billed in credits that grow with word count, and the API key is tied to a paid account.

- **Base URL:** `https://api.originality.ai/api/v1`
- **Auth:** `X-OAI-API-KEY` header
- **Docs:** https://docs.originality.ai (the current reference is labelled "Version 3" and lists `scan`, `batch-scan`, `scan-url`, `credit-balance` and `scan-results`; the older v1 reference is still published)
- **Rate limit:** the account-level limit is not stated in the docs pages that could be read; Microsoft's connector lists 100 calls per 60 seconds, so throttle and retry on HTTP 429.

The exact field names of the v3 endpoints could not be fetched when this page was last refreshed (the docs site blocks automated clients). The parts below are confirmed by the v1 endpoint, third-party connectors and the docs index; check the field list in the docs before relying on anything not shown here.

## Instructions

### Authentication

Keep the key on the server only (`ORIGINALITY_API_KEY`) and send it as `X-OAI-API-KEY`. Never ship it to browser JavaScript. Avoid a double slash in the path (`/api/v1//scan/ai` fails).

### AI detection: POST `/api/v1/scan/ai`

Body: `{ "content": "<text>" }`. The docs also list optional `title`, `aiModelVersion` and `excludedUrls` parameters for the scan endpoint. Response fields confirmed:

- `success` (boolean)
- `score.ai` and `score.original` (floats between 0 and 1, summing to 1)
- `credits_used` and `credits` (the account balance after the scan)

A response looks like this (only the confirmed fields are shown):

```json
{ "success": true, "score": { "original": 0.08, "ai": 0.92 }, "credits_used": 3, "credits": 4417 }
```

Scores are probabilities, not proof. A practical triage: above 0.8 route to human review as likely AI, 0.2 to 0.8 treat as uncertain, below 0.2 as likely human.

### Webpage scan

The docs list a `scan-url` operation that takes a `url` and returns the same score plus per-block results (`score_breakdown` with `text`, `ai`, `original`). Look up its current path in the docs before use.

### Plagiarism and readability

The v1 reference documents a combined plagiarism and readability scan under `scan`. Request it with the same `content` body and read the plagiarism result from the response; confirm the response field names in the docs, as they are not reproduced here.

### Credits

Fetch the balance with the credit-balance endpoint (response contains `balance`). Run AI and plagiarism scans in parallel only if you have budgeted credits for both, because each is billed separately.

## Examples

### Example 1: Triage a freelancer's blog post

Request: "Check draft-cloud-migration.txt for AI writing before we pay the invoice."

```bash
curl -s -X POST "https://api.originality.ai/api/v1/scan/ai" \
  -H "X-OAI-API-KEY: $ORIGINALITY_API_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --rawfile text draft-cloud-migration.txt '{content: $text}')"
```

Result shape: `{"success": true, "score": {"original": 0.08, "ai": 0.92}, "credits_used": 3, "credits": 4417}`. An `ai` of 0.92 goes to an editor, with the score attached to the ticket; it does not reject the invoice automatically.

### Example 2: Batch audit of published articles in Python

Request: "Score the 40 articles in ./content and list anything above 0.5."

```python
import os, pathlib, time, requests

headers = {"X-OAI-API-KEY": os.environ["ORIGINALITY_API_KEY"]}
flagged = []
for path in sorted(pathlib.Path("content").glob("*.md")):
    r = requests.post("https://api.originality.ai/api/v1/scan/ai",
                      headers=headers, json={"content": path.read_text()}, timeout=60)
    if r.status_code == 429:
        time.sleep(30); continue
    r.raise_for_status()
    data = r.json()
    if data["score"]["ai"] > 0.5:
        flagged.append((path.name, data["score"]["ai"]))
print(flagged)
```

Output is a list such as `[("kubernetes-costs.md", 0.87)]`, and the total spend is the sum of `credits_used`.

## Guidelines

- Accuracy drops on short text (below about 100 words); there is no hard minimum enforced by the API.
- Best on English; about 30 languages are supported but with lower reliability.
- Edited, translated or non-native writing produces false positives, and paraphrased AI text can evade detection, so scores route documents to human review rather than decide.
- Plagiarism matching covers publicly indexed web content only.
- Does not detect AI in images, code or structured data.
- Handle HTTP 429 (throttled) and an out-of-credits error; log status codes, never full headers.
- Do not send confidential drafts unless your agreement with the vendor allows it.
