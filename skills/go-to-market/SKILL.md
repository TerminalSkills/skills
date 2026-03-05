---
name: go-to-market
category: Product Management
tags: [gtm, launch, growth, distribution, acquisition, product-led-growth]
version: 1.0.0
author: terminal-skills
---

# Go-to-Market — Launch, Distribute, and Grow

You are an expert in go-to-market strategy, helping product teams plan launches, choose distribution channels, design growth loops, define ideal customer profiles, and execute GTM motions. You apply frameworks for product-led growth (PLG), sales-led growth, community-led growth, and viral loops.

## Core Capabilities

### GTM Motion Selection

```markdown
## Choose Your GTM Motion

### Product-Led Growth (PLG)
Users discover, try, and buy the product without talking to sales.

**Best for**: Developer tools, productivity software, SMB SaaS
**Revenue model**: Freemium or free trial → self-serve upgrade
**Key metrics**: Signup → Activation → Conversion rate
**Examples**: Slack, Notion, Figma, Vercel, Stripe

**Requirements**:
- Product delivers value before payment (free tier or trial)
- Low time-to-value (< 10 minutes to first "wow")
- Product can self-explain (no complex configuration)
- Viral or network effects (value increases with more users)

### Sales-Led Growth (SLG)
Sales team drives revenue through demos, proposals, and contracts.

**Best for**: Enterprise, complex products, high ACV (>$25K/year)
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
- Size: 10-50 employees, $1M-$10M ARR
- Stage: Seed, Series A/B, growth stage
- Tech stack: Uses React, AWS, Stripe...
- Pain trigger: Scaling from 5 to 20 engineers

**User characteristics (within the company)**:
- Role: Engineering Manager, CTO, DevOps Lead
- Seniority: Mid-level decision-maker, not C-suite
- Daily frustration: "I spend 3 hours/week on deployment issues"
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

### Pre-Launch (4-2 weeks before)

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

**Sequence matters**:
1. **Early morning**: Product Hunt launch (if applicable)
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
If >1.0: exponential growth. If 0.3-0.5: strong assist channel.

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

## Best Practices

1. **ICP before channels** — Define exactly who you're targeting before choosing how to reach them; channel strategy follows ICP
2. **One GTM motion first** — Master PLG or SLG before going hybrid; splitting focus early kills both motions
3. **Launch is not a one-day event** — A launch is a 6-week campaign: 2 weeks building anticipation, launch day, 3 weeks of follow-up
4. **Growth loops > funnels** — Funnels are linear and require constant input; loops compound and create sustainable growth
5. **PLG requires low time-to-value** — If users can't get value in 10 minutes without help, PLG won't work; invest in onboarding
6. **Design partners for credibility** — Launch with 5-10 customers who helped build the product; their testimonials are your best marketing
7. **Channel-market fit** — Not every channel works for every product; find the 1-2 channels that work and double down before diversifying
8. **Measure by cohort** — Compare launch week cohort retention to organic cohorts; launch traffic often has different quality
