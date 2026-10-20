---
name: lean-canvas
description: 'Maps a startup business model on one page with the Lean Canvas, the framework Ash Maurya adapted from Osterwalder''s Business Model Canvas. Use when a founder or product team asks for a lean canvas, a one-page business model, the riskiest assumptions in a business, or a business model canvas or SWOT analysis. Covers the nine Lean Canvas boxes, the nine Business Model Canvas building blocks, and SWOT.'
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.1.0
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


Lean Canvas, the one-page business model framework by Ash Maurya adapted from the Business Model Canvas. Helps founders and product teams map their business model in under 20 minutes, identify the riskiest assumptions, and iterate quickly. This skill also covers related frameworks: Business Model Canvas and SWOT analysis.


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

A common shape (a convention, not Maurya's wording): "[End result] for [target customer] without [pain/cost]". Maurya's current definition on leanstack.com: the single, clear message that turns a visitor into a customer.

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
- Growing freelance economy (cite a current, sourced figure, e.g. from Upwork's Freelance Forward research)
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


### Example 1: Creating a lean canvas for a new product

**User request:**

```
We're launching a project management tool for remote design teams. Help me create a lean canvas.
```

**Result (abbreviated canvas, first pass):**

```
PROBLEM              CUSTOMER SEGMENTS       UNIQUE VALUE PROPOSITION
1. Design reviews    Design leads at         Shared review boards that
   drift across        remote teams of 8-30    end feedback-by-email
   email threads     EARLY ADOPTERS:           for distributed design teams
   Alt: email, Figma   agencies with 3+
   comments            concurrent client
2. Handoffs lose     projects
   context              
   Alt: spreadsheets   KEY METRICS           UNFAIR ADVANTAGE
3. No view of open   Reviews closed/week     Nothing yet (say so)
   approvals            Activated teams
   Alt: status calls   (3 reviews in 14d)

SOLUTION             CHANNELS                REVENUE STREAMS
- Review board per   Design community        $25 per seat/month
  project             newsletters,           Agency plan: custom
- Approval state      Figma plugin listing
  on each frame       Referrals from         COST STRUCTURE
- Notification        agency owners          Hosting, one engineer,
  digest                                     $1,500/month content
```

Riskiest assumption: the per-seat price. Test willingness to pay with five paid pilots before building the agency plan.

### Example 2: Reviewing and improving an existing lean canvas

**User request:**

```
Here's our lean canvas for a developer documentation tool. Review it and identify the riskiest assumptions.
```

**Result (review notes):**

```
RISKIEST ASSUMPTIONS (least evidence first)
1. Revenue: "$49/month per team" has no tested price.
   Test: show the price on a landing page and count sign-up intents for 2 weeks.
2. Problem: "Docs go stale because engineers forget to update them"
   has no interview evidence. Test: ask 10 engineering leads when their
   last docs fix happened and what triggered it.
3. Channel: "SEO for API tutorials" depends on keyword volume you have
   not checked. Test: pull search volume for 20 queries before writing content.

MISSING
- Existing alternatives for problem 2 (Notion, Docusaurus, plain Markdown in the repo)
- Early adopter segment: the canvas says "all developers"; name one team type

KEEP AS IS
- Unfair advantage left as "nothing yet" (honest)
- Key metric: activation = first docs page published from a git push
```


## Guidelines

1. **20 minutes, not 2 hours** — The first Lean Canvas should be fast and imperfect; it's a starting point, not a business plan
2. **Problem first** — Start with Problem and Customer Segments; if you can't articulate the problem, skip to user research
3. **One canvas per segment** — Different customer segments may need different canvases; don't mix SMB and enterprise on one page
4. **Update weekly** — A canvas that doesn't change is a canvas that's not being tested; update as you learn from experiments
5. **Riskiest assumption first** — After filling out the canvas, identify which box has the least evidence; test that first
6. **Honest "Unfair Advantage"** — Most startups don't have one yet; "nothing" is more useful than a fake advantage
7. **Revenue model = hypothesis** — Your pricing is a guess until customers pay; test willingness to pay before building
8. **Canvas ≠ business plan** — A canvas is a living hypothesis on one page; a business plan is a dead document in a drawer
