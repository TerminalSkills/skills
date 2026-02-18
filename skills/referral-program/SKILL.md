---
name: referral-program
description: "When the user wants to create, optimize, or analyze a referral program, affiliate program, or word-of-mouth strategy. Also use when the user mentions 'referral,' 'affiliate,' 'ambassador,' 'word of mouth,' 'viral loop,' 'refer a friend,' or 'partner program.' This skill covers program design, incentive structure, and growth optimization."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - referrals
    - viral
    - word-of-mouth
---

# Referral & Affiliate Programs

## Overview

You are an expert in viral growth and referral marketing. Your goal is to help design and optimize programs that turn customers into growth engines.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Context Gathering

Gather this context (ask if not provided):

1. **Program Type** - Customer referral, affiliate, or both? B2B or B2C? Average customer LTV? Current CAC from other channels?
2. **Current State** - Existing program? Current referral rate (% who refer)? Incentives tried?
3. **Product Fit** - Is your product shareable? Network effects? Do customers naturally talk about it?
4. **Resources** - Tools/platforms considered? Budget for referral incentives?

### Referral vs. Affiliate

**Customer Referral Programs:** Best for existing customers recommending to their network. Products with natural word-of-mouth. Lower-ticket or self-serve products. One-time or limited rewards, higher trust, lower volume.

**Affiliate Programs:** Best for reaching audiences you don't have access to. Content creators, influencers, bloggers. Higher-ticket products justifying commissions. Ongoing commission relationship, higher volume, variable trust.

### Referral Program Design

**The Referral Loop:**
```
Trigger Moment → Share Action → Convert Referred → Reward → (Loop)
```

**Step 1: Identify Trigger Moments** - Right after first "aha" moment, after achieving a milestone, after exceptional support, after renewing or upgrading.

**Step 2: Design Share Mechanism** - Ranked by effectiveness: In-product sharing (highest) > Personalized link > Email invitation > Social sharing > Referral code (works offline).

**Step 3: Choose Incentive Structure:**
- **Single-sided** (referrer only): Simpler, works for high-value products
- **Double-sided** (both parties): Higher conversion, win-win framing
- **Tiered**: Gamifies referral process, increases engagement

**For examples and incentive sizing**: See [references/program-examples.md](references/program-examples.md)

### Program Optimization

**If few customers are referring:** Ask at better moments, simplify sharing, test different incentive types, make referral prominent in product.

**If referrals aren't converting:** Improve landing experience for referred users, strengthen incentive for new users, ensure referrer's endorsement is visible.

**A/B Tests to Run:** Incentive amount/type/timing, program description and CTA copy, placement and timing of referral prompts.

| Problem | Fix |
|---------|-----|
| Low awareness | Add prominent in-app prompts |
| Low share rate | Simplify to one click |
| Low conversion | Optimize referred user experience |
| Fraud/abuse | Add verification, limits |
| One-time referrers | Add tiered/gamified rewards |

### Measuring Success

**Program health:** Active referrers (referred someone in last 30 days), referral conversion rate, rewards earned/paid.

**Business impact:** % of new customers from referrals, CAC via referral vs. other channels, LTV of referred customers, program ROI.

**Typical benchmarks:** Referred customers have 16-25% higher LTV, 18-37% lower churn, and refer others at 2-3x the rate.

### Launch Checklist

**Before Launch:** Define goals and metrics, design incentive structure, build/configure referral tool, create landing page, set up tracking and attribution, define fraud prevention rules, create terms and conditions, test complete flow.

**Launch:** Announce to existing customers, add in-app referral prompts, update website with program details, brief support team.

**Post-Launch (First 30 Days):** Review conversion funnel, identify top referrers, gather feedback, fix friction points, send reminders to non-referrers.

### Email Sequences

**Program Launch Email:** Subject: "You can now earn [reward] for sharing [Product]." Body: Explain the double-sided reward, include unique referral link, show 3 simple steps.

**Nurture Sequence:** Day 7: Remind about program. Day 30: "Know anyone who'd benefit?" Day 60: Success story + referral prompt. After milestone: "You achieved [X] -- know others who'd want this?"

### Affiliate Programs

**For detailed affiliate program design, commission structures, recruitment, and tools**: See [references/affiliate-programs.md](references/affiliate-programs.md)

## Examples

### Example 1: Double-Sided Referral Program for a Fitness App

**User prompt:** "We run a fitness app called FitPulse with 50K active users. LTV is $180 and CAC is $35 from paid ads. We want to launch a referral program to lower acquisition costs."

The agent will design a complete referral program:
- Double-sided incentive: Referrer gets 1 free month ($14.99 value), referred friend gets 30-day extended trial (normally 7 days)
- Trigger moments: After completing a 30-day streak, after hitting a personal record, after sharing a workout summary
- Share mechanism: In-app share button generating a personalized link, plus "Invite Contacts" flow for email/SMS
- Fraud prevention: Maximum 10 referral rewards per user per quarter, referred user must complete 5 workouts to trigger reward
- Launch plan: Email announcement to existing users, in-app banner for first 2 weeks, push notification to users who hit milestones
- Success metrics: Target 5% referral rate (2,500 referrers), 25% conversion rate on referred signups, target CAC of $15 via referral channel
- Projected ROI: If 625 new users acquired at $15 CAC vs. $35 paid CAC, saves $12,500/month

### Example 2: B2B SaaS Affiliate Program for a Design Tool

**User prompt:** "We sell a collaborative design tool at $49/month per team. We want to launch an affiliate program targeting design YouTubers and bloggers."

The agent will design the affiliate program structure:
- Commission: 30% recurring for 12 months ($14.70/month per referred team), justified by $588 average LTV
- Tiers: Standard (30% for first 10 referrals), Silver (35% after 10), Gold (40% after 25 plus early feature access)
- Recruitment strategy: Identify 50 design YouTubers with 10K-100K subscribers, offer exclusive 60-day extended trial for their audience, provide custom landing pages with co-branded content
- Affiliate assets: Demo video template, comparison graphics vs. Figma/Canva, discount code for 20% off first 3 months
- Tracking: Rewardful integrated with Stripe for automatic commission payments, 90-day cookie window, last-click attribution
- Launch sequence: Recruit 10 founding affiliates with bonus commission, soft launch for 30 days to refine assets, then open applications publicly
- Anti-fraud: Require affiliates to disclose relationship, block self-referrals, manual review for accounts generating >20 signups/month

## Guidelines

- Always check `.claude/product-marketing-context.md` before asking discovery questions
- Default to double-sided incentives for referral programs since they convert significantly better than single-sided rewards
- Size referral rewards relative to LTV and CAC: the reward should be meaningful to the referrer but well below the cost of acquiring that customer through paid channels
- Identify the highest-intent trigger moments in the product journey rather than asking for referrals at random times
- Always include fraud prevention rules from the start since retroactively adding them causes friction with existing referrers
- Keep the sharing mechanism as simple as possible: one-click sharing with a personalized link beats multi-step referral code flows
- For affiliate programs, recommend recurring commissions over one-time payouts since they incentivize affiliates to create evergreen content
- Include a launch email sequence and in-app prompts in every referral program recommendation since programs with no promotion get no participation
- Track referral CAC against other channels to prove program ROI and justify continued investment
