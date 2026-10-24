---
name: go-to-market
description: Expert guidance for go-to-market strategy, helping product teams plan launches, choose distribution channels, design growth loops, define ideal customer profiles, and execute GTM motions. Applies frameworks for product-led growth (PLG), sales-led growth, community-led growth, and viral loops.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags:
  - gtm
  - launch
  - growth
  - distribution
  - acquisition
---

# Go-to-Market — Launch, Distribute, and Grow


## Overview


Go-to-market strategy, helping product teams plan launches, choose distribution channels, design growth loops, define ideal customer profiles, and execute GTM motions. This skill applies frameworks for product-led growth (PLG), sales-led growth, community-led growth, and viral loops.


## Instructions

### GTM Motion Selection

```markdown
## Choose Your GTM Motion

### Product-Led Growth (PLG)
Users discover, try, and buy the product without talking to sales.

**Best for**: Developer tools, productivity software, SMB SaaS (heuristic fit, not a sourced rule)
**Revenue model**: Freemium or free trial → self-serve upgrade
**Key metrics**: Signup → Activation → Conversion rate
**Examples**: Slack, Notion, Figma, Vercel, Stripe

**Requirements**:
- Product delivers value before payment (free tier or trial)
- Low time-to-value (heuristic target: a first "wow" within minutes, not a sourced number)
- Product can self-explain (no complex configuration)
- Viral or network effects (value increases with more users)

### Sales-Led Growth (SLG)
Sales team drives revenue through demos, proposals, and contracts.

**Best for**: Enterprise, complex products, high ACV (the $25K/year threshold is a rule of thumb, not a sourced figure)
**Revenue model**: Annual contracts, custom pricing
**Key metrics**: Pipeline → Demo → Proposal → Close rate
**Examples**: Salesforce, Workday, Snowflake

**Requirements**:
- Complex buying process (multiple stakeholders)
- High contract value justifies sales cost
- Product needs customization or integration

### Community-Led Growth (CLG)
Community creates awareness, education, and trust before purchase.

**Best for**: Developer tools, open-source, creative tools
**Revenue model**: Open-core, enterprise features, support
**Key metrics**: Community members → Contributors → Enterprise leads
**Examples**: Supabase, Vercel, Hashicorp, dbt

**Requirements**:
- Target audience gathers in communities (Discord, GitHub, Reddit)
- Product benefits from shared knowledge
- Team can invest in content and community management

### Hybrid (Most Common at Scale)
Start with one motion, add others as you scale.
Typical evolution: PLG → PLG + Sales → PLG + Sales + Partners
```

### Ideal Customer Profile (ICP)

```markdown
## Define Your Ideal Customer Profile

### ICP Framework
Your ICP is the customer segment where you have the highest win rate,
shortest sales cycle, lowest churn, and highest expansion.

**Company characteristics**:
- Industry: SaaS, fintech, e-commerce, healthcare...
- Size: illustrative only, e.g. 10-50 employees and $1M-$10M ARR; set your own range from your win data
- Stage: Seed, Series A/B, growth stage
- Tech stack: Uses React, AWS, Stripe...
- Pain trigger: a concrete event such as growing the engineering team (e.g. from 5 to 20 engineers)

**User characteristics (within the company)**:
- Role: Engineering Manager, CTO, DevOps Lead
- Seniority: Mid-level decision-maker, not C-suite
- Daily frustration: a specific pain in the user's words (e.g. "I lose hours every week to deployment issues")
- Current solution: Manual scripts, Jenkins

**Behavioral signals (how to identify them)**:
- Hiring for DevOps roles (LinkedIn job posts)
- Growing engineering team (crunchbase, github activity)
- Active in relevant communities (DevOps subreddit, KubeCon)
- Using complementary tools (Kubernetes, Terraform)

### Anti-ICP (Who to Avoid)
- Enterprise with 12-month procurement cycles (if you're early stage)
- Companies with in-house solutions they're invested in
- Price-sensitive customers who will churn at renewal
```

### Launch Playbook

```markdown
## Plan a Product Launch

### Pre-Launch (roughly 2-4 weeks before; heuristic timing)

**Build anticipation**:
- Waitlist landing page (collect emails)
- Teaser content: "We're building something for [audience]"
- Early access for design partners (5-10 customers who co-build with you)
- Seed community channels (Discord, Slack)

**Prepare assets**:
- Product demo video (90 seconds, show the aha moment)
- Launch blog post (problem → solution → how it works → CTA)
- Social media assets (Twitter thread, LinkedIn post, short video)
- Press outreach (if relevant): Product Hunt, tech media, newsletters

**Technical prep**:
- Load testing (can you handle 10x normal traffic?)
- Monitoring and alerting (SigNoz, Sentry)
- Support channels ready (Intercom, Discord)

### Launch Day

**Sequence (a suggested order, a heuristic, not a platform requirement)**:
1. **Start of day**: Product Hunt launch (if applicable; Product Hunt itself says there is no golden launch time and the best day is when you are ready, but its rule of thumb is to schedule for 12:01am Pacific, which gives a full 24 hours on the homepage; check its current launch guide)
2. **Morning**: Blog post goes live, email to waitlist
3. **Mid-morning**: Founder posts on Twitter/LinkedIn (personal > company)
4. **Afternoon**: Engage with comments, questions, feedback
5. **Evening**: Thank early users, share metrics with team

**Amplification**:
- Ask design partners to share their experience
- Respond to every comment (builds trust and algorithm signal)
- Cross-post to relevant subreddits, HN, Indie Hackers
- Newsletter shoutouts (partner with complementary tools)

### Post-Launch (1-4 weeks after)

**Capture momentum**:
- Share launch metrics publicly (transparency builds trust)
- Write "lessons learned" post (content from the launch itself)
- Follow up with every waitlist signup
- Collect testimonials from early users

**Measure**:
- Signups vs goal
- Activation rate (did they actually use it?)
- Source attribution (where did converting users come from?)
- Feedback themes (what do people love? what's confusing?)
```

### Growth Loops

```markdown
## Design Growth Loops

A growth loop is a system where output from one cycle feeds the next.
Unlike funnels (linear), loops compound.

### User-Generated Content Loop
User creates content → Content indexed by Google → New user discovers content → New user creates content
Example: Stack Overflow, Reddit, Pinterest

### Viral Invitation Loop
User gets value → User invites teammate → Teammate gets value → Teammate invites...
Example: Slack, Dropbox, Notion
Key metric: Viral coefficient (invites per user × conversion rate)
Above 1.0 the loop grows by itself (a definition: k is the average number of new users each user brings). Values of 0.3-0.5 as an "assist channel" are a heuristic, not a benchmark.

### Paid Loop (Reinvestment)
Revenue from customer → Reinvest in ads → Acquire new customer → Revenue...
Example: Dollar Shave Club
Key: LTV > CAC with enough margin to reinvest

### Product-Led Sales Loop
Free user adopts product → Usage grows → Hits limit → Sales contacts for upgrade → Revenue → Fund product improvements → More free users
Example: Slack, Figma

### Community Loop
Expert shares knowledge → Community grows → Attracts more experts → More knowledge shared
Example: dbt, Supabase, Vercel
```


## Examples


### Example 1: Creating a gtm motion selection for a new product

**User request:**

```
We're launching a project management tool for remote design teams. Help me create a gtm motion selection.
```

The agent applies the Go To Market framework, asking clarifying questions about target audience, market positioning, and business model. It produces a structured deliverable with specific, actionable recommendations tailored to the design-tools market, including competitive positioning and key metrics to track.

### Example 2: Reviewing and improving an existing GTM strategy

**User request:**

```
Here's our current go-to-market plan for our B2B analytics platform. Review it and identify gaps.
```

The agent analyzes the existing GTM plan against best practices, checks whether the ICP is specific enough, validates channel choices against the target audience, reviews the pricing-value alignment, and identifies missing elements like activation metrics or competitive positioning. It provides specific suggestions with reasoning, not generic advice.


## Guidelines

1. **ICP before channels** — Define exactly who you're targeting before choosing how to reach them; channel strategy follows ICP
2. **One GTM motion first** — Master PLG or SLG before going hybrid; splitting focus early kills both motions
3. **Launch is not a one-day event** — Plan it as a multi-week campaign (a heuristic: about two weeks of anticipation, launch day, then a few weeks of follow-up)
4. **Growth loops > funnels** — Funnels are linear and require constant input; loops compound and create sustainable growth
5. **PLG requires low time-to-value** — If users can't get value in 10 minutes without help, PLG won't work; invest in onboarding
6. **Design partners for credibility** — Launch with a small group of customers (heuristic: 5-10) who helped build the product; their testimonials are useful marketing
7. **Channel-market fit** — Not every channel works for every product; find the 1-2 channels that work and double down before diversifying
8. **Measure by cohort** — Compare launch week cohort retention to organic cohorts; launch traffic often has different quality
