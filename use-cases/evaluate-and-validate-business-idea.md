---
title: Evaluate and Validate a Business Idea Before Writing Code
slug: evaluate-and-validate-business-idea
description: Score 3 SaaS ideas on a 10-factor framework, pick the winner, test critical assumptions with a shadow launch, and build only after real demand is proven — turning 6 months of indecision into a validated MVP in 3 weeks.
skills:
  - market-evaluation
  - validate-idea
category: business
tags:
  - validation
  - market-research
  - mvp
  - saas
  - idea-scoring
  - shadow-test
---

# Evaluate and Validate a Business Idea Before Writing Code

Marco has been going back and forth between 3 SaaS ideas for 6 months. He's a full-stack developer who can build anything — but that's the problem. He keeps starting one, getting excited about another, abandoning the first. His GitHub has 3 half-built repos. Zero revenue. Zero users. He needs a systematic way to pick one, validate it with real market signal, and only then build.

## Step 1 — Score Each Idea on the 10-Factor Evaluation Framework

Use market-evaluation to run each idea through a structured scoring matrix. No gut feelings — just data. Score each factor 1-10:

| Factor | AI Invoice Parser | Freelancer CRM | Dev Hiring Platform |
|---|---|---|---|
| Urgency (hair-on-fire?) | 9 | 5 | 6 |
| Market Size ($) | 8 | 7 | 8 |
| Willingness to Pay | 9 | 5 | 7 |
| Ease of Reaching | 8 | 6 | 4 |
| CAC Estimate | 7 | 6 | 4 |
| Delivery Cost | 8 | 7 | 5 |
| Competitive Moat | 7 | 5 | 4 |
| Personal Fit | 8 | 8 | 6 |
| Speed to MVP | 9 | 8 | 3 |
| Retention Potential | 5 | 5 | 4 |
| **Total** | **78** | **62** | **51** |

The AI invoice parser for accountants wins by 16 points. Key insight: accountants have urgent pain (tax deadlines), they pay for software (average $200/month on tools), and Marco can reach them through accounting forums, LinkedIn, and CPA associations.

The dev hiring platform scores lowest because customer acquisition in recruiting is brutally expensive (CAC $500+), and the market is dominated by well-funded players.

## Step 2 — Identify and List Critical Assumptions

Every business idea rests on assumptions. Marco's invoice parser rests on these:

1. **"Accountants spend 5+ hours/week on manual invoice entry"** — if it's only 30 min, the pain isn't worth $49/month
2. **"They'd trust AI to extract financial data accurately"** — regulatory concerns could kill adoption
3. **"They need integration with Xero/QuickBooks, not a standalone tool"** — standalone tools die in accounting
4. **"Solo practitioners and small firms (2-10 people) are the buyer"** — enterprise sales is a different game
5. **"$49-99/month is the right price range"** — too cheap = not serious, too expensive = need sales team

Assumption #1 is the riskiest. If accountants don't actually spend significant time on manual entry, nothing else matters.

## Step 3 — Validate the Riskiest Assumption with a Shadow Test

Use validate-idea to design a shadow test. Marco doesn't build anything yet. He builds a landing page (Carrd, $19/year) with a clear value prop:

> **Stop typing invoices. Upload PDFs, get structured data in Xero in seconds.**
> AI-powered invoice parsing built for accountants. Early access — join 200+ accountants already on the waitlist.

He runs $200 in Google Ads targeting "invoice data entry automation" and "OCR for accountants." Budget: $40/day for 5 days.

**Results after 5 days:**
- 1,847 impressions
- 312 clicks ($0.64 CPC — cheap, good sign)
- 47 email signups (15.1% conversion — excellent)
- 12 replied to the welcome email asking "when does this launch?"

47 signups at $200 spend = $4.26 per lead. For B2B SaaS at $49-99/month, that's outstanding. If even 10% convert to paid, that's $235-470 MRR from a $200 test.

Marco also posted in r/accounting and two CPA Facebook groups. 3 accountants DM'd him asking for early access. One said: "I spend 6 hours every Monday entering invoices from my clients' shoeboxes of receipts."

Assumption validated. The pain is real, and people are actively searching for solutions.

## Step 4 — Talk to 5 Potential Customers

Marco emails the 12 people who replied and offers 15-minute calls. 5 accept. Key findings:

- Average time on manual entry: **4-8 hours/week** (confirms assumption)
- Top frustration: not just data entry, but **matching invoices to the right client/category**
- Dealbreaker: must integrate with QuickBooks Online (3/5) or Xero (2/5)
- Price sensitivity: "I'd pay $79/month without thinking if it saved me 4 hours" (quote from Sarah, solo CPA)
- Surprise insight: they want **batch upload** — not one invoice at a time

## Step 5 — Define and Build the MVP

Based on customer conversations, Marco scopes a 2-week MVP:

**In scope (week 1-2):**
- PDF upload (single + batch up to 20)
- AI extraction: vendor name, date, line items, totals, tax
- Review screen: human confirms/corrects before sync
- QuickBooks Online integration (3/5 customers use it)
- Simple auth + Stripe billing ($49/month plan)

**Out of scope (later):**
- Xero integration (week 3-4)
- Receipt photo capture (mobile app, month 2)
- Auto-categorization (needs training data from real usage)
- Team features (solo practitioners first)

**Tech stack:** Next.js + OpenAI Vision API for extraction + QuickBooks API + Supabase for auth/db.

Marco ships the MVP in 12 days. He emails all 47 waitlist signups. 8 start the free trial. 3 convert to paid in the first week: $147 MRR from a $200 validation test and 2 weeks of building.

## Why This Approach Works

Marco spent 6 months paralyzed by 3 ideas. The structured evaluation took 2 hours. The shadow test took 5 days and $200. Customer interviews took 1 week. The MVP took 2 weeks. Total: 4 weeks from "I can't decide" to $147 MRR with a clear path to $1k+ MRR.

The 10-factor framework killed analysis paralysis by making the decision data-driven. The shadow test killed the biggest risk ("does anyone actually want this?") before writing a single line of code. The customer interviews shaped the MVP so Marco built what people would pay for — not what he assumed they wanted.

Without this process, Marco would still be context-switching between 3 repos, building features nobody asked for, and wondering why nobody signs up.
