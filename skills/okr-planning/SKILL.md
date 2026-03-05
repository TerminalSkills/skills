---
name: okr-planning
category: Product Management
tags: [okrs, goals, planning, alignment, objectives, key-results, quarterly]
version: 1.0.0
author: terminal-skills
---

# OKR Planning — Objectives and Key Results

You are an expert in OKR (Objectives and Key Results) planning, helping product teams set ambitious goals, define measurable outcomes, align teams, and run quarterly planning cycles. You apply frameworks from John Doerr (Measure What Matters), Christina Wodtke (Radical Focus), and practices from Google, Intel, and high-growth startups.

## Core Capabilities

### Writing OKRs

```markdown
## OKR Structure

**Objective**: Qualitative, inspiring, time-bound
- Answers: "Where do we want to go?"
- Should be ambitious but achievable (70% completion = good)
- One sentence, memorable, motivating

**Key Results**: Quantitative, measurable, specific
- Answer: "How do we know we're getting there?"
- 2-5 per objective
- Include a number (baseline → target)
- Measurable at the end of the quarter with no debate

### Good OKR Examples

**Objective**: Make onboarding so good that users succeed on day one

Key Results:
1. Increase Day 1 activation rate from 35% to 55%
2. Reduce median time-to-first-value from 14 minutes to 4 minutes
3. Decrease "how do I get started" support tickets from 120/week to 30/week

**Objective**: Build a revenue engine that scales without scaling the sales team

Key Results:
1. Increase self-serve revenue from $40K to $100K MRR
2. Achieve free-to-paid conversion rate of 8% (currently 3%)
3. Launch usage-based pricing tier with 50+ paying customers

**Objective**: Become the most trusted brand in our category

Key Results:
1. Achieve NPS score of 60 (currently 38)
2. Publish 20 case studies from customers with measurable ROI
3. Reach 5,000 community members in Discord (currently 1,200)

### Bad OKR Examples (and fixes)

❌ Objective: "Improve the product"
(Too vague, not inspiring)
✅ "Deliver a product experience that users recommend to peers"

❌ KR: "Launch feature X"
(Output, not outcome — shipping ≠ success)
✅ "Feature X drives 30% increase in weekly active users"

❌ KR: "Improve customer satisfaction"
(Not measurable — what number? from what to what?)
✅ "Increase CSAT score from 3.8 to 4.5 on post-interaction survey"

❌ KR: "100% of sprint stories completed"
(Activity metric, not impact metric)
✅ "Reduce average bug fix time from 5 days to 2 days"
```

### Quarterly Planning Process

```markdown
## Run Quarterly OKR Planning

### Week -3: Preparation
- Review last quarter's OKRs: what scored well? what missed? why?
- Gather input: customer feedback, analytics, team retrospectives
- Leadership shares company-level objectives for next quarter
- Each team lead drafts 1-2 team objectives aligned to company OKRs

### Week -2: Alignment
- Cross-team review: do team OKRs create conflicts or dependencies?
- Resolve resource conflicts (two teams need same engineer)
- Identify shared KRs (both teams contribute to the same metric)
- Challenge: "If we hit all these KRs, will we actually achieve the objective?"

### Week -1: Finalization
- Lock OKRs (no changes after this point)
- Each team presents OKRs to the company (transparency)
- Set up tracking: dashboard, weekly check-in cadence
- Identify leading indicators for each KR (don't wait until end of quarter)

### During Quarter: Execution
**Weekly**: 15-minute OKR check-in per team
- Traffic light each KR: 🟢 on track | 🟡 at risk | 🔴 off track
- For 🟡/🔴: what's the plan to get back on track?
- No surprises at quarter end

**Mid-quarter**: Formal review
- Are KRs still the right measures?
- Any external changes (market, competitor, tech) that require adjustment?
- Adjust confidence levels, not the KRs themselves

### End of Quarter: Scoring and Retrospective
Score each KR: 0.0 to 1.0
- 0.0-0.3: Failed to make meaningful progress
- 0.4-0.6: Made progress but fell short
- 0.7-0.9: Delivered strong results (this is the sweet spot)
- 1.0: Hit exactly — either sandbagged or got lucky

Average KR scores = Objective score.
Team target: 0.6-0.7 average (means OKRs are ambitious enough)
If you're consistently scoring 1.0, your OKRs aren't ambitious enough.
```

### OKR Alignment

```markdown
## Align OKRs Across Teams

### Company → Team → Individual

Company Objective: "Achieve product-market fit in the SMB segment"
  └─ Company KR: "Reach $500K ARR from SMB customers"

    Product Team Objective: "Make the product irresistible for SMB users"
      └─ KR: "SMB trial-to-paid conversion from 5% to 15%"
      └─ KR: "SMB onboarding completion from 40% to 80%"

    Marketing Team Objective: "Fill the SMB pipeline with qualified leads"
      └─ KR: "Generate 500 qualified SMB leads per month"
      └─ KR: "Reduce SMB CAC from $800 to $400"

    Engineering Team Objective: "Enable SMB self-service at scale"
      └─ KR: "99.9% uptime for core workflows"
      └─ KR: "Reduce p95 page load from 3s to 1s"

### Rules for Alignment
1. Teams own their OKRs — company provides direction, not dictation
2. 60% top-down, 40% bottom-up — teams know their domain best
3. Dependencies must be explicit — if Team A needs Team B, it's in the OKRs
4. No duplicate KRs — if two teams share a KR, assign one owner
5. Individual OKRs are optional — team-level is sufficient for most orgs
```

### Common Pitfalls

```markdown
## Avoid OKR Anti-Patterns

1. **Too many OKRs**: Max 3 objectives, 3-5 KRs each. If everything is a priority, nothing is.

2. **KRs as tasks**: "Launch feature X" is a task. "Feature X drives 20% increase in activation" is a KR. Measure impact, not output.

3. **Sandbagging**: If teams always score 1.0, they're setting easy goals. OKRs should feel uncomfortable.

4. **OKRs as performance reviews**: If KR scores affect compensation, teams will sandbag. Decouple OKRs from performance reviews.

5. **Set and forget**: OKRs require weekly check-ins. Without them, you discover failure at the end of the quarter.

6. **No baseline**: "Improve retention" means nothing without "from X% to Y%". Always include the current number.

7. **Missing counter-metrics**: "Increase signups" without tracking quality leads to gaming (bot signups, low-quality traffic).
```

## Best Practices

1. **Outcomes over outputs** — Key Results measure impact on users/business, not tasks completed or features shipped
2. **Ambitious but achievable** — Target 70% completion; consistently scoring 1.0 means you're not stretching enough
3. **3 objectives max** — Focus is the point of OKRs; if you have 8 objectives, you have zero priorities
4. **Weekly check-ins** — Traffic-light each KR weekly; fix problems in week 3, not week 12
5. **Decouple from compensation** — OKRs are a goal-setting tool, not a performance evaluation tool; linking to bonuses kills ambition
6. **Include baselines** — Every KR needs "from X to Y"; without a baseline, you can't measure progress
7. **Counter-metrics** — For every metric you're trying to improve, define one you don't want to hurt
8. **Retrospect every quarter** — Score OKRs, discuss what worked and what didn't, apply learnings to next quarter's planning
