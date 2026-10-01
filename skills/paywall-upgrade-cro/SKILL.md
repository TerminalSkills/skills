---
name: paywall-upgrade-cro
description: >-
  Designs and audits the moments inside a product where an account is asked to pay or to move to a
  higher plan: feature gates, usage-limit screens, trial-ending and trial-expired states, seat and
  add-on upsells. Maps every upgrade moment, decides what blocks and what only warns, specifies
  each screen with the exact charge, wires checkout and entitlements, and sets the events and
  guardrails to judge it. Use when someone says "paywall", "upgrade modal", "feature gate", "limit
  reached screen", "trial expiration", "free to paid conversion", "upsell prompt", or "users
  complain about upgrade nags". Public pricing pages belong to page-cro; choosing plans and prices
  belongs to pricing-strategy.
license: Apache-2.0
compatibility: >-
  Web and mobile products with a free plan, a trial or several paid plans. Billing examples use the
  Stripe API; store rules cover Apple App Store and Google Play subscriptions. Code samples are
  plain JavaScript (Node.js 18+).
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["paywall", "monetization", "freemium", "conversion", "subscriptions"]
---

# Paywall and Upgrade CRO

## Overview

An upgrade prompt is shown to someone who is already using the product. That is its advantage over
a pricing page: the product knows what the person just tried to do, how much they have used and
whether they are allowed to buy. A good prompt uses those three facts, states the exact charge,
and lets the person decline and carry on. A bad one interrupts work, hides the price or the exit,
and gets paid for in refunds, cancellations and store rejections.

This skill produces an upgrade map (every moment where payment is asked for), a specification for
each screen, the billing and entitlement wiring, and a measurement plan with guardrails.

## Instructions

### 1. Collect the facts

Read `.claude/product-marketing-context.md` if present. Then search the code before asking:

```bash
grep -rnEi "isPro|isPaid|plan ?===|entitlement|hasFeature|canUse|quota|limitReached|upgrade" src/ app/ 2>/dev/null | head -60
grep -rnEi "checkout\.sessions|billing_portal|trial_end|trial_period_days|StoreKit|BillingClient" . --include=*.ts --include=*.js --include=*.swift --include=*.kt 2>/dev/null | head -30
```

From the user, get what the code does not show:

1. Plans, prices and what the free plan or trial includes.
2. The activation event (what a new account does when it first gets value) and how many reach it.
3. Current numbers: accounts that meet each prompt, checkouts started, purchases, refunds.
4. Where money is taken: web checkout, App Store, Google Play, or an invoice from sales.
5. Who can pay: one person, or an owner while members only use the product.

### 2. Draw the upgrade map

List every place where the product asks for money. One row per moment:

| Moment | Started by | Default treatment |
|---|---|---|
| Locked feature clicked | The person | Dialog over the screen they are on, with a preview of the result where it is cheap to make |
| Limit approaching (80% or more used) | The product | Inline notice next to the meter; no dialog |
| Limit reached | The person (tries to add one more) | Block only the creation; existing work stays readable and exportable; offer the free way out (archive, delete) beside the upgrade |
| Trial ending | The product | Banner with the date and what will change, from the day the billing reminder goes out |
| Trial ended without payment | The product | Reduced plan or read-only state with export; never a locked door in front of their data |
| More seats or an add-on needed | The person | In the flow (invite form, settings), showing the prorated charge |
| Ambient cue | Nobody | Plan badge on locked items, upgrade entry in the account menu |

### 3. Set the rules for showing a prompt

```js
const DAY = 86400000;

// State of a metered limit. `used` and `limit` are counts for the whole account.
export function limitState(used, limit) {
  if (!Number.isFinite(limit)) return 'none';
  if (used >= limit) return 'reached';          // block creating one more; never block reading or export
  if (used / limit >= 0.8) return 'warning';    // inline notice, no dialog
  return 'none';
}

// May a prompt that the product starts on its own appear now?
// A prompt the person asked for (a click on a locked control) is always allowed.
export function mayPrompt({ startedByUser, shownThisSession, lastDismissedAt, now = Date.now() }) {
  if (startedByUser) return true;
  if (shownThisSession) return false;
  return !lastDismissedAt || now - lastDismissedAt > 7 * DAY;
}

// Only people who can pay see a checkout button.
export function upgradeAction(role) {
  return role === 'owner' || role === 'admin' ? 'checkout' : 'ask_admin';
}
```

Further rules:

- Nothing is asked before the account has reached the activation event, except when the person
  clicks a locked control themselves.
- Never interrupt unsaved work. Save the draft, then show the prompt; after purchase, return to
  the same place and complete the action that was blocked.
- A member without billing rights gets "Ask an admin to upgrade", which sends the owner a message
  naming the member and the feature. Count these requests as a conversion step.
- Enforce limits on the server. The prompt is presentation; the entitlement check is the control.

### 4. Specify each screen

Every upgrade screen carries these parts, in this order:

| Part | Content | Check |
|---|---|---|
| Title | What the person tried to do or is about to lose | Names the feature or limit, not the plan |
| Reason | The usage fact that caused the prompt | A real number from their account |
| What changes | Two to four differences, the one they hit first | No full comparison table inside a dialog |
| Charge | Amount, period, tax note, date of the next charge; for a mid-cycle upgrade the prorated amount due today | The amount billed is the largest price on the screen |
| Primary action | Verb, plan and price | Leads to payment in one step |
| Decline | Plain text button ("Not now", "Stay on Free") | Visible without scrolling; Escape works |
| Terms | Trial length, what is charged after it, how to cancel | Present whenever a trial or renewal applies |

Build the dialog itself to the modal dialog pattern (name, focus, Escape, inert background); the
popup-cro skill has the markup. Social proof belongs here only when it is true and attributable:
US rule 16 CFR 465 prohibits invented testimonials.

### 5. Wire checkout and access

For Stripe-billed products:

- New subscriber: a Checkout Session in `subscription` mode with the price already chosen and a
  `success_url` back to the blocked action.
- Existing subscriber changing plan: show the real charge first, then apply it with the same
  timestamp so the numbers match.

```bash
NOW=$(date +%s)
curl https://api.stripe.com/v1/invoices/create_preview \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_R4tZ81kLmQx2Vn \
  -d subscription=sub_1QnV7tKX2a9LpGdE \
  -d "subscription_details[items][0][id]"=si_Rb2HqY7sT0wMcA \
  -d "subscription_details[items][0][price]"=price_1QnVf2KX2a9LpGdEo4sHq7Lw \
  -d "subscription_details[proration_date]"=$NOW

curl https://api.stripe.com/v1/subscriptions/sub_1QnV7tKX2a9LpGdE \
  -u "$STRIPE_SECRET_KEY:" \
  -d "items[0][id]"=si_Rb2HqY7sT0wMcA \
  -d "items[0][price]"=price_1QnVf2KX2a9LpGdEo4sHq7Lw \
  -d "items[0][quantity]"=6 \
  -d proration_behavior=always_invoice \
  -d proration_date=$NOW
```

Two details from Stripe's documentation that cause real bugs: the update must name the existing
subscription item, or the new price is added beside the old one and both are billed; and changing
the price resets `quantity` to 1 unless the request repeats it.

- Access: grant features from the subscription state on the server
  (`customer.subscription.updated`, or `entitlements.active_entitlement_summary.updated` when
  Stripe Entitlements is used). Unlock in the interface as soon as payment confirms; do not make
  the buyer reload.
- Trials: `customer.subscription.trial_will_end` arrives three days before the end by default.
  Stripe-hosted reminder emails, when enabled, go out seven days before. Choose what happens to a
  trial without a card through `trial_settings[end_behavior][missing_payment_method]`: `cancel`,
  `pause` or `create_invoice`.
- Confirmation: say what was charged, when the next charge is, and where to change or cancel the plan.

### 6. Respect store rules and consumer law

| Source | Requirement for the purchase screen |
|---|---|
| Apple, subscriptions guidance and guideline 3.1.2 | Subscription name, duration and what it provides; full renewal price shown clearly; a way to sign in or restore purchases; links to terms and privacy policy; the amount billed is the most prominent price, a per-month breakdown of an annual plan stays subordinate; trial length and the price after it |
| Google Play subscriptions policy | Offer terms, cost, billing frequency and auto-renewal disclosed without extra taps; a clearly visible dismiss button; annual price not led by its monthly equivalent; localised price; how to cancel a trial; an online cancel method reachable from the app |
| US, ROSCA (15 U.S.C. 8403) | Material terms disclosed clearly before billing details are taken; express informed consent to the charge; a simple way to stop recurring charges |
| California, Bus. & Prof. Code 17602 | Cancelling online when the purchase was online; a retention offer may be shown only together with a direct "click to cancel" link; 7 to 30 days' notice before a fee change |

The FTC's 2024 "click-to-cancel" amendments were vacated by a federal appeals court in July 2025
and the agency reopened the rulemaking in March 2026; ROSCA and state laws apply in the meantime.
The EU requires an online withdrawal function for distance contracts from 19 June 2026. Flag
these to the user as items for their counsel, not as legal advice.

### 7. Measure with guardrails

Events, each with `paywall_id`, `moment`, `plan_shown`, `role`: `paywall_view`, `paywall_dismiss`,
`upgrade_request_sent`, `checkout_start`, `purchase`.

- Funnel per moment: views to checkout, checkout to purchase.
- Revenue per exposed account, not conversion rate alone: a prompt can raise conversion by
  selling the cheapest plan to people who would have bought a larger one.
- Guardrails: refunds and chargebacks within 14 days, cancellation at the first renewal,
  continued activity of accounts that declined, support contacts mentioning billing.
- Experiments: randomise by account in multi-user products, change one thing, and judge after the
  first renewal has passed for the test cohort. A lift that disappears at renewal was pressure.

### 8. Deliver

Return the upgrade map, one specification block per screen in the form shown in Example 1, the
billing changes, the event list, and the first experiment with its guardrails.

## Examples

### Example 1: export gate in a whiteboard tool

Request: "Notchboard has 30,000 free accounts and 1.4% upgrade to Pro at $12 a month. The gate on
SVG export just says 'Upgrade to Pro'. Improve it."

The agent finds in the code that the gate fires for every role and that free accounts have a
median of 7 boards before first clicking export, so activation is not the problem. Specification:

```text
Paywall: export-svg
Moment: locked feature clicked (started by the person) - always shown
Title: Export this board as SVG
Reason: "SVG and PDF export are part of Pro. PNG export stays free."
Preview: the first frame of their own board rendered as SVG, watermarked
What changes: SVG and PDF export / unlimited boards (you have 7 of 10) / brand colours
Charge: "$12 per month, billed monthly. Cancel any time in Settings > Billing."
        Toggle: "$120 per year" with "equals $10 a month" in smaller type
Primary: "Upgrade to Pro - $12 a month" -> Checkout Session, success_url returns to the board
         and starts the SVG download
Decline: "Export as PNG instead"
Members: "Ask an admin to upgrade" (sends the request with the board link)
Events: paywall_view, paywall_dismiss, upgrade_request_sent, checkout_start, purchase
Test: preview versus no preview, by account, 50/50; guardrail: refunds within 14 days
```

### Example 2: trial end for a scheduling product

Request: "Fieldnest gives a 14-day trial without a card. 38% of trials are active in week two, 7%
pay ($79 a month). On day 15 we lock the account."

Findings and plan:

| Day | Surface | Content |
|---|---|---|
| 7 | Email (Stripe-hosted reminder) | Trial end date, price after trial, link to add a card |
| 11 | In-app banner, all roles | "Trial ends on 14 October. 46 jobs scheduled so far." Owner sees "Add payment details", members see "Tell your admin" |
| 14 | Dialog for the owner on sign-in, once | What stays and what stops, the charge ("$79 on 14 October, then monthly"), decline: "Decide later" |
| 15 onward | Read-only workspace, `missing_payment_method=pause` | Schedules visible and exportable, no new jobs; one button resumes the subscription and restores editing |

The agent replaces the lockout with the paused, read-only state, because locked-out trial accounts
cannot see the work that would justify paying, and adds a guardrail: share of paused accounts
that resume within 30 days. It also notes that a discount for inactive trials would train
buyers to wait, and recommends an extension on request instead.

## Guidelines

- The price on the prompt must equal the price charged. For upgrades, compute the proration with
  the billing provider; never estimate it in the client.
- Do not hide, shrink or delay the decline control, and do not word it as a confession. Google
  Play lists a missing or unclear dismiss button among its policy violations.
- Do not lead with the per-month equivalent of an annual plan. State the amount that will be billed.
- Do not gate what the person already had. Moving a free feature behind payment needs notice and,
  for existing accounts, usually a grace period; Apple's guideline says so explicitly for paid apps
  that switch to subscriptions.
- Do not prompt members who cannot buy with a checkout button; it produces views and no revenue.
- Do not count a paywall as successful on conversion alone. Check refunds, first-renewal
  cancellation and whether decliners keep using the product.
- Limits and gates that are only enforced in the interface will be bypassed. Check on the server.
- When not to use this skill: the plans themselves are wrong (pricing-strategy), people leave
  before reaching value (onboarding-cro), or the purchase happens on a public page (page-cro).
