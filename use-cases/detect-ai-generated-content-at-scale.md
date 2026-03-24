---
title: Detect AI-Generated Content at Scale
slug: detect-ai-generated-content-at-scale
description: >-
  Build an automated pipeline to scan hundreds of freelance articles per week for
  AI-generated content using LLM analysis and detection APIs.
skills: [ai-content-detection, gptzero, originality-ai]
category: data-ai
tags: ["ai-detection", "content-moderation", "editorial", "automation"]
---

# Detect AI-Generated Content at Scale

## The Problem

Editorial teams at media companies receive hundreds of freelance articles per week. Manually checking each submission for AI-generated content is impractical — it takes an experienced editor 10-15 minutes per article to assess AI authorship, and the volume keeps growing. Without automated screening, AI-written articles slip through, damaging credibility and SEO performance.

## The Solution

Combine three detection layers into an automated pipeline that scores every submission before it reaches an editor's desk:

1. **Local rule-based analysis** (free, instant) — check burstiness, AI phrases, vocabulary richness using the `ai-content-detection` skill's ruleset
2. **LLM-as-judge** (API cost) — have Claude score the text against a structured detection prompt
3. **External API verification** (credit cost) — run borderline cases through GPTZero or Originality.ai for corroboration

Articles scoring above a threshold (e.g., 6.5/10) get flagged for human review. Clean articles pass through automatically.

## Step-by-Step Walkthrough

**Step 1: Configure the pipeline.** Set API keys for Anthropic, GPTZero, and/or Originality.ai. Define your flagging threshold (start at 6.5/10 and adjust based on false positive rates).

**Step 2: Run local analysis first.** For each article, compute burstiness (sentence length variance) and scan for common AI phrases like "it's important to note" and "furthermore." This is free and filters out obvious cases instantly.

**Step 3: Send remaining articles to LLM analysis.** Use the detection prompt from `ai-content-detection` to have Claude score each article on a 0-10 scale. Chunk long articles into ~1500-word sections and average the scores.

**Step 4: Corroborate borderline cases.** Articles scoring 4-7 (the uncertain range) get sent to GPTZero or Originality.ai for a second opinion. Average the LLM score with the API score for a combined verdict.

**Step 5: Route results.** Flagged articles go to an editor queue with a report showing the score, detected signals, and suspicious phrases. Clean articles proceed to the publishing workflow.

**Step 6: Track and tune.** Monitor your false positive rate (expect ~10-15% initially). When editors mark false positives, use that feedback to adjust thresholds per author or content category.

## Real-World Example

A media company processes 500 freelance submissions per week. Here is one week's pipeline output:

```
Batch Summary:
  Total processed: 487 (13 skipped — under 200 words)
  Flagged for review: 63 (12.9%)
  Clean: 412
  Errors: 12 (GPTZero rate limits)

Score Distribution:
  AI-generated (>7):    38 articles
  Likely AI (5.5-7):    25 articles
  Uncertain (4-5.5):    44 articles
  Likely human (2.5-4): 89 articles
  Human (<2.5):         291 articles

Sample flagged article:
  "10 Ways to Boost Your Morning Productivity" by contributor-247
  Combined score: 8.2/10 — AI-generated
  LLM score: 8/10 | GPTZero: 84% AI probability
  Signals: uniform sentence rhythm, excessive hedging, no personal anecdotes
  Suspicious phrases: "In today's fast-paced world", "it's important to note",
    "can significantly enhance your overall well-being"

After editor review: 51 of 63 flagged articles confirmed as AI-generated.
False positive rate: 19% (12 articles incorrectly flagged).
Threshold adjusted from 6.5 to 7.0 for the following week.
```

## Related Skills

- [ai-content-detection](../skills/ai-content-detection/SKILL.md) — rule-based and LLM detection logic
- [gptzero](../skills/gptzero/SKILL.md) — GPTZero API integration for per-sentence scoring
- [originality-ai](../skills/originality-ai/SKILL.md) — combined AI detection and plagiarism checking
