---
title: "Build Email Campaign Performance Analyzer with AI"
slug: build-email-campaign-performance-analyzer
description: "Analyze email campaign metrics to identify what drives opens, clicks, and conversions across your marketing emails."
skills: [data-analysis, excel-processor, report-generator]
category: business
tags: [email-marketing, campaign-analysis, metrics, conversion]
---

# Build Email Campaign Performance Analyzer with AI

## The Problem

A growth marketer at a 20-person SaaS startup sends 4-6 email campaigns per week across onboarding sequences, product updates and promotions. The email platform exports campaign data as CSV, but the analysis never happens: she glances at the open rate in the dashboard, decides it looks "okay" or "bad", and moves on.

Six months of exports sit in a folder and nobody has answered the basic questions. Do question subject lines beat statements? Which send days produce clicks? Where in the onboarding sequence do new users stop engaging? The platform dashboard shows metrics per campaign, but a pattern across 100+ campaigns only appears when the files are combined and grouped.

## The Solution

- **excel-processor** merges the monthly CSV exports (and any `.xlsx`) into one clean table: one date format, duplicates from re-sends removed, rows with missing tracking reported.
- **data-analysis** computes rates, groups campaigns by subject-line traits, send day and hour, and onboarding step, and draws the charts.
- **report-generator** turns the findings into a one-page report with the data source, period and recommendations.

All of it is Python with `pandas` (3.x, Python 3.11+) and `matplotlib`. The examples below were run on a synthetic dataset to check the code, not on your data.

## Step-by-Step Walkthrough

### Step 1: Merge and clean the exports

```text
Read every CSV in campaigns/. Columns: campaign_name, send_date, subject,
recipients, opens, clicks, unsubscribes, conversions. Merge them, remove re-sent
duplicates, and report rows with missing values before analyzing.
```

```python
from pathlib import Path
import pandas as pd

frames = [pd.read_csv(p).assign(source_file=p.name) for p in sorted(Path("campaigns").glob("*.csv"))]
df = pd.concat(frames, ignore_index=True)
df["send_date"] = pd.to_datetime(df["send_date"], format="%Y-%m-%d %H:%M", errors="coerce")
df = df.drop_duplicates(subset=["campaign_name", "send_date"])
df = df[df["recipients"] > 0].copy()
df["open_rate"] = df["opens"] / df["recipients"]
df["click_rate"] = df["clicks"] / df["recipients"]
df["ctor"] = df["clicks"] / df["opens"].where(df["opens"] > 0)   # click-to-open rate
print(df.shape, df.isnull().sum(), sep="\n")
```

State the date format explicitly: if monthly exports use different formats, pandas 3 would otherwise guess value by value. Print the shape and missing-value counts first (data-analysis, Step 2), and ask what to do with campaigns that lack conversion tracking rather than counting them as zero.

Compute the overall rates as total opens / total recipients, not as the average of per-campaign rates; a 500-person onboarding email should not weigh the same as a 50,000-person blast.

### Step 2: Treat open rates with care

Apple's Mail Privacy Protection (iOS 15 and later) stops senders from using invisible tracking pixels to learn when a message is opened ([Apple newsroom, June 2021](https://www.apple.com/newsroom/2021/06/apple-advances-its-privacy-leadership-with-ios-15-ipados-15-macos-monterey-and-watchos-8/)). Open counts from Apple Mail users are therefore not reliable, and a trend in open rate can come from a change in the audience's mail client mix. Use the open rate only for comparing campaigns sent to the same audience in the same period, and base decisions on click rate, click-to-open rate and conversions, which are less affected.

### Step 3: Compare subject-line patterns

```text
Flag each subject line: contains a question mark, contains a number, over 60
characters, contains an ALL-CAPS word. Compare click rate and open rate per flag,
with the number of campaigns in each group.
```

```python
s = df["subject"].fillna("")
df["is_question"] = s.str.contains(r"\?")
df["has_number"] = s.str.contains(r"\d")
df["is_long"] = s.str.len() > 60
df["has_caps_word"] = s.str.contains(r"\b[A-Z]{4,}\b")

def compare(df, flag):
    g = df.groupby(flag).agg(campaigns=("recipients", "size"), recipients=("recipients", "sum"),
                             clicks=("clicks", "sum"), opens=("opens", "sum"))
    g["click_rate"] = g["clicks"] / g["recipients"]
    g["open_rate"] = g["opens"] / g["recipients"]
    return g
```

Report the group sizes next to every rate. With 142 campaigns, a trait present in 8 of them is a hint, not a finding. Subject-line style is also confounded with campaign type (a newsletter is long, a re-engagement email is short), so group within a campaign type when there are enough campaigns. A hint becomes a decision after an A/B test on a split of the same send.

### Step 4: Compare send day and hour

```python
df["weekday"] = df["send_date"].dt.day_name()
df["hour"] = df["send_date"].dt.hour
by_day = df.groupby("weekday").agg(campaigns=("recipients", "size"), clicks=("clicks", "sum"),
                                   recipients=("recipients", "sum"))
by_day["click_rate"] = by_day["clicks"] / by_day["recipients"]
print(by_day.sort_values("click_rate", ascending=False))
```

Check that the send times are in one time zone before grouping by hour, and that the audience is in the time zone you think it is. Day-of-week differences are also confounded: if all promotions went out on Tuesday, "Tuesday wins" may only mean "promotions win".

### Step 5: Find the onboarding drop-off

```python
seq = df[df["campaign_name"].str.startswith("onboarding-")].sort_values("campaign_name")
seq = seq.assign(step_drop=seq["click_rate"].pct_change())
print(seq[["campaign_name", "click_rate", "step_drop"]])
```

Sorting by name works only up to `onboarding-9`; name steps `onboarding-01` or add a `step` column. On the synthetic data the click rate falls by 70% at step 4, which is exactly the shape to look for: a sudden step, not a gradual decline. The cause is then found by reading what email 4 asks the reader to do, not from the numbers.

Plot the click rate per step as a line chart with `matplotlib.use("Agg")` and `plt.savefig("onboarding.png", dpi=150)`, so it can be embedded in the report.

### Step 6: Write the report

```text
Generate email-campaign-report.html: data source, period, number of campaigns,
overall rates, the subject-line and send-day tables with group sizes, the onboarding
chart, and three recommendations with the evidence behind each.
```

report-generator builds the HTML with base64-embedded charts through Jinja2, with an optional PDF through WeasyPrint. Each recommendation names its evidence and how strong it is (for example "question subjects: 38 campaigns vs 104, click rate higher in both audiences"), and anything that is only a hint is listed as a test to run.

## Real-World Example

Marco is the growth marketer at a 20-person project-management SaaS. He exports six months of campaigns and runs the steps above on a Monday morning. The merge removes re-sent duplicates, and the missing-conversion rows are listed instead of counted as zero. The subject-line table suggests that question subjects get more clicks, but only after splitting by campaign type does he see the effect also holds among promotions, so he schedules an A/B test for the next three product updates rather than rewriting everything.

The onboarding table shows the click rate collapsing at email 4, whose link goes to a long setup page. He takes that to engineering as a product problem and simplifies the page; the re-run a month later is the check on whether the drop-off moved. The numbers in this example are what the team's own data would have to show, and the point of the pipeline is that the same script produces the same report next month with the new CSVs added.
