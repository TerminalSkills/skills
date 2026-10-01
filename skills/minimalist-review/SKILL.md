---
name: minimalist-review
description: >-
  Reviews a business or product plan against simplicity and profitability
  criteria and returns a written verdict: the plan restated in one sentence, an
  inventory of its parts tagged keep, replace, defer or drop, a ten-check
  scorecard, break-even, payback and worst-case figures, the smallest version
  worth trying, and the conditions for stopping. Use when someone asks "review
  my business plan", "is this plan too complicated", "what can we cut from the
  roadmap", "should we build this or start smaller", "sanity-check this before
  I spend the money", or "give me a lean version of this plan". Works on
  expansion plans, product roadmaps, hires, purchases and new lines of business.
license: Apache-2.0
compatibility: "Any agent that can read the plan (document, roadmap, spreadsheet or a description in chat). Optional: Python 3.8+ (standard library only) for the calculator. No accounts or API keys."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["plan-review", "simplicity", "profitability", "scope", "decision-making"]
---

# Minimalist Review

## Overview

A minimalist review asks two questions of every part of a plan: is it needed for the result, and does it pay for itself. Plans grow by addition. Each feature, hire, tool and lease is reasonable when taken alone, and together they turn a small bet into a large one. The review reverses that: it finds the one result the plan exists for, lists everything the plan requires, cuts what the result does not need, and checks whether what remains earns more than it costs, including when things go badly.

The deliverable is `plan-review.md` with a scorecard out of 20, a cut list, the figures, a verdict (Proceed, Proceed with cuts, Test first, Stop) and the smallest version worth trying. The review judges the plan, not the idea: a good idea in an oversized plan gets "with cuts", not "no".

## Instructions

### 1. Get the plan and the numbers

Read whatever exists: the plan document, roadmap, product requirements, budget sheet, quotes from suppliers, the pricing page. Then ask only for what is missing:

1. What result is this for, measured how, by when?
2. What does each part cost, one-off and per month, and how long is each commitment?
3. What is the expected gain, and what is it based on: payments, signed orders, stated interest, or belief?
4. How long until it is running, and who does the work?
5. Cash today, monthly fixed costs and monthly profit of the existing business.
6. What happens if none of this is done?

### 2. Restate the plan in one sentence

```text
We will (do what) so that (who) gets (what result), measured by (metric) reaching (value) by (date).
```

If the sentence cannot be completed, or needs "and" between two results, that is the first finding. A plan with two results is two plans; review the one the owner picks.

### 3. Inventory the parts

List every distinct thing the plan requires: features, hires, equipment, tools and suppliers, channels, premises, integrations, contracts. For each, record the one-off cost, the monthly cost, the effort, the length of the commitment, and which part of the result it serves. Parts that serve no part of the result are already candidates for the cut list.

### 4. Tag and cut

Tag each part with the standard MoSCoW categories, using one test for a Must: without it, could the result still be reached, even awkwardly? If yes, it is not a Must.

| Tag | Meaning | Usual action |
|---|---|---|
| Must | the result is impossible without it | Keep, or Replace with something existing |
| Should | important, but there is a workaround | Replace or Defer |
| Could | wanted, small effect if left out | Defer |
| Won't this time | agreed to be out of this round | Drop |

Then choose an action per part: **Keep**, **Replace** (with a manual process, a tool already paid for, something rented or bought ready-made), **Defer** (with the trigger that brings it back), or **Drop**.

Two checks on the result. Musts should take no more than about 60% of the total effort or first-year cost, the proportion the DSDM method recommends so that a plan has room to absorb surprises. And "we will need it later" is not a reason to build now (software practice calls this YAGNI): a part built early costs its build, the delay of everything else, the upkeep until it is used, and the rework when the need turns out different.

### 5. Score the plan

Ten checks, each 0, 1 or 2. The thresholds are working conventions; state any the owner changes.

| | Check | 0 | 1 | 2 |
|---|---|---|---|---|
| S1 | One result | several, or none | one, but unmeasured or undated | one, measurable, dated |
| S2 | Scope: Musts as a share of effort or first-year cost | over 80%, or nothing tagged | 60 to 80% | 60% or less |
| S3 | Evidence of demand | belief | stated interest: surveys, waiting list, conversations | money paid or orders signed |
| S4 | Existing means first | everything built or bought new | a mix | new only where nothing existing or manual would do |
| S5 | Reversibility: longest lock-in | over 12 months, or cannot be undone | 3 to 12 months | under 3 months, or cancel any time |
| P1 | Margin on each unit | negative or unknown | positive, thinner than the current business | equal or better |
| P2 | Break-even volume against demonstrated volume | over 2x | 1 to 2x | at or below |
| P3 | Payback of everything spent before it runs | over 24 months, or never | 12 to 24 months | under 12 months |
| P4 | Worst case: lowest cash | runs out | under 3 months of fixed costs | stays above |
| P5 | New recurring cost as a share of today's gross profit | over 25% | 10 to 25% | under 10% |

### 6. Do the arithmetic

```text
contribution per unit = price - variable cost per unit
break-even units      = new monthly cost / contribution per unit
net monthly gain      = expected units x contribution per unit - new monthly cost
payback               = (one-off cost + monthly cost x months until it runs) / net monthly gain
lowest cash           = cash + current profit x months until it runs - everything spent by then
worst case            = half the expected units, one-off cost up 50%, twice as long to start
```

The worst case is deliberately blunt. Plans are written by the people most hopeful about them, and costs and timelines overrun far more often than they come in under.

```python
#!/usr/bin/env python3
"""review_math.py plan-numbers.json - break-even, payback and a worst case for each version of a plan."""
import json, sys

p = json.load(open(sys.argv[1]))
unit = p["price"] - p["variable_cost"]                 # contribution per unit per month
gross_profit = p["fixed_costs"] + p["current_profit"]  # what the business earns today before fixed costs

def figures(v, units, upfront, months):
    gain = units * unit - v["monthly_cost"]            # net monthly gain once running
    spent = upfront + v["monthly_cost"] * months       # recurring costs start at commitment
    low = p["cash"] + p["current_profit"] * months - spent
    payback = spent / gain if gain > 0 else None
    return gain, payback, low

def months(x):
    return f"{x:.1f} months" if x is not None else "never"

for v in p["versions"]:
    gain, payback, low = figures(v, v["units"], v["upfront"], v["months_to_start"])
    w_gain, w_payback, w_low = figures(v, v["units"] * 0.5, v["upfront"] * 1.5, v["months_to_start"] * 2)
    even = v["monthly_cost"] / unit
    shown = p["demonstrated_units"]
    print(v["name"])
    print(f"  break-even    {even:.1f} units a month ("
          + (f"{even / shown:.1f}x the {shown} already demonstrated)" if shown else "nothing demonstrated yet)"))
    print(f"  net gain      {gain:,.0f} a month at {v['units']} units; new recurring cost is {v['monthly_cost'] / gross_profit:.0%} of gross profit")
    print(f"  payback       {months(payback)} after start")
    print(f"  lowest cash   {low:,.0f} ({low / p['fixed_costs']:.1f} months of fixed costs)")
    print(f"  worst case    gain {w_gain:,.0f} a month, payback {months(w_payback)}, lowest cash {w_low:,.0f}")
```

`demonstrated_units` is the volume someone has already paid for or signed for, not the forecast. If it is zero, P2 scores 0 and the verdict will be Test first.

### 7. Design the smallest version

Build it from the cut list: Musts only, each in its cheapest form, aimed at the lowest-scoring check. It should cost a small fraction of the plan and report within weeks. Write down before it starts:

- **Pass:** the measured result that justifies the next step, as a number and a date.
- **Stop:** the result that ends it.
- **Triggers:** the condition that brings each deferred part back.

Then run a premortem: "It is a year from now and this failed. What were the three most likely reasons?" Give each reason a signal that would show it early and the week that signal is checked.

### 8. Reach the verdict

Apply in order; the first that matches is the verdict.

1. **Stop:** P1 is 0, or P4 is 0 for every version including the smallest.
2. **Test first:** S3 is 0 or 1, or P2 is 0. Nobody has paid yet, so run the smallest version before committing anything else.
3. **Proceed with cuts:** any other 0, or a total under 16. Adopt the cut list, score the cut version, and go ahead only if it has no 0.
4. **Proceed:** 16 or more and no 0.

### 9. Output

```markdown
# Plan review: (plan name), (date)
**Verdict: (one of the four).** Score (n)/20 as written; (n)/20 after cuts.

## The plan in one sentence
## Parts
| Part | One-off | Monthly | Lock-in | Tag | Action | Reason or trigger |
|---|---|---|---|---|---|---|

## Scorecard
| Check | Score | Evidence |
|---|---|---|

## Figures (as written, after cuts, worst case)
## Smallest version: cost, duration, pass and stop results
## Premortem: three reasons, the signal for each, when it is checked
## What was not reviewed, and figures supplied from memory
```

## Examples

### Example 1: A bakery's wholesale plan

Rosalind Achterberg's bakery makes $5,200 a month on $21,000 of fixed costs and has $68,000 in the bank. Her plan: supply 12 cafés by June at about $1,650 each a month, with a second deck oven ($38,000), a van on a 36-month lease ($640 a month, $1,900 deposit), a full-time baker ($3,900 a month) and a custom ordering portal ($7,500 plus $60 a month). Four cafés paid for a two-week trial in September. Ingredients, packaging and fuel take 46% of the wholesale price, leaving 54% against 62% on counter sales, so P1 scores 1.

Sentence: "We will deliver daily to cafés so that the bakery adds $19,800 of wholesale revenue a month by June." One result: S1 scores 2.

| Part | One-off | Monthly | Lock-in | Tag | Action | Reason or trigger |
|---|---|---|---|---|---|---|
| Second oven | $38,000 | | permanent | Could | Defer | the present oven is idle from 4 to 7 am, room for about 7 café orders; revisit at 7 cafés for two months |
| Van | $1,900 | $640 | 36 months | Should | Replace | own car and insulated crates ($600) on one loop of nearby cafés; $400 a month in fuel |
| Full-time baker | | $3,900 | notice period | Must | Replace | part-time early shift, 20 hours a week, $1,700 a month |
| Ordering portal | $7,500 | $60 | | Won't this time | Drop | five customers fit in a shared order sheet and the invoicing tool already in use |

As written, all four parts were treated as essential: 100% of a first-year cost of $102,600.

```text
plan as written
  break-even    5.2 units a month (1.3x the 4 already demonstrated)
  net gain      6,092 a month at 12 units; new recurring cost is 18% of gross profit
  payback       9.3 months after start
  lowest cash   21,800 (1.0 months of fixed costs)
  worst case    gain 746 a month, payback 120.0 months, lowest cash -700
cut version
  break-even    2.4 units a month (0.6x the 4 already demonstrated)
  net gain      2,355 a month at 5 units; new recurring cost is 8% of gross profit
  payback       0.3 months after start
  lowest cash   67,400 (3.2 months of fixed costs)
  worst case    gain 128 a month, payback 7.1 months, lowest cash 67,100
```

| Version | S1 | S2 | S3 | S4 | S5 | P1 | P2 | P3 | P4 | P5 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| As written | 2 | 0 | 2 | 0 | 0 | 1 | 1 | 2 | 0 | 1 | 9 |
| Cut version | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 19 |

**Verdict: Proceed with cuts.** The idea is sound: cafés have paid, and the base case pays back in nine months. The plan is not: if half the cafés come and the oven costs more, the bakery is out of cash. The cut version reaches the same customers for $600 and $2,100 a month, and even at half volume it loses nothing. Pass: five signed standing orders by week 6 and contribution of at least $800 per café in month 2. Stop: fewer than three orders by week 6. Premortem: cafés order less than in the trial (check average daily order weekly against $55); the 4 am shift wears the owner out (hours log, monthly); cafés pay late (14-day terms, checked at each month end).

### Example 2: A "version 2" product roadmap

Two developers sell time tracking to architecture practices: 410 customers at $49 a month, about 10 cancellations a month, $45 contribution per customer. The roadmap for "version 2" has five parts and 32 person-weeks, which at $2,400 a person-week is $76,800 and four months with nothing else shipped.

| Part | Weeks | Evidence | Tag | Action |
|---|---|---|---|---|
| Front-end rewrite | 12 | none from customers; pages load in 1.1 s | Won't this time | Drop |
| Native mobile apps | 9 | 4 of 61 cancellation reasons in six months | Could | Replace with a mobile-friendly timer page (1 week) |
| Timesheet suggestions by AI | 6 | nobody asked | Won't this time | Drop |
| Export to accounting tools | 3 | 37 of 61 cancellation reasons: re-entering hours by hand | Must | Keep |
| Single sign-on | 2 | two prospects asked, neither signed | Could | Defer until a prospect commits in writing at a stated price |

Scores as written: S1 0 (five results, none measured), S2 0 (every part called essential), S3 1 (cancellation reasons are stated interest), S4 0, S5 1 (four months of the whole team), P1 2, P2 1 (repaying it within two years needs 5.7 customers kept a month, and only 6.8 a month leave for any reason the roadmap addresses), P3 0, P4 2 and P5 2 (salaries are already paid; nothing new recurs). Total 9.

Arithmetic. Gains from retention accumulate, so payback is computed month by month. If the export keeps half of the roughly six customers a month who leave over re-entry, that is 3 a month: cumulative contribution is 3 x $45 x (1 + 2 + ... + n). The export alone ($7,200) is repaid in month 10. The whole roadmap, with no evidence of gain from the other 29 weeks, is repaid in month 34.

**Verdict: Test first.** S3 is 1: a cancellation reason is not a purchase. Smallest version: one week to ship a file export in the import format of the two accounting tools customers named. Pass: 30% of active accounts use it within 30 days and re-entry cancellations fall below 3 a month over the next quarter; then build the direct integration. Stop: under 10% use it. The rewrite and the AI feature return only if a customer-visible result can be named for them.

## Guidelines

- Review what the plan says, not what the owner meant. Quote the plan in the evidence column; where a figure came from memory, mark it.
- Do not cut to zero. A plan with no Must left has no result; the point is the smallest version that still delivers it.
- "Replace with manual" has a ceiling. Give every manual substitute the volume at which it breaks, as the oven has in the first example, so the deferral is a decision and not a postponement.
- The scorecard supports a judgement and does not replace it. Two plans with the same total can differ entirely; the verdict rules look at which checks are zero, not only at the sum.
- Unit arithmetic assumes one kind of unit and a steady monthly gain. Where gains build up (retention, referrals) or arrive in lumps (projects, seasons), compute cumulative cash month by month as in the second example.
- Treat the owner's own time as a cost. A plan that is cheap in cash and consumes every evening for a year fails S5 as surely as a long lease.
- Regulation, safety and contractual duties are Musts whatever the result says; do not cut insurance, licences, food-safety steps or data protection for the sake of a score.
- Not the right tool for choosing between unrelated ideas (score each, but the comparison needs market evidence this review does not gather), or for a plan whose backers have agreed to lose money for growth. It will tell them what they already know.
