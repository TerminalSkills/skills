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
    - budget
---

# Media Buying

Plan and execute paid media across programmatic, direct, and social channels. Optimize spend allocation, audience targeting, and cross-channel performance.

## Media Planning

### Budget allocation framework

Allocate budget across channels based on funnel stage and historical performance:

```
AWARENESS (top of funnel) — 30-40% of budget
├── Programmatic display (CPM $2-8)
├── YouTube/CTV (CPM $10-25)
├── Podcast sponsorships (CPM $15-30)
└── Influencer partnerships (varies)

CONSIDERATION (middle of funnel) — 30-40%
├── Paid social (Meta, TikTok, LinkedIn)
├── Sponsored content / native ads
├── Retargeting display (CPM $3-12)
└── Search non-brand keywords

CONVERSION (bottom of funnel) — 20-30%
├── Search brand keywords (highest ROAS)
├── Retargeting (cart abandoners, high-intent)
├── Email/SMS (owned, near-zero marginal cost)
└── Affiliate partnerships (CPA-based)
```

### Media plan template

```markdown
## Media Plan — Q2 2026

**Objective**: Generate 500 qualified leads at <$80 CAC
**Total Budget**: $40,000/month
**Duration**: April 1 — June 30

| Channel | Monthly Budget | Model | Target CPA | Expected Volume |
|---------|---------------|-------|------------|-----------------|
| Google Search (brand) | $5,000 | CPC | $25 | 200 leads |
| Google Search (non-brand) | $8,000 | CPC | $65 | 123 leads |
| Meta Ads | $12,000 | CPA | $90 | 133 leads |
| LinkedIn Ads | $8,000 | CPC | $120 | 67 leads |
| Programmatic Display | $4,000 | CPM | N/A (awareness) | 500K impressions |
| Content syndication | $3,000 | CPL | $75 | 40 leads |

**Total expected**: 563 leads, blended CAC $71
```

## Programmatic Advertising

### How RTB works

```
1. User visits a webpage with ad space
2. Publisher's SSP sends bid request to ad exchange (10ms)
3. Ad exchange broadcasts to connected DSPs
4. DSPs evaluate user data + campaign rules → submit bid (50ms)
5. Highest bidder wins, ad is served (~100ms total)

Key players:
- DSP (Demand-Side Platform): Where advertisers buy (DV360, The Trade Desk, Amazon DSP)
- SSP (Supply-Side Platform): Where publishers sell (Google Ad Manager, Magnite)
- DMP (Data Management Platform): Audience data (Oracle, Lotame)
- Ad Exchange: Marketplace connecting DSPs and SSPs
```

### DSP setup

```
Campaign structure in a DSP (e.g., DV360, The Trade Desk):

Advertiser
├── Campaign: Q2 Lead Gen
│   ├── Insertion Order: Awareness - Display
│   │   ├── Line Item: Prospecting - Tech Decision Makers
│   │   │   ├── Creative: 300x250 banner A
│   │   │   ├── Creative: 728x90 banner A
│   │   │   └── Creative: 160x600 banner A
│   │   └── Line Item: Prospecting - IT Managers
│   │       └── [creatives]
│   └── Insertion Order: Retargeting - Display
│       ├── Line Item: Site Visitors 7-14 days
│       └── Line Item: Site Visitors 14-30 days
```

### Targeting layers

```
AUDIENCE TARGETING
├── First-party data (your CRM, site visitors, app users)
├── Third-party data (DMPs — demographics, interests, purchase intent)
├── Contextual (page content, keywords, categories)
├── Lookalike/similar audiences (modeled from your best customers)
└── Intent signals (search history, in-market segments)

INVENTORY TARGETING
├── Domain allowlists (premium publishers only)
├── Domain blocklists (brand safety)
├── App vs. web
├── Viewability threshold (>70% viewable)
└── Ad position (above fold, in-content)

ENVIRONMENTAL
├── Geography (country, state, city, radius)
├── Device (desktop, mobile, tablet, CTV)
├── Time of day / day of week (dayparting)
├── Frequency cap (max impressions per user per day/week)
└── Browser / OS targeting
```

## Buying Models

```
CPM  (Cost Per Mille/1000 impressions)
├── Best for: Awareness, reach campaigns
├── Range: $2-50 depending on audience and format
├── You pay for: Eyeballs (impressions served)
└── Risk: Low engagement → wasted spend

CPC  (Cost Per Click)
├── Best for: Consideration, traffic campaigns
├── Range: $0.50-15 depending on industry
├── You pay for: Clicks to your site
└── Risk: Click fraud, low-quality traffic

CPA  (Cost Per Acquisition)
├── Best for: Performance, conversion campaigns
├── Range: $10-500 depending on product value
├── You pay for: Completed actions (signup, purchase)
└── Risk: Platform optimizes for easy conversions, not quality

CPV  (Cost Per View)
├── Best for: Video campaigns
├── Range: $0.01-0.10 per completed view
├── You pay for: Video views (usually 30 sec or completion)

CPL  (Cost Per Lead)
├── Best for: B2B lead generation
├── Range: $20-200 depending on qualification
├── You pay for: Form submissions, demo requests
```

## Brand Safety

Protect your brand from appearing next to harmful content:

```
Pre-bid safety:
- Domain allowlists/blocklists
- Category exclusions (violence, adult, piracy, misinformation)
- Keyword blocklists (contextual avoidance)
- Brand safety vendors (IAS, DoubleVerify, Oracle Moat)

Post-bid verification:
- Viewability measurement (>50% of pixels visible for >1 sec)
- Invalid traffic (IVT) detection (bot filtering)
- Brand suitability scoring per impression
- Placement reports (review where ads actually appeared)
```

## Cross-Channel Optimization

### Attribution windows

```
Channel              | Click window | View window | Notes
---------------------|-------------|-------------|------
Google Ads           | 30 days     | N/A         | Last-click default
Meta Ads             | 7 days      | 1 day       | Default, was 28 days
TikTok               | 7 days      | 1 day       |
LinkedIn             | 30 days     | 7 days      |
Programmatic Display | 30 days     | 14 days     | Varies by DSP
```

### Budget reallocation framework

Review weekly and reallocate based on marginal CPA:

```
If Channel A CPA < Channel B CPA:
  Move 10-20% of B's budget to A
  Wait 7 days, measure again

If Channel A CPA increases after budget increase:
  You've hit diminishing returns
  Pull back to previous budget level

Golden rule: Move money toward the channel where
the NEXT dollar produces the cheapest conversion,
not where the AVERAGE is cheapest.
```

## Negotiating Direct Deals

For premium placements (homepage takeovers, newsletter sponsorships, podcast ads):

```
Negotiation checklist:
□ Request rate card (then negotiate 20-40% below)
□ Ask for added value (bonus impressions, social posts, newsletter mention)
□ Request performance guarantees (minimum CTR, viewability)
□ Negotiate cancellation terms (7-day out clause)
□ Ask for historical performance data (CTR, conversion rates)
□ Request pixel placement for tracking
□ Get makegood policy in writing (compensation for underdelivery)
```

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
