---
name: first-customers
description: >-
  Plans and tracks the direct, one-at-a-time selling that gets a new product or
  service its first 10 to 100 paying customers: sizes the outreach needed from
  stage conversion rates and the founder's hours, builds a prospect list ordered
  by warmth, shapes an early-customer offer and price, drafts outreach and call
  scripts, and reads the funnel each week. Use when someone asks "how do I get my
  first customers", "nobody is buying, what do I do", "write a cold email for my
  product", "how many people do I need to contact", "should I charge early
  users", or "get me to 10 paying customers". Covers SaaS, services, local
  trades and products that are not built yet.
license: Apache-2.0
compatibility: "Any agent that can read and write files. Optional: Python 3.8+ (standard library only) for the funnel script. No accounts or API keys; payments are collected with whatever the business already uses."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["sales", "customer-acquisition", "outreach", "startup", "pricing"]
---

# First Customers

## Overview

The first customers of a small business are won by the founder, in person, one conversation at a time. Advertising and content need a message that is known to work and a customer profile that is known to buy; direct selling is how both are found. This skill treats that stage as a pipeline with numbers: how many people have to be contacted, in which order, with what offer, and what the results say to change.

It produces three things: `first-customers-plan.md` (target, offer, pipeline arithmetic, weekly rhythm), `prospects.csv` (one row per person, dated at every stage), and the messages and call outline the founder will use.

## Instructions

### 1. Establish the starting position

Ask what the project does not show:

1. What is sold, to whom (role plus situation), and at what price?
2. What exists today: a working product, a prototype, or nothing yet?
3. How many people does the founder know by name who have this problem? How many more can be found who have talked about it in public?
4. How many hours a week can go to selling, and for how many weeks?
5. The target: how many paying customers, by when.
6. Where the prospects are (country), because the rules for unsolicited email differ.

Read the landing page and pricing, any contact list or CRM export, earlier outreach, and how payment is taken. If nobody can pay today, fixing that comes before any outreach.

### 2. Shape the early-customer offer

Early customers buy a result and the founder's attention. State the offer in five lines: the outcome, the price, the term, what happens if it does not work, and what the founder asks for in return (a 20-minute feedback call after two weeks, a reference if they are happy).

| What exists | Offer | Money |
|---|---|---|
| Working product | Standard plan, set up by the founder personally | Full price from day one, cancel any time |
| Half-built product | Paid pilot: fixed term of 30 to 60 days and one written success measure | Fixed fee up front, refunded if the measure is missed |
| Nothing built | Pre-sale with a stated delivery date, or the result delivered by hand as a service | Deposit, refundable until delivery |
| Service or trade | The normal job with a redo guarantee | Full price; a deposit at booking |

Charge from the first customer. A free user tells you they like it; a paying one tells you it is worth money, and only the second fact lets the business continue. To set a first price: put a monthly figure on what the problem costs one customer (from their own account of it), list what they pay for the current alternative, pick a price between the alternative and a small fraction of the problem cost, then quote it. If several buyers in a row accept without hesitation, quote the next one more.

Take payment with a payment link or an invoice; Stripe Payment Links, for instance, are created in the dashboard without code and can charge once or on a subscription.

### 3. Do the pipeline arithmetic

Work backwards from the target. For each group of prospects:

```text
sales          = sends x reply rate x call rate x close rate
sends per sale = 1 / (reply rate x call rate x close rate)
minutes        = sends x minutes per send + calls x 45     (30 on the call, 15 for notes and follow-up)
```

Until the business has its own numbers, size the work with these planning guesses. They are assumptions for a first plan, not benchmarks; replace each row with measured figures after 30 sends in that group.

| Group | Who | Reply | Reply to call | Call to sale | Sends per sale | Minutes per send |
|---|---|---|---|---|---|---|
| Warm | knows the founder and has the problem | 60% | 60% | 30% | 9 | 5 |
| Community | has voiced the problem in public; no relationship | 25% | 50% | 25% | 32 | 10 |
| Cold | fits the profile; found in a directory | 8% | 40% | 20% | 156 | 12 |

Then check the total against the hours from step 1, after setting aside an hour a week for review and about two hours per new customer for setup by hand. When the target does not fit, say so and offer the choices: a later date, more warm and community prospects (introductions are the cheapest source), or a stronger offer. Do not close the gap by assuming better rates.

### 4. Build the prospect list

Fill the groups in order: warm first, community second, cold last. A prospect qualifies only with evidence of the problem (a post, a job advert, a tool they use, something they said), the authority to buy, and a way to reach them. Add 25 qualified rows a week; never buy a list.

```csv
name,org,role,source,warmth,evidence,sent_on,replied_on,call_on,paid_on,objection,next_step
Hollis Tran,Marigold Tea Club,founder,subscription-operators forum,community,"posted 2 Sep: lost 31 subscribers in August and found out from the payout",2026-09-08,2026-09-09,2026-09-15,2026-09-19,,onboarding call 22 Sep
Dana Okafor,Brine & Barrel,operations lead,Shopify app directory,cold,"store runs a monthly box; careers page lists a retention role",2026-09-10,,,,,follow up 15 Sep
```

`warmth` is `warm`, `community` or `cold`. Each stage column holds the date the stage was reached, which makes the funnel countable. `objection` records, in the prospect's words, why a conversation stopped.

### 5. Write the outreach

One message per person, written for that person, in four moves and under 100 words:

1. The evidence: what you saw or know about their situation.
2. The problem, named the way they would name it.
3. What you have and the one result it produces, with a number if you have one.
4. A small ask: a reply, or 15 minutes. Not a demo, not a signup.

Follow up once after three business days and once more a week later with something new (a number, a short example), then stop. Send by hand from the founder's own mailbox, 10 to 20 a day.

Rules for unsolicited email depend on where the recipient is:

| Recipient in | What applies |
|---|---|
| United States | CAN-SPAM covers business-to-business mail too: truthful sender and subject, clear that the message is commercial, a valid postal address, and an opt-out that is honoured within 10 business days |
| United Kingdom | PECR lets you email companies and other corporate bodies; sole traders count as individuals and need prior consent or an earlier purchase. Identify yourself and give an opt-out every time |
| European Union | GDPR accepts direct marketing as a possible legitimate interest, but each member state's e-privacy law decides whether cold business email needs consent. Check the country |
| Canada | CASL requires consent (express or implied), sender identification and an unsubscribe mechanism before a commercial message is sent |

Gmail requires anyone mailing its personal accounts to authenticate with SPF or DKIM and to keep reported spam under 0.3%, so send from a domain with both set up. On LinkedIn and community platforms the platform's own rules apply; do not use automation tools on either.

### 6. Run the conversation

A first call is mostly questions about what has already happened, because people describe their past accurately and their future generously:

- "Tell me about the last time this happened." What did they do, and how long did it take?
- "What did it cost you?" Money, hours, a customer.
- "What have you tried, and what did you pay for it?" Paying before is the strongest sign they will pay again.
- "Who else has a say in buying something like this?"

Show the product or describe the service only after those answers, and only the part that matches what they said. Then ask for the sale with a concrete next step: "I can set you up on Thursday. Shall I send the payment link now?" If the answer is no, ask what would have to be true for a yes and write the answer in `objection` verbatim. End every call, sale or not, by asking for two introductions.

### 7. Read the funnel every week

```python
#!/usr/bin/env python3
"""funnel.py prospects.csv - stage counts and conversion per warmth group, plus objections."""
import csv, sys
from collections import Counter, defaultdict

STAGES = ["sent_on", "replied_on", "call_on", "paid_on"]
rows = [r for r in csv.DictReader(open(sys.argv[1], newline="")) if r["sent_on"]]
groups = defaultdict(list)
for r in rows:
    groups[r["warmth"]].append(r)
    groups["all"].append(r)

def pct(a, b):
    return f"{a / b:.0%}" if b else "-"

print(f"{'group':10} {'sent':>4} {'reply':>5} {'call':>4} {'paid':>4} {'reply%':>7} {'call%':>6} {'close%':>7} {'sends/sale':>11}")
for name in ["warm", "community", "cold", "all"]:
    rs = groups.get(name)
    if not rs:
        continue
    sent, reply, call, paid = (sum(bool(r[s]) for r in rs) for s in STAGES)
    print(f"{name:10} {sent:>4} {reply:>5} {call:>4} {paid:>4} {pct(reply, sent):>7} "
          f"{pct(call, reply):>6} {pct(paid, call):>7} {(f'{sent / paid:.0f}' if paid else '-'):>11}")
objections = Counter(r["objection"] for r in rows if r["objection"])
print("objections:", ", ".join(f"{k} ({v})" for k, v in objections.most_common()))
```

What the stages say, once a group has 30 or more sends (working thresholds, to be tightened with experience):

| Symptom | Likely cause | Change |
|---|---|---|
| Few replies (cold under 5%, warm under 30%) | wrong people, or the first line shows no evidence | tighten the qualifying rule; rewrite the opening around what you saw |
| Replies, but under a third become calls | the ask is too large or the result is unclear | ask a question instead of asking for time; put a number on the result |
| Calls, but under one in five buys | offer, price or severity | read the objections: the same one three times means change the offer |
| "Not now" from most of a segment | the problem is real but not urgent for them | move to the segment where it costs more |
| They pay, then stop using it within a month | the product, not the selling | pause outreach and fix what the customers hit |

### 8. Know when this stage is over

Keep selling by hand until there are at least ten customers of the same kind, most of them still active or reordering after 60 days, and two or three arrived by referral without being asked. That is the evidence a marketing plan needs: who buys, the words that work, and what a customer is worth.

`first-customers-plan.md` contains, in order: target and deadline; the offer in five lines; the pipeline table with expected sales per group and the hours check; the weekly rhythm (list building, sending, calls, Friday review); the messages; and a dated log of what was changed after each review and why.

## Examples

### Example 1: A subscription-analytics tool at zero customers

Ines Carvalho built a churn-alert tool for subscription-box shops and charges $79 a month. She knows 12 shop owners from a previous job, has found 40 more who posted about churn in two operator forums, can sell 10 hours a week, and wants 10 customers in 8 weeks.

Pipeline arithmetic with the planning guesses:

| Group | Sends | Replies | Calls | Expected sales | Hours |
|---|---|---|---|---|---|
| Warm | 12 | 7.2 | 4.3 | 1.3 | 4.2 |
| Community | 40 | 10 | 5 | 1.25 | 10.4 |
| Introductions (half the 9 calls yield one) | 4.7 | 2.8 | 1.7 | 0.5 | 1.6 |
| Cold | 204 | 16 | 6.5 | 1.3 | 45.7 |
| Total | | | | 4.4 | 62 of 80 |

Eighteen of the 80 hours are held back for the weekly review and for setting up about five customers by hand; the cold row is what the remaining 45.7 hours buy at 13.4 minutes per send including its calls. The honest plan is four or five customers in 8 weeks, not ten. The agent offers the choices: keep the date and aim for five, or find about 160 more community-grade prospects, which at 32 sends per sale is the cheapest route to the other five.

Message to a community prospect (83 words):

```text
Subject: the 31 subscribers you lost in August

Hi Hollis, I read your post about finding out from the payout that 31 tea-club subscribers had gone.
I ran retention at a coffee subscription for three years and built a small tool for exactly that: it
flags subscribers likely to cancel in the next two weeks, from skipped boxes and failed cards, so
there is time to reach them. Would it be useful if I ran it on last month's data and showed you who
it would have flagged?
Ines Carvalho, Lisbon
```

After three weeks, `python3 funnel.py prospects.csv` printed:

```text
group      sent reply call paid  reply%  call%  close%  sends/sale
warm         12     8    5    2     67%    62%     40%           6
community    34     9    4    1     26%    44%     25%          34
cold         60     4    1    0      7%    25%      0%           -
all         106    21   10    3     20%    48%     30%          35
objections: no time to set it up (5), already track it in a spreadsheet (5), price (1), not a priority this quarter (1)
```

Reading: warm and community are tracking the plan and cold is not earning its hours yet. Price came up once in 12 objections, so $79 stays. "No time to set it up" came up five times, so the offer changes: Ines connects the shop's data herself on the first call. The spreadsheet objection becomes the new opening line for community prospects ("what does the spreadsheet tell you two weeks before they cancel?"). Cold sending is paused until 30 more community prospects are found.

### Example 2: A mobile bicycle mechanic in Bristol

Callum Reid services bicycles at the customer's home or workplace for £65. He wants 20 paying customers in four weeks and has 12 hours a week. He rides with a 180-member club and knows people at three offices with bike storage.

- **Price check.** He phoned five local shops: £55 to £90 for the same service and a wait of four to nine days. £65 at the door within the week needs no discount. Booking takes a £15 deposit by payment link, which also cuts no-shows.
- **Warm, individuals.** Thirty riders he knows personally, messaged one by one: 30 x 60% x 60% x 30% is about 3 bookings. A post in the club chat goes out only with the organiser's agreement.
- **Warm, workplaces.** His three contacts introduce him to whoever runs the building. The offer is a service day on site once 6 bikes are prepaid; each day is 6 to 8 customers. One or two of three happening gives 6 to 16.
- **Rules.** He does not text or email individuals he does not know: under PECR they need to have consented. Companies can be emailed, so the facilities managers are fair to contact.
- **Expected.** 9 to 19 customers, so 20 is just past the top of the range; the plan says so and names the gap-closer, a fourth workplace introduction asked for at the first service day. Each service day earns 7 x (£65 - £7 parts and card fee) = £406 for about seven hours including travel.

Message to the office contact: "Sam, would your facilities manager be up for a bike service day in the car park? I do a full service for £65, people prepay online, and I only come once six are booked, so there is nothing for the company to pay or organise beyond a spot to work. Could you introduce me?"

## Guidelines

- The planning rates are guesses. Say so in the plan, and replace them with the business's own after 30 sends per group. Published "average reply rates" describe other people's lists.
- Do not hide a target that does not fit the hours. A plan that needs 1,500 hand-written cold emails from one person in eight weeks is a wrong plan, and the fix is more warm and community prospects or more time.
- Free pilots teach little about demand. If the founder insists on one, set an end date and the price that follows in writing before it starts.
- Mass sending is a different activity with different rules: bought lists, mail-merge tools and sequences of five follow-ups damage the sending domain and, in several countries, break the law. The legal table above is a summary, not advice; for regulated sectors or consumer prospects, check the regulator's own guidance.
- Record objections in the prospect's words. "Too expensive" written down as "price" hides whether they meant the amount, the billing term or the missing proof.
- Ten customers of ten different kinds teach less than ten of one kind. Narrow the list when early buyers cluster.
- Friends who buy to be kind are not evidence. Count a warm sale as a signal only if the person has the problem and keeps using the product.
- Not the right tool once the business has a repeatable source of buyers, or for marketplaces and consumer apps that need thousands of users before the product works at all; those need a channel plan, not a prospect list.
