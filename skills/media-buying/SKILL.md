---
name: media-buying
description: >-
  Plan and execute media buying across digital and traditional channels —
  programmatic advertising, DSP platforms, direct buys, and budget allocation.
  Use when tasks involve programmatic ad buying, real-time bidding (RTB),
  demand-side platform setup, media plan creation, CPM/CPC/CPA optimization,
  cross-channel budget allocation, audience segmentation for paid media,
  or negotiating direct ad placements.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags:
    - media-buying
    - programmatic
    - advertising
    - dsp
    - rtb
---

# Media Buying

## Overview

Plan and execute paid media across programmatic, direct, and social channels. Optimize spend allocation, audience targeting, and cross-channel performance.

## Instructions

### Budget allocation framework

Allocate budget across channels based on funnel stage:

```
AWARENESS (top of funnel) — 30-40% of budget
├── Programmatic display (CPM $2-8)
├── YouTube/CTV (CPM $10-25)
├── Podcast sponsorships (CPM $15-30)
└── Influencer partnerships

CONSIDERATION (middle) — 30-40%
├── Paid social (Meta, TikTok, LinkedIn)
├── Sponsored content / native ads
├── Retargeting display (CPM $3-12)
└── Search non-brand keywords

CONVERSION (bottom) — 20-30%
├── Search brand keywords (highest ROAS)
├── Retargeting (cart abandoners, high-intent)
├── Email/SMS (near-zero marginal cost)
└── Affiliate partnerships (CPA-based)
```

### Media plan template

```markdown
## Media Plan — Q2 2026
**Objective**: Generate 500 qualified leads at <$80 CAC
**Total Budget**: $40,000/month

| Channel | Monthly Budget | Model | Target CPA | Expected Volume |
|---------|---------------|-------|------------|-----------------|
| Google Search (brand) | $5,000 | CPC | $25 | 200 leads |
| Google Search (non-brand) | $8,000 | CPC | $65 | 123 leads |
| Meta Ads | $12,000 | CPA | $90 | 133 leads |
| LinkedIn Ads | $8,000 | CPC | $120 | 67 leads |
| Programmatic Display | $4,000 | CPM | N/A | 500K impressions |
| Content syndication | $3,000 | CPL | $75 | 40 leads |
```

### Programmatic advertising (RTB)

```
1. User visits a webpage with ad space
2. Publisher's SSP sends bid request to ad exchange (10ms)
3. Ad exchange broadcasts to connected DSPs
4. DSPs evaluate user data + campaign rules → submit bid (50ms)
5. Highest bidder wins, ad is served (~100ms total)

Key players:
- DSP: Where advertisers buy (DV360, The Trade Desk, Amazon DSP)
- SSP: Where publishers sell (Google Ad Manager, Magnite)
- DMP: Audience data (Oracle, Lotame)
```

**DSP campaign structure**: Advertiser → Campaign → Insertion Order (by objective) → Line Item (by audience) → Creatives.

### Targeting layers

```
AUDIENCE: First-party data, third-party (DMP), contextual, lookalike, intent signals
INVENTORY: Domain allowlists/blocklists, app vs web, viewability (>70%), ad position
ENVIRONMENTAL: Geography, device, dayparting, frequency caps, browser/OS
```

### Buying models

```
CPM  (Cost Per 1000 impressions): Awareness/reach. Range: $2-50
CPC  (Cost Per Click): Consideration/traffic. Range: $0.50-15
CPA  (Cost Per Acquisition): Performance/conversion. Range: $10-500
CPV  (Cost Per View): Video campaigns. Range: $0.01-0.10
CPL  (Cost Per Lead): B2B lead gen. Range: $20-200
```

### Brand safety

```
Pre-bid: Domain allow/blocklists, category exclusions, keyword blocklists,
         brand safety vendors (IAS, DoubleVerify, Oracle Moat)
Post-bid: Viewability measurement (>50% pixels, >1 sec), IVT detection,
          brand suitability scoring, placement reports
```

### Cross-channel optimization

**Attribution windows**: Google 30-day click, Meta 7-day click / 1-day view, LinkedIn 30-day click / 7-day view, Programmatic 30-day click / 14-day view.

**Budget reallocation**: Review weekly. Move 10-20% from high-CPA to low-CPA channels, wait 7 days, remeasure. If CPA increases after budget increase, you've hit diminishing returns — pull back. Optimize for marginal CPA, not average CPA.

### Negotiating direct deals

For premium placements (homepage takeovers, newsletter sponsorships, podcast ads): request rate card and negotiate 20-40% below, ask for added value (bonus impressions, social posts), request performance guarantees and historical data, negotiate cancellation terms, get makegood policy in writing.

## Examples

### Create a programmatic media plan

```prompt
We're launching a B2B SaaS product targeting CTOs and VP Engineering at companies with 100-1000 employees. Budget is $25,000/month for programmatic display and video. Create a full media plan using DV360 — campaign structure, audience segments (first-party site visitors + third-party intent data), creative specs, frequency caps, and brand safety settings. Include a 4-week optimization timeline.
```

### Optimize cross-channel budget allocation

```prompt
We run ads across Google Search ($15K/mo), Meta ($20K/mo), LinkedIn ($10K/mo), and programmatic display ($5K/mo). Our blended CPA is $95 but varies wildly by channel. Analyze the marginal CPA for each channel at different spend levels and recommend a reallocation to reduce blended CPA by 20%. Include the data I need to collect and the rebalancing schedule.
```

### Set up brand safety for programmatic campaigns

```prompt
We're a financial services company running programmatic display across 500+ publisher sites. Set up comprehensive brand safety — domain allowlist of premium financial and business publishers, category exclusions, keyword blocklists specific to our industry, and viewability thresholds. Include a weekly audit process to catch new placement issues.
```

## Guidelines

- Always set up brand safety (allowlists, blocklists, verification vendors) before launching programmatic campaigns
- Optimize for marginal CPA, not average CPA — the next dollar should go to the cheapest conversion
- Never reallocate more than 20% of a channel's budget in a single week to avoid resetting algorithmic learning
- Use frequency caps to prevent ad fatigue (typically 3-5 impressions per user per day for display)
- Always request historical performance data and makegood policies before signing direct deals
- Review placement reports weekly to catch brand safety issues early
- Include viewability thresholds (>70%) in all programmatic line items
