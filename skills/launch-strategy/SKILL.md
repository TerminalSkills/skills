---
name: launch-strategy
description: >-
  Turns "we ship on this date" into a dated launch plan: how big the
  announcement should be, the rollout stages and their exit criteria, the
  message, channels ranked by the audience the team really has, an asset list
  with owners, a launch-day runbook with rollback triggers, and the numbers to
  review afterwards. Includes the published rules for Product Hunt and Show HN.
  Use when someone says "plan our launch", "launch on Product Hunt", "Show HN",
  "announce this feature", "go-to-market plan", "beta launch", "waitlist",
  "early access rollout" or "how do we announce the new pricing".
license: Apache-2.0
compatibility: >-
  Any agent with file access. Link tagging follows Google Analytics 4 UTM
  conventions; the link generator is plain POSIX shell.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["launch", "go-to-market", "product-hunt", "release-planning", "product-marketing"]
---

# Launch Strategy

## Overview

A launch is a deadline that forces three things to be true on the same day: the product works for strangers, the people who should care hear about it, and the team can cope with what happens next. Launches disappoint when one of the three is missing: an announcement to an audience of nobody, a spike of signups into a broken first run, or a quiet day because all the effort went into a platform where the team had no standing.

This skill produces one document: goal, launch size, stages, message, channel plan, dated timeline with owners, launch-day runbook and a review template. It sizes the plan to the audience and staff that exist, and it treats every release after the first as another, smaller launch.

## Instructions

### 1. Establish the facts

Read the repository for what is really shipping and how it can be switched on:

```bash
head -40 CHANGELOG.md
grep -rniE "feature_?flag|isEnabled\(|rollout" src/ | head -15
```

Then ask:

- **What ships and for whom.** New product, new capability, new price, or an improvement?
- **The goal as a number and a date**: activated accounts, upgrades, adoption among existing customers, pipeline.
- **The audience the team can reach today, with sizes**: customers, email subscribers, waiting list, followers per network, communities where a team member is already a known participant.
- **Proof in hand**: beta users, quotes, measured results.
- **Constraints**: fixed dates, app-store review, partners under embargo, who is available on the day and in which time zone, support capacity.

### 2. Size the launch

Announcing everything at full volume teaches the audience to ignore announcements. Pick the tier first; it decides everything downstream.

| Tier | What qualifies | Treatment |
|---|---|---|
| 1 | A new product, a capability that changes who can buy, a pricing change | Every relevant channel, dedicated page, staged rollout, staffed launch day, 3 or more weeks of preparation |
| 2 | A feature many customers asked for, an important integration | Email to the affected segment, in-app notice, a post, updated docs; about a week |
| 3 | Improvements, fixes, small options | Changelog entry and release notes, batched into the monthly update |

When several tier 2 items are ready together, release them on separate weeks: each gets its own moment and its own measurement.

### 3. Plan the stages and their exit criteria

Each stage answers one question, and the plan names the evidence that allows moving on.

| Stage | Who gets it | Question it answers | Move on when |
|---|---|---|---|
| Private beta | 10 to 50 invited users or customers | Does it work for people who are not us? | No open blocker, and at least a handful use it unprompted a second time |
| Public beta or waiting list | Anyone who asks, labelled as beta | Can strangers get to value without help? | First-run completion is stable and support load is known |
| General availability | Everyone | Announcement day | — |

For a feature inside a live product, stage by percentage behind a flag (for example 5%, then 25%, then everyone) and write the rollback trigger before the first step: the error rate, failed-payment rate or ticket volume at which the flag goes off.

### 4. Write the message once

One paragraph that every asset is cut from: who it is for, what they can now do, why it matters now, the proof, and the single next step. Use the words beta users used. If a sentence would be equally true of a competitor, replace it with a specific.

### 5. Choose channels from the audience that exists

List every channel with its real reach and rank by reach times fit, then cut to what the team can do well. Three done properly beat eight done thinly.

- **Channels the company controls**: customer email, waiting list, in-app message, website banner, docs, changelog. These go first and carry most results for anyone with customers.
- **Platforms and communities**: Product Hunt, Hacker News, Reddit, LinkedIn, X, app stores, niche forums. Useful only where the team already participates; each has rules.
- **Other people's audiences**: newsletters, podcasts, partners, press. Slowest to arrange; pitch three weeks ahead with the story and the proof, and state the embargo date in the first line.

Every public post points to one landing page that can capture an email, so attention on a platform becomes a contact the company keeps.

**Product Hunt, as published in its launch guide.** The day runs on Pacific Time and a launch posted at 12:01 am PT gets the full day. A launch can be scheduled up to a month ahead. Only personal accounts may post; no outside "hunter" is needed. Listing limits: tagline 60 characters, description 500 characters, square thumbnail (240 by 240 recommended, under 3 MB), at least two gallery images (1270 by 760 recommended), video as a YouTube link, up to three launch tags. Write the maker's first comment in advance. Asking people directly for upvotes is against the rules; ask them to visit and comment.

**Show HN, as published by Hacker News.** It is for something people can try: a landing page, signup page, newsletter or blog post does not qualify. The title starts with "Show HN:", the maker stays to answer questions, and nobody is asked to upvote or comment. Make it usable without creating an account where possible, and write the title plainly, with no capitals for emphasis and no exclamation marks.

**Reddit and niche forums.** Read each community's rules on self-promotion before posting; many forbid it outright. A long-standing member sharing something they built is welcome in places where a new account dropping a link is removed.

**App stores.** Submit early enough for review. Apple reports that 90% of submissions are reviewed in under 24 hours; Chrome Web Store says most reviews finish within a few days and some take weeks.

### 6. Tag every link

GA4 expects `utm_source`, `utm_medium` and `utm_campaign` together, and values are case-sensitive, so keep them lowercase.

```bash
page="https://tidewater.dev/launch"
campaign="ga_2026_11"
while read -r source medium; do
  echo "${page}?utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}"
done <<'LINKS'
waitlist email
producthunt referral
linkedin social
github referral
LINKS
```

Submit the untagged address to Hacker News and Reddit; their visits are identifiable by referrer. Record the baseline (daily signups, activation rate) for the two weeks before launch so the result has something to be compared with.

### 7. Build the timeline backwards from the date

| When | What must be true |
|---|---|
| T−21 days | Goal, tier and message agreed. Private beta running. Partner and press pitches sent. |
| T−14 | Landing page live with email capture. Demo recording and screenshots done. Store submissions in. |
| T−7 | All copy written: emails, posts, first comments, docs, support replies. Links tagged. Teaser to the list. |
| T−2 | Freeze. Full walk-through as a new user on a clean device. Rollback rehearsed. |
| T−0 | Runbook (step 8). |
| T+1 to T+14 | Follow-ups, second moments, review (step 9). |

Every row in the delivered plan has an owner and a calendar date. Avoid days when the team is thin, and avoid shipping on the eve of a weekend.

### 8. Write the launch-day runbook

A runbook lists clock times in one named time zone, the person for each action, and the conditions for stopping. It always includes: the switch-on (deploy or flag), a smoke test as a new user, the send order (customers before the public, so customers never learn from a stranger), who answers comments and tickets in which hours, the dashboards to watch (errors, signup funnel, payments), and the rollback trigger with the name of the person allowed to pull it.

### 9. Follow through and review

The two weeks after matter as much as the day. Schedule in advance: a reminder to people who did not click the first email (do not select by opens; Apple Mail loads messages automatically), replies to everyone who commented, a post with what was learned, thank-you notes to anyone who helped, and a second moment on another channel once the first has settled. Then fill in the review: goal versus actual, visits and signups per source, activation of launch-week signups against the baseline, what broke, what to repeat. Put the next launch date in the calendar before closing the document.

### 10. Deliver

One Markdown document with these headings: Goal and tier · Stages and exit criteria · Message · Channels (reach, owner, rule notes) · Timeline (date, task, owner) · Launch-day runbook · Rollback · Review template. Lead with the three decisions the user must make this week.

## Examples

### Example 1: First public launch with a small audience

**Request:** "Tidewater is an open-source CLI that verifies Postgres backups by restoring them, plus a hosted dashboard. Two founders in Berlin. 340 on the waiting list, 1,100 GitHub stars, I have 900 LinkedIn followers. We want to launch in November."

The agent classifies it as tier 1, sets the goal with the founders (150 accounts with a completed first restore within 14 days), and splits the public moments so two people can staff each one: the list and Show HN on Tuesday 10 November, Product Hunt a week later.

```text
Tue 20 Oct  Message and goal agreed; 12 beta users confirmed                     Jonas
Tue 27 Oct  /launch page live; 90-second demo recorded; quickstart needs no account  Mirela
Tue 03 Nov  Emails, posts and first comments written; links tagged; teaser to list   Jonas
Mon 09 Nov  Freeze; clean-laptop install test; rollback rehearsed                Mirela
Tue 10 Nov  Launch day (runbook below)                                           both
Thu 12 Nov  Reminder to waiting-list members who did not click                   Jonas
Tue 17 Nov  Product Hunt, live at 09:01 CET (12:01 am PT)                        both
Tue 24 Nov  Review against the goal; date set for the next release               both
```

```text
RUNBOOK · Tue 10 Nov · all times CET
08:30  Deploy v1.0, enable public signup                          Mirela
08:45  Smoke test: install, first restore, dashboard shows result Mirela
09:00  Email to the 340 on the waiting list                       Jonas
15:00  Show HN post (09:00 in New York), founders reply all day   Jonas
15:10  LinkedIn post and GitHub release notes                     Jonas
All day  Watch error rate, signup-to-first-restore funnel, inbox  Mirela
ROLLBACK  If more than 1 in 5 first restores fail for 30 minutes: close public signup,
          keep the CLI available, post a status note. Decision: Mirela.
```

```text
Show HN title   Show HN: Tidewater – verify Postgres backups by restoring them nightly
PH tagline      Verify your Postgres backups by restoring them every night        (58 of 60)
PH description  Tidewater restores last night's backup into a throwaway database, runs your
                checks against it and reports what failed. Open-source CLI with an optional
                hosted dashboard. Works with pg_dump, pgBackRest and WAL-G.     (211 of 500)
```

The agent points out that the Show HN link goes to the repository, where the tool can be run without an account, and that the waiting-list email asks readers to try it and reply with what broke, not to vote anywhere.

### Example 2: A payments feature for existing customers

**Request:** "Mossgate is booking software for dog groomers, 4,800 paying salons. We built online deposits to cut no-shows. It is ready Monday 12 October. How do we announce it?"

The agent rates it tier 1 for existing customers (it changes revenue and touches payments) with no public platform push, since the buyers are already in the product. Goal: 30% of salons take at least one deposit within 30 days of full release.

| Date | Stage | Audience | Move on when |
|---|---|---|---|
| Mon 12 Oct | Flag on for 5% | 240 salons, chosen from those who asked for deposits | Payment failures under 2%, no data errors after 48 hours |
| Mon 19 Oct | 25% | 1,200 salons, in-app notice only | Deposit tickets under 15 a day |
| Mon 26 Oct | Everyone | Email to all owners, in-app guide, help article, changelog | — |
| Wed 25 Nov | Review | — | Adoption against the 30% goal |

Rollback trigger at any stage: failed deposit charges above 5% in an hour turns the flag off; the on-call engineer decides. The announcement email leads with a beta salon's own result, which the agent marks for confirmation and written permission before use, and it goes to owners only, not to staff accounts. Salons that have not switched deposits on by 2 November get one follow-up showing the two-step setup.

## Guidelines

- Do not plan around a platform the team has never taken part in. A first-ever post that is an advertisement is treated as one.
- Never organise votes, pay for traffic or hand out prepared comments. Product Hunt removes launches and bans accounts for it, and Hacker News forbids soliciting votes or comments.
- A waiting list decays. If the product will not open within about two months, send those people something useful in the meantime.
- Launching before a stranger can get through the first run wastes the one day of attention. Hold the date only if the private-beta exit criteria were met.
- Platform rules and limits change; re-read the Product Hunt launch guide and the Show HN page in the week of the launch.
- Ranking on a launch platform is not the goal. Report signups, activation and revenue against the baseline.
- A plan without owners and dates is a wish list. If the user cannot name who does a task, cut the task.
- Neighbouring work has its own skills: page text (copywriting), launch and onboarding emails (email-sequence), social posts (social-content), paid promotion (paid-ads).
