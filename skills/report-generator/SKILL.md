---
name: report-generator
description: >-
  Generate professional reports with charts, tables, visualizations, and
  structured narratives. Covers data-driven PDF/HTML reports, weekly status
  reports, executive summaries, and recurring team updates. Use when a user asks
  to create a report, generate a data report, build a dashboard report, write a
  weekly report, create a status update, or produce a team progress report.
license: Apache-2.0
compatibility: "Python 3.8+ with pandas, matplotlib, jinja2 for data reports; no deps for status reports"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["reports", "visualization", "status-updates", "charts", "productivity"]
---

# Report Generator

## Overview

Generate professional reports combining data visualizations, narrative text, and structured updates. Supports two modes: **data reports** (charts, tables, KPI cards from CSV/database sources as HTML or PDF) and **status reports** (weekly updates, team progress, executive summaries in Markdown).

## Instructions

### Data Reports

#### Step 1: Load and analyze data

```python
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import base64
from io import BytesIO

df = pd.read_csv("data.csv")
metrics = {
    "total_revenue": df["revenue"].sum(),
    "avg_order_value": df["revenue"].mean(),
    "total_orders": len(df),
}
```

#### Step 2: Generate charts as base64 for embedding

```python
def fig_to_base64(fig):
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")

fig, ax = plt.subplots(figsize=(10, 5))
monthly = df.groupby("month")["revenue"].sum()
monthly.plot(kind="line", marker="o", ax=ax, color="#2563eb")
ax.set_title("Monthly Revenue Trend")
chart_b64 = fig_to_base64(fig)
plt.close()
```

#### Step 3: Build HTML report with Jinja2

Use a template with metric cards, chart sections, and data tables. Embed charts as base64 so the report is a single self-contained file. Convert to PDF with weasyprint or Chrome headless if needed.

### Status Reports (Weekly/Team Updates)

#### Identify the audience

| Audience | Focus | Detail Level |
|----------|-------|-------------|
| Direct manager | Individual contributions, blockers | High detail |
| Director/VP | Team progress, risks, metrics | Medium detail |
| Executive/C-suite | Business impact, milestones, KPIs | High-level summary |
| Cross-functional | Dependencies, shared updates | Relevant items only |

#### Use the standard template

```markdown
# Weekly Report: [Team/Project Name]
**Week of:** [Start Date] - [End Date]

## Summary
[2-3 sentence overview. Main focus, notable wins or challenges.]

## Completed This Week
- **[Project]:** [What was done and why it matters]
- **[Bug fix]:** [What was resolved]

## In Progress
| Item | Owner | Status | ETA |
|------|-------|--------|-----|
| [Task] | [Person] | On track | [Date] |
| [Task] | [Person] | Blocked | - |

## Blockers & Risks
- **[Blocker]:** [Description and what is needed to unblock]

## Key Metrics
| Metric | This Week | Last Week | Trend |
|--------|-----------|-----------|-------|
| [Metric] | [Value] | [Value] | Up/Down/Flat |

## Next Week Plan
- [ ] [Priority 1]
- [ ] [Priority 2]
```

#### Content guidelines

- Lead with impact, not activity: "Reduced page load time by 40%" beats "Worked on performance"
- Quantify wherever possible (numbers, percentages, counts)
- Be honest about blockers — hiding problems does not make them go away
- Use consistent status labels: On Track, At Risk, Blocked, Complete
- Keep the full report under 1 page (~400-500 words)

## Examples

### Example 1: Weekly engineering status report

**User request:** "Write a weekly report from these notes: shipped auth v2, fixed 3 prod bugs, started dashboard redesign, waiting on API team for endpoints, velocity was 34 points"

**Output:**
```markdown
# Weekly Report: Platform Engineering
**Week of:** Jan 20 - Jan 24

## Summary
Strong delivery week. Shipped Auth v2 on schedule and resolved 3 production
issues. Dashboard redesign kicked off but partially blocked on API dependencies.

## Completed
- **Auth v2 launch:** Rolled out to 100% of users with MFA and session management
- **Production bugs (3):** Payment timeout, avatar upload crash, timezone display

## In Progress
| Item | Status | ETA |
|------|--------|-----|
| Dashboard redesign (frontend) | On track | Feb 7 |
| Dashboard API integration | Blocked | Pending API team |

## Blockers
- **API endpoints:** Waiting on API team for analytics endpoints. No ETA yet.

## Metrics
| Metric | This Week | Last Week | Trend |
|--------|-----------|-----------|-------|
| Sprint velocity | 34 pts | 28 pts | Up |
| Open bugs (P1/P2) | 2 | 5 | Down |
```

### Example 2: Data-driven sales report from CSV

**User request:** "Generate a weekly sales report from this CSV"

The agent loads the CSV, filters to the current week, computes KPIs (revenue, orders, AOV, top product), generates charts (daily revenue trend, top 10 products, channel breakdown), and builds a polished HTML report with metric cards, charts, and a transactions table.

### Example 3: Executive summary from multiple sources

**User request:** "Create an executive summary combining sales, support, and engagement data"

The agent loads three data sources, computes cross-functional metrics, generates comparison charts, writes narrative summaries per department, and outputs a PDF with overview dashboard, per-department sections, and recommendations.

## Guidelines

- Use `matplotlib.use('Agg')` to avoid display issues in headless environments
- Embed charts as base64 in HTML for self-contained reports
- Include data source, generation date, and reporting period on every data report
- Show both value and trend (vs prior period) for metric cards
- Use consistent color schemes across all charts in a report
- For PDF output, use weasyprint or Chrome headless
- Validate data before generating — flag missing or malformed data
- For status reports, always include blockers even if none ("No blockers this week")
- Status labels should be honest — marking "on track" when at risk erodes trust
- Consistency is key — use the same structure every week so readers know where to look
- Write for the audience: executives want outcomes, managers want details
