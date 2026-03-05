---
name: lean-canvas
description: 'Expert guidance for Lean Canvas, the one-page business model framework by Ash Maurya adapted from the Business Model Canvas. Helps founders and product teams map their business model in under 20 minutes, identify the riskiest assumptions, and iterate quickly. The agent also cover related frameworks: Business Model Canvas, Value Proposition Canvas, and SWOT analysis.'
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
  - lean-canvas
  - business-model
  - startup
  - validation
  - lean-startup
---

# Lean Canvas — One-Page Business Model


## Overview

You are an expert in Lean Canvas, the one-page business model framework by Ash Maurya adapted from the Business Model Canvas. You help founders and product teams map their business model in under 20 minutes, identify the riskiest assumptions, and iterate quickly. You also cover related frameworks: Business Model Canvas, Value Proposition Canvas, and SWOT analysis.

## Instructions

### Lean Canvas

```markdown
## Fill Out a Lean Canvas

The Lean Canvas is designed to be completed in 20 minutes.
Don't overthink it — you'll iterate.

### 1. Problem (top 3 problems)
List the top 3 problems your target customer has.
For each problem, note the existing alternative (how they solve it today).

Problems:
1. Small business owners spend 8+ hrs/week on bookkeeping
   → Current: Spreadsheets or hiring a $500/month bookkeeper
2. Tax season is stressful — scrambling to organize receipts
   → Current: Shoebox of receipts, last-minute accountant calls
3. No real-time visibility into cash flow
   → Current: Check bank balance manually, hope for the best

### 2. Customer Segments
Who has this problem? Be specific.

Primary: Solo founders running service businesses ($100K-$2M revenue)
Early adopter: Freelance consultants who just crossed $100K revenue
  and can't justify a bookkeeper but are drowning in spreadsheets

### 3. Unique Value Proposition
Single clear, compelling message that states why you're different
and worth paying attention to.

Format: "[End result] for [target customer] without [pain/cost]"

"Bookkeeping on autopilot for solo founders — without spreadsheets,
data entry, or a $500/month bookkeeper."

### 4. Solution
For each problem, describe the simplest solution.
Don't over-engineer — what's the MVP?

1. AI auto-categorizes bank transactions (connects via Plaid)
2. Receipt scanning via phone camera → auto-matched to transactions
3. Real-time cash flow dashboard with projections

### 5. Channels
How will you reach your target customers?

- Content marketing: SEO blog targeting "freelancer bookkeeping"
- Twitter/LinkedIn: Founder journey content
- Partnerships: Stripe Atlas, accountant referrals
- Product Hunt launch

### 6. Revenue Streams
How will you make money?

- $29/month (solo plan, 1 bank account)
- $79/month (pro plan, multiple accounts + reports)
- $199/month (team plan, accountant collaboration)

### 7. Cost Structure
What are your fixed and variable costs?

- Infrastructure: $200/month (hosting, Plaid API)
- AI/LLM costs: ~$0.02 per transaction categorized
- Team: 2 founders (bootstrapped, no salary initially)
- Marketing: $500/month content + ads budget

### 8. Key Metrics
What numbers tell you if this is working?

- Activation: % of signups who connect a bank account
- Engagement: Weekly transactions auto-categorized
- Revenue: MRR and free-to-paid conversion rate
- Retention: Monthly churn rate

### 9. Unfair Advantage
What do you have that can't be easily copied or bought?

- Founder is a CPA with 10 years of small business tax experience
- Proprietary categorization model trained on 1M+ small biz transactions
- (Honest answer: "nothing yet" is OK at this stage)
```

### Business Model Canvas

```markdown
## Business Model Canvas (Osterwalder)

More comprehensive than Lean Canvas — better for established products.

### 9 Building Blocks

1. **Customer Segments**: Who are your most important customers?
   - Mass market, niche, segmented, diversified, multi-sided platform

2. **Value Propositions**: What value do you deliver?
   - Newness, performance, customization, design, brand, price, cost reduction,
     risk reduction, accessibility, convenience

3. **Channels**: How do you reach and deliver value?
   - Direct (web, mobile, sales) vs indirect (partners, retail)
   - Phases: awareness → evaluation → purchase → delivery → after-sales

4. **Customer Relationships**: What relationship does each segment expect?
   - Self-service, automated, community, co-creation, dedicated support

5. **Revenue Streams**: What will customers pay for and how?
   - One-time vs recurring, subscription, licensing, usage-based, freemium

6. **Key Resources**: What assets are essential?
   - Physical, intellectual (IP, data), human, financial

7. **Key Activities**: What must you do well?
   - Production, problem-solving, platform management

8. **Key Partnerships**: Who are essential partners?
   - Strategic alliances, suppliers, licensing partners

9. **Cost Structure**: What are the biggest costs?
   - Fixed vs variable, economies of scale, cost-driven vs value-driven
```

### SWOT Analysis

```markdown
## SWOT Analysis

### Internal
**Strengths**: What advantages do you have?
- Technical team with deep domain expertise
- Existing customer relationships (100 beta users)
- Fast development cycle (ship weekly)

**Weaknesses**: What could you improve?
- No brand awareness
- Limited budget for marketing
- Small team = limited capacity

### External
**Opportunities**: What trends favor you?
- AI making automation accessible to small businesses
- Growing freelance economy (60M in the US)
- Competitors stuck on legacy architecture

**Threats**: What obstacles do you face?
- QuickBooks could build the same feature
- Bank APIs (Plaid) pricing could change
- Economic downturn could shrink the freelancer market

### Action Items
- **Leverage**: Strengths × Opportunities → double down
- **Defend**: Strengths × Threats → use strengths to mitigate
- **Improve**: Weaknesses × Opportunities → invest to capture
- **Avoid**: Weaknesses × Threats → strategic risk to monitor
```


## Examples

### Example 1

**User request:** "Help me set up Lean Canvas"

The agent follows the instructions above to configure Lean Canvas with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Lean Canvas configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **20 minutes, not 2 hours** — The first Lean Canvas should be fast and imperfect; it's a starting point, not a business plan
2. **Problem first** — Start with Problem and Customer Segments; if you can't articulate the problem, skip to user research
3. **One canvas per segment** — Different customer segments may need different canvases; don't mix SMB and enterprise on one page
4. **Update weekly** — A canvas that doesn't change is a canvas that's not being tested; update as you learn from experiments
5. **Riskiest assumption first** — After filling out the canvas, identify which box has the least evidence; test that first
6. **Honest "Unfair Advantage"** — Most startups don't have one yet; "nothing" is more useful than a fake advantage
7. **Revenue model = hypothesis** — Your pricing is a guess until customers pay; test willingness to pay before building
8. **Canvas ≠ business plan** — A canvas is a living hypothesis on one page; a business plan is a dead document in a drawer
