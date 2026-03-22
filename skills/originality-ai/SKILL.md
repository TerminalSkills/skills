---
name: originality-ai
description: >-
  Use Originality.ai API to detect AI-generated content and plagiarism
  simultaneously. Use when: SEO content audits, freelancer content verification,
  editorial review pipelines.
license: Apache-2.0
compatibility: "Requires Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["ai-detection", "plagiarism", "originality", "content-moderation", "seo"]
  use-cases:
    - "Verify freelance blog posts for AI content and plagiarism before publishing"
    - "Audit a batch of SEO articles for originality"
    - "Build an editorial pipeline that flags both AI and copied content"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Originality.ai API Integration

## Overview

Originality.ai combines AI content detection with plagiarism checking in a single
API. It is credit-based — each scan costs credits proportional to word count.

**API base URL:** `https://api.originality.ai/api/v1`  
**Auth:** `X-OAI-API-KEY` header  
**Docs:** https://docs.originality.ai

## Setup

```typescript
const ORIGINALITY_API_KEY = process.env.ORIGINALITY_API_KEY!;
const BASE_URL = "https://api.originality.ai/api/v1";

const headers = {
  "X-OAI-API-KEY": ORIGINALITY_API_KEY,
  "Content-Type": "application/json",
};
```

## AI Detection — `/api/v1/scan/ai`

```typescript
interface OriginalityAIResult {
  success: boolean;
  score: {
    ai: number;       // 0-1: probability of AI authorship
    original: number; // 0-1: probability of human authorship (1 - ai)
  };
  content: string;
  credits_used: number;
}

async function scanForAI(content: string): Promise<OriginalityAIResult> {
  const res = await fetch(`${BASE_URL}/scan/ai`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content,
      aiModelVersion: "1",  // use "1" for latest model
      storeScan: false,     // set true to save in dashboard
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Originality.ai error ${res.status}: ${err}`);
  }

  return res.json();
}
```

### Score Interpretation

| `score.ai` | Interpretation         |
|------------|------------------------|
| 0.80 – 1.0 | Very likely AI-generated |
| 0.50 – 0.79 | Mixed / uncertain      |
| 0.20 – 0.49 | Probably human-written |
| 0.00 – 0.19 | Very likely human      |

```typescript
function interpretAI(score: number): string {
  if (score >= 0.8) return "🔴 AI-generated";
  if (score >= 0.5) return "🟡 Mixed/uncertain";
  if (score >= 0.2) return "🟠 Probably human";
  return "🟢 Human-written";
}
```

## Plagiarism Detection — `/api/v1/scan/plag`

```typescript
interface OriginalityPlagResult {
  success: boolean;
  score: {
    percentUnique: number;     // 0-100: % of unique content
    percentDuplicated: number; // 0-100: % matched elsewhere
  };
  matches: Array<{
    url: string;
    matchedWords: number;
    percentage: number;
  }>;
  credits_used: number;
}

async function scanForPlagiarism(content: string): Promise<OriginalityPlagResult> {
  const res = await fetch(`${BASE_URL}/scan/plag`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, storeScan: false }),
  });

  if (!res.ok) throw new Error(`Plagiarism scan error ${res.status}`);
  return res.json();
}
```

## Combined AI + Plagiarism Scan

Run both checks together for a single content piece:

```typescript
interface CombinedScanResult {
  ai: OriginalityAIResult;
  plagiarism: OriginalityPlagResult;
  summary: string;
  flagged: boolean;
}

async function combinedScan(
  content: string,
  thresholds = { aiScore: 0.5, plagPercent: 20 }
): Promise<CombinedScanResult> {
  const [ai, plagiarism] = await Promise.all([
    scanForAI(content),
    scanForPlagiarism(content),
  ]);

  const aiFlag = ai.score.ai >= thresholds.aiScore;
  const plagFlag = plagiarism.score.percentDuplicated >= thresholds.plagPercent;
  const flagged = aiFlag || plagFlag;

  const reasons: string[] = [];
  if (aiFlag) reasons.push(`AI score: ${(ai.score.ai * 100).toFixed(0)}%`);
  if (plagFlag)
    reasons.push(
      `Plagiarism: ${plagiarism.score.percentDuplicated.toFixed(0)}% duplicated`
    );

  return {
    ai,
    plagiarism,
    summary: flagged
      ? `⚠️ Flagged — ${reasons.join(", ")}`
      : "✅ Passes both AI and plagiarism checks",
    flagged,
  };
}
```

## Bulk Scanning with Credit Management

Credits are consumed per word. Check balance before bulk runs:

```typescript
async function getCreditsRemaining(): Promise<number> {
  const res = await fetch(`${BASE_URL}/account/credits/balance`, { headers });
  if (!res.ok) throw new Error("Could not fetch credit balance");
  const data = await res.json();
  return data.credits;
}

async function bulkScan(
  articles: Array<{ id: string; content: string }>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Array<{ id: string; result: CombinedScanResult | null; error?: string }>> {
  const { concurrency = 2, delayMs = 500 } = options;

  // Estimate cost: ~1 credit per 100 words
  const totalWords = articles.reduce(
    (sum, a) => sum + a.content.split(/\s+/).length,
    0
  );
  const estimatedCredits = Math.ceil(totalWords / 100) * 2; // AI + plag
  console.log(
    `Estimated credits needed: ${estimatedCredits} for ${articles.length} articles`
  );

  const results: Array<{
    id: string;
    result: CombinedScanResult | null;
    error?: string;
  }> = [];

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async ({ id, content }) => {
        try {
          const result = await combinedScan(content);
          return { id, result };
        } catch (err: any) {
          return { id, result: null, error: err.message };
        }
      })
    );

    results.push(...batchResults);

    if (i + concurrency < articles.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
```

## Python Example

```python
import os
import requests

API_KEY = os.environ["ORIGINALITY_API_KEY"]
BASE_URL = "https://api.originality.ai/api/v1"
HEADERS = {"X-OAI-API-KEY": API_KEY, "Content-Type": "application/json"}


def scan_ai(content: str) -> dict:
    resp = requests.post(
        f"{BASE_URL}/scan/ai",
        json={"content": content, "aiModelVersion": "1"},
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


def scan_plagiarism(content: str) -> dict:
    resp = requests.post(
        f"{BASE_URL}/scan/plag",
        json={"content": content},
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


def interpret(ai_score: float) -> str:
    if ai_score >= 0.8:
        return "AI-generated"
    elif ai_score >= 0.5:
        return "Mixed/uncertain"
    elif ai_score >= 0.2:
        return "Probably human"
    return "Human-written"


if __name__ == "__main__":
    text = "Your article content here..."
    ai_result = scan_ai(text)
    plag_result = scan_plagiarism(text)

    ai_score = ai_result["score"]["ai"]
    plag_pct = plag_result["score"]["percentDuplicated"]

    print(f"AI Score:     {ai_score:.2f} — {interpret(ai_score)}")
    print(f"Plagiarism:   {plag_pct:.1f}% duplicated")
    print(f"Credits used: {ai_result['credits_used'] + plag_result['credits_used']}")
```

## Error Handling

```typescript
async function safeScan(content: string) {
  try {
    return await scanForAI(content);
  } catch (err: any) {
    if (err.message.includes("402")) {
      throw new Error("Insufficient Originality.ai credits — top up at https://originality.ai");
    }
    if (err.message.includes("429")) {
      throw new Error("Rate limited — reduce concurrency or add delay between requests");
    }
    throw err;
  }
}
```

## Credit Pricing Notes

- Credits are consumed proportionally to word count
- AI scan + plagiarism scan each cost credits separately
- Free trial credits available on signup
- Check https://originality.ai/pricing for current rates
- Use `storeScan: false` to avoid storing content in the dashboard (saves credits on some plans)

## Limitations

- Minimum 50 words for AI detection
- Best accuracy for English; other languages supported but less reliable
- Plagiarism check only works for publicly indexed web content
- Heavily paraphrased AI text may evade detection
- Does not detect AI in images, code, or structured data
