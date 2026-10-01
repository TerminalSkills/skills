---
name: referral-program
description: >-
  Designs, specifies and diagnoses customer referral programs and affiliate programs for software
  and subscription businesses: whether to run one, how large the reward can be, how attribution
  and payout work in the database and billing system, how to stop abuse, and how to measure
  whether it pays. Use when a user asks to "set up a referral program", "add refer-a-friend",
  "give credit for invites", "launch an affiliate program", "what commission should we pay",
  "why is nobody using our referral link", or mentions word of mouth, invite codes, ambassadors
  or partner payouts.
license: Apache-2.0
compatibility: "Any product with user accounts and a billing system. Calculation helper needs Python 3.8+; the schema runs on PostgreSQL and SQLite; billing examples use the Stripe API."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["referral-program", "affiliate-marketing", "growth", "customer-acquisition", "unit-economics"]
---

# Referral Program

## Overview

A referral program pays existing customers, usually in account credit, when someone they invite becomes a paying customer. An affiliate program pays outside publishers a commission for the same result. Both are acquisition channels with a cost per customer, and both fail in predictable ways: rewards larger than the margin allows, rewards paid for sign-ups that never pay, links that leak to coupon sites, and attribution that cannot be audited.

This skill takes a business from numbers to a written specification an engineer can build: an economics check, the reward rules, a data model with a status flow, the billing calls, abuse controls, the compliance points that apply, and the queries that show whether it works. It also diagnoses a program that already exists.

## Instructions

### 1. Collect the numbers and decide whether to build

Ask for, or pull from billing and analytics: active paying customers, new customers per month and how many already arrive by recommendation (a "how did you hear about us" field, direct and branded traffic), average revenue per account per month, gross margin, monthly churn, the blended cost of acquiring a customer through paid channels, the billing system, and the refund window.

Decide with the user before designing anything:

- If almost nobody recommends the product today, a reward will not create the habit. Fix the product or onboarding first and say so.
- With a small customer base (a few hundred or fewer), run it by hand first: a personal email with a unique link and a manually applied credit. Build the machinery when the manual version produces customers.
- If recommendations already happen, a program mainly makes them trackable and more frequent. Expect part of the "referred" volume to be people who would have come anyway, and plan for that in the maths.

### 2. Choose the program type

| | Customer referral | Affiliate or partner |
|---|---|---|
| Who promotes | Existing customers, to people they know | Publishers, creators, consultants, to an audience |
| Reward | Account credit, free period or plan upgrade, usually for both sides | Cash commission, flat or a share of revenue for a set period |
| Volume and trust | Low volume, high trust, high retention | Higher volume, variable quality |
| Extra obligations | Simple terms | Contract, disclosure rules, tax forms, payout operations, brand rules |

Start with customer referral unless the product is sold through advisers or reviewed by publishers. Run both only with separate links and separate rules, and never let one person collect both rewards for the same customer.

### 3. Size the reward

The reward has to be noticeable to the person sharing and still leave the channel cheaper than the alternatives. Check both with the business's own numbers:

```python
def referral_economics(arpa, gross_margin, monthly_churn, paid_cac,
                       referrer_reward, friend_reward, incremental_share):
    """All money in one currency. incremental_share: fraction of referred
    customers who would not have signed up without the program (0-1)."""
    margin_month = arpa * gross_margin
    ltv = margin_month / monthly_churn
    cost = referrer_reward + friend_reward
    cac = cost / incremental_share
    return {
        "ltv": round(ltv), "reward_cost": cost, "effective_cac": round(cac),
        "payback_months": round(cac / margin_month, 1),
        "ltv_to_cac": round(ltv / cac, 1), "vs_paid_cac": f"{cac / paid_cac:.0%}",
    }
```

Rules for reading the result:

- Count rewards at face value. Credit given to a paying customer is revenue you would otherwise have collected.
- `incremental_share` is unknown at launch. Compute the result at an optimistic and a pessimistic value (for example 0.6 and 0.3) and keep the reward only if the pessimistic case is still acceptable.
- Keep `effective_cac` below the paid-channel figure and the payback period inside what the business accepts for other channels. If the pessimistic case fails, lower the reward or pay it in a form that costs less than its face value (plan upgrade, usage allowance).
- Two-sided rewards are the default: the friend gets a reason to use the link instead of signing up directly, which is what makes attribution possible.

### 4. Write the rules

State each of these in the specification, in one sentence each:

- **Who can refer:** paying customers in good standing; staff and resellers excluded.
- **Who counts as referred:** a person or company with no previous account, payment method or trial.
- **Qualifying event:** the first paid invoice, and the reward is released only after the refund window has passed. Never pay on sign-up.
- **Attribution:** the link `https://app.../r/CODE` sets a first-party cookie for a fixed window (30 to 90 days) and the code is stored on the account at sign-up; a code typed at checkout overrides the cookie; the last valid code before sign-up wins.
- **Limits:** a cap per referrer per year, an expiry for unused credit, no cash value.
- **Reversal:** refund, chargeback or cancellation inside the window reverses both rewards.
- **Change clause:** the business may alter or end the program and withhold rewards for abuse.

### 5. Data model and status flow

```sql
CREATE TABLE referral_codes (
  code         TEXT PRIMARY KEY,              -- random, 8+ characters, never derived from the customer id
  customer_id  TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE referrals (
  id                    TEXT PRIMARY KEY,
  code                  TEXT NOT NULL REFERENCES referral_codes(code),
  referred_customer_id  TEXT NOT NULL UNIQUE, -- a new customer has at most one referrer
  status                TEXT NOT NULL DEFAULT 'signed_up'
                        CHECK (status IN ('signed_up', 'qualified', 'rewarded', 'rejected', 'reversed')),
  signed_up_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  qualified_at          TIMESTAMP,
  reject_reason         TEXT
);
CREATE TABLE referral_rewards (
  id              TEXT PRIMARY KEY,
  referral_id     TEXT NOT NULL REFERENCES referrals(id),
  beneficiary_id  TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  provider_ref    TEXT UNIQUE,                -- billing-system transaction id
  issued_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at     TIMESTAMP,
  UNIQUE (referral_id, beneficiary_id)        -- a retried webhook cannot pay twice
);
```

Status moves one way: `signed_up` to `qualified` when the first invoice is paid, `qualified` to `rewarded` when a scheduled job finds the refund window has passed and writes the reward rows, `rejected` when an abuse rule fires, `reversed` when money is returned after a reward. Drive the transitions from billing webhooks (`invoice.paid`, `charge.refunded`, `charge.dispute.created` in Stripe), not from the browser.

With Stripe, carry the code into checkout as `client_reference_id` (up to 200 letters, digits, dashes or underscores) so the `checkout.session.completed` event can be matched to the referral, give the friend's discount as a promotion code restricted to first-time customers, and pay the referrer as invoice credit. A negative amount is a credit against the next invoice:

```bash
curl https://api.stripe.com/v1/customers/cus_Qx81LmT4vJd2Rk/balance_transactions \
  -u "$STRIPE_SECRET_KEY:" \
  -d amount=-5000 -d currency=usd \
  -d description="Referral reward for referral rf_2f9c1a" \
  -H "Idempotency-Key: reward-rf_2f9c1a-referrer"
```

Balance transactions cannot be edited or deleted; a reversal is a second transaction with the opposite sign. Test every call in a sandbox before live keys are involved.

### 6. Abuse controls

- Reject when referrer and friend share a payment card fingerprint, a billing address, or (for business products) an email domain; hold for review when they share a device or network.
- Pay only after the qualifying event and the refund window; reverse on refund or dispute.
- Cap rewards per referrer and review anyone who reaches the cap in days rather than months.
- Forbid posting links on coupon and deal sites in the terms, and watch for links with many clicks and few qualified customers.
- Log every decision in `reject_reason` so support can explain it.

### 7. Compliance points to raise with the user

- **Disclosure (US, FTC Endorsement Guides):** someone rewarded for a recommendation has a material connection and should say so in plain words when recommending publicly. Affiliates must disclose commissions clearly; the label "affiliate link" alone is not enough. The business is expected to tell participants this and to monitor it.
- **Invitation email (US, CAN-SPAM):** if you offer a reward for forwarding a message, you count as its sender and the message needs a working opt-out and your postal address. The simplest safe design gives the referrer a link to send through their own channels; do not import their address book.
- **Privacy (EU and UK):** if a referrer types a friend's email address into your product, send at most the one invitation and do not add the address to marketing lists.
- **Tax (US):** cash paid to an affiliate is reportable on Form 1099-NEC once it reaches $2,000 in a calendar year (the threshold from tax year 2026; it was $600 before). Collect a W-9 or W-8 before the first payout. Ask an accountant how customer credits are treated.

These are prompts for the user's own legal and tax advice, not a substitute for it.

### 8. Affiliate terms

Decide and write down: commission (a share of revenue for a fixed number of months is easier to keep inside the payback limit than a lifetime share), the attribution window and that the last affiliate click wins, payout schedule (monthly, after the refund window, above a minimum balance), what is forbidden (bidding on the brand name in search ads, cashback and coupon sites unless approved, misleading claims), the disclosure requirement, and termination. Run the same economics function with `friend_reward` as any audience discount and `referrer_reward` as the expected total commission.

### 9. Placement, launch and measurement

Offer the link right after a moment of success (a goal reached, a positive survey answer, a renewal) and keep a permanent entry in the account menu. The offer is one sentence naming what each side gets and when. Launch to a slice of customers first so the rest serve as a comparison group for incrementality.

Track the funnel by stage: customers shown the offer, customers who shared, link clicks, sign-ups, qualified customers, rewards issued and reversed. Then compare referred and other customers on retention after 90 days.

```sql
SELECT COUNT(*) AS signed_up,
       SUM(CASE WHEN status IN ('qualified', 'rewarded') THEN 1 ELSE 0 END) AS qualified,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
FROM referrals WHERE signed_up_at >= '2026-09-01';

SELECT c.customer_id, COUNT(*) AS referred,
       SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) AS rejected
FROM referrals r JOIN referral_codes c ON c.code = r.code
GROUP BY c.customer_id HAVING COUNT(*) >= 10 ORDER BY referred DESC;
```

| Weak stage | Likely cause | First change |
|---|---|---|
| Few customers see the offer | It lives only in settings | Add it after success moments and in receipts |
| Seen but not shared | Reward unclear or unattractive, sharing takes effort | Rewrite the offer; one-tap copy of a short link |
| Shared but few sign-ups | Friend lands on a generic page with no visible benefit | Landing page that names the referrer and the friend's reward |
| Sign-ups but few qualify | Reward attracts people who never pay, or abuse | Tie the friend's benefit to the first payment; check the per-referrer query |

### 10. Deliverable

Write `docs/referral-program.md` with these sections: economics (inputs and both scenarios), rules, status flow and schema, billing calls, abuse rules, compliance notes, copy for the offer and the invitation, metrics and targets, launch plan. Add migrations and webhook handlers only if the user asks for implementation.

## Examples

### Example 1: Credit-based referral for a subscription tool

**Request:** "Quillharbor is invoicing software at $49 a month. 1,900 paying customers, 78% gross margin, 3.1% monthly churn, paid CAC is $310, and 14% of new customers say a colleague told them. Design a referral program on Stripe."

```text
>>> referral_economics(49, 0.78, 0.031, 310, referrer_reward=50, friend_reward=49, incremental_share=0.6)
{'ltv': 1233, 'reward_cost': 99, 'effective_cac': 165, 'payback_months': 4.3, 'ltv_to_cac': 7.5, 'vs_paid_cac': '53%'}
>>> referral_economics(49, 0.78, 0.031, 310, referrer_reward=50, friend_reward=49, incremental_share=0.3)
{'ltv': 1233, 'reward_cost': 99, 'effective_cac': 330, 'payback_months': 8.6, 'ltv_to_cac': 3.7, 'vs_paid_cac': '106%'}
```

Recommendation written into the spec: the friend's first month is free and the referrer receives $50 of invoice credit, released 30 days after the friend's first paid invoice. In the pessimistic case the channel costs about the same as paid acquisition, so the program launches to half of customers for one quarter and continues only if referred sign-ups in that half exceed the other half by enough to hold `incremental_share` above 0.4. Cap of 10 rewards per referrer per year; referrer and friend on the same email domain are rejected because that is seat expansion, not a new customer. The spec includes the schema above, the three webhook handlers, and the offer line "Give a colleague a free month. You get $50 off your next invoice when they stay."

### Example 2: Diagnosing a program that produces little

**Request:** "Ferncrest's refer-a-friend has run for a quarter and brought 23 members. We have 4,200 members. What is wrong?"

Funnel from the tables and link logs: 4,200 eligible, 126 shared (3.0%), 1,890 clicks (15 per sharer), 151 sign-ups (8.0% of clicks), 23 qualified (15% of sign-ups).

```text
customer_id       referred  rejected
cus_PnA41xRdT0    64        61
cus_Lw7Hq2ZsB9    11        0
```

Findings: the offer appears only on the account page, which explains the 3% share rate. Fifteen clicks per sharer is far above what personal sharing produces: one link was posted on a deals forum, and that referrer accounts for 64 sign-ups, 61 rejected for a shared card fingerprint. Without that account the sign-up-to-qualified rate is 23 of 87, about 26%.

Actions: show the offer after a member's tenth class and in the monthly receipt; add a landing page that names the referrer and the free week; withhold that referrer's pending rewards and add the forum to the terms' forbidden list; keep the reward as it is, since the problem is reach, not size. Target for next quarter: share rate above 8%.

## Guidelines

- Do the arithmetic before the creative work. A program whose pessimistic scenario costs more than paid acquisition should be shrunk or dropped, and saying so is the useful answer.
- Never release a reward on sign-up, trial start or email verification; these are free to fake.
- Attributed is not the same as caused. Without a comparison group, report referral numbers as an upper bound.
- Quote no industry benchmark for share or conversion rates unless the user supplies a source; the spread between products is too wide for a generic number to guide a decision.
- Keep rewards in the product's own currency (credit, upgrades, usage) for customers; cash invites people who have no interest in the product and creates tax paperwork.
- Regulated sectors (financial services, health, gambling, alcohol) and programs open to minors have extra rules on inducements; stop and send the user to counsel.
- Multi-level structures, where people earn from the referrals of their referrals, are out of scope and legally risky.
- Use a third-party referral or affiliate platform when the user needs payouts in many countries, tax form collection or a partner portal; this skill's schema is for the common in-product case.
