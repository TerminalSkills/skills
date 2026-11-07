---
title: "Allocate Infrastructure Costs Across Teams with AI"
slug: allocate-infrastructure-costs
description: "Break down cloud infrastructure costs by team, service, and environment to enable accurate chargeback and budgeting."
skills: [data-analysis, excel-processor, report-generator]
category: business
tags: [cost-allocation, cloud-costs, finops, budgeting, chargeback]
---

# Allocate Infrastructure Costs Across Teams with AI

## The Problem

The cloud bill is $47,000 a month and growing, and nobody can say which team is driving the increase. Engineering blames the data team's batch jobs, the data team blames staging environments that never get torn down, and Finance wants per-team numbers for next quarter's budget. Only some resources carry a cost-allocation tag, and the one person who understood the billing console has left.

A service-level view ("$8,400 on EC2, $6,200 on RDS") does not say who is responsible: one cluster runs workloads for three teams, one database serves two, and shared networking and monitoring have no owner. Without an owner per dollar, "reduce cloud spend" is an impossible mandate.

## The Solution

- **excel-processor** loads the billing export and the team-ownership spreadsheet and joins them with pandas.
- **data-analysis** finds unallocated spend, month-over-month changes by team, and outliers in line items.
- **report-generator** writes the monthly summary (HTML or PDF for Finance) and the Excel workbook with line-item detail for engineering.

The input is an AWS Data Exports table. AWS documents CUR 2.0 as the current Cost and Usage Report table, with a fixed set of columns; the columns used here are `bill_billing_period_start_date`, `line_item_usage_account_id`, `line_item_product_code`, `line_item_resource_id` and `line_item_unblended_cost` ([CUR 2.0 table dictionary](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2.html)). Tags arrive in the `resource_tags` map column. A tag key appears in that map only if you enabled it as a cost allocation tag in the Billing console, and only on line items where it has a value ([resource_tags](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-resource-tags.html)). Activate the `team` tag first (it can take up to 48 hours to become active, per the [activation page](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html)), then check which months of the export actually carry it.

## Step-by-Step Walkthrough

### Step 1: Gather the inputs

```text
Here is our CUR 2.0 export for January (bill.csv, exported from Data Exports) and
service-owners.xlsx with columns match_type (resource|account), match_value, team.
Show row counts, total cost, and cost by product before changing anything.
```

Export as CSV or Parquet to your own S3 bucket and download it. For a Parquet export `resource_tags` is a map column; for CSV it arrives as a string, so parse it first. Large exports (hundreds of thousands of rows) are aggregated with `groupby` instead of being opened in Excel. The agent prints the shape, columns and the total `line_item_unblended_cost` first; this total is what every later step must add up to. Decide up front whether credits, refunds and tax belong in the allocation (`line_item_line_item_type` tells them apart) and say which you chose.

### Step 2: Map every line item to a team in layers

```text
Allocate in this order: exact resource match from the spreadsheet, then the team tag,
then the linked account. Everything else is "unallocated", not guessed.
```

```python
import pandas as pd

HEADCOUNT = {"platform": 8, "product": 12, "data": 5}
SHARED_PRODUCTS = {"AmazonVPC", "AmazonRoute53", "AmazonCloudWatch"}

by_resource = owners[owners.match_type == "resource"].set_index("match_value")["team"]
by_account = owners[owners.match_type == "account"].set_index("match_value")["team"]

bill["team"] = bill["line_item_resource_id"].map(by_resource)
bill["team"] = bill["team"].fillna(bill["tag_team"])            # tag_team: parsed from resource_tags
bill["team"] = bill["team"].fillna(bill["line_item_usage_account_id"].astype(str).map(by_account))
bill["team"] = bill["team"].fillna("unallocated")
bill.loc[bill["line_item_product_code"].isin(SHARED_PRODUCTS), "team"] = "shared"
```

Use the tag key exactly as it appears in your export. The order matters: an explicit entry in the spreadsheet beats a tag, which beats the account default. Keep a `method` column recording which layer matched each row, so Finance can see how much of the bill rests on weaker evidence. Orphaned resources are found in this step: an unallocated EC2 instance with spend all month and no owner is a candidate to ask about, not to delete. Billing data does not show who logged in or whether traffic exists; use CloudTrail and the resource's own utilization metrics for that.

### Step 3: Allocate shared costs and verify the total

```python
direct = bill.groupby("team")["line_item_unblended_cost"].sum()
pool = direct.get("shared", 0.0)
heads = sum(HEADCOUNT.values())
summary = pd.DataFrame(
    [{"team": t, "direct": direct.get(t, 0.0), "shared": pool * n / heads} for t, n in HEADCOUNT.items()]
    + [{"team": "unallocated", "direct": direct.get("unallocated", 0.0), "shared": 0.0}]
)
summary["total"] = summary["direct"] + summary["shared"]
assert abs(summary["total"].sum() - bill["line_item_unblended_cost"].sum()) < 0.01
```

Splitting shared networking and monitoring by headcount is a policy choice, not a measurement. It is simple and explainable; where data exists, a split by usage (request counts, bytes, CPU hours) is fairer, and the model can switch to it by replacing `HEADCOUNT`. For EKS, AWS publishes split cost allocation data that attributes cluster cost down to pod and namespace level ([Split cost allocation data](https://docs.aws.amazon.com/cur/latest/userguide/split-cost-allocation-data.html)), which is the better source for a cluster shared by several teams than a headcount split. The `assert` is the important line: if the allocated total does not equal the bill, the report is not published. Tested on a small synthetic bill, the script reconciles to the cent.

### Step 4: Compare months and look for step changes

```text
Do the same for the previous two months. Show cost per team per month, the change in
percent, and the line items that explain any team that moved more than 15%.
```

With data-analysis, `groupby(["bill_billing_period_start_date", "team"])` gives a team-by-month pivot, and `pct_change()` the movement. For a team that jumped, list its top line items by cost difference between the two months. A step on one date (a new resource that appears mid-month and stays on) reads differently from gradual growth, and the resource id in the top difference line tells you which it is.

### Step 5: Turn findings into reviewed recommendations

Each recommendation needs an owner, an estimated saving taken from the bill, and a check before action:

| Finding | Check before acting | Typical action |
|---|---|---|
| Large unallocated EC2 instances | Utilization metrics and CloudTrail; ask the likely owner | Tag, or stop then terminate after a grace period |
| Old manual RDS snapshots | Source instance gone, retention policy | Delete; or export to S3 (RDS supports snapshot export to S3 in Parquet) if the data must be kept |
| NAT Gateway in a region with no workloads | Route tables that point to it | Delete the gateway |
| Idle batch cluster (EMR) | Job history | Terminate when jobs finish; use auto-termination or managed scaling |
| Low-utilization containers | Peak load test | Right-size, then watch for throttling |

Savings numbers come from the billed amounts of the specific resources, not from percentages; the agent never terminates anything itself.

### Step 6: Produce the monthly deliverables

```text
Write cost-allocation-2026-01.xlsx (By team, Unallocated, Service detail, Method coverage)
and a one-page cost-allocation-2026-01.pdf with the team table, month-over-month chart and
the top three findings.
```

excel-processor writes the workbook with `pd.ExcelWriter(..., engine="openpyxl")`; report-generator renders the HTML with embedded charts and exports a PDF through WeasyPrint (which needs the Pango library). The PDF shows the data source, billing period and generation date. Next month the same script runs on the new export and flags teams whose cost moved more than 15% and any new unallocated resources.

## Real-World Example

Marco, VP of Engineering at a 40-person SaaS company heading into a funding round, cannot answer "what does each team's infrastructure cost?" He activates the `team` cost allocation tag, downloads three months of CUR 2.0 data and the ownership spreadsheet, and runs the layered mapping. The first run leaves a visible share of spend under "unallocated", and the Method coverage sheet shows how much of the rest depends on the account default rather than on a tag.

The month-over-month table shows one team's cost stepping up on a single date. The top line items point to a batch cluster started for a one-off migration and never stopped. He asks the data team to confirm, and the cluster is terminated. The unallocated list becomes a tagging to-do for the owners, and the next month's run shows that bucket shrinking. What he takes to the investors is the method: every dollar mapped to an owner by a stated rule, a total that reconciles to the invoice, and shared costs split in a way anyone can read.
