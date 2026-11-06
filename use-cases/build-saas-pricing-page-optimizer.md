---
title: "Build an Automated SaaS Pricing Page Optimizer with AI"
slug: build-saas-pricing-page-optimizer
description: "Analyze and optimize SaaS pricing pages using competitor data, conversion best practices, and A/B testing."
skills: [pricing-strategy, page-cro, competitor-alternatives, web-research]
category: business
tags: [pricing, saas, conversion, optimization, competitor-analysis]
---

# Build an Automated SaaS Pricing Page Optimizer with AI

## The Problem

Marta is head of product at a 20-person SaaS startup selling a developer tool. Their pricing page converts 2.1% of visitors to a paid checkout. The page has not been updated in six months, and the tiers were set at launch based on what "felt right".

Optimizing a pricing page needs three kinds of work at once: competitive intelligence (what do similar tools charge, and for what?), conversion audit (what on the page helps or hurts?), and packaging (how do tiers, limits and feature gating steer the decision?). Marta tried once before: the design team changed colors and copy without data on what was wrong, and conversion stayed flat. This time she wants evidence first, and she wants to know up front whether her traffic can even measure the result.

## The Solution

Use **page-cro** to audit the page from the visitor's side, **pricing-strategy** to find the weak lever and propose packaging, **competitor-alternatives** (its sourced, dated claims ledger) and **web-research** to collect competitor pricing from public pages, and again **page-cro** to size a test for the traffic. The output is a pricing page specification with tiers, copy and test parameters, in which every change is tied to evidence.

## Step-by-Step Walkthrough

### Step 1: Audit the Current Page

Give the agent the real page URL and your analytics, not only a request for "best practices". The `page-cro` skill measures first (conversion by device and traffic source, field speed data) and then reads the page the way a visitor does, separating defects from hypotheses.

```text
Audit our pricing page at https://app.example.com/pricing. Pull conversion by device and source from the analytics export in ./analytics/, check speed and accessibility, then walk the page as a visitor deciding between tiers. Rank the findings and say which are defects and which are hypotheses.
```

A typical result for a page like Marta's, with the example team's data:

| Priority | Finding | Kind | Evidence |
|---|---|---|---|
| High | Mobile converts at 0.9% vs 3.4% on desktop; the comparison table overflows the screen | Defect | analytics segments, screenshot at 390 px |
| High | 24-row feature table; the three limits that decide the plan (projects, users, API) are on rows 9, 14 and 21 | Hypothesis | scroll-depth data |
| High | API access is only in the Enterprise tier, while the docs push the API to every visitor | Hypothesis | docs-to-pricing clickstream |
| Medium | Enterprise says "Contact Sales" with no price or range | Hypothesis | sales call notes |
| Medium | Billing toggle defaults to monthly and no annual price is shown up front | Hypothesis | plan mix in billing data |
| Low | Every tier button reads "Get Started" | Hypothesis | none yet |

The skill's rule applies here: a defect (broken layout, slow load) is fixed without a test, while a hypothesis (collapse the table, move API access) is a candidate for a test. Industry "benchmark" conversion rates from other companies are not a target; the useful comparison is this page against itself, by segment and over time.

### Step 2: Build a Dated Competitor Pricing Ledger

Pricing does not exist in a vacuum: visitors compare your tiers with the tools they saw five minutes earlier. The `competitor-alternatives` skill keeps a ledger of facts, each with a source URL and the date it was read, so nothing on the page rests on memory. `web-research` gathers the sources.

```text
Find 5 direct competitors of our developer tool. For each, record from its public pricing page: tier names, monthly and annual price, what limits each tier (seats, projects, API), whether there is a free plan or trial, and the page URL and date read. Mark anything you could not confirm as unverified.
```

The ledger feeds a comparison like this one. These competitor names and prices are invented for the example:

| | You ($29 / $79 / $199) | Comp A ($12 / $25 / $59) | Comp B (Free / $15 / $49) | Comp C ($19 / $49 / $99) |
|---|---|---|---|---|
| Free plan | No | No | Yes (3 users) | No |
| Seat pricing | Flat per tier | Per user | Per user | Flat per tier |
| API access | Enterprise only | All paid tiers | Pro and up | All paid tiers |
| Annual discount | Not shown | 20% | 17% | 25% |

What the comparison supports: the $79 middle tier is about 2.7 times the competitors' middle tiers ($25, $15 and $49 average about $30), and the table makes the justification hard to find. Three of four competitors include API access below their top tier, which matters for a developer tool. Flat-per-tier pricing is shared by only one competitor and is worth stating plainly on the page. Competitor prices change, so re-read the ledger before every release of the page.

### Step 3: Generate the Pricing Page Spec

With the audit and ledger in hand, `pricing-strategy` works from the weak lever rather than from a template: which unit to charge for, where the plan limits fall, and where each price sits. It also models the change before proposing it, including what happens to existing customers on the old tiers (grandfather or migrate, with notice).

```text
Using the audit and the competitor ledger, propose a tier structure with names, prices, limits, CTA text and the reason for each change. Model revenue under a pessimistic and an expected plan mix, list the assumptions, and say what happens to current customers.
```

An example specification:

- **Free ($0)**: 2 projects, 1 user, community support. CTA "Start Free". Gives developers a way to try the API; the project limit is the upgrade trigger. This is a hypothesis: if the sales funnel shows buyers already trial the product through the docs sandbox, a time-limited trial may fit better.
- **Starter ($19 / month)**: 10 projects, 5 users, API access, email support. CTA "Start 14-Day Trial". API access moves down from Enterprise.
- **Pro ($49 / month)**, marked recommended: unlimited projects, 25 users, priority support, advanced analytics.
- **Enterprise (custom)**: SSO/SAML, audit logs, SLA. CTA "Talk to Sales", with a "from $199 / month" line so prospects know the range before the call.

Page-level changes: the annual price is shown beside the monthly one with the saving stated as months free; the table shrinks to the 8 to 12 rows that separate the tiers, with a "See all features" expander; the layout is fixed for phones; a short FAQ answers plan switching, limit behavior and refunds (state only policies the company really has).

### Step 4: Plan the Test for the Traffic You Have

`page-cro` ends with a check that most redesigns skip: whether the page has enough traffic to test at all. Marta has 3,000 visitors a month. For a two-sided test at 95% confidence and 80% power (the standard two-proportion sample-size formula, computed here with Python's `statistics.NormalDist`):

| Baseline | Lift to detect | Visitors needed per arm | At 3,000 visitors / month, 50/50 split |
|---|---|---|---|
| 2.1% | 3.1% (+1.0 point) | about 3,970 | about 2.6 months |
| 2.1% | 4.2% (doubling) | about 1,085 | about 3 weeks |

You can check any other pair with the same formula or a sample-size calculator such as <https://www.evanmiller.org/ab-testing/sample-size.html>. The consequence: 1,000 visitors per arm (about 21 conversions each) cannot tell a real +1 point from noise. So the plan is:

- **Fix defects now, without a test**: the phone layout and the table overflow.
- **Run one compound test for about 2 to 3 months**, with the sample size, primary metric and end date fixed in advance, full weeks only, and no early stopping when the dashboard turns green. It tells you whether the new package beats the old one, not which change did it.
- **Primary metric**: paid checkouts per pricing-page visitor. **Also track** free signups, revenue per paid conversion, plan mix and annual share. A free tier can raise signups while lowering revenue per visitor, so pause the test if revenue per paid conversion falls below an agreed floor (for example 85% of control).
- **If waiting that long is not acceptable**, drop the test and decide from interviews with recent buyers, lost deals and plan-mix changes over the next two quarters; say so in the report rather than reading a two-week result as proof.

## Real-World Example

Marta fixes the phone layout first, which can be seen directly in the mobile segment. She ships the new tiers as a 50/50 test, with the end date set twelve weeks out, from the sample-size table (about 2.6 months of traffic). In this example, the variant ends ahead on paid checkouts per visitor, the Pro tier takes a larger share of new signups than the old $79 tier did, and revenue per paid conversion stays above the floor. Those figures belong to the invented team, and a real result may be flat or negative; the point of the process is that the page either earned the change or did not. Existing customers stay on their old prices for twelve months with written notice, following the migration plan the `pricing-strategy` skill produces.

Marta keeps the evidence together: the audit, the dated ledger, the model with its assumptions, and the test record. The next pricing review starts from plan-mix and conversion data by tier instead of from a blank page.

## Related Skills

- **pricing-strategy**: finds the weak lever, packages the tiers, models revenue and plans the customer migration
- **page-cro**: audits the page by segment, separates defects from hypotheses and sizes the test for the traffic
- **competitor-alternatives**: keeps the competitor pricing facts in a sourced, dated ledger
- **web-research**: collects the competitor pricing pages and sources for the ledger
