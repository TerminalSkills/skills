---
name: pricing-strategy
description: >-
  Sets and reworks software pricing: which unit to charge for, how to split features and limits
  into plans, where to set each price, and how to move new and existing customers to it. Covers a
  first price for a product with no customers yet, diagnosis of the weak lever from billing and
  usage data, willingness-to-pay research, revenue modelling, and the migration and notice plan.
  Use when someone says "how much should I charge", "pricing tiers", "packaging", "value metric",
  "per seat or usage-based", "should we raise prices", "grandfather existing customers", "Van
  Westendorp", "willingness to pay", "free plan or trial", or "annual discount".
license: Apache-2.0
compatibility: >-
  Subscription and usage-billed software with customer and usage data to analyse. The survey script
  needs Python 3.8+. Billing examples use the Stripe API; other billing systems need the same steps.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["pricing", "packaging", "monetization", "saas", "willingness-to-pay"]
---

# Pricing Strategy

## Overview

Pricing is three decisions and one operation. The decisions: the unit a customer pays for (the
value metric), what each plan contains (packaging), and the amounts (level). The operation: moving
new and existing customers to the result without breaking billing or trust. Most pricing problems
sit in the first two decisions; most pricing projects touch only the third.

This skill starts from evidence the business already owns (billing records, usage per account,
sales notes), adds research where evidence is thin, and ends in a pricing memo with a migration
plan. A product with no paying customers yet takes the short path in step 2.

## Instructions

### 1. Collect the facts

Read `.claude/product-marketing-context.md` if it exists. Find how plans are defined in the code
(search for plan names, limits and price identifiers) and export the current catalog:

```bash
curl -G https://api.stripe.com/v1/prices -u "$STRIPE_SECRET_KEY:" \
  -d active=true -d limit=100 -d "expand[]"=data.product
```

Then get, per account where possible: plan, amount actually paid after discounts, start date,
billing period, seats, usage of every candidate metric, features used, and whether the account
churned or expanded. Ask the user for what data cannot tell:

1. The goal: more revenue per customer, more customers, larger buyers, or covering a usage cost.
2. Promises already made: "price locked for life", contract terms, renewal caps in order forms.
3. How deals are closed: self-serve, sales-assisted or both, and how often a discount is needed.
4. The alternatives buyers name, including doing nothing or a spreadsheet.

### 2. No customers yet: set a first price

With nothing to diagnose, skip steps 3 and 8 and keep the structure minimal: one metric, one or
two plans, monthly and annual billing, a trial instead of a free plan until the paid reason is known.

- Bracket the price. Floor: variable cost per customer plus payment fees. Ceiling: what the outcome
  is worth to the buyer (hours saved times their hourly cost, revenue gained, a tool replaced).
  Reference: what they spend on the alternative today, including doing the job by hand.
- Interview 10 to 15 target buyers. Ask what they use now and what it costs, show the product,
  then state a price and watch the reaction. "What would you pay?" produces low, unreliable numbers.
- Ask for commitment (a pre-order, a paid pilot, a card on file); an opinion is not a purchase.
- Choose from the upper half of what buyers accepted without bargaining. A price that is too low
  cannot be told apart from weak demand, and it is easier to discount later than to raise.
- Reward early customers with a dated discount on the list price, not a lower list price.
- Review after the first 20 to 30 paying customers or 90 days; log objections and instant yeses.

### 3. Find the weak lever

| Evidence | Likely problem | Go to |
|---|---|---|
| A 5-person account and a 500-person account pay the same | Metric does not follow value | Step 4 |
| Bills swing and customers ask for caps, or usage is throttled to save money | Metric is unpredictable or punishes adoption | Step 4 |
| 80% of customers sit on one plan, or sales keeps unbundling features to close | Plans do not match buyer groups | Step 5 |
| Almost no price objections, discounts are rare, close rate is unusually high | Level too low | Step 6 |
| Most deals need a discount; churn reasons mention price | Level too high for the value shown, or the wrong buyers | Steps 5 and 6 |
| Free accounts stay active for months and never pay | Free plan gives away the paid reason | Step 5 |

### 4. Choose the value metric

Score each candidate from the usage data, not from opinion:

| Test | How to check |
|---|---|
| Grows with the value the customer gets | Accounts with more of it retain and expand more |
| The buyer can predict the bill | They can state next month's number before the invoice |
| Countable and auditable | The product already records it and can show it to the customer |
| Does not discourage the behaviour that makes the product stick | Per-seat pricing on a collaboration feature suppresses invitations |
| Spreads customers out | If 90% of accounts fall in the lowest band, it does not separate anyone |
| Follows cost when cost is material | Compute, messages, AI calls |

Forms: flat fee, per seat, metered usage, plans with usage bands, a platform fee plus usage, per
outcome. When two metrics score well, charge on one and fence the plan with the other. For tiered
usage, choose between graduated tiers (each unit priced by the band it falls in) and volume tiers
(all units priced by the band reached); graduated avoids a bill that drops at a threshold.

### 5. Package the plans

1. Name the buyer groups by need, two to four of them. Company size is a proxy, not a need.
2. Sort every feature into one of four bins using adoption per group, plus a best-worst ranking
   survey (MaxDiff) when adoption data is missing for unreleased features:
   - **Every plan:** needed to reach the core value. Gating it reduces activation.
   - **Plan differentiator:** the reason one group moves up. One to three per plan.
   - **Add-on:** valued highly by a minority spread across groups.
   - **Controls for large buyers:** security review items, audit logs, uptime terms, invoicing.
3. Give each plan one headline limit on the value metric, so the next plan is the answer to
   growth rather than a feature hunt.
4. Each plan needs a named buyer. A plan nobody is meant to choose is clutter.
5. Free plan or trial: a free plan fits when serving an account costs little and free users bring
   others or content; a time-limited trial fits when value appears within days and serving costs
   are real. Either way the paid reason must stay out of the free allowance.

### 6. Set the level

Evidence, strongest first: prices real buyers accepted or refused (win and loss notes, discount
history, a live test on new signups), then surveys, then competitor price lists, which show the
buyer's reference point and nothing about your value.

Survey methods:

- **Price sensitivity meter (Van Westendorp):** four open questions per respondent: the price at
  which the product is too cheap to trust, a bargain, getting expensive, and too expensive to
  consider. Yields an acceptable range.
- **Gabor-Granger:** purchase intent at a ladder of prices; demand times price gives a revenue curve.
- **Conjoint:** choices between bundles; the right tool when packaging and price interact, and
  the only one of the three that needs specialist software.

Ask people who match the target buyer and know the product, one plan and one billing period per
question. Treat fewer than about 100 usable answers per group as directional.

```python
"""Usage: python3 psm.py survey.csv
Columns, one row per respondent, same currency and billing period: too_cheap, cheap, expensive, too_expensive"""
import csv, sys

rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(sys.argv[1]))]
valid = [r for r in rows if r["too_cheap"] <= r["cheap"] <= r["expensive"] <= r["too_expensive"]]
n = len(valid)
grid = sorted({v for r in valid for v in r.values()})

def at_least(col, p): return sum(r[col] >= p for r in valid) / n   # falls as the price rises
def at_most(col, p): return sum(r[col] <= p for r in valid) / n    # rises with the price

def crossing(falling, rising):
    prev = None
    for p in grid:
        gap = at_least(falling, p) - at_most(rising, p)
        if gap <= 0:
            if prev is None or gap == 0: return p
            p0, g0 = prev
            return p0 + (p - p0) * g0 / (g0 - gap)
        prev = (p, gap)

print(f"{n} of {len(rows)} respondents usable (answers in ascending order)")
print(f"lower bound (too cheap x expensive):      {crossing('too_cheap', 'expensive'):.2f}")
print(f"optimal (too cheap x too expensive):      {crossing('too_cheap', 'too_expensive'):.2f}")
print(f"indifference (cheap x expensive):         {crossing('cheap', 'expensive'):.2f}")
print(f"upper bound (cheap x too expensive):      {crossing('cheap', 'too_expensive'):.2f}")
```

Read the output as a range to test inside, not as the answer: stated willingness differs from
what people pay, and the method ignores volume. Confirm with a live test on new signups.

### 7. Model the change before proposing it

- A price increase of `r` keeps revenue level as long as the share of customers lost because of
  it stays under `r / (1 + r)`. Plus 20% tolerates 16.7%.
- A price cut of `d` needs `d / (1 - d)` more customers to break even. Minus 20% needs 25% more.
- With a real variable cost per customer, do the same on contribution margin. Model per plan and
  cohort (monthly, annual, discounted, legacy), add a pessimistic case, and mark the assumptions.

### 8. Plan the migration

| Option for existing customers | Fits when | Cost |
|---|---|---|
| Keep the old price indefinitely | Small base, strong loyalty, old plans cheap to maintain | Permanent legacy catalog; no revenue gain from the base |
| Keep it for a fixed period, then move | Most cases | Needs two notices and a reminder |
| Move at the next renewal | Annual contracts | Slow; a year until complete |
| Move everyone on one date with notice | Price was far below value, or costs rose | Highest churn risk; needs the best explanation |

Mechanics in Stripe: the amount of a Price cannot be edited after creation. Create the new Price,
move the lookup key to it so the site and checkout pick it up, archive the old one for new sales,
then update each subscription at its own pace:

```bash
curl https://api.stripe.com/v1/prices -u "$STRIPE_SECRET_KEY:" \
  -d product=prod_QmT4vLx81nBkWz -d unit_amount=3500 -d currency=usd \
  -d "recurring[interval]"=month -d lookup_key=growth_monthly -d transfer_lookup_key=true

curl https://api.stripe.com/v1/subscriptions/sub_1Pz8MdJr4Yt2WqLc \
  -u "$STRIPE_SECRET_KEY:" \
  -d "items[0][id]"=si_QpW3xN7uB5kTfa -d "items[0][price]"=price_1Q2kXeJr4Yt2WqLcH9dVmS0b \
  -d "items[0][quantity]"=4 -d proration_behavior=none
```

Name the existing subscription item or the new price is added next to the old one; repeat the
quantity or it resets to 1. With the same billing interval and no proration, the new amount first
appears on the next renewal invoice.

Notice: tell each customer their own old and new amount, the date, what has been added since the
last change, and their options (annual at the old price, a smaller plan, cancelling). California
requires consumer subscriptions to get notice of a fee change 7 to 30 days ahead, with cancellation
instructions. On Apple's App Store an increase can require each subscriber's consent, and a
subscriber who does not agree lapses at the end of the period; existing subscribers can be kept on
their price instead. Contract terms and other jurisdictions are questions for the user's counsel.

### 9. Deliver the memo and measure

The memo has these sections: diagnosis with the evidence; metric; plans table (buyer, headline
limit, differentiators, monthly and annual price); research summary; revenue model with
break-even; migration table by cohort; notice text; risks; what will be measured.

After launch, compare by price version and plan: signup-to-paid conversion, revenue per account,
plan mix, share of deals discounted, churn and downgrades at the first renewal after the change,
billing-related support contacts. Decide in advance which result reverses the change.

## Examples

### Example 1: flat price that ignores account size

Request: "Reedcount is inventory software at a flat $49 a month, 1,900 customers. Big warehouses
pay the same as garages. Fix it."

The usage export shows that locations per account separates customers (1,210 have one, 540 have
two to five, 150 have six or more), that accounts with more locations churn half as often, and
that order volume is too seasonal for buyers to predict. Proposal:

| Plan | Buyer | Price | Headline limit | Differentiators |
|---|---|---|---|---|
| Single | One stockroom | $49 a month | 1 location | Core stock, barcode scanning |
| Multi | Shops with several sites | $49 + $25 per extra location | 5 locations | Transfers between locations, low-stock rules per site |
| Network | Distributors | $149 + $15 per location above 5 | None | Purchase-order approvals, API, audit log |

Model: if the two-to-five group averages 3.5 locations and the six-plus group 7, then at list
prices and with no losses monthly revenue would rise from $93,100 to about $146,000
(1,210 × $49 + 540 × $111.50 + 150 × $179). The memo does not promise that: existing accounts keep $49 for six months, no bill more than
doubles in the first year, and the pessimistic case assumes 15% of multi-location accounts leave.
New signups get the new plans at once, which tests the metric before the base moves.

### Example 2: raising a price that has not moved in two years

Request: "Mossline charges $29 a month for up to 5,000 subscribers. 3,400 customers, monthly churn
2.1%. We have shipped automations and deliverability reports since the last change. How much can
we raise?"

The agent surveys active customers and runs the script:

```text
199 of 212 respondents usable (answers in ascending order)
lower bound (too cheap x expensive):      22.00
optimal (too cheap x too expensive):      29.00
indifference (cheap x expensive):         31.00
upper bound (cheap x too expensive):      39.00
```

Recommendation: $35 for new customers, inside the range and below its upper bound; revenue per
visitor holds unless signup conversion falls by more than 17.1% (6 / 35). Existing customers move
to $33 after 60 days' notice; that is revenue-neutral unless more than 12.1% leave because of it
(4 / 33), and at an assumed 4% loss monthly revenue goes from $98,600 to $107,712. Anyone may
prepay a year at $29 before the date. The memo fixes the reversal rule in advance: if more than 8%
of existing customers cancel citing price within two billing cycles, the base returns to $29.

## Guidelines

- Do not copy a competitor's price list or add a margin to cost. Competitors show what buyers
  compare against and cost sets the floor; value and alternatives set the rest.
- Do not add a plan to solve a discounting problem. Fix the packaging or the discount policy.
- Showing different prices to similar visitors at the same time carries legal and reputational
  risk. Test across time, markets or plan designs, or state openly that pricing is being tested.
- Never change what an existing customer pays without notice, and never by editing amounts in
  place. Legacy prices stay as archived Price objects until the last subscription leaves them.
- Annual discounts trade margin for cash and retention. Express the discount as months free, and
  compare annual and monthly retention before choosing its size.
- Revisit pricing at least yearly and after releases that change the value, so increases stay small.
- When not to use this skill: the problem is the upgrade screen (paywall-upgrade-cro), the layout
  of the public pricing page (page-cro), or a one-off quote for custom work.
