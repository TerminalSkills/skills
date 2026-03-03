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
    - roas
---

# Ad Campaign Optimization

Optimize paid advertising across platforms — Google Ads, Meta (Facebook/Instagram), TikTok, LinkedIn, Twitter/X. Improve ROAS, reduce CAC, and scale winning campaigns.

## Campaign Structure

### Account architecture

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
- Use Campaign Budget Optimization (CBO) within each campaign — let the algorithm allocate between ad sets
- Exclude audiences across campaigns (retarget pool excluded from prospecting)
- Keep 3-5 ads per ad set minimum for creative rotation

## Audience Strategy

### Prospecting audiences (cold)

**Lookalike audiences**: Seed from your highest-value customers (purchasers, high LTV), not just all customers. Start with 1% lookalike, expand to 2-5% as you scale.

**Interest-based targeting**: Layer interests with demographics. Instead of "fitness" (too broad), use "fitness AND CrossFit AND 25-44 AND iPhone owners."

**Broad targeting**: On Meta especially, broad targeting (no interests, just age/geo) often outperforms detailed targeting at scale because Meta's algorithm learns faster with more data.

### Retargeting audiences (warm)

Build these exclusion-layered audiences:

```
Tier 1 (hottest): Cart/checkout abandoners, 0-7 days
Tier 2: Product page viewers, 7-14 days
Tier 3: Any website visitor, 14-30 days
Tier 4: Video viewers (50%+), 14-30 days
Tier 5: Social engagers, 30-60 days

Each tier excludes all tiers above it.
Tier 1 gets highest bid/budget (closest to conversion).
```

### Lookalike seed quality

The seed audience quality matters more than size:

```
Best seeds (in order):
1. Top 25% LTV customers (purchases × retention)
2. Repeat purchasers (2+ orders)
3. All purchasers
4. Add-to-cart users
5. High-engagement website visitors (3+ pages, 2+ min)

Minimum seed size: 1,000 users (Meta), 1,000 (Google)
Optimal seed size: 5,000-20,000
```

## Creative Strategy

### Creative DNA — what makes ads work

Break winning ads into components to understand WHY they work:

```
HOOK (first 3 seconds)
├── Pattern interrupt: unexpected visual/sound that stops scrolling
├── Curiosity gap: "I tried X for 30 days, here's what happened"
├── Problem callout: "Tired of [specific pain point]?"
└── Social proof: "500K people already switched to..."

BODY (next 10-20 seconds)
├── Problem amplification: make the pain vivid
├── Solution introduction: show the product solving it
├── Proof elements: testimonials, data, demonstrations
└── Differentiation: why this, not alternatives

CTA (final 3-5 seconds)
├── Direct: "Start your free trial"
├── Urgency: "Offer ends Sunday"
├── Risk reversal: "30-day money-back guarantee"
└── Social: "Join 50,000 happy customers"
```

### Creative formats by platform

**Meta (Facebook/Instagram)**:
- Video: 15-30 sec vertical (9:16), first 3 sec hook, captions mandatory (80% watch muted)
- Carousel: 3-5 cards, each tells a mini-story, swipe = engagement signal
- Static image: bold text, clear product shot, single benefit
- UGC-style: filmed on phone, authentic feel, talking-head + screen recording

**TikTok**:
- Native-feeling video: no polished ads, match organic content style
- Hook in 1-2 seconds (faster than Meta)
- Text overlays, trending sounds, face-to-camera
- Spark Ads: boost organic creator posts as ads

**Google Ads**:
- Search: headline 1 = keyword match, headline 2 = benefit, headline 3 = CTA
- Performance Max: provide diverse assets (images, videos, headlines, descriptions)
- YouTube: 6-sec bumper for awareness, 15-sec skippable for consideration

**LinkedIn**:
- Document ads (PDF carousel): highest organic reach
- Thought leadership ads: boost exec's organic post
- Lead gen forms: auto-fill from profile, higher conversion than landing pages

### Creative testing framework

```
Phase 1: Concept testing (what message works?)
- Test 3-5 different hooks/angles with same CTA
- Budget: $20-50/day per ad, run 3-5 days
- Winner metric: CTR and CPA

Phase 2: Variation testing (optimize the winning concept)
- Test 3-5 executions of winning concept
- Different visuals, presenters, formats (video vs static)
- Budget: $30-75/day per ad, run 5-7 days
- Winner metric: CPA and ROAS

Phase 3: Scale testing (does it hold at volume?)
- Increase budget 20-30% every 3 days on winners
- Monitor frequency: creative fatigue starts at 2.5-3.0 frequency
- Replace fatigued creatives before performance tanks
```

## Bid Strategy and Budget

### Bid strategies by objective

```
Awareness:    CPM bidding, optimize for reach
Consideration: CPC bidding or landing page view optimization
Conversion:   CPA/ROAS bidding (need 50+ conversions/week for learning)
Retention:    Value-based bidding (optimize for LTV)
```

### Budget allocation

Start with 70/20/10 split:
- **70% Prospecting**: New customer acquisition
- **20% Retargeting**: Convert warm audiences
- **10% Testing**: New creatives, audiences, platforms

Scale winners by increasing budget 20-30% every 3 days. Don't double budgets overnight — algorithmic learning resets with dramatic changes.

### The learning phase

Meta and Google need 50 conversion events per ad set per week to exit the learning phase. If you're not hitting this:
- Consolidate ad sets (fewer, larger audiences)
- Move the optimization event up the funnel (optimize for add-to-cart instead of purchase)
- Increase budget to reach the threshold

## Attribution

### Attribution models

```
Last-click:       Simple but undervalues awareness campaigns
First-click:      Values discovery but ignores nurturing
Linear:           Equal credit to all touchpoints
Time-decay:       More credit to recent touchpoints
Position-based:   40% first, 40% last, 20% middle
Data-driven:      ML-based, available at scale (Google, Meta)
```

### Cross-platform attribution challenges

Each platform claims credit for conversions it influenced. A user sees a Meta ad, searches on Google, and buys — both platforms claim the conversion.

Solutions:
- **UTM parameters**: Tag every link, analyze in GA4/Mixpanel
- **Incrementality testing**: Run holdout tests (10% of audience sees no ads)
- **Marketing Mix Modeling (MMM)**: Statistical model using spend + revenue data over time
- **Post-purchase surveys**: "How did you hear about us?" (simple, directionally useful)

## Performance Metrics

```
EFFICIENCY
- CPA (Cost Per Acquisition): $[amount] (target: <1/3 of LTV)
- ROAS (Return on Ad Spend): [x]:1 (target: >3:1 for profitable)
- CTR: [rate]% (benchmark: 1-2% Meta, 3-5% Google Search)
- CPC: $[amount]

QUALITY
- Conversion rate (click → purchase): [rate]%
- Landing page bounce rate: [rate]%
- Creative fatigue (frequency): [number] (refresh at >3.0)
- Quality Score (Google): [1-10]

SCALE
- Daily spend: $[amount]
- CAC trend: [improving/stable/declining]
- Impression share (Google): [rate]%
- Audience saturation: [rate]%
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
