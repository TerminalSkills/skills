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
    - prioritization
---

# Feedback Analysis

Collect user feedback from multiple channels, categorize it, extract patterns, and turn it into prioritized product decisions. Build a systematic process from raw input to actionable insight.

## Multi-Channel Collection

Users leave feedback everywhere. Set up collection from all sources:

```
PROACTIVE (you ask)
├── In-app surveys (NPS, CSAT, CES)
├── Email campaigns (post-purchase, post-onboarding)
├── User interviews (1:1, 30-60 min)
├── Beta feedback forms
└── Onboarding follow-ups

REACTIVE (they tell you)
├── Support tickets (Zendesk, Intercom, Freshdesk)
├── App store reviews (iOS, Android)
├── Social media mentions (Twitter, Reddit, HN)
├── Community forums (Discord, Slack, GitHub Issues)
└── Sales call notes (CRM)

BEHAVIORAL (they show you)
├── Session recordings (Hotjar, FullStory)
├── Heatmaps and click maps
├── Feature usage analytics
├── Drop-off funnels
└── Search queries (in-app and on-site)
```

## Feedback Categorization

### Taxonomy

Classify every piece of feedback on three dimensions:

```
1. TYPE
   ├── Bug report         (something is broken)
   ├── Feature request    (something is missing)
   ├── Usability issue    (something is confusing)
   ├── Performance        (something is slow)
   ├── Praise             (something is great)
   └── Question           (something is unclear)

2. AREA
   ├── Onboarding
   ├── Core workflow
   ├── Billing/pricing
   ├── Integrations
   ├── Mobile experience
   └── Account/settings

3. SEVERITY / IMPACT
   ├── Critical    (blocking, causes churn)
   ├── High        (significant pain, workaround exists)
   ├── Medium      (annoying but manageable)
   └── Low         (nice-to-have improvement)
```

### Tagging at scale

For high-volume feedback (1000+ items/month), automate initial classification:

```python
# feedback_classifier.py
# Uses LLM to classify raw feedback into structured categories
# Run as batch job on new tickets/reviews daily

import json
from openai import OpenAI

client = OpenAI()

CLASSIFICATION_PROMPT = """Classify this user feedback:

Feedback: "{text}"

Return JSON:
{{
  "type": "bug|feature_request|usability|performance|praise|question",
  "area": "onboarding|core_workflow|billing|integrations|mobile|account",
  "severity": "critical|high|medium|low",
  "sentiment": "positive|neutral|negative",
  "key_theme": "one phrase summarizing the core issue",
  "actionable": true/false
}}"""

def classify_feedback(text: str) -> dict:
    """Classify a single feedback item into structured categories.
    
    Args:
        text: Raw feedback text from any channel
    
    Returns:
        Dict with type, area, severity, sentiment, theme, actionable flag
    """
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # Fast and cheap for classification
        messages=[{"role": "user", "content": CLASSIFICATION_PROMPT.format(text=text)}],
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)
```

## Sentiment Analysis

### NPS (Net Promoter Score)

```
"On a scale of 0-10, how likely are you to recommend us?"

Detractors: 0-6  (unhappy, may churn, may leave negative reviews)
Passives:   7-8  (satisfied but vulnerable to competitors)
Promoters:  9-10 (loyal, will refer others)

NPS = % Promoters - % Detractors
Range: -100 to +100

Benchmarks by industry:
SaaS:        +30 is good, +50 is excellent
E-commerce:  +40 is good, +60 is excellent
Consumer app: +20 is good, +40 is excellent
```

The number alone is useless — the follow-up question matters: "What's the main reason for your score?" That text is where the insights live.

### CSAT (Customer Satisfaction Score)

```
"How satisfied are you with [specific interaction]?"

Measured after specific touchpoints:
- After support ticket resolution
- After onboarding completion
- After feature first use
- After purchase/checkout

Scale: 1-5 or 1-7
CSAT = (positive responses / total responses) × 100

Target: >80% (4-5 on a 5-point scale)
```

### CES (Customer Effort Score)

```
"How easy was it to [complete this task]?"

Scale: 1-7 (1 = very difficult, 7 = very easy)
CES = average score

CES is the best predictor of churn for specific interactions.
Users who give effort score 1-3 are 4x more likely to churn.
Focus on reducing effort at high-friction points.
```

## Theme Extraction

### Finding patterns in qualitative data

1. **Collect**: Aggregate all feedback from the past 30 days
2. **Sample**: If volume is high, take a representative sample (200+ items)
3. **Code**: Tag each item with themes (use consistent labels)
4. **Count**: Rank themes by frequency
5. **Weight**: Multiply frequency by severity and user segment value
6. **Validate**: Cross-reference with behavioral data (do the themes match usage patterns?)

### Theme report format

```markdown
## Feedback Theme Report — [Month Year]

### Data Sources
- Support tickets: 342 (classified)
- App reviews: 89 new
- NPS responses: 156
- Social mentions: 47

### Top Themes (by weighted frequency)

| # | Theme | Count | Severity | Top Segment | Sample Quote |
|---|-------|-------|----------|-------------|--------------|
| 1 | Slow search results | 67 | High | Power users | "Search takes 5+ seconds on large projects" |
| 2 | Missing CSV export | 52 | Medium | Enterprise | "We need to get data into our BI tools" |
| 3 | Confusing permissions | 41 | High | Team admins | "I can't figure out how to restrict access" |
| 4 | Mobile app crashes | 38 | Critical | All | "App crashes when opening dashboard" |
| 5 | Love the new editor | 35 | Praise | Creators | "The new editor is 10x better than before" |

### Churn-Correlated Themes
Themes most mentioned by users who churned in the past 90 days:
1. Slow search (mentioned by 34% of churners)
2. Missing integrations (28%)
3. Pricing concerns (22%)
```

## Feature Request Prioritization

### RICE Framework

Score each request on four dimensions:

```
RICE Score = (Reach × Impact × Confidence) / Effort

Reach:      How many users in the next quarter? (number)
Impact:     How much will it move the metric? (3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal)
Confidence: How sure are we? (100%=high, 80%=medium, 50%=low)
Effort:     Person-months to build (number)

Example:
Feature: CSV Export
Reach: 500 users/quarter (from feedback volume + segment size)
Impact: 2 (high — it's a blocker for enterprise deals)
Confidence: 90% (clear ask, well-understood scope)
Effort: 1 person-month

RICE = (500 × 2 × 0.9) / 1 = 900
```

### Kano Model

Classify features by user expectations:

```
Must-have:      Expected, causes dissatisfaction if missing (bug fixes, basic features)
Performance:    More is better, linear satisfaction (speed, storage, seats)
Delighter:      Unexpected, creates disproportionate satisfaction (surprise features)
Indifferent:    Users don't care either way (skip these)
Reverse:        Some users actively don't want this (risky to build)

Ask two questions per feature:
1. "If we had this feature, how would you feel?" (Like/Expect/Neutral/Tolerate/Dislike)
2. "If we didn't have this feature, how would you feel?" (same scale)

The combination reveals the category.
```

## Feedback-to-Action Pipeline

```
Raw Feedback → Classify → Tag Themes → Quantify → Prioritize → Build → Close Loop

The "Close Loop" step is critical:
- Tell users you heard them: "Thanks for the feedback about X"
- Tell users when you ship it: "You asked for CSV export — it's live"
- This turns frustrated users into advocates
```

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
