---
title: "Automate Sprint Retrospective Reports"
slug: automate-sprint-retrospective-reports
description: "Generate data-driven sprint retrospectives by analyzing Git activity, PR metrics, and ticket data to surface what actually happened."
skills: [report-generator, data-analysis, github]
category: productivity
tags: [retrospective, sprint, agile, team-metrics, engineering-management]
---

# Automate Sprint Retrospective Reports

## The Problem

It is Friday afternoon, retro time. The manager asks "what went well?" and gets silence, then vague complaints about "too many meetings" and "slow reviews". Three people talk about the same three problems every two weeks. Without numbers, the loudest voice wins and recency bias dominates: "reviews take too long" has been on the board for months, and nobody can say whether it is getting better or worse, or whether one person is carrying most of the load.

The facts are in GitHub: PR timestamps, reviews, check results, workflow runs. Nobody has time to compile them before the meeting.

## The Solution

- **github** (the `gh` CLI) pulls merged PRs with their reviews, and workflow runs, for the sprint window as JSON.
- **data-analysis** turns that JSON into metrics with pandas: time to first review, PR size, review load per person, CI pass rate. It compares them with earlier sprints.
- **report-generator** writes the retro document in its weekly-status structure (summary, went well, needs attention, action items, key metrics with trend), so every claim carries a number.

Ticket-tracker data (Jira, Linear) is not covered by `gh`; if you want it in the report, export it as CSV and load it with the same pandas code. The rest of this page uses GitHub data only.

## Step-by-Step Walkthrough

### Step 1: Pull the sprint's data with gh

```text
Pull all PRs merged between 2026-02-03 and 2026-02-14 in acme-shop/web-store with their
reviews, and all workflow runs created in that window. Save them as JSON.
```

```console
$ gh auth status
$ gh pr list -R acme-shop/web-store --state merged --search "merged:2026-02-03..2026-02-14" \
    --limit 500 --json number,author,createdAt,mergedAt,additions,deletions,reviews > prs.json
$ gh run list -R acme-shop/web-store --created "2026-02-03..2026-02-14" \
    --limit 1000 --json databaseId,workflowName,conclusion,createdAt > runs.json
```

`gh pr list` and `gh run list` accept `--json` with the fields shown, and `reviews` carries each review's author, state and `submittedAt`. The default limit is 30 for PRs and 20 for runs, so always pass `--limit`, and check that the number of rows is below the limit; otherwise the data is silently cut off. In scripts and CI, `gh` reads the token from `GH_TOKEN`; it is never printed or committed.

### Step 2: Compute the metrics

```text
For each PR compute hours to first review (ignoring the author's own reviews), hours
to merge and size in changed lines. Then per reviewer review counts, and the CI pass rate.
```

```python
import pandas as pd

def pr_frame(prs):
    rows = []
    for pr in prs:
        author = (pr.get("author") or {}).get("login")
        reviews = [r for r in pr["reviews"] if (r.get("author") or {}).get("login") != author and r.get("submittedAt")]
        first = min((pd.Timestamp(r["submittedAt"]) for r in reviews), default=None)
        created = pd.Timestamp(pr["createdAt"])
        rows.append({
            "number": pr["number"], "author": author, "lines": pr["additions"] + pr["deletions"],
            "hours_to_first_review": (first - created).total_seconds() / 3600 if first is not None else None,
            "hours_to_merge": (pd.Timestamp(pr["mergedAt"]) - created).total_seconds() / 3600,
            "reviewers": sorted({r["author"]["login"] for r in reviews}),
        })
    return pd.DataFrame(rows)

df = pr_frame(prs)
per_reviewer = df.explode("reviewers")["reviewers"].value_counts()
ci = pd.DataFrame(runs)
done = ci[ci["conclusion"].isin(["success", "failure"])]       # skip cancelled and skipped runs
metrics = {
    "median_hours_to_first_review": df["hours_to_first_review"].median(),
    "mean_hours_to_first_review": df["hours_to_first_review"].mean(),
    "prs_over_500_lines": int((df["lines"] > 500).sum()),
    "ci_pass_rate": (done["conclusion"] == "success").mean(),
    "top_reviewer_share": per_reviewer.iloc[0] / per_reviewer.sum(),
}
```

The script was run on a small synthetic dataset to check the logic. Things the agent has to state with the numbers:

- Report the median next to the mean. One 1,800-line PR waiting three days drags the mean up; the median shows the typical wait.
- PRs merged with no review have no first-review time; count them separately (`df["hours_to_first_review"].isna().sum()`) because that is a finding in itself.
- Review counts are review submissions, not comments, and an author's own reviews are excluded.
- The workflow-run pass rate counts every run, including re-runs of the same commit, so a flaky test shows up as lower pass rate even if the final build is green. Say which it is.
- Deploy frequency is only available if deploys are a workflow: filter `gh run list --workflow deploy.yml` to successful runs. Otherwise leave it out.

### Step 3: Compare with earlier sprints

```text
Run the same code for the last three sprint windows, append each result to
retro-history.json, and show the trend table.
```

Each sprint's `metrics` dictionary is appended to `retro-history.json` with the sprint label, and a pandas DataFrame over that file gives the trend table. Mark a metric as "degrading" only if it moved in the same direction across at least three sprints; with two points, say it moved and wait for the next one. The script is the same every sprint, which is the point: the numbers stay comparable.

For a cause behind a CI trend, look at the failures themselves. `gh run view <run-id> --log-failed` prints the logs of the failed jobs; the agent counts which test name appears most across the failed runs, and reports "N of M failures name the same test" only when it has counted them.

### Step 4: Write the retro document

```text
Create retro-sprint-23.md using the report template: a two-sentence summary, what went well,
what needs attention (each with a number), action items with an owner and a date, and a
metrics table showing this sprint, last sprint and the trend.
```

report-generator's weekly template gives the structure; the agent fills it only from the metrics above. The rules from that skill apply: lead with impact, quantify every "needs attention" item, label items honestly (On Track, At Risk, Blocked, Complete) and keep it to one page. Observations about people ("Noa did 26% of the reviews") are framed as load on the process, not as a judgement, and the manager reads them before the meeting.

### Step 5: Track the action items

Keep the previous retro's action items in the history file with an owner, a due date and a status. Before generating the new report, the agent lists last retro's items and asks the manager for each status (completed, partial, abandoned); it does not guess from commits. The new document opens with that follow-through rate. Items that recur in several retros are written more specifically ("quarantine `payments/checkout.spec.ts`, owner Sam, Wednesday" instead of "reduce flaky tests"), and the team takes at most three items per sprint.

## Real-World Example

Jess, engineering manager of a 12-person product team, has run the same retro format for eight months. She runs the two `gh` commands and the script before the next retro and gets a table covering the last four sprints. The median time to first review is the stable number; the mean is far higher because of a few PRs that waited days, and one reviewer accounts for about a quarter of all reviews. These figures are for the example team.

In the meeting she projects the report. The discussion moves from "reviews are slow" to "reviews for large PRs wait the longest, and a quarter of the reviews depend on one person". The team picks three actions with owners and dates. The next sprint's report opens with the follow-through on those items and the new review numbers, so the effect of the change is visible instead of remembered.
