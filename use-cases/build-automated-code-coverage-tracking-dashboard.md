---
title: "Build Automated Code Coverage Tracking Dashboard with AI"
slug: build-automated-code-coverage-tracking-dashboard
description: "Set up a code coverage tracking system that monitors test coverage trends and surfaces gaps across your codebase."
skills: [test-generator, coding-agent, data-analysis]
category: development
tags: [code-coverage, testing, dashboard, quality]
---

# Build Automated Code Coverage Tracking Dashboard with AI

## The Problem

A 15-person engineering team knows their test coverage is uneven but has no visibility into where it is getting worse. Coverage reports run in CI but nobody looks at them: they are buried in build logs as a single number that scrolls past in a wall of green text.

New features ship with zero tests because nothing flags coverage drops. The tech lead discovers that a critical payments module went from 85% to 42% coverage over three months. Developers kept adding code without tests, and nobody noticed until a production bug caused duplicate charges. That was not a sudden drop; it was a slow erosion, PR by PR, a percent or two at a time, that a trend line would have shown in week one.

The overall number is misleading too. The codebase shows 71%, which sounds healthy, but utility functions sit at 95% (easy to test, rarely changed) while the billing module that handles real money sits at 38% (hard to test, changed constantly). What matters is coverage on the code that changes most and costs most when it breaks.

## The Solution

Use **test-generator** to write the missing tests, **coding-agent** to wire up CI and the reporting scripts as scoped background tasks, and **data-analysis** (pandas) to rank files by risk (coverage gap times change frequency) and to turn stored coverage snapshots into trends. The CI job enforces a threshold and comments on each PR; a history file feeds the weekly digest.

## Step-by-Step Walkthrough

### Step 1: Produce Machine-Readable Coverage

Everything below reads the `json-summary` report. For a Vitest project, install the provider (`npm i -D @vitest/coverage-v8`; its version must match `vitest`) and configure the reporters and a global threshold:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 70 },   // `vitest run --coverage` exits non-zero below this
    },
  },
});
```

`npx vitest run --coverage` now writes `coverage/coverage-summary.json` with a `total` entry and one entry per file keyed by absolute path, each with `lines`, `statements`, `functions` and `branches` (`total`, `covered`, `pct`). For Python use `pytest --cov=src --cov-report=json`, and adapt the parsing in the next step (the `coverage.py` JSON has a different shape). Delegate the setup to an agent with a narrow prompt:

```text
Add Vitest v8 coverage to this repo with the json-summary reporter and a 70% line threshold. Change only vitest.config.ts and package.json. Run the suite and show me the summary.
```

### Step 2: Rank Files by Risk

The useful ranking has two dimensions: how little of a file is tested, and how often it changes. Ask the agent for a script that joins the coverage report with `git log` churn:

```text
Write scripts/coverage_risk.py: read coverage/coverage-summary.json, count how many commits touched each file in the last 90 days with git log, and print files sorted by (100 - line pct) / 100 * changes, plus line-weighted coverage per top-level module. Use pandas.
```

The core of the script:

```python
import json, subprocess
from pathlib import Path
import pandas as pd

root = Path.cwd().resolve()
summary = json.loads(Path("coverage/coverage-summary.json").read_text())
cov = pd.DataFrame([
    {"file": str(Path(p).resolve().relative_to(root)), "lines": v["lines"]["total"], "line_pct": v["lines"]["pct"]}
    for p, v in summary.items() if p != "total"
])
log = subprocess.run(
    ["git", "log", "--since=90 days ago", "--name-only", "--pretty=format:"],
    capture_output=True, text=True, check=True,
).stdout.split()
churn = pd.Series(log).value_counts().rename_axis("file").reset_index(name="changes")
df = cov.merge(churn, on="file", how="left").fillna({"changes": 0})
df["risk"] = (100 - df["line_pct"]) / 100 * df["changes"]
df["module"] = df["file"].str.split("/").str[:2].str.join("/")
print(df.sort_values("risk", ascending=False).head(20).to_string(index=False))
```

Example output for a team like this one:

| File | Coverage | Changes (90 days) | Risk |
|------|----------|-------------------|------|
| src/billing/subscription.ts | 34% | 47 | 31.0 |
| src/api/webhooks/handler.ts | 28% | 31 | 22.3 |
| src/auth/oauth-flow.ts | 41% | 22 | 13.0 |

Because `include` is set, a file that no test imports is still listed, with 0%. The billing module has both the lowest coverage and the highest churn, which is where the duplicate-charge bug lived. Sorting by risk instead of by percentage puts that module first.

### Step 3: Gate Pull Requests in CI

Ask the agent to add the workflow. The threshold in Step 1 makes the test step fail below 70%, which blocks the merge once the check is marked required in branch protection. A second step posts a per-module table on the PR:

```yaml
# .github/workflows/coverage.yml
name: coverage
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx vitest run --coverage
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: coverage-summary
          path: coverage/coverage-summary.json
      - name: Comment coverage on the PR
        if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR: ${{ github.event.pull_request.number }}
        run: |
          pip install --quiet pandas
          { echo '```'; python scripts/coverage_risk.py; echo '```'; } > coverage-comment.md
          gh pr comment "$PR" --body-file coverage-comment.md --edit-last \
            || gh pr comment "$PR" --body-file coverage-comment.md
```

The comment step skips PRs from forks, where the token is read-only. `--edit-last` updates the previous comment instead of adding a new one on every push. Seeing "src/billing/ is at 38%" in the pull request is what changes behavior: most developers skip tests because they do not realize they are eroding coverage.

### Step 4: Keep a History and Draw the Trend

CI artifacts expire, so keep a small history file. The agent adds `scripts/cov_history.py` with two commands. `snapshot` appends one row per module (date, commit, covered lines, percent) to a CSV; `digest` compares the latest snapshot with the one a week earlier:

```python
import json, os, sys
from datetime import date
from pathlib import Path
import pandas as pd

def snapshot(history: Path) -> None:
    root = Path.cwd().resolve()
    summary = json.loads(Path("coverage/coverage-summary.json").read_text())
    files = pd.DataFrame([
        {"module": "/".join(Path(p).resolve().relative_to(root).parts[:2]),
         "lines": v["lines"]["total"], "covered": v["lines"]["covered"]}
        for p, v in summary.items() if p != "total"
    ])
    mod = files.groupby("module", as_index=False)[["lines", "covered"]].sum()
    mod["line_pct"] = (100 * mod["covered"] / mod["lines"].clip(lower=1)).round(1)
    mod.insert(0, "sha", os.environ.get("GITHUB_SHA", "local")[:7])
    mod.insert(0, "date", date.today().isoformat())
    mod.to_csv(history, mode="a", header=not history.exists(), index=False)

def digest(history: Path, days: int = 7) -> None:
    df = pd.read_csv(history, parse_dates=["date"])
    df = df.drop_duplicates(["date", "module"], keep="last")   # several pushes in one day
    last = df["date"].max()
    now = df[df["date"] == last].set_index("module")["line_pct"]
    before = df[df["date"] <= last - pd.Timedelta(days=days)]
    prev = before[before["date"] == before["date"].max()].set_index("module")["line_pct"]
    out = pd.DataFrame({"now": now, "prev": prev}).assign(change=lambda d: (d["now"] - d["prev"]).round(1))
    print(out.sort_values("change").to_markdown())   # needs `pip install tabulate`

if __name__ == "__main__":
    cmd, path = sys.argv[1], Path(sys.argv[2])
    snapshot(path) if cmd == "snapshot" else digest(path)
```

On pushes to `main`, a workflow step runs `python scripts/cov_history.py snapshot history.csv` and commits `history.csv` to a dedicated `coverage-data` branch (this job needs `contents: write`; keep the data branch separate so the main branch has no bot commits). For a visual dashboard, have the agent render the CSV as a static HTML page with a line per module (any chart library, or matplotlib images as the `data-analysis` skill does) and publish it from the same branch via GitHub Pages. Whether the page needs a login depends on your Pages plan, so check before publishing coverage data of a private repository.

### Step 5: Generate Tests for the Worst Gaps

With the gate and history in place, dig out of the hole using the top of the Step 2 list:

```text
Generate Vitest tests for src/billing/subscription.ts. Cover the uncovered branches and error paths from coverage/coverage-summary.json: proration at month end, cancelled subscriptions, and webhook retries. Mock the Stripe client and the database; do not change source files.
```

The `test-generator` skill makes the agent analyze the code, detect the framework, and write tests with real assertions on edge cases rather than happy-path boilerplate. Run `npx vitest run --coverage` and check that the module number moved. Tests written to cover branches tend to expose bugs in them (for example an off-by-one in a proration calculation, or a missing null check on a cancelled subscription); treat each failing test as a finding to confirm, not as a test to delete.

### Step 6: Weekly Digest

A scheduled workflow (`on: schedule: - cron: '0 8 * * 1'`) checks out the `coverage-data` branch, runs `python scripts/cov_history.py digest history.csv` and posts the table to Slack through an incoming webhook stored in a repository secret:

```bash
jq -Rs '{text: .}' < digest.md | curl -fsS -X POST -H 'Content-type: application/json' --data @- "$SLACK_WEBHOOK_URL"
```

A weekly view also catches slow decline: a module that loses 1% per week never trips a per-PR check, but the week-over-week column shows it.

## Real-World Example

Ravi is the tech lead at a 15-person SaaS startup. After a billing bug causes duplicate charges, he finds the payments code at 34% coverage, down from 85% three months earlier. The erosion happened across dozens of PRs, and nobody noticed because the coverage number was buried in CI logs.

He has an agent set up the Vitest json-summary report, runs the risk script, and confirms billing and webhooks are the critical gaps: high churn, low coverage, maximum blast radius. GitHub Actions now fails any PR below 70% and comments the module table. In one session the agent generates a batch of billing tests aimed at uncovered branches and error handling; coverage on the module climbs and two failing tests expose real bugs in the proration and cancellation code, which the team fixes.

The history CSV and Monday digest keep the numbers in front of the team. When "billing: +4.0 this week" shows up in the channel, maintaining coverage becomes a shared habit rather than the tech lead's nagging point.
