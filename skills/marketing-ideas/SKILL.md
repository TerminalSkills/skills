---
name: marketing-ideas
description: >-
  Picks the two or three marketing bets that fit a software product's stage,
  budget and team, and turns each into a sized test with a pass mark and a stop
  rule. Use when someone asks "how do I market this", "give me marketing ideas",
  "growth ideas for my SaaS", "which channel should we try next", "what should
  marketing do this quarter", or "we have a small budget, where do we start".
  Works from the product's own numbers: it backs the goal out into traffic and
  cost limits, screens channel families against what must be true for each, and
  writes the plan as a short document instead of a long list of tactics.
license: Apache-2.0
compatibility: >-
  Any agent that can read project files and run Python 3.9+. Optional: exports
  from Google Analytics 4 and Google Search Console, and billing data for
  price, margin and churn.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["marketing", "growth", "go-to-market", "saas", "planning"]
---

# Marketing Ideas for SaaS and Software Products

## Overview

A founder who asks for marketing ideas rarely lacks ideas. They lack a reason to choose one over another and a way to find out cheaply whether it worked. This skill produces that: a goal turned into numbers, a shortlist of at most three bets chosen against explicit criteria, and one test card per bet with a budget, a deadline, a pass mark and a stop rule.

The output is a plan of one to two pages. A catalogue of a hundred tactics is the failure case, because it hands the choosing back to the person who asked.

## Instructions

### 1. Collect the facts before suggesting anything

Look in the project first: the README and landing page copy (what it is, for whom), the pricing page (price, free plan or trial), any `docs/marketing` or positioning notes, analytics exports, and the changelog (what has shipped recently and is worth announcing). Then ask only for what is still missing. Record everything in one block and mark guesses as guesses:

```yaml
product: Perwordly, invoicing for freelance translators (per-word and per-hour lines)
buyer: the translator herself; no procurement, pays by card
stage: live 9 months, 38 paying customers, monthly churn 3%
price: 19 USD/month, 14-day trial, gross margin 85%
goal: 100 paying customers in 13 weeks
budget: 600 USD/month, founder time 8 h/week
team: solo founder, former translator, writes well, no design or video skills
working_now: 420 visits/week, almost all organic search; visit->trial 2.5%, trial->paid 14%
tried: Product Hunt launch (310 visits, 2 trials), one sponsored newsletter (no trials)
assets: 61-person customer list, 900 newsletter subscribers
constraints: sells in the EU and US; no cold calling
```

If the product has no users yet, `working_now` is empty and the goal is conversations and first users, not traffic.

### 2. Turn the goal into numbers

Run the arithmetic before judging any channel. It shows how far the goal is from today and what a visit or a signup may cost at most. Save this as `plan_math.py`; the arguments are new customers, weeks, visit-to-signup rate, signup-to-paid rate, monthly price, gross margin and payback months.

```python
"""Back out the traffic a growth goal needs and the most a customer may cost."""
import math, sys

def plan(new_customers, weeks, visit_to_signup, signup_to_paid,
         monthly_price, gross_margin, payback_months):
    signups = math.ceil(new_customers / signup_to_paid)
    visits = math.ceil(signups / visit_to_signup)
    cac_ceiling = monthly_price * gross_margin * payback_months
    return {
        "signups_needed": signups,
        "visits_needed": visits,
        "visits_per_week": math.ceil(visits / weeks),
        "cac_ceiling": round(cac_ceiling, 2),
        "max_cost_per_signup": round(cac_ceiling * signup_to_paid, 2),
        "max_cost_per_visit": round(cac_ceiling * signup_to_paid * visit_to_signup, 2),
    }

if __name__ == "__main__":
    for key, value in plan(*[float(a) for a in sys.argv[1:8]]).items():
        print(f"{key:>20}: {value}")
```

`cac_ceiling` is the gross profit one customer returns inside the payback period the business can afford to wait: six months is a cautious setting for a self-funded product, twelve for one with cash in the bank. For a sales-led product read "signup" as "demo booked" and use the demo-to-won rate. If the customer's expected lifetime (1 ÷ monthly churn) is shorter than the payback period, lower the payback period to match.

### 3. Find the stage that is actually broken

More traffic into a leaking funnel is the most common wasted quarter. Compare the stages and name one constraint:

| What the numbers show | Constraint | Where the bets go |
|---|---|---|
| No users yet, or fewer than about twenty | Unknown whether anyone wants it | Direct conversations, communities, a waitlist; nothing that needs scale |
| Visitors arrive, few sign up | The page or the offer | Fix the page first (see the `page-cro` skill); acquisition bets wait |
| People sign up, few reach first value or pay | Onboarding or pricing | See `onboarding-cro`; acquisition bets wait |
| The funnel converts, too few visitors | Reach | This skill's main case: pick channels |
| One channel carries nearly everything | Concentration risk | Keep feeding it, add one test in a second family |
| Customers leave within months | Retention | Lifecycle email, product; new acquisition just refills the bucket |

### 4. Screen the channel families

Each family has a condition that must hold for it to work at all. Check the condition with evidence from step 1; drop every family that fails. Do not score what cannot work.

| Family | Must be true | First signal | Verify before planning |
|---|---|---|---|
| Search content (comparison, integration and problem pages) | People already type the problem into a search engine; Search Console or a keyword tool shows the queries | 2–6 months | Google's spam policies: pages mass-produced to rank count as scaled content abuse |
| Paid search | Demand exists and the forecast cost per click is below `max_cost_per_visit` | 1–3 weeks | Keyword Planner forecast; conversion tracking in place |
| Paid social | The buyer can be described by interest, job or a customer list, and someone can make new creative every few weeks | 2–4 weeks | Budget can buy the roughly 50 results a week Meta's delivery system needs to settle |
| Communities and forums | A team member can take part as a peer, for months, without pitching | 2–6 weeks | Each community's rules. Show HN requires something people can try and forbids asking friends to upvote |
| Launch sites, directories, marketplaces, review sites | The audience of that site is the buyer, not other makers | Days (spike), months (listing) | Listing requirements; whether past launches of similar products brought customers or only visits |
| Outbound email and LinkedIn | Contract value pays for manual work and the accounts can be named | 2–4 weeks | CAN-SPAM covers business email too: real sender, postal address, opt-out honoured within 10 business days. EU recipients fall under GDPR and national e-privacy rules |
| Partners, integrations, affiliates | Another product or publisher already has the buyer's attention and gains from the pairing | 1–3 months | Affiliates and paid creators must disclose the relationship clearly (FTC Endorsement Guides) |
| Product loops (invites, shared output, referral rewards, templates) | Using the product creates something other people see, and active users exist | 1–2 months | Share of users who ever send or publish anything |
| Free tool or dataset | Engineering time is available and a tool answers a query with real volume | 2–4 months | Same search check as content |
| Owned audience (newsletter, lifecycle email) | A list or steady traffic to capture exists | 2–4 weeks | Bulk senders to Gmail need SPF, DKIM, DMARC and one-click unsubscribe |
| Events, webinars, podcast guesting | Buyers gather somewhere and trust who speaks there | 1–3 months | Total cost including travel against `cac_ceiling` |
| Sponsorships (newsletters, creators, podcasts) | A publication reaches the exact buyer and sells trackable placements | 1–2 weeks | Past sponsor results if the publisher shares them; disclosure |

### 5. Score what survives and choose at most three

Score each surviving family from 1 to 5 on four questions, with the evidence written next to the score. A score with no evidence is capped at 3.

- **Reach**: are the buyers there in numbers that matter against `visits_needed`?
- **Speed**: does the first signal arrive well inside the deadline and the runway?
- **Cost**: does a meaningful test fit in the budget, and can the channel stay under `cac_ceiling`?
- **Edge**: does the team have a skill, asset or relationship here that competitors lack?

Add the four scores. Then choose:

1. The highest total whose first signal arrives inside the deadline.
2. The next highest total from a different family. If the first bet does not compound, prefer one that does (search content, owned audience, product loops, partners), even if it is slower.
3. Optionally a third: a slow compounding channel started now for the following quarter, or a long shot capped at a tenth of budget and time.

Earlier stage means fewer bets: one or two before the product retains users; three once it does. List what was rejected with the reason, so the same ideas are not reopened next week.

### 6. Write a test card for each bet

```yaml
bet: Answer invoicing questions in two translator communities
hypothesis: Translators asking about late payment and per-word invoices will try a tool built for them
smallest_version: 3 helpful replies a week for 6 weeks; profile links to a page with a free invoice checklist
cost: 0 USD, 3 h/week
tracking: utm_source=community&utm_medium=referral&utm_campaign=translator-forums
metric: trials started from tagged visits
expected_if_true: 12 trials (about 480 visits at 2.5%)
pass_mark: 8 or more trials in 6 weeks
stop_rule: fewer than 3 trials after 4 weeks, or a moderator warning
if_it_passes: add a monthly worked example post; keep the reply cadence
owner: founder
```

Size the test so that the expected count of the target event is at least 10 if the hypothesis holds. With only 3 expected, pure chance gives zero about one time in twenty (e⁻³ ≈ 0.05), and a real channel gets written off. With 10 expected, seeing 3 or fewer happens about one time in a hundred. If a test cannot reach 10, measure an earlier event (trials instead of customers, replies instead of meetings) or lengthen it.

Tag every link with `utm_source`, `utm_medium` and `utm_campaign` so Google Analytics 4 puts the visits in the right channel. GA4's default channels now include "AI Assistant" for visits from chat assistants; check it before concluding nobody finds the product that way.

### 7. Deliver the plan

Write `marketing-plan.md` (or reply in this shape) with this title and these sections as headings, in order:

```text
Marketing plan: Perwordly, 6 Oct – 4 Jan

1. Where things stand        (the fact block from step 1, five lines at most)
2. What the goal requires    (output of the arithmetic; the gap in one sentence)
3. Constraint                (one stage, with the two numbers that show it)
4. Scorecard                 (table: family | reach | speed | cost | edge | total | evidence)
5. The bets                  (one test card each, three at most)
6. Not now                   (rejected ideas, one line of reason each)
7. Review                    (date; what result moves budget where)
```

At the review date compare each bet with its pass mark. Passed: raise its share and write the next, larger test. Failed by the stop rule: end it and promote the next family from the scorecard. Unclear: extend once, then decide.

## Examples

### Example 1: A small paid product with almost no budget

The fact block in step 1 belongs to this request: "I run Perwordly alone. 38 customers, I want 100 by January, I can spend $600 a month. What should I do?"

The agent runs `python3 plan_math.py 62 13 0.025 0.14 19 0.85 6`:

```text
      signups_needed: 443
       visits_needed: 17720
     visits_per_week: 1364
         cac_ceiling: 96.9
 max_cost_per_signup: 13.57
  max_cost_per_visit: 0.34
```

It reports that the goal needs 1,364 visits a week against 420 today, so reach is the constraint, and that the goal is a stretch: tripling traffic in one quarter is unlikely from compounding channels alone. Screening removes paid search (a click may cost at most $0.34; the Keyword Planner forecast for "invoice software for freelancers" is several times that), launch sites (already tried, visitors were other makers) and events (cost). The scorecard favours communities (reach 4, speed 4, cost 5, edge 5: she is a translator), search pages for queries where Search Console already shows impressions in positions 8–20 such as "invoice template for translators" (4, 2, 5, 4), and one sponsored issue of a translators' association newsletter as the long shot (3, 5, 3, 2; $180, a tenth of the quarter's budget).

The plan carries three test cards, lists the rejected ideas with reasons, and states plainly that 70 customers by January is the realistic outcome if the two main bets pass, with 100 reachable in the following quarter.

### Example 2: A sales-led product with a real budget

Request: "Chairsidely sells scheduling software to dental clinics: $400 a month, 230 clinics, 80% margin, $12,000 a month for marketing, two marketers. We book about 55 demos a quarter from search and word of mouth and close 22%. We need 30 new clinics next quarter."

The agent reads "signup" as "demo booked" and runs `python3 plan_math.py 30 13 0.012 0.22 400 0.80 12`: 137 demos, 11,417 visits, a customer may cost up to $3,840 and a demo up to $844.80. The gap is 82 demos. The funnel converts, so the constraint is reach.

| Family | Reach | Speed | Cost | Edge | Total | Evidence |
|---|---|---|---|---|---|---|
| Paid search | 4 | 5 | 4 | 3 | 16 | Planner shows steady queries for "dental scheduling software"; forecast click cost about $4, under the $10.14 limit |
| Customer referrals | 3 | 4 | 5 | 5 | 17 | 230 clinics; a fifth of last year's deals named a colleague as the source |
| Integration listing with a practice-management system | 4 | 2 | 4 | 4 | 14 | Partner marketplace open to applications; shared customers already exist |
| Dental conference booth | 3 | 2 | 1 | 2 | 8 | One booth costs more than a month's budget |
| City-by-city landing pages | 2 | 2 | 4 | 1 | 9 | Near-identical pages per city risk Google's doorway and scaled-content policies |

Bets, in rule order: a referral offer to existing clinics (highest total; one month free for both sides, pass mark 15 referred demos in the quarter); paid search from a different family ($4,000 over four weeks, expected 12 demos, pass mark 10 demos at $400 or less each, stop after $2,500 with fewer than 5); the integration listing as the slow third (application sent in week 1, measured next quarter). Rejected with reasons: conference booth, city pages, LinkedIn ads (the buyer is a practice owner who is hard to isolate by job title), a podcast.

## Guidelines

- Never answer with more than three bets. If the user asks to browse options, show the screening table from step 4 with the pass or fail for their product, not a list of tactics.
- Use the user's own conversion rates and prices. When a number is missing, say so, state the assumption, and make the first test one that measures it. Do not quote industry averages as if they were the user's.
- A channel that failed once is not dead if the test was too small to read. Check the expected count before accepting "we tried that".
- Do not plan acquisition when step 3 points at the page, onboarding or retention. Say which stage is broken and hand over to the matching skill.
- Rules of the venue come before tactics: community rules, sender requirements, disclosure of paid relationships, search spam policies. A plan that breaks them is not a plan.
- Paid channels need conversion tracking before the first dollar; see the `paid-ads` skill for setup and structure.
- This skill plans; it does not execute campaigns, write the ad copy, or build the pages. It is also the wrong tool for a company with an established multi-channel program that needs budget optimisation across channels, which calls for attribution or incrementality analysis.
- Revisit the plan at the review date, not daily. Compounding channels look like failures for the first weeks; stop rules, not impatience, end a bet.
