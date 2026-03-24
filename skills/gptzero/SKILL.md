---
name: gptzero
description: >-
  Integrate GPTZero API for AI content detection — text scanning, file upload,
  batch processing, per-sentence probability scores. Use when: programmatic AI
  content scanning, academic integrity tools, content moderation pipelines.
license: Apache-2.0
compatibility: "Requires Node.js 18+ with native fetch"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["ai-detection", "gptzero", "content-moderation", "text-analysis"]
---

# GPTZero API Integration

## Overview

GPTZero is a specialized AI content detection service providing per-document and per-sentence AI probability scores. It detects output from GPT-family, Claude, Gemini, and other LLMs.

- **API base URL:** `https://api.gptzero.me/v2`
- **Auth:** `x-api-key` header
- **Docs:** https://gptzero.me/docs

## Instructions

### Authentication

Set `GPTZERO_API_KEY` in your environment, then use it in the `x-api-key` header for all requests.

### Single Text Analysis — POST `/v2/predict/text`

Send `{ "document": "<text>" }` as JSON. Returns a response with:
- `completely_generated_prob` (0-1) — probability the entire document is AI-generated
- `average_generated_prob` (0-1) — average AI probability across sentences
- `overall_burstiness` — burstiness score (low = more AI-like)
- `sentences[]` — per-sentence objects with `generated_prob`, `perplexity`, and `highlight_sentence_for_ai`

### Score Interpretation

| `completely_generated_prob` | Meaning                  |
|-----------------------------|--------------------------|
| > 0.80                      | Very likely AI-generated |
| 0.50 - 0.80                | Mixed / uncertain        |
| < 0.50                      | Likely human-written     |

### File Upload — POST `/v2/predict/files`

Upload PDF, DOCX, or TXT files using multipart form data. Returns the same document structure as text analysis.

### Batch Processing

GPTZero free tier allows ~10 req/min. For bulk scanning, process in batches with concurrency control (e.g., 3 concurrent requests with 300ms delay between batches).

### Flagged Sentences

Filter `sentences` where `highlight_sentence_for_ai === true` to extract the specific sentences GPTZero considers AI-generated.

## Examples

### Example 1: Scanning a student essay

A university teaching assistant checks a submitted essay using the GPTZero API:

```
POST https://api.gptzero.me/v2/predict/text
Headers: { "x-api-key": "gz-abc123...", "Content-Type": "application/json" }
Body: { "document": "The Industrial Revolution fundamentally transformed Western society in numerous ways. It is worth noting that the shift from agrarian economies to industrial manufacturing created unprecedented urbanization. Furthermore, the development of steam power and mechanized production significantly altered labor dynamics and social structures across Europe and North America." }

Response:
{
  "documents": [{
    "completely_generated_prob": 0.89,
    "average_generated_prob": 0.85,
    "overall_burstiness": 0.12,
    "sentences": [
      { "sentence": "The Industrial Revolution fundamentally transformed Western society in numerous ways.", "generated_prob": 0.78, "highlight_sentence_for_ai": true },
      { "sentence": "It is worth noting that the shift from agrarian economies...", "generated_prob": 0.95, "highlight_sentence_for_ai": true },
      { "sentence": "Furthermore, the development of steam power...", "generated_prob": 0.91, "highlight_sentence_for_ai": true }
    ]
  }]
}

Verdict: AI-generated (89% probability). All 3 sentences flagged.
```

### Example 2: Verifying a journalist's draft

An editor checks a news article draft before publication:

```
POST https://api.gptzero.me/v2/predict/text
Body: { "document": "At 3:47 AM on Tuesday, a pipe burst in the basement of Mel's Diner on Crenshaw Blvd, flooding the kitchen where owner Melinda Torres had just finished prepping 40 pounds of brisket for the lunch rush. 'I heard it pop and I just stood there watching the water come up,' Torres said. 'Twenty-two years in this spot and nothing like this has happened.' The city's Department of Water and Power dispatched a crew by 5 AM." }

Response:
{
  "documents": [{
    "completely_generated_prob": 0.08,
    "average_generated_prob": 0.11,
    "overall_burstiness": 0.67,
    "sentences": [
      { "sentence": "At 3:47 AM on Tuesday, a pipe burst...", "generated_prob": 0.05, "highlight_sentence_for_ai": false },
      { "sentence": "'I heard it pop and I just stood there...'", "generated_prob": 0.03, "highlight_sentence_for_ai": false },
      { "sentence": "The city's Department of Water and Power...", "generated_prob": 0.12, "highlight_sentence_for_ai": false }
    ]
  }]
}

Verdict: Human-written (8% probability). No sentences flagged.
```

## Guidelines

- Minimum text length: ~250 characters for reliable results
- Best accuracy on English text; other languages are supported but less reliable
- Paraphrased or lightly edited AI text may score lower than raw AI output
- Does not detect AI-generated images or code
- Free tier: ~10,000 words/month, ~10 req/min; check https://gptzero.me/pricing for paid plans
- Handle HTTP 429 (rate limit) by waiting 60s and HTTP 402 (quota exceeded) by checking your plan
- Always route flagged content to human review — no detector is 100% accurate
