---
name: feedback-analysis
description: >-
  Collect, categorize, and synthesize user feedback from multiple channels into
  actionable product insights. Use when tasks involve analyzing support tickets,
  app store reviews, NPS survey responses, social media mentions, user interviews,
  feature request prioritization, sentiment analysis, churn prediction from
  feedback patterns, or building voice-of-customer reports. Covers multi-channel
  feedback aggregation and data-driven product decisions.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags:
    - feedback
    - product
    - user-research
    - sentiment
    - nps
---

# Feedback Analysis

## Overview

Collect user feedback from multiple channels, categorize it, extract patterns, and turn it into prioritized product decisions. Build a systematic process from raw input to actionable insight.

## Instructions

### Multi-channel collection

```
PROACTIVE (you ask)
├── In-app surveys (NPS, CSAT, CES)
├── Email campaigns (post-purchase, post-onboarding)
├── User interviews (1:1, 30-60 min)
└── Beta feedback forms

REACTIVE (they tell you)
├── Support tickets (Zendesk, Intercom, Freshdesk)
├── App store reviews (iOS, Android)
├── Social media mentions (Twitter, Reddit, HN)
└── Community forums (Discord, Slack, GitHub Issues)

BEHAVIORAL (they show you)
├── Session recordings (Hotjar, FullStory)
├── Feature usage analytics
└── Drop-off funnels and search queries
```

### Feedback categorization

Classify every piece of feedback on three dimensions:

```
1. TYPE: Bug report | Feature request | Usability issue | Performance | Praise | Question
2. AREA: Onboarding | Core workflow | Billing | Integrations | Mobile | Account
3. SEVERITY: Critical (blocking) | High (workaround exists) | Medium | Low (nice-to-have)
```

For high-volume feedback (1000+/month), automate classification:

```python
# feedback_classifier.py — LLM-based batch classification

CLASSIFICATION_PROMPT = """Classify this user feedback:

Feedback: "{text}"

Return JSON:
{{"type": "bug|feature_request|usability|performance|praise|question",
  "area": "onboarding|core_workflow|billing|integrations|mobile|account",
  "severity": "critical|high|medium|low",
  "sentiment": "positive|neutral|negative",
  "key_theme": "one phrase summarizing the core issue",
  "actionable": true/false}}"""

def classify_feedback(text: str) -> dict:
    """Classify a single feedback item into structured categories."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": CLASSIFICATION_PROMPT.format(text=text)}],
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)
```

### Sentiment analysis

**NPS (Net Promoter Score)**: "How likely to recommend? (0-10)". Detractors 0-6, Passives 7-8, Promoters 9-10. NPS = %Promoters - %Detractors. Benchmarks: SaaS +30 good/+50 excellent. The follow-up "Why?" is where insights live.

**CSAT**: "How satisfied with [interaction]?" (1-5). Measured after specific touchpoints. Target: >80%.

**CES (Customer Effort Score)**: "How easy was it to [task]?" (1-7). Best predictor of churn for specific interactions. Users scoring 1-3 are 4x more likely to churn.

### Theme extraction

1. Aggregate all feedback from past 30 days
2. Sample if high volume (200+ items)
3. Tag each item with consistent theme labels
4. Rank themes by frequency
5. Weight: frequency × severity × segment value
6. Cross-reference with behavioral data

**Theme report format:**

```markdown
## Feedback Theme Report — [Month Year]

### Top Themes (by weighted frequency)
| # | Theme | Count | Severity | Top Segment | Sample Quote |
|---|-------|-------|----------|-------------|--------------|
| 1 | Slow search | 67 | High | Power users | "Search takes 5+ sec on large projects" |
| 2 | Missing CSV export | 52 | Medium | Enterprise | "Need to get data into BI tools" |

### Churn-Correlated Themes
1. Slow search (34% of churners mentioned)
2. Missing integrations (28%)
```

### Feature request prioritization

**RICE Framework:**

```
RICE Score = (Reach × Impact × Confidence) / Effort

Reach: Users affected next quarter (number)
Impact: 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal
Confidence: 100%=high, 80%=medium, 50%=low
Effort: Person-months to build

Example — CSV Export:
Reach: 500, Impact: 2, Confidence: 90%, Effort: 1 month
RICE = (500 × 2 × 0.9) / 1 = 900
```

**Kano Model**: Classify features as Must-have (expected), Performance (more is better), Delighter (unexpected joy), Indifferent, or Reverse (unwanted).

### Feedback-to-action pipeline

```
Raw Feedback → Classify → Tag Themes → Quantify → Prioritize → Build → Close Loop
```

The "Close Loop" step is critical: tell users you heard them, tell them when you ship it. This turns frustrated users into advocates.

## Examples

### Analyze app store reviews for product insights

```prompt
We have 2,400 app store reviews (iOS + Android) from the past 6 months. Export them and analyze for recurring themes, sentiment trends over time, and feature requests. Identify the top 5 issues driving negative reviews and recommend specific product changes. Include a breakdown by star rating and platform.
```

### Build a feedback collection system

```prompt
Our B2B SaaS product has 3,000 active users across 200 companies. We currently collect feedback only through support tickets. Design a multi-channel feedback system — in-app surveys, NPS, feature request portal, and automated review monitoring. Include the timing triggers, question wording, and how to aggregate insights into a monthly report.
```

### Prioritize a feature backlog using user feedback

```prompt
We have 45 feature requests from the past quarter across support tickets, sales calls, and NPS comments. Score each using RICE framework, cross-reference with churn data, and produce a prioritized backlog with the top 10 features to build next quarter. Include the data sources and confidence level for each score.
```

## Guidelines

- Always close the feedback loop — tell users when their requested feature ships
- Use CES (Customer Effort Score) for specific interaction feedback; it's the best churn predictor
- Never rely on a single feedback channel; aggregate from proactive, reactive, and behavioral sources
- Weight feedback by user segment value, not just raw frequency
- Cross-reference qualitative themes with quantitative behavioral data to validate patterns
- Automate classification for high-volume feedback (1000+/month) using LLM batch processing
- Run theme reports monthly and share with product, engineering, and support teams
