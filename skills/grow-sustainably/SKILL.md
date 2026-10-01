---
name: grow-sustainably
description: >-
  Works out how fast a small business can grow on its own money and capacity,
  and whether a specific commitment (a hire, a lease, an ad budget, a large
  contract) is affordable. Computes contribution margin, break-even, cash
  buffer, acquisition payback, the customer ceiling set by churn, the growth
  rate working capital can fund, and a stress case, then writes guardrails with
  thresholds. Use when someone asks "can we afford to hire", "should we spend
  more on ads", "how fast can we grow without raising money", "are we growing
  too fast", "why is cash tight when sales are up", or "how do I grow without
  burning out". For businesses with revenue: SaaS, services, shops, wholesale.
license: Apache-2.0
compatibility: "Any agent that can read a profit-and-loss export and a billing or sales export (CSV or spreadsheet). Optional: Python 3.8+ (standard library only) for the calculator. No accounts or API keys."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["unit-economics", "cash-flow", "bootstrapping", "retention", "financial-planning"]
---

# Grow Sustainably

## Overview

Growth is sustainable when the business can pay for it out of money it has or is certain to receive, and when the people doing the work can keep the pace for years. A business can fail while selling more every month: the cash goes into stock, unpaid invoices, salaries and advertising faster than customers return it.

This skill turns "should we grow faster, hire, spend, take the contract?" into arithmetic the owner can check. It reads recent figures, computes a small set of numbers, tests the decision against them and writes `growth-guardrails.md`: the numbers, the verdict, and the thresholds that should trigger the next decision.

## Instructions

### 1. Collect the numbers

Read them from exports where possible and ask for the rest. Use the average of the last three months unless the business is seasonal; then use the same months of last year next to this year's.

| Figure | Where it comes from |
|---|---|
| Monthly revenue | profit-and-loss export, billing system |
| Variable costs: whatever rises with each sale (materials, shipping, payment fees, usage-priced hosting, commission) | profit-and-loss export, split line by line |
| Fixed costs: whatever is owed next month regardless of sales (salaries, rent, subscriptions, insurance, loan payments) | profit-and-loss export, payroll |
| Cash in the bank today | bank balance, not the accounting profit |
| Customers, new per month, lost per month | billing or CRM export |
| Acquisition spend per month (ads, commissions, paid tools, the paid hours spent selling) | ad accounts, payroll |
| Days stock is held, days customers take to pay, days taken to pay suppliers | stock and invoice ageing reports |
| Owner's weekly hours, and what the owner is paid | ask |

Two rules for the inputs. Put a market-rate wage for the owner's work into fixed costs even if it is not drawn; a business that is profitable only because its owner works unpaid is not. And split mixed costs (a phone plan with usage charges, a part-time packer paid per order) into their fixed and variable parts.

Then ask what decision is on the table and what it costs: per month, one-off, and how long the commitment lasts.

### 2. Compute the baseline

```text
contribution margin  = (revenue - variable costs) / revenue
break-even revenue   = fixed costs / contribution margin
safety margin        = 1 - break-even revenue / revenue
cash buffer          = cash / monthly fixed costs                      (months)
monthly churn        = customers lost in the month / customers at the start
acquisition cost     = acquisition spend / new customers
payback              = acquisition cost / (revenue per customer x contribution margin)   (months)
lifetime value       = revenue per customer x contribution margin / monthly churn
customer ceiling     = new customers per month / monthly churn
```

The ceiling is the one most owners have never seen: with a steady number of new customers and a steady churn rate, the customer count stops rising at that figure, however long the business runs.

```python
#!/usr/bin/env python3
"""sustain.py growth-inputs.json - margin, break-even, cash buffer, unit economics, commitment tests."""
import json, sys

d = json.load(open(sys.argv[1]))
rev, var, fixed, cash = d["monthly_revenue"], d["variable_costs"], d["fixed_costs"], d["cash"]
cust, new, lost, spend = d["customers"], d["new_per_month"], d["lost_per_month"], d["acquisition_spend"]

cm = (rev - var) / rev            # contribution margin ratio
arpa, churn = rev / cust, lost / cust
gp = arpa * cm                    # contribution per customer per month
print(f"contribution margin  {cm:.0%}")
print(f"break-even revenue   {fixed / cm:,.0f} a month (now {rev:,.0f}, safety margin {1 - fixed / cm / rev:.0%})")
print(f"profit               {rev * cm - fixed:,.0f} a month")
print(f"cash buffer          {cash / fixed:.1f} months of fixed costs")
print(f"churn                {churn:.1%} a month, average customer stays {1 / churn:.0f} months")
print(f"acquisition cost     {spend / new:,.0f}, paid back in {spend / new / gp:.1f} months; lifetime value {gp / churn:,.0f}")
print(f"customer ceiling     {new / churn:,.0f} at {new} new a month = {new / churn * arpa:,.0f} a month in revenue")

for c in d.get("commitments", []):
    fixed2 = fixed + c["monthly_cost"]
    n = cust
    money = low = cash - c.get("one_off", 0)
    back = None
    for month in range(1, 37):
        money += n * gp - fixed2
        low = min(low, money)
        n += new - churn * n
        if back is None and n * gp >= fixed2:
            back = month
    stress = rev * 0.8 * cm - fixed2
    print(f"\n{c['name']}: {c['monthly_cost']:,.0f} a month, {c.get('one_off', 0):,.0f} one-off")
    print(f"  break-even revenue {fixed2 / cm:,.0f} ({fixed2 / gp - cust:+,.0f} customers from today)")
    print(f"  profit at today's revenue {rev * cm - fixed2:,.0f} a month")
    print(f"  profitable again: {'month ' + str(back) if back else 'not within 36 months'}; lowest cash {low:,.0f}")
    print(f"  revenue down 20%: {stress:,.0f} a month"
          + (f", cash lasts {cash / -stress:.0f} months" if stress < 0 else ""))
```

Compare the baseline with these floors. They are widely used conventions, not laws; record any the owner changes and why.

| Figure | Floor | Below it |
|---|---|---|
| Safety margin | 15% | one slow month produces a loss; no new fixed costs |
| Cash buffer | 3 months of fixed costs | build cash before committing to anything |
| Acquisition payback | 12 months or less | each new customer drains cash for longer than a small firm can carry |
| Lifetime value to acquisition cost | 3 to 1 | acquisition is bought too dearly, or churn is too high |
| Monthly churn | not rising three months running | fix retention before buying more customers |

### 3. Pull the levers in this order

1. **Keep customers longer.** Churn sets the ceiling, and lowering it costs nothing per customer.
2. **Price.** A rise that loses no customers goes almost entirely to profit.
3. **Sell more to existing customers:** repeat orders, a higher plan, an add-on.
4. **Convert more of the demand that already arrives:** enquiries, trials, quotes.
5. **Buy more demand,** and only while payback stays under the floor and the buffer above it.

For each lever under discussion, recompute the baseline with the changed input and show the two results side by side.

### 4. Test a commitment

Add each option to `commitments` in the input file and run the script. For a hire, the monthly cost is salary times 1.25 to 1.4 for employer taxes and benefits (the US employer-cost survey puts benefits at 30% of total pay in private industry, which is 1.43 times wages), plus equipment and recruiting as one-off costs.

- **Go** when the business still makes a profit at today's revenue, or returns to profit within 6 months, and the lowest cash stays above three months of the new fixed costs, and the 20%-revenue-drop case leaves at least 6 months of cash.
- **Smaller** when any of those fails: find the most reversible form of the same thing (a contractor, part-time hours, a month-to-month space, a four-week advertising trial with a cap) and test that.
- **Wait** when the small form fails too. State the number at which it passes ("at 330 customers and $68,000 in the bank") so the owner knows when to ask again.

### 5. When cash sits in stock and unpaid invoices

Any business that buys before it sells, or is paid after it delivers, needs more cash for every extra sale. The rate it can grow without outside money:

```text
cycle days          = days stock is held + days customers take to pay
cash tied per $1    = cost of goods % x (cycle days - days taken to pay suppliers) / cycle days
                      + operating costs % x 0.5
working capital     = annual sales x cycle days / 365 x cash tied per $1
self-funded growth  = net margin % / cash tied per $1          per cycle
                      x 365 / cycle days                         per year
cash a plan needs   = working capital at the new sales and terms - working capital today
                      - net margin % x sales made during the year
```

Operating costs count at half because they are paid evenly through the cycle. Sales made during a year of steady growth are roughly today's annual sales x (1 + growth / 2). The yearly rate errs slightly low, which is the safe side. Businesses paid in advance (subscriptions, deposits, card at the till) have a short or negative cycle and are limited by step 2, not by this.

Shortening the cycle is the cheapest way to raise the rate: deposits, card on file, invoicing on delivery day, smaller and more frequent stock orders, longer supplier terms.

### 6. Check the owner's capacity

Have the owner log two normal weeks by activity. Flag an average above 50 hours, and any task that recurs weekly, takes over two hours and follows the same steps each time: write it down as a checklist, hand it to someone, then automate it, in that order. Growth that depends on the owner adding hours is not funded, whatever the cash says. The World Health Organization describes burn-out as the result of chronic workplace stress that has not been managed: exhaustion, growing distance from the work, falling effectiveness. If the owner reports those, the plan's first item is to reduce load, not to add revenue.

### 7. Funding growth above the self-funded rate

When the plan needs more cash than the business produces, take it from the cheapest source first: customers (annual prepayment, deposits), suppliers (longer terms), a credit line sized to the working-capital gap, a term or revenue-based loan, and only last a sale of shares, which is permanent. Borrow against a gap you have calculated, never against a hope that sales will cover it.

### 8. Output

```markdown
# Growth guardrails: (business), (date)
Decision under review: (one line)

## Baseline (three-month average)
| Figure | Value | Floor | Status |
|---|---|---|---|

## Verdict: Go / Smaller / Wait
Two or three sentences with the numbers that decided it.

## Options tested
| Option | Monthly cost | Profit at today's revenue | Profitable again | Lowest cash | 20% drop |
|---|---|---|---|---|---|

## Levers, in order, with the effect of each on the baseline
## Guardrails: the thresholds that reopen this decision, and the date of the next review
## Assumptions and figures the owner supplied from memory
```

## Examples

### Example 1: Can a three-person software company afford a support hire?

Maren Solberg runs scheduling software for dance studios: 268 customers, $21,400 a month, $64,000 in the bank. Support takes half her week and she wants a full-time hire at $52,000. Inputs: variable costs $2,996, fixed costs $16,900 including her own market wage, 14 new and 8 lost customers a month, $2,100 a month on acquisition. The hire is entered at $52,000 x 1.3 / 12 = $5,633 a month plus $1,800 one-off; the alternative is a contractor for 20 hours a week at $32 an hour, $2,773 a month.

```text
contribution margin  86%
break-even revenue   19,651 a month (now 21,400, safety margin 8%)
profit               1,504 a month
cash buffer          3.8 months of fixed costs
churn                3.0% a month, average customer stays 34 months
acquisition cost     150, paid back in 2.2 months; lifetime value 2,300
customer ceiling     469 at 14 new a month = 37,450 a month in revenue

full-time support hire: 5,633 a month, 1,800 one-off
  break-even revenue 26,201 (+60 customers from today)
  profit at today's revenue -4,129 a month
  profitable again: month 12; lowest cash 37,313
  revenue down 20%: -7,810 a month, cash lasts 8 months

support contractor, 20 h a week: 2,773 a month, 0 one-off
  break-even revenue 22,876 (+18 customers from today)
  profit at today's revenue -1,269 a month
  profitable again: month 4; lowest cash 61,347
  revenue down 20%: -4,950 a month, cash lasts 13 months
```

Verdict: **Smaller.** The full-time hire fails two tests: a year of losses, and cash falling to $37,313 against a floor of $67,599 (three months of the new fixed costs). The contractor passes all three: profitable again in month 4, lowest cash $61,347 against a floor of $59,019, thirteen months of cash in the stress case. The safety margin of 8% is already under the 15% floor, which is the reason to avoid a permanent cost.

Levers written into the file: acquisition is cheap (payback 2.2 months), so the limit is churn. Cutting it from 3.0% to 2.2% lifts the ceiling from 469 to 636 customers, the same as buying five more customers every month at $750 a month for ever. The contractor is therefore measured on churn, with a target of 2.5% within two quarters. A 5% price rise would add about $1,000 a month to a profit of $1,504. Guardrail: revisit a full-time hire at 330 customers and $68,000 in cash.

### Example 2: A wholesale roaster offered a contract that nearly doubles sales

Pilar Estévez roasts coffee for cafés: $48,000 a month, cost of goods 58%, operating costs 37% including her pay, net margin 5%, $22,000 in the bank. Stock sits 45 days, cafés pay in 38, she pays suppliers in 15. A grocery chain offers $43,200 a month within a year, paid at 60 days.

| | Today | Contract as offered | Contract after changes |
|---|---|---|---|
| Stock days / customer days | 45 / 38 | 45 / 48.4 blended | 30 / 32.4 blended |
| Cycle days | 83 | 93.4 | 62.4 |
| Cash tied per $1 of sales | 0.660 | 0.672 | 0.626 |
| Working capital | $86,471 | $188,198 | $116,971 |
| Increase to fund | | $101,727 | $30,500 |
| Cash generated in the year (5% of about $835,000) | | $41,760 | $41,760 |
| Gap or surplus | | $59,967 short | $11,260 over |

Her self-funded rate today is 0.05 / 0.660 = 7.6% a cycle, about 33% a year; the contract is 90% growth. As offered it needs $60,000 she does not have, and it would look like success the whole way down: record sales, a full roastery, an empty account.

Verdict: **Go, on three conditions met before signing.** Move cafés to card on file so they pay in 21 days; order green coffee monthly so stock falls to 30 days; negotiate the chain to 45 days. With all three the plan funds itself with $11,260 to spare. If the chain holds at 60 days, the fallback is half the volume in year one or a credit line of $25,000 agreed in advance.

## Guidelines

- Profit is not cash. Tax, loan principal, stock purchases and the owner's drawings leave the bank without appearing in the margin. When the buffer is under three months, add a 13-week cash forecast, week by week, before any verdict.
- Three months of data make churn and lifetime value rough. With under a year of history, treat lifetime value as an upper bound and rely on payback, which needs no forecast.
- The floors are conventions. The median small business in one large US bank study held 27 days of cash, so three months is deliberately cautious; an owner with dependable recurring revenue may choose less, and one with a few large customers should choose more.
- A falling safety margin while revenue rises means fixed costs are growing faster than sales. Say so even when nobody asked.
- Averages hide concentration. If one customer is over 20% of revenue, run the stress case as the loss of that customer, not as 20% across the board.
- Do not present the stress case as a forecast. It answers one question: how long is there to react.
- This is arithmetic on the owner's figures, not accounting, tax or legal advice, and not a diagnosis of anyone's health. Send decisions on entity structure, tax timing and loan covenants to an accountant.
- Not the right tool before there is revenue (there is nothing to compute; get customers first), or for a company that has deliberately raised money to lose it for market share. That is a different bet with different arithmetic.
