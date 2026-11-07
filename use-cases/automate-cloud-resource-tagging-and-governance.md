---
title: "Automate Cloud Resource Tagging and Governance with AI"
slug: automate-cloud-resource-tagging-and-governance
description: "Enforce consistent resource tagging across cloud infrastructure to enable cost allocation, compliance, and cleanup of orphaned resources."
skills: [coding-agent, report-generator, hetzner-cloud]
category: devops
tags: [cloud-governance, tagging, cost-allocation, infrastructure, compliance]
---

# Automate Cloud Resource Tagging and Governance with AI

## The Problem

A 40-person engineering organization runs 200+ cloud resources across several environments. Only about 60% have the tags that matter, so nobody can allocate costs to teams, tell which environment a resource belongs to, or decide whether it is still in use. Finance asked for a cost breakdown by product and nobody could answer. Meanwhile some of the bill goes to leftovers from projects that ended months ago, and nobody can tell which are safe to delete.

It compounds: every untagged resource adds noise, every finished project leaves resources behind. A manual tagging sprint helps for a month or two and then compliance drifts back. The fundamental issue is that tagging is a creation-time problem being treated as a cleanup problem. Quarterly audits will not fix it if creating a resource does not require tags.

## The Solution

This page uses Hetzner Cloud, where the equivalent of a tag is a **label** (key/value pairs on servers, volumes, load balancers, networks, firewalls, IPs, snapshots and more). Use **hetzner-cloud** for the `hcloud` CLI (read inventory with `-o json`, fix with `add-label`, filter with `-l`), **coding-agent** to build and extend the audit and fix scripts as headless `claude -p` runs you review, and **report-generator** to turn the inventory into a governance report. Enforcement happens at creation time, in the Terraform that creates resources.

## Step-by-Step Walkthrough

### Step 1: Audit the Current Labelling State

Set up a context once (`hcloud context create --token-from-env shop-prod`, with a read-only token for auditing), then have the agent write the audit:

```bash
timeout 900 claude -p "Write scripts/label_audit.py: for server, volume, load-balancer, network, \
firewall, floating-ip and primary-ip run 'hcloud <kind> list -o json', check the required labels \
team, environment, project, cost-center, normalize known aliases (production/prd -> prod, \
back-end/BE -> backend), flag environment values outside prod|staging|dev, and write inventory.csv \
and fixes.csv. Read-only: never call add-label. Python stdlib only." \
  --permission-mode acceptEdits --allowedTools "Read" "Write" "Edit" "Bash(python3 -m py_compile *)" \
  --max-budget-usd 2 --output-format text > /tmp/audit-agent.log 2>&1
```

The version below compiles and was run against a stub of the Hetzner API with three servers (one correct, one with `Backend`/`production`, one with only `environment=PROD`), which produced `{"total": 3, "compliant": 1, "percent": 33.3}` and a `fixes.csv` listing the two. Treat any agent-written version the same way: run it against a small known set before trusting it.

```python
#!/usr/bin/env python3
"""Audit Hetzner Cloud resource labels. Read-only; writes inventory.csv and fixes.csv, prints a JSON summary."""
import csv, json, subprocess

REQUIRED = ["team", "environment", "project", "cost-center"]
ALLOWED = {"environment": {"prod", "staging", "dev"}}
ALIASES = {
    "environment": {"production": "prod", "prd": "prod", "stage": "staging", "development": "dev"},
    "team": {"back-end": "backend", "be": "backend"},
}
KINDS = ["server", "volume", "load-balancer", "network", "firewall", "floating-ip", "primary-ip"]


def hcloud(*args):
    out = subprocess.run(["hcloud", *args, "-o", "json"], check=True, capture_output=True, text=True).stdout
    return json.loads(out) or []


def normalize(key, value):
    v = str(value).strip().lower()
    return ALIASES.get(key, {}).get(v, v)


def audit():
    rows, compliant, total, inventory = [], 0, 0, []
    for kind in KINDS:
        for res in hcloud(kind, "list"):
            total += 1
            labels = res.get("labels") or {}
            inventory.append({"kind": kind, "name": res.get("name") or res.get("id"),
                              **{k: normalize(k, labels.get(k, "(missing)")) for k in REQUIRED}})
            missing = [k for k in REQUIRED if k not in labels]
            fixes = {k: normalize(k, v) for k, v in labels.items()
                     if k in ALIASES and normalize(k, v) != v}
            bad = [k for k, allowed in ALLOWED.items()
                   if k in labels and normalize(k, labels[k]) not in allowed]
            if not missing and not fixes and not bad:
                compliant += 1
                continue
            rows.append({"kind": kind, "name": res.get("name") or res.get("id"),
                         "missing": ",".join(missing), "normalize": json.dumps(fixes),
                         "invalid": ",".join(bad), "created": res.get("created", "")})
    return total, compliant, rows, inventory


if __name__ == "__main__":
    total, compliant, rows, inventory = audit()
    with open("inventory.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["kind", "name", *REQUIRED])
        w.writeheader()
        w.writerows(inventory)
    print(json.dumps({"total": total, "compliant": compliant,
                      "percent": round(100 * compliant / total, 1) if total else 100.0}))
    with open("fixes.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["kind", "name", "missing", "normalize", "invalid", "created"])
        w.writeheader()
        w.writerows(rows)
```

Two kinds of problem show up. Missing labels are obvious. Inconsistent values (`prod`, `production`, `PROD`, `prd`; `backend`, `Backend`, `BE`) look fine until you group by them, when one team's costs split across several rows. For a quick look without the script, `hcloud server list -l '!team'` lists servers that have no `team` label.

### Step 2: Fix What Can Be Fixed Safely

Normalization is mechanical and reversible; inference is a guess. Apply the first, review the second:

```bash
# Normalize known aliases from fixes.csv (dry run first: print, then run)
hcloud server add-label --overwrite web-1 environment=prod team=backend
```

For missing labels, infer from what you can verify: a name prefix (`etl-worker-3` suggests project `etl`), the private network a server is attached to, or the SSH key it was created with. Have the agent propose values into `fixes.csv` for a human to approve, and apply them with `hcloud <kind> add-label --overwrite <name> key=value`. Resources nobody recognises go to a review list with creation date and partial labels; they are the likeliest orphans. Always list before you change, and change one kind at a time.

### Step 3: Enforce Labels at Creation

Make Terraform refuse unlabelled resources. Route every resource's `labels` through one validated variable:

```hcl
variable "labels" {
  type = map(string)
  validation {
    condition = alltrue([
      for k in ["team", "environment", "project", "cost-center"] : contains(keys(var.labels), k)
    ]) && contains(["prod", "staging", "dev"], lookup(var.labels, "environment", ""))
    error_message = "labels must include team, environment (prod|staging|dev), project and cost-center."
  }
}

resource "hcloud_server" "web" {
  name        = "web-1"
  server_type = "cx23"
  image       = "ubuntu-24.04"
  labels      = var.labels
}
```

Passing `labels={team="backend",environment="production"}` makes `terraform plan` stop with the error message; a complete, valid map passes. That shifts tagging from a cleanup task to a creation requirement. Resources created outside Terraform (console, CLI, scripts) slip past this, so run the audit nightly from CI with a read-only token, post the summary to the team channel, and page the platform lead if compliance drops below your threshold.

Tag values need validation as well as presence: `environment: prodution` must fail like a missing label, which the `ALLOWED` check in the audit script and the `contains(...)` in the variable both do.

### Step 4: Find Orphaned Resources

List candidates, never delete automatically. Unattached resources are the cheap, high-confidence ones:

```bash
hcloud volume list -o json | jq -r '.[] | select(.server == null) | [.name, .created, .size] | @csv'
hcloud floating-ip list -o json | jq -r '.[] | select(.server == null) | [.name, .ip] | @csv'
hcloud image list --type snapshot -o json | jq -r '.[] | [.id, .description, .created] | @csv'
```

(The field names follow the Hetzner Cloud API schema; check them against your own `-o json` output before relying on the filter.) Volumes and IPs that are unattached and old are likely orphans; snapshots need the owner's say-so, because a disaster-recovery snapshot looks unused until the disaster. A server with no traffic for weeks may be a standby. Put each candidate in a review queue with its labels, creation date and last known owner, and let a human delete. `hcloud server enable-protection <name> delete rebuild` marks anything that must survive a mistaken cleanup. Good governance automates detection, not destruction.

### Step 5: Report to Finance and Team Leads

Hand `inventory.csv` to report-generator's data-report flow (pandas, Jinja2, self-contained HTML):

```python
import datetime
import pandas as pd
from jinja2 import Environment

df = pd.read_csv("inventory.csv")
df["compliant"] = ~df.isin(["(missing)"]).any(axis=1)
by_team = df.groupby("team").agg(resources=("name", "count"), compliant=("compliant", "sum")).reset_index()
by_env = df.groupby("environment")["name"].count().reset_index(name="resources")

html = Environment(autoescape=True).from_string("""
<h1>Label governance report</h1>
<p>Source: hcloud, generated {{ today }}. Required labels present on {{ pct }}% of resources ({{ ok }} of {{ n }}).</p>
<h2>By team</h2>{{ team|safe }}<h2>By environment</h2>{{ env|safe }}
<h2>Needs an owner</h2>{{ bad|safe }}
""").render(today=datetime.date.today(), n=len(df), ok=int(df.compliant.sum()),
            pct=round(100 * df.compliant.mean(), 1), team=by_team.to_html(index=False),
            env=by_env.to_html(index=False), bad=df[~df.compliant].to_html(index=False))
open("label_report.html", "w").write(html)
```

This ran with pandas and Jinja2 on the stub inventory above and wrote the HTML. For money, join the inventory with the price list yourself (server types and volumes have published prices, shown by `hcloud server-type describe <type>`) and label the figure an estimate; pull the final numbers for Finance from the invoice. Add week-over-week deltas by keeping last week's `inventory.csv`.

**On AWS or another provider**, the shape is identical but the commands differ: `aws resourcegroupstaggingapi tag-resources` applies tags in bulk, but `get-resources` returns resources that are tagged or were once tagged, so it will not find resources that never had a tag. Detect those through AWS Config's required-tags rule or per-service listings. Cost allocation tags must also be activated in the billing console before they appear in cost reports. These are documentation-checked only; the scripts on this page were run against Hetzner only.

## Real-World Example

Dani is the platform engineer at a 40-person e-commerce company. Finance wants cost by team, but a good share of resources have no team label. She once spent a week labelling resources by hand and watched compliance sag back within two months.

This time she has the agent write the audit, runs it read-only, and reviews `fixes.csv`: normalization first, then inferred labels she approves one kind at a time. The Terraform validation goes into the shared module so new servers cannot be created without labels, and the nightly audit catches console-created strays. The orphan list is a short review queue: two old volumes get deleted, a standby that looked idle is labelled `environment=prod` and protected. Finance gets a team-by-team report built from the same inventory, and the labels, which looked like bureaucracy, become the basis for every cost question the company asks about its infrastructure.

## Related Skills

- [coding-agent](/skills/coding-agent)
- [report-generator](/skills/report-generator)
- [hetzner-cloud](/skills/hetzner-cloud)
