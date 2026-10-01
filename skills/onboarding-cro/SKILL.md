---
name: onboarding-cro
description: >-
  Audits and redesigns what happens between account creation and a new user's
  first real result, so that more signups activate and come back. Use when
  someone says "activation rate is low", "users sign up and never return",
  "fix our onboarding flow", "first-run experience", "time to value", "empty
  states", "onboarding checklist", "aha moment", or "product tour". Finds the
  activation event in the product's own data with SQL, measures where new
  users stop, decides step by step what to remove, default or defer, and
  specifies screens, permission prompts, lifecycle messages, tracking events
  and the experiment that proves the change.
license: Apache-2.0
compatibility: >-
  Any agent with read access to the application code and to event data (a SQL
  warehouse such as PostgreSQL or DuckDB, or exports from GA4, PostHog,
  Amplitude or Mixpanel). The queries use standard SQL tested on PostgreSQL 16
  and DuckDB 1.5.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["onboarding", "activation", "retention", "product-analytics", "ux"]
---

# Onboarding CRO: Activation and the First-Run Experience

## Overview

Onboarding work fails in two ways: redesigning screens without knowing which early action predicts that a user stays, and adding guidance (tours, tooltips, checklists) on top of steps that should not exist. This skill does the measurement first, then the subtraction, then the design.

The agent produces an audit with numbers per step, a decision for every step between signup and first value, the specification for what replaces it, and an experiment sized for the product's signup volume. It covers the product after the account exists; the signup form itself and long-running email programmes are separate jobs.

## Instructions

### 1. Read the flow from the code and ask what the code cannot tell

Find the post-signup path in the repository: the redirect after registration, routes or components named `onboarding`, `welcome`, `setup`, `wizard`, `checklist`; the calls that record events (`track(`, `capture(`, `gtag('event'`, `logEvent(`); the jobs that send welcome and reminder messages; on mobile, every permission request and when it fires. List each screen in order with what it asks for.

Ask the user only for: what a successful customer gets out of the product in one sentence, how often a healthy user returns (daily, weekly, monthly), trial length or free limits, and where event data lives.

### 2. Find the activation event in the data

Activation is the earliest action a user controls that separates those who stay from those who leave. Derive it; do not assume it. With a `users(user_id, signed_up_at)` table and an `events(user_id, event_name, occurred_at)` table:

```sql
with cohort as (
  select user_id, signed_up_at
  from users
  where signed_up_at >= date '2026-06-01' and signed_up_at < date '2026-08-01'
),
did as (
  select distinct c.user_id, e.event_name
  from cohort c
  join events e on e.user_id = c.user_id
   and e.occurred_at < c.signed_up_at + interval '7 days'
),
retained as (
  select distinct c.user_id
  from cohort c
  join events e on e.user_id = c.user_id
   and e.occurred_at >= c.signed_up_at + interval '21 days'
   and e.occurred_at <  c.signed_up_at + interval '28 days'
)
select
  n.event_name,
  round(100.0 * count(d.user_id) / count(*), 1) as pct_who_did,
  round(100.0 * count(r.user_id) filter (where d.user_id is not null)
        / nullif(count(d.user_id), 0), 1) as retained_if_did,
  round(100.0 * count(r.user_id) filter (where d.user_id is null)
        / nullif(count(*) - count(d.user_id), 0), 1) as retained_if_not
from (select distinct event_name from did) n
cross join cohort c
left join did d on d.user_id = c.user_id and d.event_name = n.event_name
left join retained r on r.user_id = c.user_id
group by n.event_name
order by 3 desc;
```

Adjust the windows to the product's rhythm: first 7 days and week 4 suit a weekly-use tool; a daily app might use day 1 and day 7. The cohort must be old enough for every user to have reached the retention window.

Choose the event that meets all four tests:

1. A large gap between `retained_if_did` and `retained_if_not`.
2. Done by enough users to matter, and by few enough that there is room to grow (roughly a tenth to two thirds).
3. Within the user's own control. "Received a first booking" depends on someone else; "shared the booking link" does not.
4. It is the product's value, not setup around it. Events with no gap (uploading a logo, picking a theme) are setup.

The gap is a correlation. Motivated users both do more and stay longer, so treat the chosen event as a hypothesis that step 7 tests.

### 3. Measure the path to that event

```sql
with cohort as (
  select user_id, signed_up_at
  from users
  where signed_up_at >= date '2026-06-01' and signed_up_at < date '2026-08-01'
),
steps (step_no, event_name) as (
  values (1, 'signed_up'), (2, 'workspace_created'), (3, 'working_hours_set'),
         (4, 'calendar_connected'), (5, 'booking_link_shared')
),
reached as (
  select s.step_no, s.event_name, c.user_id, c.signed_up_at, min(e.occurred_at) as first_at
  from steps s
  cross join cohort c
  join events e on e.user_id = c.user_id and e.event_name = s.event_name
   and e.occurred_at < c.signed_up_at + interval '7 days'
  group by s.step_no, s.event_name, c.user_id, c.signed_up_at
)
select
  step_no,
  event_name,
  count(*) as users,
  round(100.0 * count(*) / (select count(*) from cohort), 1) as pct_of_signups,
  round(cast(percentile_cont(0.5) within group (
          order by extract(epoch from (first_at - signed_up_at)) / 3600.0) as numeric), 1) as median_hours
from reached
group by step_no, event_name
order by step_no;
```

Without a warehouse, build the same funnel in the analytics tool. GA4's funnel exploration takes up to 10 steps, can be open or closed, and shows elapsed time between steps. Split the result by signup source and by device before drawing conclusions; an average can hide one broken segment.

### 4. Decide the fate of every step

For each screen or field before the activation event, pick exactly one:

| Decision | When | Typical cases |
|---|---|---|
| Remove | Nothing later depends on it | Intro carousels, "how did you hear about us", theme pickers |
| Default | A sensible value exists | Workspace name from the email domain, time zone from the browser, weekday working hours |
| Defer | Needed, but only after first value | Teammate invites, billing details, profile photo, secondary integrations |
| Do it for them | The user would otherwise face a blank screen | Sample project, starter template, import from the tool they are leaving |
| Keep and explain | First value is impossible without it | Connecting the one data source the product runs on |

A question asked during setup must change what the user sees next. If the answer is only stored for the sales team, defer it.

### 5. Design what remains

- **First screen after signup**: one primary action that leads toward the activation event. No dashboard of zeros.
- **Empty states**: say what will appear here, show one button that creates the first item, and where useful show clearly labelled sample data that disappears when real data arrives.
- **Checklist**: three to five items in the order they produce value, kept in one stable place, dismissible, with completed items detected from real events. Pre-tick an item only if the user has truly done it.
- **Tours and tooltips**: prefer a hint beside the control at the moment it becomes relevant over a tour at first launch. Apple's guidelines ask for onboarding that is fast and optional and teaches through interaction; Nielsen Norman Group's testing found tutorial screens did not improve task performance. Any tour needs a visible skip and must not return on later visits.
- **Accessibility of overlays**: a modal step moves focus inside when it opens, keeps Tab inside, closes on Escape and returns focus to its trigger (`role="dialog"`, `aria-modal="true"`, a label). Tooltips must be dismissible, hoverable and persistent (WCAG 2.2 SC 1.4.13); an overlay must not fully hide the focused control (SC 2.4.11); close buttons are at least 24 by 24 CSS pixels (SC 2.5.8).
- **Permission prompts**: request each permission when the user starts the feature that needs it, with the reason visible. On iOS write a specific purpose string. On Android 13 (API level 33) and later, notifications need the `POST_NOTIFICATIONS` runtime permission; ask after an action such as turning on a reminder. On the web, call `Notification.requestPermission()` from a click handler, never on page load.
- **Lifecycle messages**: trigger on behaviour, not only on the calendar, and stop when the user does the thing. One message, one next step, deep-linked to the exact screen. Promotional mail sent in bulk to Gmail must carry one-click unsubscribe (`List-Unsubscribe` with an HTTPS URI plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) and keep the reported spam rate under 0.3%.

### 6. Specify the tracking

Every remaining step gets an event, named in past tense, with the properties needed to segment it:

```yaml
events:
  - name: signed_up            # GA4 recommended event: sign_up (param: method)
    properties: [method, signup_source]
  - name: calendar_connected
    properties: [provider, seconds_since_signup]
  - name: booking_link_shared  # activation event
    properties: [channel, seconds_since_signup]
  - name: onboarding_checklist_item_completed
    properties: [item, position]
  - name: lifecycle_message_sent
    properties: [message_key, channel, trigger_event]
metrics:
  activation_rate: users with booking_link_shared within 7 days / users signed_up
  time_to_activation: median hours from signed_up to booking_link_shared
  guardrail: share of the cohort active in days 21-28
```

GA4 also defines `tutorial_begin` and `tutorial_complete` for flows that keep a guided sequence.

### 7. Prove it

Randomise new signups between the current and the new flow. The primary metric is activation rate within the window; the guardrail is retention in the later window, read when the cohort is old enough. Compute the sample before starting: for base rate p₁ and target p₂ at 5% significance and 80% power, users per variant ≈ 7.85 × (p₁(1−p₁) + p₂(1−p₂)) ÷ (p₁−p₂)². If signups are too few to finish in about eight weeks, ship the change to everyone and compare weekly signup cohorts before and after, stating that seasonality and traffic mix are not controlled.

### 8. Deliver the audit

Write the audit as Markdown with this title and these sections as headings, in order:

```text
Onboarding audit: Mendslot, signups 1 Jun – 31 Jul 2026 (n = 2,400)

1. Activation event      (the event, the four tests, the retention gap)
2. Path today            (table: step | users | % of signups | median hours | drop from previous)
3. Step decisions        (table: step | remove / default / defer / do for them / keep | reason)
4. New flow              (screens in order, copy for the first screen and empty states)
5. Messages              (trigger | wait | content | stop condition)
6. Tracking              (event spec)
7. Experiment            (metric, base, target, users per variant, duration, guardrail)
```

## Examples

### Example 1: A booking tool where setup hides the value

Request: "Mendslot lets physiotherapy clinics take online bookings. About 1,200 clinics sign up a month and most never come back. Here is read access to the warehouse."

The agent runs the first query on the June–July cohort:

```text
       event_name       | pct_who_did | retained_if_did | retained_if_not
------------------------+-------------+-----------------+-----------------
 first_booking_received |        20.8 |            69.3 |            14.2
 booking_link_shared    |        27.8 |            65.7 |            10.3
 calendar_connected     |        41.6 |            51.2 |             7.5
 working_hours_set      |        54.6 |            34.8 |            14.7
 workspace_created      |        79.4 |            30.7 |             6.5
 logo_uploaded          |        24.1 |            29.6 |            24.4
 signed_up              |       100.0 |            25.7 |
 teammate_invited       |        14.1 |            25.1 |            25.8
```

It picks `booking_link_shared` within 7 days as activation: a 55-point retention gap, done by 27.8%, and in the clinic's own hands, unlike the first booking. Logo upload and teammate invites show no gap, so they are setup. The path query shows 100% → 79.4% → 54.6% → 41.6% → 27.8%, with a median of 19.1 hours to connect a calendar and 46.2 hours to share the link.

Step decisions: workspace name defaulted from the email domain (removes a screen that loses a fifth of signups); working hours defaulted to weekdays 9:00–17:00 and editable later; calendar connection kept and moved to the first screen with one sentence on why; logo and invites deferred to a checklist shown after the first share. After the calendar connects, the user lands on their finished booking page with "Copy your booking link" as the only primary button. One lifecycle email fires 24 hours after `calendar_connected` if no share has happened, containing the link itself, and is cancelled by `booking_link_shared`.

Experiment: activation from 27.8% to 33% needs 1,224 clinics per variant, about two months at the current volume; the agent suggests the bolder target of 34% (868 per variant) only if the team accepts missing a smaller gain, and names week-4 activity as the guardrail.

### Example 2: A mobile app that asks for everything at first launch

Request: "Thriftwren is a budgeting app, 18,000 installs a month. First launch shows five intro cards, then the notification prompt, then asks to connect a bank. 39% connect a bank and 24% create a budget within three days."

Reading the app code, the agent lists the first-launch sequence and finds that a budget cannot be created without a connected bank, although the data model allows manual entries. Budget creation within three days is taken as the working activation event until retention data confirms it.

Decisions: intro cards removed; the first screen becomes "What do you want to keep under control this month?" with three category chips and an amount, producing a budget in under a minute from manual entry or a clearly labelled sample month; bank connection deferred to the moment the user taps "Add my real transactions", with the reason shown; notification permission requested when the user switches on "Warn me at 80% of a budget" (on Android 13 and later this triggers `POST_NOTIFICATIONS`; on iOS the purpose is visible on the screen that asks). The bank step keeps its place in a three-item checklist: budget created, bank connected, first alert set.

Tracking adds `budget_created` (source: manual, sample or bank), `bank_connect_started`, `bank_connected` and `notification_permission_answered` (result). Experiment: budget creation from 24% to 28% needs 1,884 installs per variant, under a week of traffic; the run is held for two full weeks, with bank connection by day 7 and day-30 activity as guardrails, since making the first budget easier must not reduce the share who later connect real data.

## Guidelines

- No activation event, no redesign. If event data does not exist, the first deliverable is the tracking spec and four weeks of collection, with only obvious removals shipped meanwhile.
- A retention gap in the first query shows association, not cause. Avoid forcing every user through the "magic" action; make it easier and test.
- Count steps by what the user must decide, not by screens. One screen with six required fields is six steps.
- Do not add a tour to explain a confusing screen. Fix the screen, then see whether the tour is still needed.
- Progress indicators must tell the truth. A bar that starts part-filled for work the user did not do is a deception, and people notice.
- Segment before concluding: invited teammates, mobile versus desktop and paid versus organic signups often need different first screens.
- Sample data must be unmistakably labelled and easy to delete, or users will mistake it for their own or distrust the product's numbers.
- Out of scope: the registration form, pricing and paywalls, and win-back campaigns for long-lapsed users. Products with a sales-assisted rollout need an implementation plan per account more than a self-serve flow.
