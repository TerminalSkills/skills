---
name: ad-campaign-optimization
description: >-
  Optimize paid advertising campaigns across Google Ads, Meta, TikTok, LinkedIn,
  and other platforms. Use when tasks involve bid optimization, audience targeting,
  creative testing, ROAS improvement, attribution modeling, budget allocation,
  campaign structure, retargeting strategies, lookalike audiences, or reducing
  customer acquisition cost. Covers multi-platform campaign management and
  creative performance analysis.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags:
    - advertising
    - ppc
    - meta-ads
    - google-ads
    - campaign
---

# Ad Campaign Optimization

## Overview

Optimize paid advertising across platforms — Google Ads, Meta (Facebook/Instagram), TikTok, LinkedIn, Twitter/X. Improve ROAS, reduce CAC, and scale winning campaigns.

## Instructions

### Campaign structure

Organize campaigns by objective, then ad sets by audience, then ads by creative variant:

```
Account
├── Campaign: Prospecting (Cold)
│   ├── Ad Set: Lookalike 1% (interest-based seed)
│   │   ├── Ad: Video A — problem/solution hook
│   │   ├── Ad: Video B — testimonial hook
│   │   └── Ad: Static C — benefit-focused
│   ├── Ad Set: Interest targeting (competitor audiences)
│   │   ├── Ad: Video A
│   │   └── Ad: Static D — data-driven hook
│   └── Ad Set: Broad targeting (algorithm-optimized)
│       ├── Ad: Video A
│       └── Ad: Video E — UGC style
│
├── Campaign: Retargeting (Warm)
│   ├── Ad Set: Website visitors 7-30 days
│   ├── Ad Set: Video viewers 50%+ (14 days)
│   └── Ad Set: Cart abandoners (7 days)
│
└── Campaign: Retention (Existing customers)
    ├── Ad Set: Upsell (purchased product A)
    └── Ad Set: Win-back (inactive 60+ days)
```

**Key principles:**
- Separate cold, warm, and hot audiences into different campaigns (different budgets, different optimization)
- Use Campaign Budget Optimization (CBO) within each campaign
- Exclude audiences across campaigns (retarget pool excluded from prospecting)
- Keep 3-5 ads per ad set minimum for creative rotation

### Audience strategy

**Prospecting (cold):**
- Lookalike audiences: Seed from highest-value customers, start with 1% lookalike, expand to 2-5% as you scale
- Interest-based: Layer interests with demographics. Instead of "fitness" (too broad), use "fitness AND CrossFit AND 25-44"
- Broad targeting: On Meta, broad targeting often outperforms detailed targeting at scale

**Retargeting (warm)** — build exclusion-layered audiences:

```
Tier 1 (hottest): Cart/checkout abandoners, 0-7 days
Tier 2: Product page viewers, 7-14 days
Tier 3: Any website visitor, 14-30 days
Tier 4: Video viewers (50%+), 14-30 days
Tier 5: Social engagers, 30-60 days

Each tier excludes all tiers above it.
Tier 1 gets highest bid/budget (closest to conversion).
```

**Lookalike seed quality** (in order): Top 25% LTV customers > Repeat purchasers > All purchasers > Add-to-cart users > High-engagement visitors. Minimum seed: 1,000 users.

### Creative strategy

Break winning ads into components:

```
HOOK (first 3 seconds)
├── Pattern interrupt: unexpected visual/sound
├── Curiosity gap: "I tried X for 30 days..."
├── Problem callout: "Tired of [specific pain]?"
└── Social proof: "500K people already switched"

BODY (next 10-20 seconds)
├── Problem amplification → Solution introduction
├── Proof elements: testimonials, data, demos
└── Differentiation: why this, not alternatives

CTA (final 3-5 seconds)
├── Direct: "Start your free trial"
├── Urgency or risk reversal
└── Social: "Join 50,000 happy customers"
```

**Formats by platform:**
- **Meta**: 15-30s vertical video, carousels (3-5 cards), static images, UGC-style
- **TikTok**: Native-feeling video, 1-2s hook, text overlays, Spark Ads
- **Google**: Search (headline = keyword match + benefit + CTA), Performance Max (diverse assets), YouTube bumpers
- **LinkedIn**: Document ads, thought leadership ads, lead gen forms

**Creative testing:**
- Phase 1: Test 3-5 hooks/angles, $20-50/day each, 3-5 days → winner by CTR and CPA
- Phase 2: Test 3-5 variations of winner, $30-75/day, 5-7 days → winner by CPA and ROAS
- Phase 3: Scale winners 20-30%/day, refresh at frequency >3.0

### Bid strategy and budget

```
Awareness:    CPM bidding, optimize for reach
Consideration: CPC bidding or landing page view optimization
Conversion:   CPA/ROAS bidding (need 50+ conversions/week)
Retention:    Value-based bidding (optimize for LTV)
```

Start with 70/20/10 split: 70% prospecting, 20% retargeting, 10% testing. Scale winners by increasing budget 20-30% every 3 days.

Meta and Google need 50 conversion events per ad set per week to exit the learning phase. If not hitting this: consolidate ad sets, move optimization event up the funnel, or increase budget.

### Attribution

```
Last-click:       Simple but undervalues awareness
First-click:      Values discovery but ignores nurturing
Time-decay:       More credit to recent touchpoints
Data-driven:      ML-based, available at scale (Google, Meta)
```

Cross-platform solutions: UTM parameters (tag every link), incrementality testing (10% holdout), Marketing Mix Modeling (statistical model), post-purchase surveys.

### Performance metrics

```
EFFICIENCY: CPA (<1/3 of LTV), ROAS (>3:1), CTR (1-2% Meta, 3-5% Google Search), CPC
QUALITY: Conversion rate, bounce rate, frequency (<3.0), Quality Score (Google 1-10)
SCALE: Daily spend, CAC trend, impression share, audience saturation
```

## Examples

### Set up a Meta Ads campaign for an e-commerce launch

```prompt
We're launching a DTC skincare brand with $3,000/month ad budget on Meta. Our product is $45, target audience is women 25-40 interested in clean beauty. Set up the full campaign structure — prospecting, retargeting, creative strategy, and bid optimization. Include audience definitions, exclusion rules, and creative brief for the first 5 ads.
```

### Diagnose and fix a declining ROAS

```prompt
Our Google Ads ROAS dropped from 4.2x to 2.1x over the past month. Monthly spend is $15,000 across Search and Performance Max campaigns. Analyze potential causes (creative fatigue, audience saturation, competition, seasonality) and provide a 2-week recovery plan with specific actions for each campaign type.
```

### Build a multi-platform attribution model

```prompt
We run ads on Meta, Google, TikTok, and LinkedIn with $50K/month total spend. Each platform reports different ROAS numbers and we suspect double-counting. Design an attribution framework that gives us a single source of truth for cross-platform performance. Include UTM structure, holdout testing plan, and weekly reporting template.
```

## Guidelines

- Always separate cold, warm, and hot audiences into different campaigns with independent budgets
- Never double budgets overnight — algorithmic learning resets with dramatic changes
- Ensure every ad link has UTM parameters before launch
- Monitor creative frequency and replace fatigued ads before performance tanks (frequency >3.0)
- Run incrementality tests quarterly to validate platform-reported attribution
- Start with proven formats (UGC video, testimonial) before testing experimental creative
- Keep at least 3 ads per ad set for rotation and learning
