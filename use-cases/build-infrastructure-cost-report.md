---
title: Build an Automated Infrastructure Cost Report
slug: build-infrastructure-cost-report
description: Build an automated AWS/GCP cost report — pull spend by service and team, detect idle resources and waste, send Slack budget alerts, and email a weekly HTML report with charts before anyone notices a spike.
skills:
  - aws-sdk
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

## Step 1 — Pull AWS Costs with Cost Explorer API

```python
# cost_report/aws_costs.py — Fetch daily and monthly AWS spend by service and tag.
# Run with: python aws_costs.py --days 30

import boto3
import json
from datetime import datetime, timedelta
from typing import Optional

def get_daily_costs_by_service(days: int = 30) -> dict:
    """Pull daily spend breakdown by AWS service for the last N days."""
    client = boto3.client("ce", region_name="us-east-1")

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    response = client.get_cost_and_usage(
        TimePeriod={"Start": start_date, "End": end_date},
        Granularity="DAILY",
        Metrics=["UnblendedCost", "UsageQuantity"],
        GroupBy=[
            {"Type": "DIMENSION", "Key": "SERVICE"},
        ],
    )

    results = []
    for time_period in response["ResultsByTime"]:
        date = time_period["TimePeriod"]["Start"]
        for group in time_period["Groups"]:
            service = group["Keys"][0]
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            if cost > 0.01:  # Filter noise
                results.append({
                    "date": date,
                    "service": service,
                    "cost_usd": round(cost, 2),
                })

    return results


def get_costs_by_team_tag(days: int = 30) -> dict:
    """Pull costs grouped by the 'Team' resource tag."""
    client = boto3.client("ce", region_name="us-east-1")

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    response = client.get_cost_and_usage(
        TimePeriod={"Start": start_date, "End": end_date},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        GroupBy=[
            {"Type": "TAG", "Key": "Team"},
            {"Type": "DIMENSION", "Key": "SERVICE"},
        ],
        Filter={
            "Tags": {
                "Key": "Team",
                "MatchOptions": ["PRESENT"],
            }
        }
    )

    team_costs = {}
    for period in response["ResultsByTime"]:
        for group in period["Groups"]:
            team_tag, service = group["Keys"]
            team = team_tag.replace("Team$", "") or "untagged"
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])

            if team not in team_costs:
                team_costs[team] = {"total": 0, "services": {}}

            team_costs[team]["total"] += cost
            team_costs[team]["services"][service] = (
                team_costs[team]["services"].get(service, 0) + cost
            )

    return team_costs


def detect_cost_anomalies(daily_costs: list, threshold_multiplier: float = 2.0) -> list:
    """Flag days where spend is 2x or more above the 7-day rolling average."""
    from collections import defaultdict

    service_daily = defaultdict(list)
    for row in daily_costs:
        service_daily[row["service"]].append((row["date"], row["cost_usd"]))

    anomalies = []
    for service, days in service_daily.items():
        days.sort(key=lambda x: x[0])
        for i in range(7, len(days)):
            recent_avg = sum(d[1] for d in days[i-7:i]) / 7
            current = days[i][1]

            if recent_avg > 1.0 and current > recent_avg * threshold_multiplier:
                anomalies.append({
                    "service": service,
                    "date": days[i][0],
                    "cost": current,
                    "average": round(recent_avg, 2),
                    "multiplier": round(current / recent_avg, 1),
                })

    return sorted(anomalies, key=lambda x: x["cost"], reverse=True)
```

## Step 2 — Detect Wasted Resources

```python
# cost_report/waste_detection.py — Find idle and unused AWS resources.
# Checks EC2, EBS, Elastic IPs, and old snapshots.

import boto3
from datetime import datetime, timezone, timedelta

def find_idle_ec2_instances() -> list:
    """Find EC2 instances with <5% average CPU over 14 days — likely idle."""
    ec2 = boto3.client("ec2")
    cloudwatch = boto3.client("cloudwatch")

    instances = ec2.describe_instances(
        Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
    )

    idle = []
    for reservation in instances["Reservations"]:
        for instance in reservation["Instances"]:
            instance_id = instance["InstanceId"]
            instance_type = instance["InstanceType"]

            # Get 14-day average CPU
            metrics = cloudwatch.get_metric_statistics(
                Namespace="AWS/EC2",
                MetricName="CPUUtilization",
                Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
                StartTime=datetime.now(timezone.utc) - timedelta(days=14),
                EndTime=datetime.now(timezone.utc),
                Period=86400,
                Statistics=["Average"],
            )

            if not metrics["Datapoints"]:
                avg_cpu = 0
            else:
                avg_cpu = sum(d["Average"] for d in metrics["Datapoints"]) / len(metrics["Datapoints"])

            name = next(
                (t["Value"] for t in instance.get("Tags", []) if t["Key"] == "Name"),
                instance_id
            )

            if avg_cpu < 5.0:
                # Estimate monthly cost (simplified)
                # In production, use the Pricing API
                hourly_rates = {"t3.medium": 0.042, "m5.large": 0.096, "p3.8xlarge": 12.24}
                hourly_rate = hourly_rates.get(instance_type, 0.10)

                idle.append({
                    "instance_id": instance_id,
                    "name": name,
                    "instance_type": instance_type,
                    "avg_cpu_14d": round(avg_cpu, 1),
                    "estimated_monthly_cost": round(hourly_rate * 24 * 30, 0),
                    "recommendation": "Stop or terminate",
                })

    return sorted(idle, key=lambda x: x["estimated_monthly_cost"], reverse=True)


def find_unattached_ebs_volumes() -> list:
    """Find EBS volumes not attached to any instance — pure waste."""
    ec2 = boto3.client("ec2")

    response = ec2.describe_volumes(
        Filters=[{"Name": "status", "Values": ["available"]}]
    )

    waste = []
    for vol in response["Volumes"]:
        size_gb = vol["Size"]
        # gp3 costs ~$0.08/GB/month
        monthly_cost = size_gb * 0.08

        name = next(
            (t["Value"] for t in vol.get("Tags", []) if t["Key"] == "Name"),
            vol["VolumeId"]
        )

        waste.append({
            "volume_id": vol["VolumeId"],
            "name": name,
            "size_gb": size_gb,
            "volume_type": vol["VolumeType"],
            "created": vol["CreateTime"].strftime("%Y-%m-%d"),
            "monthly_cost": round(monthly_cost, 2),
        })

    return sorted(waste, key=lambda x: x["monthly_cost"], reverse=True)
```

## Step 3 — Slack Alerts for Budget Thresholds

```python
# cost_report/alerts.py — Send Slack alerts when daily or monthly spend exceeds budget.

import boto3
import requests
import json
from datetime import datetime

SLACK_WEBHOOK = "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

BUDGETS = {
    "daily_total": 1500,         # Alert if daily AWS spend > $1,500
    "monthly_total": 35000,      # Alert if monthly projection > $35,000
    "ec2_daily": 800,            # Alert if EC2 alone > $800/day
}

def get_monthly_spend_projection() -> float:
    """Project end-of-month spend based on current daily average."""
    client = boto3.client("ce", region_name="us-east-1")

    now = datetime.now()
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")
    days_elapsed = now.day
    days_in_month = 30  # Approximate

    response = client.get_cost_and_usage(
        TimePeriod={"Start": month_start, "End": today},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
    )

    mtd_spend = float(response["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"])
    daily_avg = mtd_spend / max(days_elapsed, 1)
    projection = daily_avg * days_in_month

    return round(projection, 0)


def send_budget_alert(message: str, spend: float, budget: float, severity: str = "warning"):
    color = {"warning": "#ff9900", "critical": "#ff0000", "info": "#36a64f"}[severity]

    payload = {
        "attachments": [{
            "color": color,
            "title": f"💰 AWS Cost Alert — {severity.upper()}",
            "text": message,
            "fields": [
                {"title": "Current Spend", "value": f"${spend:,.0f}", "short": True},
                {"title": "Budget", "value": f"${budget:,.0f}", "short": True},
                {"title": "Over Budget", "value": f"${spend - budget:,.0f} ({((spend/budget)-1)*100:.0f}%)", "short": True},
            ],
            "footer": f"AWS Cost Report • {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}",
        }]
    }

    requests.post(SLACK_WEBHOOK, json=payload)


def run_budget_checks():
    """Check all budgets and send alerts for any breaches."""
    from aws_costs import get_daily_costs_by_service

    daily = get_daily_costs_by_service(days=1)
    total_today = sum(r["cost_usd"] for r in daily)
    ec2_today = sum(r["cost_usd"] for r in daily if "EC2" in r["service"])
    projected = get_monthly_spend_projection()

    if total_today > BUDGETS["daily_total"]:
        send_budget_alert(
            f"Daily AWS spend is ${total_today:,.0f} — exceeds ${BUDGETS['daily_total']:,.0f} daily budget.",
            total_today,
            BUDGETS["daily_total"],
            "critical" if total_today > BUDGETS["daily_total"] * 1.5 else "warning",
        )

    if projected > BUDGETS["monthly_total"]:
        send_budget_alert(
            f"Monthly spend on track for ${projected:,.0f} — exceeds ${BUDGETS['monthly_total']:,.0f} budget.",
            projected,
            BUDGETS["monthly_total"],
            "warning",
        )
```

## Step 4 — Weekly HTML Email Report

```python
# cost_report/email_report.py — Generate and send weekly cost report as HTML email.

import boto3
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def generate_html_report(daily_costs, team_costs, anomalies, idle_instances, idle_volumes):
    total_month = sum(r["cost_usd"] for r in daily_costs)
    waste_ec2 = sum(i["estimated_monthly_cost"] for i in idle_instances)
    waste_ebs = sum(v["monthly_cost"] for v in idle_volumes)

    html = f"""
    <html><body style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
    <h1>☁️ Weekly AWS Cost Report</h1>
    <p style="color: #666">{datetime.now().strftime("%B %d, %Y")}</p>

    <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2 style="margin: 0">Total (Last 30 Days): ${total_month:,.0f}</h2>
      <p style="color: #e00">⚠️ Estimated waste: ${waste_ec2 + waste_ebs:,.0f}/month</p>
    </div>

    <h2>Spend by Team</h2>
    <table style="width:100%; border-collapse: collapse;">
      <tr style="background:#f5f5f5">
        <th style="text-align:left; padding:8px">Team</th>
        <th style="text-align:right; padding:8px">Monthly Cost</th>
      </tr>
      {"".join(f'<tr><td style="padding:8px">{team}</td><td style="text-align:right; padding:8px">${data["total"]:,.0f}</td></tr>' for team, data in sorted(team_costs.items(), key=lambda x: x[1]["total"], reverse=True))}
    </table>

    <h2>🗑️ Waste Detected</h2>
    <h3>Idle EC2 Instances (${waste_ec2:,.0f}/month)</h3>
    <ul>
      {"".join(f'<li><strong>{i["name"]}</strong> ({i["instance_type"]}) — {i["avg_cpu_14d"]}% avg CPU — ${i["estimated_monthly_cost"]}/month</li>' for i in idle_instances[:5])}
    </ul>

    <h3>Unattached EBS Volumes (${waste_ebs:,.0f}/month)</h3>
    <ul>
      {"".join(f'<li><strong>{v["name"]}</strong> — {v["size_gb"]}GB — ${v["monthly_cost"]}/month</li>' for v in idle_volumes[:5])}
    </ul>

    <h2>📈 Anomalies</h2>
    <ul>
      {"".join(f'<li>{a["date"]}: <strong>{a["service"]}</strong> spiked to ${a["cost"]:.0f} (normally ${a["average"]:.0f} — {a["multiplier"]}x)</li>' for a in anomalies[:5])}
    </ul>
    </body></html>
    """
    return html
```

## Step 5 — Schedule with GitHub Actions

```yaml
# .github/workflows/cost-report.yml — Run cost checks daily, email report weekly.

name: AWS Cost Report

on:
  schedule:
    - cron: "0 9 * * *"      # Daily at 9am UTC — budget checks + anomaly alerts
    - cron: "0 8 * * 1"      # Weekly on Monday 8am UTC — full email report
  workflow_dispatch:          # Manual trigger for on-demand reports

jobs:
  cost-report:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install boto3 requests

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Run budget checks
        run: python cost_report/alerts.py
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_COST_WEBHOOK }}

      - name: Run weekly report
        if: github.event.schedule == '0 8 * * 1' || github.event_name == 'workflow_dispatch'
        run: python cost_report/email_report.py
        env:
          SMTP_HOST: smtp.gmail.com
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}
          REPORT_RECIPIENTS: jake@company.com,cto@company.com,finance@company.com
```

## Results

Jake shipped the cost report in an afternoon. Over 3 months:

- **First report found $18k/month in waste** — the GPU instance (the one that caused the $47k surprise) was gone within hours of the first waste detection run. Five other idle instances were terminated.
- **AWS bill down 38%** — from $47k to $29k/month. The savings paid for engineering time in week one.
- **Zero budget surprises in 3 months** — the daily Slack alert has fired 7 times. Each time, the team identified and fixed the issue within hours instead of weeks.
- **Team tagging adopted** — once teams saw their costs on the weekly report, they started tagging resources properly. "Untagged" costs went from 60% to 8% in 6 weeks.
- **Anomaly detection works** — caught a runaway Lambda function that was being called in a loop (DynamoDB streams misconfiguration). Fixed in 2 hours; saved ~$800.
