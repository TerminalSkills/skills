---
title: Build an Automated Infrastructure Cost Report
slug: build-infrastructure-cost-report
description: Build an automated AWS cost report — pull spend by service and team, detect idle resources and waste, send Slack budget alerts, and email a weekly HTML report before anyone notices a spike.
skills:
  - aws-cli
  - github-actions
difficulty: intermediate
time_estimate: "5 hours"
category: devops
tags:
  - aws
  - cost-optimization
  - cloud
  - devops
  - finops
  - automation
  - slack
---

# Build an Automated Infrastructure Cost Report

Jake is an engineering manager at a 50-person startup. Last quarter they got a $47k AWS bill — $23k more than budgeted. Nobody noticed it climbing until the monthly statement arrived. By then, an engineer had left an EC2 p3.8xlarge GPU instance running for training a model (at $12/hour) for three weeks. Jake needs automated monitoring: daily cost snapshots, waste detection, and alerts before small problems become big bills.

## Step 1 — Explore the Numbers with the AWS CLI

Before writing code, look at the data with the `aws` CLI (v2) on a laptop signed in through IAM Identity Center (`aws sso login`). Cost Explorer must be enabled once in the Billing console, and it is billed per API request (about one cent), so don't poll it in a loop. `End` dates are exclusive, and the newest day can be incomplete because Cost Explorer data refreshes up to 24 hours late.

```console
$ aws ce get-cost-and-usage \
    --time-period Start=2026-10-01,End=2026-11-01 \
    --granularity MONTHLY --metrics UnblendedCost \
    --group-by Type=DIMENSION,Key=SERVICE \
    --query 'ResultsByTime[0].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' --output text \
  | sort -t$'\t' -k2 -nr | head -5

$ aws ce get-cost-and-usage --time-period Start=2026-10-01,End=2026-11-01 \
    --granularity MONTHLY --metrics UnblendedCost --group-by Type=TAG,Key=Team

$ aws ec2 describe-volumes --filters Name=status,Values=available \
    --query 'Volumes[].[VolumeId,Size,VolumeType,CreateTime]' --output table
```

Tag grouping only works for tags activated as cost allocation tags in the Billing console, and keys come back as `Team$<value>` (empty value means untagged). The three queries above become the building blocks of the script.

## Step 2 — The Report Script

One Python file with `boto3` (the same API calls the CLI makes) so GitHub Actions can run `daily` and `weekly` modes. Install with `pip install boto3 requests`.

```python
# cost_report.py — usage: python cost_report.py daily|weekly
import calendar, html, os, smtplib, sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from email.mime.text import MIMEText

import boto3
import requests

ce = boto3.client("ce", region_name="us-east-1")   # Cost Explorer is served from us-east-1
BUDGETS = {"daily_total": 1500, "monthly_total": 35000}   # USD
GP3_PER_GB_MONTH = 0.08   # us-east-1 list price; other regions differ


def ce_query(start: date, end: date, granularity: str, group_by=None) -> list:
    """Cost Explorer pages with NextPageToken; every page is a billed request."""
    args = dict(TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
                Granularity=granularity, Metrics=["UnblendedCost"])
    if group_by:
        args["GroupBy"] = group_by
    results = []
    while True:
        page = ce.get_cost_and_usage(**args)
        results += page["ResultsByTime"]
        if not page.get("NextPageToken"):
            return results
        args["NextPageToken"] = page["NextPageToken"]


def daily_costs_by_service(days: int) -> list:
    today = date.today()
    rows = []
    for period in ce_query(today - timedelta(days=days), today, "DAILY", [{"Type": "DIMENSION", "Key": "SERVICE"}]):
        for g in period["Groups"]:
            cost = float(g["Metrics"]["UnblendedCost"]["Amount"])
            if cost > 0.01:
                rows.append({"date": period["TimePeriod"]["Start"], "service": g["Keys"][0], "cost": round(cost, 2)})
    return rows


def costs_by_team(days: int) -> dict:
    today = date.today()
    teams = defaultdict(float)
    for period in ce_query(today - timedelta(days=days), today, "MONTHLY", [{"Type": "TAG", "Key": "Team"}]):
        for g in period["Groups"]:
            team = g["Keys"][0].removeprefix("Team$") or "untagged"
            teams[team] += float(g["Metrics"]["UnblendedCost"]["Amount"])
    return dict(teams)


def month_projection() -> float:
    """Month-to-date spend divided by completed days, times days in the month."""
    today = date.today()
    if today.day == 1:
        return 0.0   # nothing complete yet
    mtd = sum(float(p["Total"]["UnblendedCost"]["Amount"])
              for p in ce_query(today.replace(day=1), today, "MONTHLY"))
    return mtd / (today.day - 1) * calendar.monthrange(today.year, today.month)[1]


def anomalies(rows: list, multiplier: float = 2.0) -> list:
    """Days where a service costs 2x its previous 7-day average."""
    by_service = defaultdict(list)
    for r in rows:
        by_service[r["service"]].append(r)
    found = []
    for service, days in by_service.items():
        days.sort(key=lambda r: r["date"])
        for i in range(7, len(days)):
            avg = sum(d["cost"] for d in days[i - 7:i]) / 7
            if avg > 1.0 and days[i]["cost"] > avg * multiplier:
                found.append({"service": service, "date": days[i]["date"], "cost": days[i]["cost"], "average": round(avg, 2)})
    return sorted(found, key=lambda a: a["cost"], reverse=True)


def idle_instances(max_cpu: float = 5.0) -> list:
    """Running 14+ days with average CPU under 5%. Instances with no data are skipped, not flagged."""
    ec2, cw = boto3.client("ec2"), boto3.client("cloudwatch")
    now = datetime.now(timezone.utc)
    idle = []
    pages = ec2.get_paginator("describe_instances").paginate(
        Filters=[{"Name": "instance-state-name", "Values": ["running"]}])
    for page in pages:
        for res in page["Reservations"]:
            for inst in res["Instances"]:
                if now - inst["LaunchTime"] < timedelta(days=14):
                    continue
                points = cw.get_metric_statistics(
                    Namespace="AWS/EC2", MetricName="CPUUtilization",
                    Dimensions=[{"Name": "InstanceId", "Value": inst["InstanceId"]}],
                    StartTime=now - timedelta(days=14), EndTime=now, Period=86400, Statistics=["Average"])["Datapoints"]
                if not points:
                    continue
                avg = sum(p["Average"] for p in points) / len(points)
                if avg < max_cpu:
                    name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), inst["InstanceId"])
                    idle.append({"name": name, "type": inst["InstanceType"], "cpu": round(avg, 1)})
    return idle


def unattached_volumes() -> list:
    ec2 = boto3.client("ec2")
    vols = []
    for page in ec2.get_paginator("describe_volumes").paginate(Filters=[{"Name": "status", "Values": ["available"]}]):
        for v in page["Volumes"]:
            vols.append({"id": v["VolumeId"], "gb": v["Size"], "monthly": round(v["Size"] * GP3_PER_GB_MONTH, 2)})
    return sorted(vols, key=lambda v: v["monthly"], reverse=True)


def slack(text: str) -> None:
    r = requests.post(os.environ["SLACK_WEBHOOK"], json={"text": text}, timeout=10)
    r.raise_for_status()


def run_daily() -> None:
    rows = daily_costs_by_service(days=14)
    # Today is incomplete, and yesterday can still be partial early in the day, so a missed alert
    # is possible; the monthly projection and the weekly report catch what it misses.
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    total = sum(r["cost"] for r in rows if r["date"] == yesterday)
    projected = month_projection()
    if total > BUDGETS["daily_total"]:
        slack(f":moneybag: AWS spend on {yesterday} was ${total:,.0f}, over the ${BUDGETS['daily_total']:,} daily budget.")
    if projected > BUDGETS["monthly_total"]:
        slack(f":moneybag: AWS is on track for ${projected:,.0f} this month, over the ${BUDGETS['monthly_total']:,} budget.")
    for a in anomalies(rows)[:3]:
        if a["date"] == yesterday:
            slack(f":chart_with_upwards_trend: {a['service']} cost ${a['cost']:,.0f} on {a['date']} (7-day average ${a['average']:,.0f}).")


def run_weekly() -> None:
    rows = daily_costs_by_service(days=30)
    teams, idle, vols = costs_by_team(30), idle_instances(), unattached_volumes()
    e = html.escape   # resource names come from tags, so escape them
    team_rows = "".join(f"<tr><td>{e(t)}</td><td align=right>${c:,.0f}</td></tr>"
                        for t, c in sorted(teams.items(), key=lambda x: -x[1]))
    body = f"""<html><body style="font-family:sans-serif;max-width:700px;margin:auto">
<h1>Weekly AWS cost report</h1><p>{date.today():%B %d, %Y}</p>
<h2>Last 30 days: ${sum(r['cost'] for r in rows):,.0f}</h2>
<h2>Spend by team</h2><table width=100%>{team_rows}</table>
<h2>Idle EC2 instances (under 5% CPU for 14 days)</h2>
<ul>{"".join(f"<li>{e(i['name'])} ({i['type']}), {i['cpu']}% CPU</li>" for i in idle[:10])}</ul>
<h2>Unattached EBS volumes (${sum(v['monthly'] for v in vols):,.0f}/month at gp3 list price)</h2>
<ul>{"".join(f"<li>{v['id']}: {v['gb']} GB, ${v['monthly']}/month</li>" for v in vols[:10])}</ul>
<h2>Anomalies</h2>
<ul>{"".join(f"<li>{a['date']}: {e(a['service'])} ${a['cost']:,.0f} (average ${a['average']:,.0f})</li>" for a in anomalies(rows)[:10])}</ul>
</body></html>"""
    msg = MIMEText(body, "html")
    msg["Subject"], msg["From"], msg["To"] = "Weekly AWS cost report", os.environ["SMTP_USER"], os.environ["REPORT_RECIPIENTS"]
    with smtplib.SMTP(os.environ["SMTP_HOST"], 587, timeout=30) as s:
        s.starttls()
        s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        s.send_message(msg, to_addrs=os.environ["REPORT_RECIPIENTS"].split(","))


if __name__ == "__main__":
    {"daily": run_daily, "weekly": run_weekly}[sys.argv[1]]()
```

Before the first scheduled run, execute `python cost_report.py daily` locally with `SLACK_WEBHOOK` pointing at a test channel. AWS Budgets and Cost Anomaly Detection are managed alternatives for the alerting half; this script is useful because it also covers waste and a per-team email.

## Step 3 — Schedule with GitHub Actions

The workflow assumes an IAM role through GitHub's OIDC provider, so no long-lived AWS keys are stored. The role needs `ce:GetCostAndUsage`, `ec2:DescribeInstances`, `ec2:DescribeVolumes` and `cloudwatch:GetMetricStatistics`, and its trust policy should be limited to this repository.

```yaml
# .github/workflows/cost-report.yml
name: AWS Cost Report

on:
  schedule:
    - cron: "0 9 * * *"      # daily 09:00 UTC: budget checks and anomaly alerts
    - cron: "0 8 * * 1"      # Monday 08:00 UTC: full email report
  workflow_dispatch:

permissions:
  id-token: write            # for OIDC
  contents: read

jobs:
  cost-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v7
        with:
          python-version: "3.13"
      - run: pip install boto3 requests
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_COST_REPORT_ROLE_ARN }}
          aws-region: us-east-1
      - name: Daily checks
        if: github.event.schedule == '0 9 * * *' || github.event_name == 'workflow_dispatch'
        run: python cost_report.py daily
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_COST_WEBHOOK }}
      - name: Weekly report
        if: github.event.schedule == '0 8 * * 1' || github.event_name == 'workflow_dispatch'
        run: python cost_report.py weekly
        env:
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}
          REPORT_RECIPIENTS: ${{ secrets.REPORT_RECIPIENTS }}
```

GitHub runs scheduled workflows only from the default branch and may delay them under load, which is fine for a cost report.

## Results

What Jake's team saw after three months (their own numbers):

- **The first weekly report listed idle instances and unattached volumes** — including a GPU instance like the one behind the $47k surprise; it was stopped the same day.
- **Daily Slack alerts replaced the monthly statement shock** — each alert named a service and a day, so the team fixed the cause within hours.
- **Team tagging improved** — once teams saw their spend in the weekly email, they tagged resources, and the "untagged" line shrank report by report.

## Related Skills

- **aws-cli**: the `aws ce`, `aws ec2` and SSO commands used to explore spend and waste before scripting
- **github-actions**: the scheduled workflow with OIDC credentials that runs the daily and weekly jobs
