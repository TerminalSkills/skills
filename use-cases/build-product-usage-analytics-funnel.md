---
title: "Build a Product Usage Analytics Funnel with AI"
slug: build-product-usage-analytics-funnel
description: "Set up a product usage funnel to identify where users drop off and what features drive retention."
skills: [analytics-tracking, data-analysis]
category: data-ai
tags: [analytics, funnel, product, retention, user-behavior]
---

# Build a Product Usage Analytics Funnel with AI

## The Problem

Tomas runs a 15-person B2B SaaS startup with 2,000 registered users. Only 300 are active weekly. That is an 85% drop-off between signup and regular usage, and the founder keeps asking "why aren't users sticking?" Nobody has data to answer.

The product team has basic page-view analytics -- they know users visit the dashboard -- but they have no idea where users drop off. Is it during onboarding? After creating the first project? When they try to invite teammates and nobody responds? The team debates this in every product meeting, and every person has a different theory based on the last user they talked to.

Setting up proper funnel analytics has been on the backlog for months, but there is no dedicated data analyst and the developers are focused on shipping features. Every week the gap between signups and active users widens, and the team is making product decisions on gut feeling. They shipped three onboarding improvements last quarter based on hunches -- none of them moved the weekly active number.

## The Solution

Use the **analytics-tracking** skill to instrument key user events, and the **data-analysis** skill to query, segment, and visualize funnel data the team can act on. The workflow goes from zero instrumentation to actionable funnel insights in under a week: define stages, add tracking code, collect data, analyze drop-offs, and produce visualizations that drive product decisions.

## Step-by-Step Walkthrough

### Step 1: Define the Critical Funnel Stages

The first step is defining what "activation" actually means. Most teams track too few stages (signup and monthly active) or too many (every click). The sweet spot is 5-8 stages that represent genuine progression toward becoming a retained user.

```text
We're a project management SaaS. Define a user activation funnel with these stages: signup → email verified → first project created → first team member invited → first task completed → returned within 7 days. Also suggest any stages I might be missing.
```

The activation funnel needs seven stages, not six. Profile setup completion is a commonly overlooked drop-off point -- users who bail on "tell us about your team" forms never reach the product:

1. **Signup completed** -- account created
2. **Email verified** -- clicked confirmation link
3. **Profile setup completed** -- filled in team name and role
4. **First project created** -- created (not just viewed) a project
5. **First team member invited** -- sent at least one invite
6. **First task completed** -- marked a task as done
7. **Returned within 7 days** -- came back after initial session

Two additional tracking dimensions make the funnel actionable rather than just informational:

- **Time between stages**: A 4-minute median for email verification is healthy. An 18-minute median for first project creation means users are lost. Without timing data, both stages look like similar drop-offs.
- **Feature discovery events**: Which features do retained users try first? If retained users all discover the template gallery before creating a project, that is a strong signal to surface templates earlier in onboarding.

### Step 2: Instrument the Tracking Events

```text
Generate the tracking code for these funnel events. We use a Node.js backend with Express and a React frontend. Use a provider-agnostic approach so we can send events to any analytics backend.
```

The tracking layer is provider-agnostic -- a thin wrapper around a two-line `AnalyticsProvider` interface. Point `setProvider` at the Mixpanel, Amplitude, PostHog or GA4 client you choose (or at your own `/events` endpoint) without changing any call site. Pass an opaque user ID, never an email address, and fire each event from the server once the action succeeded (the project row exists), not when a button is clicked:

```typescript
// lib/analytics.ts: provider-agnostic funnel events
export type FunnelEvent =
  | { name: 'signup_completed'; properties: { source: string } }
  | { name: 'email_verified'; properties: { delay_seconds: number } }
  | { name: 'profile_setup_completed'; properties: { team_size: string; role: string } }
  | { name: 'first_project_created'; properties: { template_used: boolean; template_name?: string } }
  | { name: 'first_member_invited'; properties: { invite_method: 'email' | 'link' } }
  | { name: 'first_task_completed'; properties: { time_to_complete_hours: number } }
  | { name: 'user_returned'; properties: { days_since_signup: number; session_count: number } };

export interface AnalyticsProvider {
  track(name: string, properties: Record<string, unknown>): void;
}

let provider: AnalyticsProvider = { track: () => {} };

export function setProvider(p: AnalyticsProvider): void {
  provider = p;
}

export function track(userId: string, event: FunnelEvent): void {
  provider.track(event.name, {
    ...event.properties,
    user_id: userId,
    timestamp: new Date().toISOString(),
  });
}
```

The typed union ensures every call site provides the right properties for each event. No more passing `{ event: "signup" }` from one file and `{ type: "user_signup" }` from another -- the TypeScript compiler catches mismatches at build time.

Keep event names to lowercase letters, digits and underscores (GA4 allows 40 characters, 25 parameters per event, and silently drops anything over the limits), and use Google's recommended names such as `sign_up` if you send these to GA4 -- the **analytics-tracking** skill has the full rules and the consent-mode setup you need for EU visitors. Fire `user_returned` only for a session 1-7 days after signup, so the stage means what its name says.

Backend events (signup, email verification) fire from Express middleware. Frontend events (project creation, task completion) fire from React components. Both use the same event names and property shapes, so when querying funnel data later, there is no mismatch between what the frontend and backend report.

One subtle but important detail: each event captures timing information. `delay_seconds` on email verification tracks how long users take to open the confirmation email. `time_to_complete_hours` on the first task tracks the gap between project creation and meaningful engagement. These timing properties turn the funnel from a "what" tool into a "where do users stall" diagnostic.

### Step 3: Analyze the Funnel Data

Export the events (from your analytics tool, or the events table) to `events.csv` with `user_id`, `event`, `ts` and `source` columns. The **data-analysis** skill loads it with pandas and computes each transition from every user's first timestamp per stage, counting a user as converted only if the next stage happened after the previous one. The numbers below are this example team's own, from 90 days of data. Out of 1,847 signups in the last 90 days, only 72 made it all the way to "returned within 7 days" -- a 3.9% end-to-end activation rate:

```python
import sys

import pandas as pd

STAGES = [
    "signup_completed",
    "email_verified",
    "profile_setup_completed",
    "first_project_created",
    "first_member_invited",
    "first_task_completed",
    "user_returned",
]


def funnel(events: pd.DataFrame) -> pd.DataFrame:
    """events: one row per event with user_id, event, ts (UTC)."""
    first = (
        events[events["event"].isin(STAGES)]
        .groupby(["user_id", "event"])["ts"].min()
        .unstack("event")
        .reindex(columns=STAGES)
        .apply(pd.to_datetime, utc=True)  # a stage nobody reached comes back all-NaN, not datetime
    )
    rows = []
    for prev, cur in zip(STAGES, STAGES[1:]):
        reached_prev = first[prev].notna()
        # a user converts only if the next stage happened after the previous one
        converted = reached_prev & (first[cur] >= first[prev])
        gap = (first.loc[converted, cur] - first.loc[converted, prev]).median()
        rows.append({
            "transition": f"{prev} -> {cur}",
            "from_users": int(reached_prev.sum()),
            "to_users": int(converted.sum()),
            "conversion": round(converted.sum() / max(reached_prev.sum(), 1), 3),
            "median_gap": gap,
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = pd.read_csv(sys.argv[1], parse_dates=["ts"])
    out = funnel(df)
    print(out.to_string(index=False))
    if "source" in df.columns:
        users = df[df["event"] == "signup_completed"].drop_duplicates("user_id")[["user_id", "source"]]
        for source, grp in df.merge(users, on="user_id", suffixes=("", "_signup")).groupby("source_signup"):
            print(f"\n== {source}")
            print(funnel(grp)[["transition", "from_users", "conversion"]].to_string(index=False))
```

```text
Analyze our funnel data from the last 90 days. Show conversion rates between each stage, median time between stages, and segment by signup source (organic, paid, referral).
```

| Stage Transition | Conversion | Users | Median Time |
|---|---|---|---|
| Signup -> Email verified | 78% | 1,441 | 4 min |
| Email verified -> Profile setup | 61% | 879 | 2 min |
| Profile setup -> First project | 54% | 475 | 18 min |
| First project -> Invite teammate | 31% | 147 | 3 days |
| Invite teammate -> First task | 72% | 106 | 12 min |
| First task -> 7-day return | 68% | 72 | 2 days |

The good news: the stages that work, work well. Email verification at 78% is healthy. Once users invite a teammate, 72% complete a task -- the collaborative experience holds. The funnel is not uniformly leaky; it has two specific bottlenecks.

Two massive drop-offs jump out immediately.

The first is profile-to-project at 54% -- users stall at the blank project screen with no guidance. The median time of 18 minutes is telling: users are not leaving instantly, they are poking around for 18 minutes and then giving up. That is frustration, not disinterest. A blank screen with a "Create Project" button is not enough -- these users need templates, examples, or a guided setup.

The second is project-to-invite at 31% with a 3-day median -- users are not discovering the team features, or they are evaluating solo before deciding whether to bring teammates in. The 3-day gap is especially concerning because it means the product fails to demonstrate collaborative value in the first session. By day 3, urgency has faded.

### Step 4: Segment by User Type

```text
Break down the funnel by signup source and company size. Are enterprise trial users behaving differently from self-serve signups?
```

The segments tell a dramatically different story:

| Segment | Signups | Signup -> First Project | Signup -> 7-day Return |
|---|---|---|---|
| Self-serve (organic) | 1,200 | 23% (272) | 2.5% (30) |
| Self-serve (paid ads) | 400 | 12% (48) | 1.0% (4) |
| Enterprise trials | 247 | 63% (155) | 15.4% (38) |

The segments add up to the overall funnel: 475 first projects and 72 returning users out of 1,847 signups.

Enterprise users who get a guided onboarding call activate at about six times the rate of organic self-serve users. The call does not teach them anything magical -- it just walks them through creating a project with their real data instead of staring at a blank screen. Self-serve users need in-product guidance to match that experience.

Paid ad users perform worst of all: 1.0% end-to-end activation against 2.5% for organic. This suggests a targeting problem -- the ads are reaching people who are curious but not ready to commit, or the landing page sets expectations the product does not immediately deliver on. The paid channel may not be broken, but it needs different onboarding treatment than organic signups.

### Step 5: Visualize and Share Findings

```text
Create a funnel visualization showing these conversion rates with absolute numbers. Also create a retention curve chart showing weekly retention for cohorts from the last 3 months. Include the segment breakdown.
```

The output includes three types of visualizations ready for the product review meeting:

- **Funnel chart**: conversion rates with absolute numbers at each stage, showing exactly where the 1,847 signups narrow to 72 retained users
- **Cohort retention curves**: weekly retention for each monthly cohort, so the team can see whether recent changes are improving retention
- **Segment comparison**: side-by-side funnels for organic, paid, and enterprise users

The retention curve reveals another insight: users who invite a teammate within 48 hours have 3x higher 30-day retention than users who invite after a week. The invite is not just a growth lever -- it is the single strongest predictor of whether a user sticks.

The cohort view is particularly revealing. The January cohort (when the team shipped a quick-start wizard) retained 22% better at week 4 than the December cohort. That one feature change moved the needle more than the three marketing campaigns combined. Without cohort tracking, they would have credited the improvement to ad spend changes that happened in the same period.

## Real-World Example

Armed with data for the first time, Tomas presents two concrete findings at the weekly product meeting: 46% of users never create their first project (they stall at the blank screen for 18 minutes and leave), and users who invite a teammate within 48 hours retain at 3x the rate of those who invite later.

The team ships two changes: a project template picker that replaces the blank screen with "Start with a template" options, and an onboarding prompt that nudges users to invite a teammate before creating their first task. The engineering team integrates the tracking code in half a day.

First-project creation jumps from 54% to 71% in the next month. The invite rate climbs more slowly but steadily. Weekly active users climb from 300 to 410 in the first month, and the team has a clear roadmap of what to build next: an in-product nudge to invite teammates at the 48-hour mark, when the data shows invites have the highest correlation with retention.

For the first time, the founder's question has a data-driven answer -- and the team knows exactly which levers to pull. The funnel dashboard becomes a fixture in every weekly product meeting.
