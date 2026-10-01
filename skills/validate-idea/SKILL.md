---
name: validate-idea
description: >-
  Tests a business or product idea against evidence before anything is built: turns the idea into
  falsifiable assumptions, grades the evidence already collected, designs cheap experiments
  (interviews, smoke tests, pre-sales, hand-delivered pilots) with pass lines fixed in advance, and
  returns a verdict with the numbers behind it. Use when someone asks "is this idea any good",
  "should I build this", "how do I validate my startup idea", "is there a market for this", or wants
  interview questions, a landing-page test, or help reading early signup or pre-order results.
license: Apache-2.0
compatibility: "Any agent that can read and write files in the working directory. Web search is optional (competitor and demand research); Python 3 is optional (confidence-interval check)."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["startup", "idea-validation", "customer-interviews", "market-research", "experiments"]
---

# Idea Validation

## Overview

An idea is a bundle of guesses: that a specific group has a problem, that it hurts enough to pay for, that those people can be reached for less than they are worth, and that the promised result can be delivered. Validating means finding the guess most likely to be wrong and attacking it with the cheapest experiment that could disprove it, before any product exists.

The result of this skill is a validation brief: the idea in one testable sentence, ranked assumptions, the evidence graded by strength, the next experiments with pass lines set in advance, and a verdict. Evidence here means behaviour (what people did, paid or gave up), not what they said they might do.

## Instructions

### 1. Collect the facts

In a project directory, read first: README, `docs/`, `notes/`, interview transcripts, survey or analytics exports. Then ask only for what is missing, in one message:

- Who is the buyer, narrowly: role, size of company or life situation, and the moment the problem shows up?
- What do they do about it today, and what does that cost in money or hours?
- What has been observed so far? Ask for counts ("7 of 11 calls"), not impressions.
- Planned price and how it is charged (once, monthly, per use).
- How can the founder reach these people, and how many are within reach?
- Budget and weeks available for testing, and which result would make them drop the idea.

### 2. Write the idea so it can fail

One sentence: "*Segment* who *trigger situation* currently *workaround and its cost*; they will pay *price* for *outcome*." If the segment reads like "small businesses" or "busy people", narrow it until 50 members could be listed by name.

### 3. Rank the assumptions

| Kind | The question | Usually tested by |
|---|---|---|
| Problem | Does this segment hit the problem often and spend effort on it? | Interviews about past behaviour, review mining, search demand |
| Payment | Will they pay this price, in this form? | Pre-sale, deposit, letter of intent, paid pilot |
| Reach | Can they be reached for less than a customer is worth? | Smoke test with ads, cold outreach reply rate |
| Delivery | Can the outcome be produced legally, technically and at a margin? | Hand-delivered pilot, technical spike, compliance check |

Score every assumption 1–3 for damage if false and 1–3 for missing evidence, multiply, and test from the top. On a tie, the cheaper test goes first.

### 4. Grade the evidence already in hand

| Level | What happened | Example |
|---|---|---|
| 0 | Opinion from the founder's circle | "My cofounder and two friends like it" |
| 1 | Strangers said something positive | Survey answers, likes, "I'd use that" |
| 2 | Existing behaviour observed | They already pay for a workaround, complain publicly, search for it |
| 3 | They gave up time or reputation | Booked a call, joined a waitlist with a work address, introduced a boss |
| 4 | They gave up money | Deposit, pre-order, signed letter of intent, paid pilot |
| 5 | They came back | Renewal, repeat order, weekly use of a pilot |

Count only people inside the segment who are not friends, relatives or colleagues. Write every finding as "k of n". A single case never moves the grade.

### 5. Choose the next experiment

| Experiment | Reaches level | Typical cost | Run it honestly |
|---|---|---|---|
| Problem interviews (10–15 in one segment) | 2–3 | 1–2 weeks, no spend | Ask about the last occurrence; no pitch until the end |
| Desk research: competitor pricing, 1–3 star reviews, search volume | 2 | 1–2 days | Record sources and dates; a crowded market is evidence of spending |
| Smoke test: one page, one offer, paid traffic | 3 (4 with a deposit) | 1 week, $200–500 of ads | Say after the click that the product is not ready yet |
| Fake door inside an existing product | 3 | Days | Show a "not available yet" message and offer to notify |
| Pre-sale or refundable deposit | 4 | 1–2 weeks | State the delivery date; refund automatically if it slips |
| Hand-delivered pilot for 3–5 customers | 4–5 | 2–6 weeks of the founder's time | Charge for it; log every manual step and the hours |

Pick the cheapest experiment able to reach the level the top assumption needs. Payment assumptions need level 4; no number of interviews substitutes for it.

### 6. Fix the pass line before running

Derive the threshold from the economics of the idea, not from an industry average:

```text
first-year gross profit = price per year x gross margin
allowable acquisition cost (CAC) = first-year gross profit / 3      (common 3:1 rule of thumb)
required visitor-to-customer rate = cost per click / allowable CAC
```

Write down the pass line, the sample size and the stop date, and get the founder to agree to them before the first visitor arrives. With small samples, report an interval rather than a single percentage:

```python
from math import sqrt
def wilson(k, n, z=1.96):          # 95% interval for k successes out of n
    p, d = k / n, 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return round(c - h, 3), round(c + h, 3)
```

If nobody converts out of n, the true rate can still be as high as roughly 3/n (0 of 100 is compatible with 3%). A test passes when the whole interval is above the line, fails when the whole interval is below it, and is undecided otherwise: extend it or change the test.

### 7. Size the market from the bottom up

`reachable buyers x yearly price x share you can plausibly win`, using a list that can be counted (a directory, a registry, members of a community). Compare the result with the income the founder needs. Never argue from "1% of a huge market".

### 8. Run interviews that produce evidence

- Stay in one segment for 10–15 conversations; reviews of qualitative studies find that new themes mostly stop appearing between 9 and 17 interviews in a homogeneous group. A second segment needs its own set.
- Ask about specific past events: "Tell me about the last time this happened. What did you do next? What did it cost? What have you tried or paid for?" Avoid "would you use…" and "how much would you pay…"; people invent answers to hypotheticals.
- Describe the product only at the end, then ask for a commitment that costs something: a deposit, a pilot start date, an introduction to whoever signs.
- Tally after each call: raised the problem unprompted (y/n), has a workaround (what), spends money on it (how much), commitment given (which).

### 9. Decide

| Verdict | Condition |
|---|---|
| **Build** | Problem at level 2+ for most of the segment sample, payment at level 4 from strangers, reach cost under the allowable CAC or a named free channel, market large enough for the goal |
| **Keep testing** | No failed pass line, but the top assumption is still below the level it needs; name the one experiment that closes the gap |
| **Reshape** | The problem is real but a pass line failed on price, channel or segment; state which element changes and what the new test is |
| **Stop** | Problem interviews show no workaround and no spending, or two reshaped tests in a row failed |

### 10. Write the brief

Save as `validation-brief.md` (or reply inline) in exactly this shape:

```markdown
# Validation brief: clinic waitlist texts (2026-10-01)
**Idea:** the one testable sentence from step 2
**Verdict:** Build, Keep testing, Reshape or Stop, plus the single deciding fact
## Assumptions (ranked)
| # | Assumption | Kind | Damage x Unknown | Level now | Level needed |
## Evidence
k-of-n findings with source and date; who was left out of the counts and why
## Numbers
price, margin, allowable CAC, pass lines, market arithmetic
## Next experiment
what, with whom, sample size, pass line, stop date, cost
## Open risks
```

## Examples

### Example 1: clinic waitlist tool, evidence from interviews and deposits

Jonas Weber wants to sell physiotherapy clinics a tool that texts waitlisted patients when an appointment is cancelled, at €79 a month. He has run 12 calls with practice managers reached through cold email and counted 412 clinics in the three cities he can visit.

**Idea:** practice managers at clinics with 3+ therapists who lose paid slots to late cancellations currently phone the waitlist by hand; they will pay €79 a month to have freed slots refilled automatically.

| Finding | Count | Level |
|---|---|---|
| Raised late cancellations without being prompted | 9 of 12 | 2 |
| Fill gaps by phoning patients themselves | 5 of 12 | 2 |
| Paid a €150 deposit for a three-month pilot | 4 of 12 (95% interval 14%–61%) | 4 |

Numbers: first-year gross profit = 79 × 12 × 0.85 = €805.80; allowable CAC = €268.60, which buys about 7.7 hours of outreach per closed clinic at €35 an hour, so selling by phone and visit is affordable. Market: his goal of €60,000 a year needs 64 clinics (60,000 ÷ 948), which is 16% of the 412 he can reach; at the low end of the interval (14%) he would land at 57 clinics and €54,000, just short.

**Verdict: Build, as a hand-delivered pilot.** Payment is at level 4 from strangers. Open risks: the four payers came from people who agreed to a call, so the true rate across all clinics is lower; the goal is met only if the deposit rate holds, so the reachable list should grow beyond three cities. Next experiment: run the pilot for the four clinics by hand for six weeks; pass line: three of four refill at least two slots a week and convert to the monthly plan.

### Example 2: consumer subscription, smoke test that fails on reach

Amara Okafor plans a meal-planning web app for people newly diagnosed with coeliac disease at $36 a year. Before the test she fixed the pass line: gross margin 85%, so first-year gross profit is $30.60 and allowable CAC is $10.20. Her ads cost $0.70 per click, so she needs 0.70 ÷ 10.20 = 6.9% of clicks to pre-order.

Result after one week: $300 spent, 428 clicks, 19 email signups (4.4%), 2 pre-orders.

- Pre-order rate: 2 of 428 = 0.47%, 95% interval 0.13%–1.69%. The whole interval sits below 6.9%.
- Cost per pre-order: $150 against an allowable $10.20.

**Verdict: Reshape.** The problem assumption is untested by this experiment (signups at 4.4% show some interest), but paid ads cannot carry a $36 product: even the top of the interval is four times too low. What changes: the channel, not the product. Next experiment: ask five dietitians who see newly diagnosed patients to hand out a pre-order link for two weeks; pass line: 15 pre-orders with no ad spend. If that fails too, the verdict becomes Stop.

## Guidelines

- Praise, survey enthusiasm and waitlist size are level 1–3 evidence. Do not issue a Build verdict on them for a paid product.
- People the founder already knows inflate every rate. Keep them out of the counts or report them in a separate row.
- Never move a pass line after seeing the data. If the line was wrong, say so, set a new one and rerun.
- A fake door or smoke test must tell visitors the product is not available yet and what happens to their email address; never take a payment without a delivery date and a refund path.
- Competitors with paying customers are level 2 evidence for the problem, not a reason to stop. No competitor and no workaround at all is a warning.
- Regulated fields (health, finance, children's data) add a delivery assumption that must be checked with a qualified person before a pilot touches real customers.
- The 3:1 ratio and the 95% interval are conventions. State them in the brief so the reader can substitute their own.
- This skill ends at the verdict. Scoping the first release belongs to an MVP plan; setting a price belongs to pricing research.
- Do not use it for an established product with usage data: analyse the retention and revenue figures instead.
