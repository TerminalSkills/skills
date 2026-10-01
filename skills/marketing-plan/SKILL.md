---
name: marketing-plan
description: >-
  Writes a marketing plan for a small business as a working document: where
  customers come from today, one target segment and message, a numeric goal
  turned into the leads it requires, a spending ceiling derived from what a
  customer is worth, channels chosen by score, a 13-week calendar and a weekly
  scorecard with stop rules. Use when someone asks "write a marketing plan",
  "how should I market this", "which channels should I use", "how much should I
  spend on marketing", "plan the next quarter's marketing", or "make a 90-day
  go-to-market plan". Suits local services, shops, B2B software and solo
  founders with a small budget.
license: Apache-2.0
compatibility: "Any agent that can read the project's site copy and a customer or sales export (CSV or spreadsheet). Optional: Python 3.8+ (standard library only) for the plan calculator. No accounts or API keys."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["marketing", "go-to-market", "channel-strategy", "budgeting", "small-business"]
---

# Marketing Plan

## Overview

A marketing plan for a small business is a short document that answers six questions with numbers: who the business is for, what it says to them, how many new customers it wants and by when, what it may spend to get each one, which few channels it will use, and how it will know by week four whether the plan is working. Those are the same parts the US Small Business Administration lists for a plan (target market, competitive advantage, sales plan, goals, action plan, budget), arranged so each one feeds the next.

This skill produces `marketing-plan.md` for one quarter (13 weeks) and the inputs file its numbers were computed from. It assumes the business has customers already. With none, direct selling comes first, because a plan needs to know who buys and why.

## Instructions

### 1. Gather the facts

Read before asking: the website and its main pages, pricing, any analytics export, the customer or job list (especially a "source" or "how did you hear about us" column), reviews, past campaigns and what they cost.

Ask for what is missing:

1. What is sold, the average sale, and how often a customer buys again in a year.
2. Gross margin on a sale (what is left after the direct cost of delivering it).
3. New customers per month now, and the goal for the quarter.
4. Money available for the quarter, and hours per week the owner or team can give.
5. The conversion steps from first contact to sale, with rough rates (enquiry to quote, quote to job; visit to trial, trial to paid).
6. Service area or market, and anything already tried.

### 2. Describe the situation in numbers

- **Source tally.** Count the last 40 to 100 customers by how they arrived. This is the best single predictor of which channels will work. If the data does not exist, the plan's first action is to start recording it.
- **Best customers.** Take the top fifth by profit and write down what they share: type, size, location, and above all the event that made them look for a solution.
- **Alternatives.** List what a buyer does otherwise, including doing nothing and doing it themselves, with prices.
- **Segment size.** Count the segment where a count is available (households in the service area, businesses of that type in the region; in the US, County Business Patterns on data.census.gov gives establishments by industry and county). A segment the plan could exhaust in a quarter is too small; one it cannot describe in a sentence is too broad.

### 3. Fix the target and the message

Choose one segment for the quarter. Write the message as five short lines, then compress it to a sentence:

```text
Who       homeowners with solid-wood kitchen cabinets from the 1990s
When      they have just been quoted $18,000 or more to replace them
Result    the kitchen looks new in five working days for about a quarter of that
Proof     40 kitchens finished locally, photos of each, a five-year finish warranty
Instead   of replacing sound cabinets, or painting them over a weekend
```

Read the sentence to five customers and ask them to say it back. What they repeat is the message; what they drop was not doing any work.

### 4. Turn the goal into leads and a spending ceiling

```text
first-year profit per customer = first-year revenue per customer x gross margin
allowable cost per customer    = first-year profit per customer / 3
spending ceiling               = goal x allowable cost per customer
leads needed                   = goal / (product of the conversion rates)
```

Dividing by three is the common rule that a customer should return about three times what it cost to win; a business short of cash can use a payback period instead (the cost must come back within so many months). Use first-year figures, not lifetime ones, unless there are years of retention data.

Put the inputs in `plan-inputs.json` and the candidate channels with an honest estimate of the leads each will bring:

```python
#!/usr/bin/env python3
"""plan_math.py plan-inputs.json - goal, funnel, spending ceiling and a channel table."""
import json, sys

d = json.load(open(sys.argv[1]))
goal = d["goal_new_customers"]
profit = d["first_year_revenue_per_customer"] * d["gross_margin"]
allowable = profit / d.get("profit_to_cost_ratio", 3)
rate = 1.0
for step in d["funnel"].values():       # e.g. lead -> quote -> sale
    rate *= step
print(f"goal                {goal} new customers in {d['weeks']} weeks")
print(f"first-year profit   {profit:,.0f} per customer; allowable cost {allowable:,.0f} each; ceiling {goal * allowable:,.0f}")
print(f"funnel              {rate:.1%} of leads become customers; {goal / rate:.0f} leads needed ({goal / rate / d['weeks']:.1f} a week)")

print(f"\n{'channel':34} {'leads':>5} {'cust':>5} {'cost':>6} {'hours':>5} {'cost/cust':>9}")
leads = cost = hours = 0
for c in d["channels"]:
    n = c["leads"] * rate
    per = c["cost"] / n if n else 0
    flag = "  over" if per > allowable else ""
    print(f"{c['name'][:34]:34} {c['leads']:>5} {n:>5.1f} {c['cost']:>6,} {c['hours']:>5} {per:>9,.0f}{flag}")
    leads, cost, hours = leads + c["leads"], cost + c["cost"], hours + c["hours"]
print(f"{'total':34} {leads:>5} {leads * rate:>5.1f} {cost:>6,} {hours:>5} {cost / (leads * rate):>9,.0f}")
print(f"\nbudget {cost:,} of {d['budget']:,}; hours {hours} of {d['hours_available']}; "
      f"{'meets' if leads * rate >= goal else 'misses'} the goal of {goal}")
```

A "lead" is whatever enters the first conversion step: an enquiry for a trade, a visit for a website. A channel marked `over` costs more per customer than the business can afford and is cut, shrunk to a test, or renegotiated. If the plan misses the goal inside the budget and the hours, change the goal, not the estimates.

### 5. Choose the channels

Every plan starts with a base layer, because nothing else pays without it: a page or profile that says the message and makes the next step obvious, a way to record where each lead came from, a permission-based contact list, and a request for a review or referral at the moment of delivery.

Then score the candidates from 0 to 3 on four questions and take the top two or three that fit the money and hours:

| Question | 0 | 3 |
|---|---|---|
| Audience: is the segment there? | no evidence | the source tally or a search already shows it |
| Intent: are they looking to buy when they meet it? | passing time | searching for the solution by name |
| Speed and cost to a first result | months and four figures | weeks and little cash |
| Capability: can this business do it well? | needs skills nobody has | already does it |

| Channel | Suits | Typical time to first result | Rule to know |
|---|---|---|---|
| Google Business Profile and reviews | local buyers who search by need and place | weeks | local ranking rests on relevance, distance and prominence and cannot be bought; offering anything in exchange for reviews is prohibited |
| Referrals and partners | satisfied customers who know others like them | weeks | ask at delivery; thank referrers, never pay for reviews |
| Pages that answer searched questions | problems people type into a search engine | months | one page per question, written from real customer wording |
| Email list | repeat purchase or long consideration | weeks | consent first; every message carries an unsubscribe link and, in the US, a postal address |
| Communities and direct outreach | a niche small enough to list by name | weeks | each venue's rules on promotion |
| Search ads | demand that is already searched | days | cap the test and set the stop rule first |
| Social ads and sponsorships | visual products; niche newsletters and podcasts | weeks | price one placement before buying three |
| Events and trade shows | high-value sales | fixed by the date | cost per conversation, not per badge scan |

Everything not chosen goes into the plan under "not this quarter" with the reason, so it is not reopened every week.

### 6. Lay out 13 weeks

Weeks 1 and 2 build the base layer. Weeks 3 to 12 run the chosen channels at a fixed weekly rhythm. Week 13 is the review. Give every paid or uncertain activity the form of an experiment: what is expected, by when, at what cost, and the result that stops it. A workable stop rule for paid tests: pause once the test has spent twice the allowable cost per customer without producing a customer.

Content topics come from questions customers have actually asked (support mail, quote visits, sales calls, review text), one piece per question, each ending in the same next step.

### 7. Measure

Tag every link the business controls so sources stay separable. Google Analytics reads `utm_source`, `utm_medium` and `utm_campaign` (always use all three) and treats values as case sensitive, so `Google` and `google` become two sources. Keep everything lower case:

```text
https://fernhillcabinets.com/quote?utm_source=google&utm_medium=cpc&utm_campaign=2026q4_cabinet_refinishing
https://fernhillcabinets.com/quote?utm_source=referral_card&utm_medium=offline&utm_campaign=2026q4_past_customers
```

Offline sources need a question: "How did you hear about us?" on every form and call, with fixed answers.

The weekly scorecard has one row per week: leads by source, each conversion step, sales, spend, cost per customer by channel, reviews, list size. Review every four weeks and make one of three decisions per channel: keep, change one thing, or stop.

### 8. Output

```markdown
# Marketing plan: (business), (quarter)

## 1. Situation
Source tally, best customers, alternatives and their prices, segment size.

## 2. Target and message
The five lines, the sentence, three proof points.

## 3. Goal and arithmetic
Goal, conversion rates, leads needed, allowable cost per customer, ceiling. Output of plan_math.py.

## 4. Channels
Score table, chosen channels with expected leads, cost, hours. Not this quarter, with reasons.

## 5. Calendar
| Week | Action | Who | Hours | Cost | Measured by |

## 6. Experiments and stop rules
## 7. Scorecard and review dates
## 8. Assumptions (every estimate, marked measured or guessed)
```

## Examples

### Example 1: A cabinet-refinishing business with $3,000 and five hours a week

Dele Adeyemi refinishes kitchen cabinets in Columbus, Ohio: average job $4,200, gross margin 45%, six jobs a month, and he wants ten. That is 12 extra jobs in the quarter. Of his last 40 jobs, 17 came by referral, 11 from Google search and Maps, 5 from Nextdoor, 4 from yard signs and 3 are unknown. Six in ten enquiries get a quote visit and 35% of quotes become jobs.

| Channel | Audience | Intent | Speed and cost | Capability | Total | Decision |
|---|---|---|---|---|---|---|
| Business Profile and review requests | 3 | 3 | 2 | 3 | 11 | chosen |
| Referral request to past customers | 3 | 2 | 3 | 3 | 11 | chosen |
| Search ads | 3 | 3 | 2 | 1 | 9 | capped test |
| Yard signs and door hangers | 2 | 1 | 3 | 3 | 9 | chosen, cheap |
| Instagram before-and-after posts | 2 | 1 | 1 | 2 | 6 | not this quarter |
| Home-show booth at $2,400 | 2 | 2 | 1 | 1 | 6 | not this quarter: most of the budget on one weekend |

```text
goal                12 new customers in 13 weeks
first-year profit   1,890 per customer; allowable cost 630 each; ceiling 7,560
funnel              21.0% of leads become customers; 57 leads needed (4.4 a week)

channel                            leads  cust   cost hours cost/cust
Business Profile + review requests    15   3.1      0    14         0
Referral request to 40 past jobs      14   2.9    240    10        82
Search ads, 8-week test               24   5.0  1,800    12       357
Yard signs + door hangers              6   1.3    360     9       286
total                                 59  12.4  2,400    45       194

budget 2,400 of 3,000; hours 45 of 65; meets the goal of 12
```

Calendar, in brief. Weeks 1 and 2: complete the Business Profile (services, service area, hours, 30 job photos), add a quote page with the "how did you hear" question, put the review link on every invoice, and text the 40 past customers a thank-you with the review link and a referral card. Weeks 3 to 10: search ads at $225 a week on "cabinet refinishing" searches inside the service area, a sign at every job and 25 door hangers on the same street. Stop rule for the ads: pause at $1,260 spent with no booked job. The ad figure of $75 a lead is marked as a guess; week 4 replaces it with the measured one. The $600 not allocated stays in reserve for whichever channel is ahead at the week-8 review.

### Example 2: Inventory software for small breweries

Linnea Brandt has 140 customers at $89 a month, 82% gross margin and 2.5% monthly churn, so a customer brings about $933 in the first year. Each quarter 2,700 visits produce 108 trials and 24 customers; she wants 45, with $6,000 and ten hours a week.

At today's rates 45 customers would need 5,114 visits, nearly double the traffic. The trial list shows a cheaper lever first: 9 of the 22 trials that had a setup call became customers, against 15 of the 86 that did not. A call for every trial is planned at 50 hours, with trial-to-paid assumed to rise from 22% to 30%.

```text
goal                45 new customers in 13 weeks
first-year profit   765 per customer; allowable cost 255 each; ceiling 11,476
funnel              1.2% of leads become customers; 3750 leads needed (288.5 a week)

channel                            leads  cust   cost hours cost/cust
Existing traffic                    2700  32.4      0     0         0
Guild newsletter, 3 issues           540   6.5  1,800    12       278  over
Brewery-software directory listing   300   3.6      0    20         0
Spreadsheet-template page + email    450   5.4      0    45         0
Onboarding call for every trial        0   0.0      0    50         0
total                               3990  47.9  1,800   127        38

budget 1,800 of 6,000; hours 127 of 130; meets the goal of 45
```

The newsletter is flagged: $278 a customer against $255 allowed. The plan buys one issue for $600 and continues only if it brings three paying customers ($200 each). The riskiest assumption is the 30%: if trial-to-paid stays at 22%, the same traffic yields 35 customers, so the week-4 review checks that rate before anything else. Most of the $6,000 stays unspent, and the plan says so plainly; the limit here is hours, not money.

## Guidelines

- A plan with more than three active channels for one person is a list of intentions. Cut until the hours add up, and show the sum.
- Estimates of leads per channel are the weakest numbers in the document. Mark each as measured or guessed, and replace guesses at the first review.
- Do not benchmark the budget against a percentage of revenue borrowed from large companies. The ceiling comes from what a customer is worth to this business.
- Paid traffic to a page that does not convert only buys the proof that it does not convert. Fix the base layer first.
- Reviews: ask every customer, make it one tap with the review link or QR code, reply to each one, and never offer a discount or gift for a review. Google prohibits incentives of any kind and can restrict a profile that uses them.
- Email and text marketing need permission in most countries; in the US every commercial email needs a working unsubscribe honoured within 10 business days and a postal address. Collect consent at the point of signup and keep the record.
- Attribution in a small business is approximate. Use tagged links and the asked question together and accept "unknown" under about 10%; do not buy tooling to chase the remainder.
- Not the right tool before the first customers exist, for a single launch day (that is an event plan), or for a company with a marketing team and a six-figure budget, where channel owners, forecasting and brand work need more than this document holds.
