---
name: originality-ai
description: >-
  Use Originality.ai API to detect AI-generated content and check for plagiarism
  simultaneously. Use when: SEO content audits, freelancer content verification,
  editorial review pipelines, originality checks.
license: Apache-2.0
compatibility: "Requires Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["ai-detection", "plagiarism", "originality", "content-moderation", "seo"]
---

# Originality.ai API Integration

## Overview

Originality.ai combines AI content detection with plagiarism checking in a single API. It uses a credit-based pricing model where each scan costs credits proportional to word count.

- **API base URL:** `https://api.originality.ai/api/v1`
- **Auth:** `X-OAI-API-KEY` header
- **Docs:** https://docs.originality.ai

## Instructions

### Authentication

Set `ORIGINALITY_API_KEY` in your environment. Pass it in the `X-OAI-API-KEY` header for all requests.

### AI Detection — POST `/api/v1/scan/ai`

Send `{ "content": "<text>", "aiModelVersion": "1", "storeScan": false }`. Returns:
- `score.ai` (0-1) — probability of AI authorship
- `score.original` (0-1) — probability of human authorship (equals `1 - ai`)
- `credits_used` — credits consumed by this scan

| `score.ai`  | Meaning                  |
|-------------|--------------------------|
| 0.80 - 1.0  | Very likely AI-generated |
| 0.50 - 0.79 | Mixed / uncertain        |
| 0.20 - 0.49 | Probably human-written   |
| 0.00 - 0.19 | Very likely human        |

### Plagiarism Detection — POST `/api/v1/scan/plag`

Send `{ "content": "<text>", "storeScan": false }`. Returns:
- `score.percentUnique` (0-100) — percentage of unique content
- `score.percentDuplicated` (0-100) — percentage matched elsewhere on the web
- `matches[]` — array of `{ url, matchedWords, percentage }` for each source found

### Combined Scan

Run both AI detection and plagiarism checks in parallel for comprehensive content verification. Flag content if AI score >= 0.5 or plagiarism >= 20%.

### Credit Management

Check your balance via GET `/api/v1/account/credits/balance`. Credits are consumed per word, and AI + plagiarism scans cost credits separately. Use `storeScan: false` to avoid storing content in the dashboard.

## Examples

### Example 1: Checking marketing copy for originality

A content team lead verifies a freelancer's submitted blog post about cloud migration:

```
AI Detection:
POST https://api.originality.ai/api/v1/scan/ai
Headers: { "X-OAI-API-KEY": "oai-key-abc123...", "Content-Type": "application/json" }
Body: { "content": "Cloud migration is a transformative journey that organizations must carefully plan. It is essential to consider the various deployment models available, including public, private, and hybrid cloud solutions. Furthermore, a comprehensive migration strategy should address data security, compliance requirements, and cost optimization.", "aiModelVersion": "1", "storeScan": false }

Response:
{ "success": true, "score": { "ai": 0.92, "original": 0.08 }, "credits_used": 1 }

Plagiarism Check:
POST https://api.originality.ai/api/v1/scan/plag
Body: { "content": "...(same text)...", "storeScan": false }

Response:
{ "success": true, "score": { "percentUnique": 73, "percentDuplicated": 27 }, "matches": [{ "url": "https://example-cloud-blog.com/migration-guide", "matchedWords": 42, "percentage": 22 }], "credits_used": 1 }

Result: Flagged — AI score 92%, plagiarism 27% duplicated.
Total credits used: 2.
```

### Example 2: Verifying an original product review

An e-commerce site checks a customer-submitted product review:

```
AI Detection:
POST https://api.originality.ai/api/v1/scan/ai
Body: { "content": "I bought this blender last March after my old Vitamix finally died (RIP, 8 years of smoothies). The Ninja BN701 is louder than I expected — my cat literally bolts out of the kitchen — but it crushes frozen mango like nothing. The lid seal is a bit finicky, learned the hard way when I repainted my ceiling with acai. For $89 though, no complaints.", "aiModelVersion": "1", "storeScan": false }

Response:
{ "success": true, "score": { "ai": 0.04, "original": 0.96 }, "credits_used": 1 }

Plagiarism Check:
Response:
{ "success": true, "score": { "percentUnique": 100, "percentDuplicated": 0 }, "matches": [], "credits_used": 1 }

Result: Passes both checks — AI score 4%, 100% unique content.
```

## Guidelines

- Minimum 50 words required for AI detection
- Best accuracy for English; other languages are supported but less reliable
- Plagiarism check only works for publicly indexed web content
- Heavily paraphrased AI text may evade detection
- Does not detect AI in images, code, or structured data
- Budget credits for bulk runs: estimate ~1 credit per 100 words per scan type
- Handle HTTP 402 (insufficient credits) and 429 (rate limited) gracefully
- Always pair automated detection with human review for final decisions
