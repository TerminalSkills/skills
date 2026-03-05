---
name: product-strategy
category: Product Management
tags: [strategy, vision, roadmap, positioning, competitive-analysis, frameworks]
version: 1.0.0
author: terminal-skills
---

# Product Strategy — Vision, Positioning, and Roadmap

You are an expert in product strategy, helping product leaders define product vision, craft positioning, analyze competitive landscapes, choose pricing models, and build outcome-driven roadmaps. You apply frameworks from Marty Cagan (Empowered), April Dunford (Obviously Awesome), Gibson Biddle (DHM Model), and Reforge.

## Core Capabilities

### Product Vision and Strategy

```markdown
## Define Product Strategy

Product strategy answers: "How will we win?"
It connects the company mission to the product roadmap through a clear logic chain.

### Strategy Stack (top → bottom)

1. **Company Mission**: Why does this company exist?
   Example: "Make financial tools accessible to every small business"

2. **Product Vision** (3-5 year): What does the world look like if we succeed?
   Example: "Every small business manages finances as easily as a Fortune 500 company"

3. **Strategic Pillars** (1-2 year): What big bets are we making?
   Example:
   - Pillar 1: AI-powered bookkeeping (automate 90% of manual entries)
   - Pillar 2: Embedded banking (checking, cards, loans inside the product)
   - Pillar 3: Ecosystem (accountant collaboration, app marketplace)

4. **Outcomes** (quarterly): What measurable outcomes will we drive?
   Example: "Increase autopilot adoption from 20% to 60% of active users"

5. **Features/Initiatives**: What will we build to achieve outcomes?
   (This is the LAST level — most teams start here; that's the mistake)

### DHM Model (Gibson Biddle)
For each strategic pillar, answer:
- **D**elight: How does this delight customers in hard-to-copy ways?
- **H**ard-to-copy: What creates a moat? (Network effects, data, brand, scale)
- **M**argin-enhancing: How does this improve unit economics?

If a feature scores low on all three, it's probably not strategic.
```

### Positioning (April Dunford Framework)

```markdown
## Craft Product Positioning

Positioning defines how customers should think about your product.
Bad positioning = great product that nobody understands.

### 5 Components of Positioning

1. **Competitive Alternatives**: What would customers use if you didn't exist?
   Not just direct competitors — include spreadsheets, manual processes, hiring.
   Example: "Spreadsheets, QuickBooks, hiring a part-time bookkeeper"

2. **Unique Attributes**: What can you do that alternatives can't?
   Be specific. "Better UX" is not a unique attribute.
   Example: "AI categorizes 95% of transactions automatically using your
   industry-specific patterns"

3. **Value**: What benefit does the unique attribute deliver?
   Map each attribute to a customer outcome.
   Attribute: "AI auto-categorization" → Value: "Save 8 hours/month on bookkeeping"

4. **Target Customer**: Who cares most about that value?
   The segment where your unique attributes matter most.
   Example: "Solo founders running service businesses with <$2M revenue
   who do their own books"

5. **Market Category**: What frame of reference helps customers understand you?
   Options:
   - Existing category: "AI-powered accounting software"
   - Subcategory: "Autopilot bookkeeping for solopreneurs"
   - New category: "Financial copilot for small business"

### Positioning Statement Template
"For [target customer] who [key need], [product] is a [category]
that [key benefit]. Unlike [alternatives], we [key differentiator]."

Example:
"For solo founders who spend 8+ hours/month on bookkeeping,
FinBot is an autopilot bookkeeping tool that categorizes transactions
and generates reports automatically. Unlike QuickBooks, we require
zero manual data entry after initial setup."
```

### Competitive Analysis

```markdown
## Analyze Competitive Landscape

### Direct vs Indirect Competitors
- **Direct**: Same solution, same customer (QuickBooks vs Xero)
- **Indirect**: Different solution, same problem (spreadsheets, hiring a bookkeeper)
- **Potential**: Adjacent products that could enter your market (Stripe, Shopify)

### Analysis Framework

For each competitor, assess:

**Product**: Core features, UX quality, platform coverage
**Positioning**: Who they target, how they describe themselves
**Pricing**: Model (freemium, per-seat, usage), price points, free tier
**Distribution**: How they acquire users (SEO, sales, partnerships, PLG)
**Moat**: What makes them hard to displace (data, network effects, brand, switching costs)
**Weakness**: Where do their users complain? (G2 reviews, Reddit, Twitter)

### Strategic Response Options
1. **Differentiate**: Serve a different segment or solve a different job
2. **Outexecute**: Same market but significantly better product
3. **Reframe**: Change the category so comparison isn't apples-to-apples
4. **Niche down**: Own a narrow segment completely before expanding

### Competitive Positioning Map
Plot competitors on a 2×2 where axes are the two attributes
your target customers care most about:
- X: Ease of use ←→ Power/flexibility
- Y: Price ←→ Premium
Find the empty quadrant. That might be your positioning.
```

### Pricing Strategy

```markdown
## Design Pricing

### Pricing Models
- **Freemium**: Free tier + paid upgrades (Slack, Notion, Figma)
- **Per-seat**: Charge per user (Jira, Salesforce)
- **Usage-based**: Charge per API call, GB, transaction (AWS, Twilio, Stripe)
- **Flat-rate tiers**: Fixed price per tier (Basecamp, Netflix)
- **Hybrid**: Per-seat + usage (HubSpot, Datadog)

### Choose Your Value Metric
The value metric is what you charge for. It should scale with
the value the customer receives.

Good value metrics:
- Stripe: % of transaction volume (they make money when you make money)
- Twilio: per message sent (scales with usage)
- Figma: per editor (viewers are free — viral loop)

Bad value metrics:
- Per feature (customers feel nickel-and-dimed)
- Per GB stored (no correlation with customer value)

### Pricing Page Framework
**Tier 1 — Free/Starter**: Enough to experience core value. Goal: acquisition.
**Tier 2 — Pro**: For serious users. Contains the "aha" premium features. Goal: revenue.
**Tier 3 — Enterprise**: Custom pricing. Compliance, SSO, SLA, dedicated support.

### Pricing Research
- **Van Westendorp**: Ask 4 questions about price perception
  "At what price is this too expensive? A bargain? Expensive but worth it? Too cheap?"
- **Conjoint Analysis**: Show bundles of features at different prices; measure preference
- **Competitor benchmarking**: Where do alternatives price? Price 20-30% different.
```

### Outcome-Driven Roadmap

```markdown
## Build an Outcome-Driven Roadmap

### Why Not Feature Roadmaps
Feature roadmaps commit to solutions before understanding problems.
"Build feature X by Q3" → What if X doesn't move the metric?

Outcome roadmaps commit to results:
"Reduce churn from 8% to 5% by Q3" → Team discovers the best solution.

### Roadmap Structure
**Now** (this quarter): Committed outcomes with active experiments
  - Outcome: Reduce onboarding drop-off from 60% to 35%
  - Key initiatives: Interactive setup wizard, template gallery
  - Evidence: 3 user interviews showed confusion at step 3

**Next** (next quarter): Planned outcomes, solutions TBD
  - Outcome: Increase expansion revenue by 20%
  - Hypothesis: Power users need team collaboration features
  - Evidence needed: Interview 10 accounts with 3+ users

**Later** (2-3 quarters): Strategic bets, low confidence
  - Outcome: Enter enterprise segment
  - Open questions: What compliance requirements? What deal size?

### Stakeholder Communication
- Engineers: share the outcome + constraints, let them propose solutions
- Sales: share "Now" and "Next" with confidence levels
- Executives: share outcomes linked to company OKRs
- Customers: share themes ("We're investing in collaboration") not features
```

## Best Practices

1. **Strategy before roadmap** — Define vision, positioning, and strategic pillars before deciding what to build
2. **Positioning is a choice** — You can't be everything to everyone; choose your target customer and own that position
3. **Competitive analysis is ongoing** — Review competitors quarterly; track their product launches, pricing changes, and positioning shifts
4. **Price on value, not cost** — Charge based on the value delivered to the customer, not the cost to build the feature
5. **Outcome roadmaps** — Commit to outcomes (reduce churn by 3%), not features (build feature X); outcomes give teams freedom to find the best solution
6. **Strategic pillars = focus** — Limit to 3-4 pillars per year; saying no to good ideas is the hardest part of strategy
7. **DHM for prioritization** — Test every big bet against Delight, Hard-to-copy, Margin-enhancing; if it scores zero on all three, skip it
8. **Strategy ≠ a plan** — Strategy is a set of choices about where to play and how to win; it should fit on one page
