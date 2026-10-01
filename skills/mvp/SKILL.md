---
name: mvp
description: >-
  Plans a minimum viable product: states what the first release must teach, picks the cheapest form
  that can teach it (hand-delivered service, assembled tools or a single coded flow), budgets
  capacity in person-days, sorts scope by effort into must, should, could and not-this-time, and
  defines the metric and pass line that decide what happens after launch. Use when someone says
  "what should go into v1", "help me scope my MVP", "cut this feature list", "we have two weeks to
  launch", "plan the first version", or keeps adding features before a first release.
license: Apache-2.0
compatibility: "Any agent that can read and write files in the working directory. Reads an existing repository when there is one (manifest, routes, schema); no specific stack required."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["mvp", "startup", "product-scope", "prioritization", "launch"]
---

# MVP: Scope and Ship the First Version

## Overview

A minimum viable product is the smallest release that lets real users finish one job from start to end and tells you whether a stated belief about them is true. Its purpose is learning for the least effort, so the plan starts from the question to answer and works backwards to scope.

This skill produces an `MVP.md` plan: the learning goal with its pass line, the form of the release, one user journey, a scope table with estimates and a cut list, the capacity arithmetic, the events to record, and the rule for deciding what comes next. In a repository it also gives the build order.

## Instructions

### 1. Establish the starting point

Look before asking. In a repository read the README, the package manifest, routes or screens, the data schema and any feature flags, and list what already works. Then ask for whatever is still unknown:

- One target segment and the job they are trying to get done.
- Evidence that the problem is real (conversations, payments, a waitlist). If there is none, say plainly that building is a costly way to find out and offer the cheapest form in step 3.
- The belief that sinks the product if it turns out false.
- Capacity: how many people, how many working days, any fixed date.
- Constraints: payments, personal or regulated data, app-store or platform rules, the existing stack.

### 2. Write the learning goal

State a belief about behaviour, then the measurement that would prove it, with a threshold, a sample and a window:

```text
We believe freelancers who upload their unpaid invoices will let the tool send reminders for them.
We are right if 40% of signups send a first reminder within 48 hours, counted over the first 50 signups.
```

The behaviour must show up in logs or payment records: sent, booked, paid, returned. "Users like it" is not a goal.

### 3. Choose the form of the release

| Situation | Form | Watch for |
|---|---|---|
| Nobody has shown they want it yet | No build: run a demand test first (page plus pre-order) | An MVP cannot rescue an untested problem |
| A person can deliver the result and customers know it | Hand-delivered service | Log every manual step and the minutes; that log is the later spec |
| Customers need a product-like surface, automation is the costly part | Human behind the interface | Tell users when a person sees their data or writes the answer |
| The job is glue between tools people already use | Assembled: form, spreadsheet, automation, hosted checkout | Limits of the tools set the ceiling; fine for the first 50 users |
| The value is the software experience itself (speed, an integration, an algorithm) | One coded flow | Everything outside that flow stays manual |
| Two-sided marketplace | Supply one side yourself, build only for the scarce side | Do not build onboarding for the side you can recruit by phone |

Take the form with the least building that still produces the behaviour named in the learning goal.

### 4. Map one journey

Write the five to nine steps a user takes from first hearing about the product to getting the outcome. Under each step note the crudest thing that works (an email from the founder counts). The first release is one thin path through every step, not a finished version of some steps.

### 5. Budget the capacity

```text
capacity (person-days) = people x working days x focus factor
focus factor           = 0.6-0.7 for a full-time team; lower for part-time work or an unfamiliar stack
must budget            = capacity x 0.6
```

The 60% ceiling comes from MoSCoW prioritisation as practised in DSDM: must-haves take at most about 60% of the effort and could-haves (about 20%) act as contingency. The split is measured in effort, not in number of items.

### 6. Sort the scope by effort

Estimate each item in half-day units, then classify it:

- **Must**: without it the user cannot finish the journey, the learning goal cannot be measured, or launching would be unsafe or unlawful.
- **Should**: painful to omit, but a manual workaround exists for the first weeks.
- **Could**: improves the experience; first to go when estimates slip.
- **Not this time**: named and parked, so nobody rebuilds the argument later.

When the musts exceed the budget, reduce in this order: replace building with a manual step or a hosted service; narrow the segment or the inputs accepted; do a journey step on the user's behalf; only then move the date.

Usually deferred: admin screens (use the database console), roles and teams, settings pages, notification preferences, native apps when a web page works, translations, custom billing logic, search and filters for short lists, bulk import beyond one format, performance work for load that does not exist.

Never deferred: safe handling of credentials (delegate sign-in rather than write it), correct money handling, consent and a privacy notice when personal data is stored, backups of customer data, error logging, and the event that measures the learning goal.

### 7. Decide what to record

- Three to five events, one of which is activation (the first time the user gets the outcome):

```text
signed_up          account created
invoice_uploaded   first CSV accepted
reminder_sent      first reminder goes out (activation, the pass-line event)
reminder_repeated  a reminder goes out in a later week
paid               first payment received
```

- One pass line from step 2, with the window and the sample size written next to it.
- A conversation with every early user until there are too many to call. Record what they tried to do that the product could not.
- Once 30 or more active users can answer, ask how they would feel if the product went away; 40% or more answering "very disappointed" is the customary sign of strong pull.
- With a few dozen users a percentage is a wide interval. 14 of 31 is 45%, but the 95% range is 29%–62%.

### 8. Launch small and decide

Launched means people outside the team, from the target segment, can use it without anyone standing next to them, and can pay if it is a paid product. Recruit the first users by hand. When the window closes, compare against the pass line agreed in advance:

- Met: build the next slice, chosen from what users asked for, not from the parked list by default.
- Missed overall but a sub-segment clearly uses it: narrow to that group and run the window again.
- Missed with no pull anywhere: stop, or go back to testing the problem.

### 9. Write the plan

```markdown
# MVP plan: home bike tune-ups (2026-10-01)
## Learning goal
belief, metric, threshold, sample, window
## Form
which form from step 3 and why nothing lighter would do
## Journey
numbered steps, with the mechanism behind each
## Capacity
people x days x focus factor = person-days; must budget
## Scope
| Item | Est. (pd) | Class | How it is done in v1 |
## Recording
events, pass line, who talks to users
## After the window
what happens if met, if partly met, if missed
```

### 10. In a repository: build order

1. Day one: an empty path through every journey step, deployed where a user could reach it.
2. Fill in the musts in journey order; each one ends with the path still working.
3. Add the measuring event before launch, not after.
4. Shoulds only while capacity remains. Parked items go to the issue tracker, never into code "for later".
5. No configuration systems, plugin points or generic abstractions for features that are not in the table.

## Examples

### Example 1: a marketplace idea reduced to a service run by hand

Lina Haddad, a solo developer with three full-time weeks, wants a marketplace where commuters book mobile bike mechanics.

- Learning goal: commuters in one district will pay €39 for a tune-up at home booked online. Right if there are 25 paid bookings within four weeks of launch.
- Form: she contracts two mechanics herself and dispatches them by phone. Nothing is built for the supply side.
- Capacity: 1 × 15 × 0.7 = 10.5 person-days; must budget 6.3.

| Item | Est. (pd) | Class | How it is done in v1 |
|---|---|---|---|
| Booking page: service, address, time slot | 1.5 | Must | One form, three fixed slots a day |
| Payment and confirmation email | 0.5 | Must | Hosted checkout link |
| Slot sheet shared with both mechanics | 0.5 | Must | Spreadsheet, updated by Lina |
| Booking and payment events | 0.5 | Must | Two events in web analytics |
| Privacy notice, terms, insurance check | 1.0 | Must | Template reviewed with the insurer |
| Flyers and posts in two neighbourhood groups | 1.5 | Must | Without them no one arrives |
| Follow-up message asking to rebook | 0.5 | Should | Sent by hand for now |
| Automatic slot availability | 2.0 | Should | Only if double bookings occur |
| Mechanic sign-up, job app, ratings, payout split | 10+ | Not this time | Two mechanics, paid by bank transfer |

Musts total 5.5 person-days against a budget of 6.3, leaving 5.0 for the shoulds and slippage. After the window: 25 or more bookings, automate slots and recruit a third mechanic; 10–24, repeat in a second district before building; under 10, stop.

### Example 2: a coded product whose musts did not fit

Tomás and Ingrid have two weeks for a tool that chases overdue freelancer invoices by email. Capacity: 2 × 10 × 0.65 = 13 person-days; must budget 7.8. Learning goal: 40% of signups send a first reminder within 48 hours, counted over the first 50 signups.

Their first list of musts came to 14.5 person-days. The reduction:

| Item | First estimate | Decision | v1 estimate |
|---|---|---|---|
| Password sign-in with reset | 2.0 | Magic-link sign-in from the auth library already in the repo | 0.5 |
| Import from an accounting API | 3.0 | Not this time; CSV only | 0 |
| CSV upload of invoices | 1.0 | Keep | 1.0 |
| Editable reminder schedule | 2.5 | One fixed schedule: 3, 10 and 21 days overdue | 0.5 |
| Sending with the user's reply-to address | 1.5 | Keep | 1.5 |
| Dashboard | 2.0 | One list page with status per invoice | 1.0 |
| Subscription billing | 2.0 | Payment link emailed by hand on day 14 | 0.5 |
| Events for signup, upload, first reminder | 0.5 | Keep | 0.5 |
| Sender identity and opt-out line in every email | missing | Added: required for lawful sending | 1.0 |

New total: 6.5 person-days, inside the 7.8 budget. Four weeks after launch: 31 signups, 14 sent a reminder within 48 hours (45%, 95% range 29%–62%). The agreed sample of 50 has not been reached and the range still straddles 40%, so nothing is decided yet: the scope stays frozen and recruiting continues. Nine of the 14 activated users asked for accounting import, which makes it the first candidate for the next slice.

## Guidelines

- "Viable" has a floor: the user must get the promised outcome. A release that demonstrates screens but delivers nothing teaches only that it is unfinished.
- Do not pad the must list with things that feel professional. Apply the three-part test in step 6 to every item, including the founder's favourite.
- A hand-run step that takes five minutes per customer is cheaper than two days of code until there are roughly 200 customers; do the arithmetic before automating.
- Estimates from someone who has not built the thing before are low. Use the lower focus factor rather than trimming the contingency.
- Charging from the first release is the strongest signal for a paid product. If the plan postpones payment, the learning goal must not claim to test willingness to pay.
- Avoid a human-behind-the-interface release where the user would reasonably expect privacy or professional accountability (health, legal, financial advice) unless they are told.
- Quality is not the variable to cut. Reduce what the product does, not whether it does it correctly.
- Not for adding a feature to a product that already has users (use the product's own usage data and an experiment), and not for products where a partial release is unsafe, such as medical devices or payments infrastructure.
