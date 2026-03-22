---
name: gptzero
description: >-
  Integrate GPTZero API for AI content detection — batch scanning, document
  analysis, probability scores. Use when: programmatic AI content scanning,
  building content moderation pipelines, academic integrity tools.
license: Apache-2.0
compatibility: "Requires Node.js 18+ with native fetch or node-fetch"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["ai-detection", "gptzero", "content-moderation", "text-analysis"]
  use-cases:
    - "Scan submitted essays and flag likely AI-generated content"
    - "Build a content moderation pipeline with per-sentence AI scores"
    - "Batch-check hundreds of documents for AI authorship"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# GPTZero API Integration

## Overview

GPTZero is a specialized AI content detection service that provides per-document
and per-sentence AI probability scores. It is purpose-built for detecting
GPT-family, Claude, Gemini, and other LLM outputs.

**API base URL:** `https://api.gptzero.me/v2`  
**Auth:** `x-api-key` header  
**Docs:** https://gptzero.me/docs

## Setup

```typescript
const GPTZERO_API_KEY = process.env.GPTZERO_API_KEY!;
const BASE_URL = "https://api.gptzero.me/v2";

const headers = {
  "x-api-key": GPTZERO_API_KEY,
  "Content-Type": "application/json",
};
```

## Single Text Analysis — `/v2/predict/text`

Send a single document for AI detection.

```typescript
interface GPTZeroDocument {
  completely_generated_prob: number;   // 0-1: probability entire doc is AI
  average_generated_prob: number;      // 0-1: average across sentences
  overall_burstiness: number;          // burstiness score
  paragraphs: GPTZeroParagraph[];
  sentences: GPTZeroSentence[];
}

interface GPTZeroParagraph {
  start_index: number;
  end_index: number;
  completely_generated_prob: number;
}

interface GPTZeroSentence {
  sentence: string;
  generated_prob: number;             // per-sentence AI probability
  perplexity: number;
  highlight_sentence_for_ai: boolean;
}

interface GPTZeroResponse {
  documents: GPTZeroDocument[];
}

async function scanText(text: string): Promise<GPTZeroDocument> {
  const res = await fetch(`${BASE_URL}/predict/text`, {
    method: "POST",
    headers,
    body: JSON.stringify({ document: text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPTZero error ${res.status}: ${err}`);
  }

  const data: GPTZeroResponse = await res.json();
  return data.documents[0];
}
```

### Interpreting Scores

| `completely_generated_prob` | Interpretation          |
|-----------------------------|-------------------------|
| > 0.80                      | Very likely AI-generated |
| 0.50 – 0.80                 | Mixed / uncertain        |
| < 0.50                      | Likely human-written     |

```typescript
function interpret(doc: GPTZeroDocument): string {
  const p = doc.completely_generated_prob;
  if (p > 0.8) return "🔴 AI-generated";
  if (p > 0.5) return "🟡 Mixed/uncertain";
  return "🟢 Human-written";
}
```

## Highlighted Sentences

Retrieve the specific sentences GPTZero flagged as AI-generated:

```typescript
function getAISentences(doc: GPTZeroDocument): string[] {
  return doc.sentences
    .filter((s) => s.highlight_sentence_for_ai)
    .map((s) => s.sentence);
}
```

## File Upload — `/v2/predict/files`

For PDF, DOCX, or TXT files:

```typescript
async function scanFile(filePath: string): Promise<GPTZeroDocument> {
  const { createReadStream } = await import("fs");
  const { default: FormData } = await import("form-data");

  const form = new FormData();
  form.append("files", createReadStream(filePath));

  const res = await fetch(`${BASE_URL}/predict/files`, {
    method: "POST",
    headers: {
      "x-api-key": GPTZERO_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) throw new Error(`GPTZero file error ${res.status}`);
  const data = await res.json();
  return data.documents[0];
}
```

## Batch Processing with Rate Limiting

GPTZero free tier allows ~10 req/min. Use a queue with concurrency control:

```typescript
async function batchScan(
  texts: string[],
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<{ text: string; result: GPTZeroDocument; verdict: string }[]> {
  const { concurrency = 3, delayMs = 300 } = options;
  const results: { text: string; result: GPTZeroDocument; verdict: string }[] = [];

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (text) => {
        const result = await scanText(text);
        return { text, result, verdict: interpret(result) };
      })
    );

    results.push(...batchResults);

    // Respect rate limits between batches
    if (i + concurrency < texts.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
```

## Per-Article Report

```typescript
function generateReport(text: string, doc: GPTZeroDocument): string {
  const aiSentences = getAISentences(doc);
  const verdict = interpret(doc);

  return `
## AI Detection Report

**Verdict:** ${verdict}
**AI Probability:** ${(doc.completely_generated_prob * 100).toFixed(1)}%
**Average Sentence AI Score:** ${(doc.average_generated_prob * 100).toFixed(1)}%
**Burstiness:** ${doc.overall_burstiness?.toFixed(3) ?? "N/A"}

### Flagged Sentences (${aiSentences.length})
${aiSentences.map((s, i) => `${i + 1}. "${s}"`).join("\n")}
`.trim();
}
```

## Error Handling

```typescript
async function safeScan(text: string): Promise<GPTZeroDocument | null> {
  try {
    // GPTZero requires minimum ~250 characters
    if (text.length < 250) {
      console.warn("Text too short for reliable detection (<250 chars)");
    }
    return await scanText(text);
  } catch (err: any) {
    if (err.message.includes("429")) {
      console.error("Rate limited — wait 60s before retrying");
    } else if (err.message.includes("402")) {
      console.error("Quota exceeded — check your GPTZero plan");
    } else {
      console.error("GPTZero error:", err.message);
    }
    return null;
  }
}
```

## Pricing Notes

- **Free tier:** Limited to ~10,000 words/month, ~10 req/min
- **Essential / Pro:** Higher limits, file upload, API access
- Check https://gptzero.me/pricing for current plans

## Limitations

- Minimum text length: ~250 characters for reliable results
- Paraphrased or edited AI text may score lower
- Best accuracy on English text; other languages supported but less reliable
- Does not detect AI-generated images or code
