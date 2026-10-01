---
name: email-sequence
description: >-
  Designs automated email sequences end to end: the trigger, branches and exit
  rules, the full copy of every message, and the sender setup that keeps them
  out of spam (SPF, DKIM, DMARC, one-click unsubscribe, consent). Covers
  onboarding and welcome series, lead nurture, abandoned cart, dunning,
  win-back and sunset flows. Use when someone asks for a "drip campaign",
  "welcome sequence", "onboarding emails", "nurture sequence", "win-back
  emails", "lifecycle emails", "email automation", or says "our emails land in
  spam" or "nobody clicks our onboarding emails". In-app onboarding belongs to
  onboarding-cro.
license: Apache-2.0
compatibility: >-
  Works with any email service that supports event-triggered automations.
  DNS checks need dig (bind-utils or dnsutils); the endpoint check needs curl.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["email", "lifecycle-marketing", "deliverability", "automation", "onboarding"]
---

# Email Sequence

## Overview

An email sequence is a small state machine: an event puts a person in, behaviour moves them between branches, and a goal event takes them out. Most weak sequences fail in the machine, not the prose: they keep selling to people who already bought, mail on a calendar regardless of what the person did, or never reach the inbox because the sending domain is not authenticated.

This skill produces three artifacts: a sequence specification an engineer can build in any email service, the complete copy of each message, and a sender-readiness check against the published requirements of Gmail, Yahoo and Outlook.

## Instructions

### 1. Establish the facts

Look in the project first: which email service is wired in, and which product events already exist.

```bash
grep -rniE "resend|postmark|sendgrid|customer\.?io|mailchimp|klaviyo|brevo|loops" package.json src/ | head -20
grep -rnE "track\(|identify\(|capture\(" src/ | head -20
```

Then ask for whatever is still unknown:

- The moment that starts the sequence and the single behaviour it should cause (the goal event).
- Who must not enter: existing customers, people without marketing consent, internal accounts.
- Every other email these people already get, and how often.
- Sending domain, daily volume, and the countries recipients live in.
- Proof the user is allowed to cite: real customer results, numbers, quotes.

### 2. Decide whether each message is commercial or transactional

A message whose main purpose is to promote is commercial; one that completes or reports on something the recipient asked for (receipt, password reset, payment failure) is transactional. Onboarding tips, nurture and win-back emails are commercial even when they feel helpful. The distinction decides three things: commercial mail needs consent or an existing-customer basis, it needs the unsubscribe header and a visible link, and it should go out on its own subdomain or stream so a complaint about a promotion never slows down a password reset.

### 3. Choose the shape

Starting points, to be adjusted to the buying cycle and to what the data later shows:

| Sequence | Enters on | Goal event | Typical span | Leaves when |
|---|---|---|---|---|
| Trial or free-plan onboarding | Account created | First real use of the core feature, then payment | 5–6 emails over the trial | Subscribes |
| Lead nurture | Resource downloaded, webinar attended | Call booked or trial started | 4–6 emails over 2–4 weeks | Books, or replies |
| Abandoned cart | Cart updated, no order after 1 hour | Order placed | 2–3 emails within 3 days | Orders |
| Post-purchase | Order delivered | Review left, second order | 3–4 emails over 30 days | Second order |
| Dunning (transactional) | Payment failed | Card updated | One email per retry, then a final notice | Payment succeeds |
| Win-back or sunset | No click for 90–180 days | Any click | 2–3 emails over 2 weeks | Clicks, otherwise suppressed |

### 4. Design the logic before the copy

- **Branch on behaviour.** Someone who has not finished setup needs help with setup on day 3, not a feature tour. Write the condition next to every email.
- **Exit conditions are checked before every send**, not only at entry.
- **One sequence at a time.** Name what is paused while this one runs (the newsletter, other automations) and which sequence wins a conflict.
- **Cap frequency**: no more than one automated email per person per day across all sequences.
- **Send in the recipient's working hours**, in their time zone when it is known.
- **Hold out a control group** (5–10% who get only the first message) when volume allows. It is the only way to learn whether the sequence causes the goal or merely precedes it.

### 5. Write each message

Each email does one job and has one primary link. Draft the body first, then the subject.

- **From**: a stable name people recognise ("Maren at Slotwise"). A reply address that a person reads.
- **Subject**: says what is inside, in the reader's words. Put the meaningful words first; narrow phone screens cut off the rest.
- **Preheader**: the line shown after the subject in the inbox. Continue the thought, never repeat the subject.
- **Body**: the first sentence states why this arrived now. Then the one useful thing. Then the link, written as the action it performs. Short paragraphs, plain words, second person.
- **Personalisation**: every merge field has a fallback ("Hi there"), and every claim about the recipient comes from data, not a guess.
- **Footer** for commercial mail: sender's legal name and postal address, why they receive this, an unsubscribe link that works without logging in.
- Always include a plain-text part. Do not put the whole message in one image.

### 6. Make sure it can reach the inbox

Requirements as published by the mailbox providers (checked October 2026):

| Requirement | Gmail | Yahoo | Outlook.com |
|---|---|---|---|
| Who counts as bulk | About 5,000 or more messages a day to personal Gmail accounts, counted per primary domain; the status does not expire | "A significant volume"; no number published | Over 5,000 messages a day |
| Authentication, any sender | SPF or DKIM, valid forward and reverse DNS, TLS | SPF or DKIM, valid forward and reverse DNS | — |
| Authentication, bulk | SPF and DKIM, plus DMARC (`p=none` accepted) with the From domain aligned to the SPF or the DKIM domain | Same | Same; failing mail is rejected with `550 5.7.515` |
| Unsubscribe, bulk | One-click header on marketing and subscribed mail, plus a visible link in the body; honoured within 48 hours | One-click header and a visible link; honoured within 2 days | A working, clearly visible link is recommended |
| Complaints | Stay under 0.1%; at 0.3% delivery suffers and mitigation is refused | Under 0.3% | — |

Transactional messages are exempt from the one-click rule at Gmail and Yahoo. Check the domain:

```bash
dig +short TXT fernwoodtea.co | grep spf1               # one record, lists the email service
dig +short TXT _dmarc.fernwoodtea.co                    # v=DMARC1; p=none|quarantine|reject; rua=mailto:...
dig +short TXT s1._domainkey.mail.fernwoodtea.co        # selector comes from the email service
```

One-click unsubscribe (RFC 8058) is two headers, both covered by the DKIM signature. Most email services add them when the message is sent on a marketing stream; confirm in the raw source of a delivered message:

```text
List-Unsubscribe: <https://mail.fernwoodtea.co/u/9f2c7a41e0b84d3c>, <mailto:unsubscribe@mail.fernwoodtea.co?subject=9f2c7a41e0b84d3c>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The mailbox provider sends a POST to that HTTPS address with the body `List-Unsubscribe=One-Click`, without cookies or a login. The address must identify the recipient and the list on its own, must answer directly rather than redirect, and must unsubscribe on POST only: link scanners issue GET requests, and a GET that unsubscribes will silently empty the list.

```bash
curl -i -X POST -d "List-Unsubscribe=One-Click" "https://mail.fernwoodtea.co/u/9f2c7a41e0b84d3c"   # expect 200, no Location header
```

### 7. Respect the law where recipients live

- **United States (CAN-SPAM)**: truthful From and subject, a postal address, a clear opt-out that costs nothing and needs no more than an email address or one page visit, honoured within 10 business days and working for at least 30 days after the send.
- **EU and UK**: marketing email to individuals needs prior consent, or the existing-customer exception for similar products where an opt-out was offered at collection and in every message. Pre-ticked boxes are not consent.

Building to the mailbox providers' two-day unsubscribe rule satisfies the slower legal deadlines as well. This is orientation, not legal advice; point the user to counsel for regulated sectors.

### 8. Measure the right thing

Apple Mail Privacy Protection loads message content in the background, so open rates are inflated and cannot gate a branch or decide a test. Judge a sequence by the goal-event rate of people who entered versus the holdout, click rate per email, unsubscribe and complaint rate per email, and the email after which most people stop clicking.

### 9. Deliver in this shape

1. The specification block (see Example 1): trigger, entry filter, goal, exits, suppression, send window, holdout, and one line per email.
2. Every email in full: send condition, From, subject, preheader, body, link text and destination.
3. The sender-readiness table for the user's domain, with each failing row and its fix.
4. What to measure after 30 days and the number that would trigger a rewrite.

## Examples

### Example 1: Trial onboarding for a booking product

**Request:** "Slotwise is online booking for physiotherapy clinics. 14-day trial, $39 a month per practitioner afterwards. People sign up and then never put the booking link on their site. Write the onboarding emails."

The agent finds `trial_started`, `booking_page_published` and `booking_created` events in the codebase and specifies:

```yaml
sequence: trial-onboarding
stream: marketing
trigger: trial_started
entry_filter: marketing_consent == true and is_internal == false
goal_event: booking_created where source == "patient"
exit_when: [subscription_started, account_deleted, unsubscribed]
pause_while_active: [monthly-newsletter]
send_window: "08:00-17:00 clinic time zone, Monday to Friday"
holdout: "10% of new trials receive email 1 only"
emails:
  - { id: 1, day: 0,  when: "always",                          job: "publish the booking page" }
  - { id: 2, day: 1,  when: "booking page not published",      job: "remove the setup obstacle" }
  - { id: 3, day: 3,  when: "page published, no patient booking", job: "put the link where patients look" }
  - { id: 4, day: 6,  when: "has a patient booking",           job: "show automatic reminders" }
  - { id: 5, day: 10, when: "always",                          job: "trial ends in 4 days, what stays and what stops" }
  - { id: 6, day: 13, when: "not subscribed",                  job: "last day, offer a 15-minute call" }
```

Two of the six messages, as delivered:

```text
EMAIL 1 · immediately after trial_started
From: Maren at Slotwise <maren@mail.slotwise.app>     Reply-To: maren@slotwise.app
Subject: Your booking page needs your opening hours
Preheader: Two minutes now, and patients can book themselves tonight.

Hi Tobias,

You started a Slotwise trial for Harbour Physio a moment ago. It runs until 19 October.

One thing stands between you and your first online booking: your opening hours.
Add them and your booking page goes live at once.

[Set opening hours]  ->  https://app.slotwise.app/setup/hours

Stuck on anything? Reply to this email. It comes to me, not a queue.

Maren Okafor, Slotwise
Slotwise Ltd, 14 Quay Street, Bristol BS1 4DJ · You get this because you started a trial. Unsubscribe

EMAIL 3 · day 3, only if the page is published and no patient has booked
Subject: Where to put your booking link
Preheader: Three places that take five minutes between appointments.

Hi Tobias,

Your booking page is live, and no patient has used it yet. That is normal:
patients cannot book through a link they have never seen.

Clinics on Slotwise usually start with these three places:
1. The "Book" button on the clinic website
2. The appointment reminder text you already send
3. Your Google Business Profile

[Copy my booking link]  ->  https://app.slotwise.app/share

Maren
```

Measure after 30 days: share of trials reaching a patient booking, sequence versus holdout. If email 3 is clicked by under 5% of the people who receive it, rewrite it before touching anything else.

### Example 2: A list that is hurting its own delivery

**Request:** "Fernwood Tea, 48,000 subscribers, weekly promos. Gmail's Postmaster Tools shows a spam rate of 0.34% and sales from email are falling."

The agent runs the three `dig` checks and reports:

| Check | Found | Verdict |
|---|---|---|
| SPF | `v=spf1 include:sendgrid.net ~all` | Pass |
| DKIM | Key published for selector `s1` | Pass |
| DMARC | No record at `_dmarc.fernwoodtea.co` | Fail: required for bulk senders |
| One-click header | Present; POST returns 200 | Pass |
| Complaint rate | 0.34% | Fail: above the 0.3% line |

Fixes, in order: publish `v=DMARC1; p=none; rua=mailto:dmarc@fernwoodtea.co`; stop promotional sends to the 19,200 subscribers with no click in 180 days; put those subscribers through a sunset sequence instead.

```text
EMAIL 1 · day 0
Subject: Still want tea notes from us?
Preheader: One click keeps you on the list. No click, and we stop writing.

Hi Rosa,

You have not opened a link from us since March, so we are checking before we send more.

[Keep me on the list]  ->  https://fernwoodtea.co/stay?t=9f2c7a41e0b84d3c

If we hear nothing, the email after this one will be our last.

EMAIL 2 · day 7, only if no click
Subject: Last email from Fernwood Tea
Preheader: We are taking you off the list on Friday unless you say otherwise.
```

Anyone who has not clicked seven days after the second message is suppressed, not deleted, so they are never re-imported. The agent states what to expect: the list shrinks by up to 19,200 addresses, and Gmail restores eligibility for mitigation once the rate has stayed below 0.3% for seven consecutive days.

## Guidelines

- Never invent testimonials, customer counts or deadlines. Urgency is only written when the date is real ("your trial ends on 19 October").
- Do not use opens as a branch condition or a success metric. Use clicks and product events.
- Do not add a second email service to SPF without counting lookups: SPF evaluation stops at 10 DNS lookups, and a record that exceeds it fails for every message.
- A "no-reply" sender address throws away the cheapest research channel there is. Use an address someone reads.
- Buying or scraping a list has no fix. No copy or warm-up plan repairs the complaint rate of people who never asked.
- Provider thresholds and legal rules change. Re-read the Gmail, Yahoo and Outlook sender pages before quoting numbers to a client, and treat the table above as dated.
- Timings in step 3 are defaults. A product bought once every five years and a daily-use app do not share a cadence; let the measured drop-off decide the length.
- Out of scope: one-off newsletters and broadcast campaigns, cold outreach to people who never opted in, SMS and push, and in-product onboarding screens (onboarding-cro).
