---
title: "Automate Infrastructure Drift Detection with AI"
slug: automate-infrastructure-drift-detection
description: "Detect and resolve infrastructure drift between your IaC definitions and actual cloud state before it causes outages."
skills: [coding-agent, cicd-pipeline, report-generator]
category: devops
tags: [infrastructure, drift, terraform, iac, cloud, automation]
---

# Automate Infrastructure Drift Detection with AI

## The Problem

Alex is a DevOps engineer at a 25-person SaaS team. They manage 120 cloud resources with Terraform. Over the past year, engineers have made 40+ manual changes through the AWS console during incidents — a security group rule here, a scaling parameter there, an RDS instance resize at 2 AM when the database was melting. Every change was justified in the moment and forgotten the next day.

Now `terraform plan` shows 23 unexpected changes, and nobody has run `terraform apply` in three months because the last time someone tried, the plan included reverting the ASG min_size from 4 back to 2 — which would have halved the web tier's capacity during the busiest month of the year.

The problem is not the drift itself. It is that nobody knows which manual changes were intentional fixes that need to be kept versus mistakes that should be reverted. Applying the plan blindly might undo the scaling fix that is keeping the site alive. Ignoring the plan means every future Terraform change carries 23 unknowns. And somewhere in those 23 changes, there might be an open port or an overly permissive IAM policy that nobody remembers creating. The team is stuck, afraid to touch infrastructure in either direction.

## The Solution

Using the **coding-agent** skill to analyze drift and reconcile differences, the **cicd-pipeline** skill to set up automated detection on a schedule, and the **report-generator** skill to produce clear drift reports and change records, the agent categorizes every drifted resource by risk, updates Terraform code to match intentional changes, flags unauthorized modifications for review, and sets up ongoing monitoring so drift never accumulates this badly again.

## Step-by-Step Walkthrough

### Step 1: Capture the Current Drift

First, get the full picture of what has drifted and why it might have changed:

```text
Run a refresh-only plan on our ./infrastructure directory, save it, and read the resource_drift section of its JSON. For each drifted resource, classify the change as: security-related, performance-related, configuration-related, or unknown. Show me what changed and when it might have been changed manually (check CloudTrail).
```

The agent runs:

```console
$ terraform plan -refresh-only -detailed-exitcode -out=drift.tfplan
$ terraform show -json drift.tfplan > drift.json
```

`-refresh-only` compares real infrastructure with the state file and ignores pending code changes, so everything it reports is drift. Without it, `terraform plan` mixes drift with edits that were never applied. `drift.json` lists each drifted resource under `resource_drift` with `change.before` and `change.after`. (Terraform 1.17.1 checked: exit code 0 means no drift, 2 means drift.)

### Step 2: Categorize the Drift

The 23 drifted resources fall into four buckets. The categorization immediately reveals what needs urgent attention versus what can wait:

**Security (fix in IaC immediately) — 3 resources:**
- `aws_security_group.api` — port 9090 opened, not in Terraform. This is a debug endpoint that was likely enabled during an incident and never closed.
- `aws_iam_role.lambda_exec` — extra managed policy attached: `AmazonS3FullAccess`. Someone could not figure out the minimum permissions and took a shortcut.
- `aws_s3_bucket_public_access_block.uploads` — public access block disabled. This is the scariest one — the uploads bucket may have been publicly accessible for weeks or months.

**Performance (likely intentional hotfixes) — 3 resources:**
- `aws_autoscaling_group.web` — `min_size` changed from 2 to 4 (almost certainly the January traffic spike incident)
- `aws_db_instance.primary` — `instance_class` changed from `db.r5.large` to `db.r5.2xlarge` (the slow query cascade from two weeks later)
- `aws_elasticache_cluster.redis` — `node_type` changed from `cache.t3.medium` to `cache.r6g.large` (capacity planning decision, tracked in OPS-445)

**Configuration — 14 resources** with tag changes, description updates, and minor parameter adjustments that have no operational impact.

**Unknown — 3 resources** with changes that do not correlate with any incident ticket or Slack conversation.

The security bucket is the most concerning. An open port, an overly permissive IAM policy, and a public S3 bucket all look like rushed incident response where someone took shortcuts and never cleaned up. These are exactly the kind of silent risks that compound when drift goes unmanaged.

### Step 3: Reconcile Drift into Code

The performance changes are almost certainly intentional — someone scaled up the database during a slow query cascade and the ASG during a traffic spike. These need to be codified in Terraform so the next `terraform apply` does not accidentally revert them.

```text
For the 6 security and performance changes: update the Terraform code to match the current cloud state where the change was intentional. For the 3 security issues (port 9090, S3 public access, extra IAM policy), flag them as likely unauthorized and create a plan to revert.
```

Three Terraform files get updated to codify the intentional performance changes, each with a comment linking to the incident or ticket that motivated the change:

```hcl
# infrastructure/autoscaling.tf
resource "aws_autoscaling_group" "web" {
  min_size = 4  # Updated from 2 — INC-2024-089 (Jan 15 traffic spike)
  # ...
}
```

```hcl
# infrastructure/rds.tf
resource "aws_db_instance" "primary" {
  instance_class = "db.r5.2xlarge"  # Updated from db.r5.large — INC-2024-091 (slow query cascade)
  # ...
}
```

```hcl
# infrastructure/elasticache.tf
resource "aws_elasticache_cluster" "redis" {
  node_type = "cache.r6g.large"  # Updated from cache.t3.medium — OPS-445 capacity planning
  # ...
}
```

For the three security issues, the code is left as it is and a reviewed pull request runs a normal `terraform plan` and `terraform apply`, which reverts the risky changes: port 9090 leaves the API security group, `AmazonS3FullAccess` is detached from the Lambda role (a minimal policy for only the bucket the function needs is added in code), and the public access block on the uploads bucket is restored. Apply the whole plan after review rather than using `-target`, which Terraform documents as an exception tool and which leaves the rest of the drift unexamined.

### Step 4: Generate Compliance Documentation

SOC 2 auditors want a paper trail for every infrastructure change, including changes made during incidents and later reconciled. Each reconciled change gets a formal record:

```text
For each reconciled change, generate a change record documenting: what changed, why (incident reference if applicable), who approved the reconciliation, and the date codified. We need this for our SOC 2 audit trail.
```

| Record | Resource | Change | Reference | Action |
|---|---|---|---|---|
| CR-001 | ASG min_size 2 to 4 | Scaling increase | INC-2024-089 (Jan 15) | Codified |
| CR-002 | RDS instance upgrade | Performance | INC-2024-091 | Codified |
| CR-003 | ElastiCache upgrade | Capacity planning | OPS-445 | Codified |
| CR-004 | Security group port 9090 | Unauthorized | No reference | **Reverted** |
| CR-005 | IAM policy over-permission | Unauthorized | No reference | **Reverted** |
| CR-006 | S3 public access | Unauthorized | No reference | **Reverted, escalated to security** |

The report-generator skill renders them as Markdown in `infrastructure/drift-records/2025-02-17.md`. For the SOC 2 audit, each record includes the before/after state, the date of the original change (estimated from CloudTrail), and the date of reconciliation.

### Step 5: Set Up Automated Drift Detection

The one-time cleanup is valuable, but the real win is preventing drift from accumulating for three months again. Without ongoing detection, the same problem reappears after the next incident.

```text
Create a GitLab CI scheduled pipeline that runs a refresh-only terraform plan every 6 hours and posts a Slack notification if drift is detected. Include the drift classification in the alert.
```

The cicd-pipeline skill produces two jobs that run only when the pipeline source is a schedule (a pipeline schedule with cron `0 */6 * * *` is created in the project settings). The first job detects drift; the second classifies it with a small script the coding agent writes:

```yaml
drift-detect:
  stage: test
  image:
    name: hashicorp/terraform:1.17.1
    entrypoint: [""]
  script:
    - cd infrastructure
    - terraform init -input=false
    - terraform plan -refresh-only -detailed-exitcode -input=false -out=drift.tfplan || rc=$?
    - terraform show -json drift.tfplan > ../drift.json
    - test "${rc:-0}" -ne 1   # exit code 1 is a plan error, 2 is drift
  artifacts:
    paths: [drift.json]
    expire_in: 1 day   # the JSON contains resource attributes: keep it short-lived
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"

drift-notify:
  stage: deploy
  image: python:3.14-slim
  needs: [drift-detect]
  script:
    - python3 scripts/classify_drift.py drift.json   # posts to $SLACK_WEBHOOK_URL (masked CI variable)
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
```

`classify_drift.py` reads `resource_drift` from `drift.json`, buckets each resource by type (`aws_security_group*`, `aws_iam_*` and `aws_s3_bucket_public_access_block` are security; `aws_autoscaling_group`, `aws_db_instance` and `aws_elasticache_*` are performance; the rest is configuration), and posts one Slack message through an incoming webhook, listing only resource addresses and actions, never attribute values:

Here is the script, `scripts/classify_drift.py` (standard library only; the `resource_drift` key is absent from the JSON when nothing drifted):

```python
import json, os, sys, urllib.request

SECURITY = ("aws_security_group", "aws_iam_", "aws_s3_bucket_public_access_block")
PERFORMANCE = ("aws_autoscaling_group", "aws_db_instance", "aws_elasticache_")


def bucket(resource_type):
    if resource_type.startswith(SECURITY):
        return "security"
    if resource_type.startswith(PERFORMANCE):
        return "performance"
    return "configuration"


def main(path):
    with open(path) as f:
        plan = json.load(f)
    groups = {"security": [], "performance": [], "configuration": []}
    for r in plan.get("resource_drift", []):  # key is absent when nothing drifted
        actions = ",".join(r["change"]["actions"])
        groups[bucket(r["type"])].append(f'{r["address"]} ({actions})')
    if not any(groups.values()):
        print("No drift")
        return
    mention = {"security": "<!channel> ", "performance": "<!here> ", "configuration": ""}
    lines = []
    for name in ("security", "performance", "configuration"):
        if groups[name]:
            lines.append(f"{mention[name]}*{name}*: " + ", ".join(groups[name]))
    text = "Terraform drift detected\n" + "\n".join(lines)
    print(text)
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if url:
        req = urllib.request.Request(url, json.dumps({"text": text}).encode(),
                                     {"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10).read()


main(sys.argv[1])
```

- **Security changes** are listed first and the message starts with Slack's `<!channel>` mention — open ports and IAM changes cannot wait
- **Performance changes** use `<!here>` — likely an incident response that needs codifying
- **Config changes** are listed without a ping and reviewed the next business day

The alert includes the specific resource address, so the on-call engineer can assess urgency without running Terraform. Credentials for the plan come from the runner's cloud role (read-only), not from stored keys.

The next time someone makes a console change during an incident, Alex gets a Slack alert within 6 hours instead of discovering the drift three months later. He can codify it the same day while the context is still fresh — while the engineer who made the change still remembers why they changed it and can verify the codification is correct.

## Real-World Example

Alex applies the reconciled Terraform on a Wednesday afternoon. The plan shows exactly the changes he expects: 3 performance codifications, 3 security reverts, and 14 minor config alignments. For the first time in three months, `terraform plan` shows zero drift.

The security reverts trigger a brief but important conversation with the team. The open port on 9090 turns out to be a debug endpoint someone enabled during an incident six weeks ago — it was publicly accessible the entire time. The `AmazonS3FullAccess` policy was attached because a developer could not figure out the minimum IAM permissions for a Lambda function and took the expedient shortcut at 1 AM during an incident. The S3 public access block was disabled to debug a file upload issue and never re-enabled. All three are exactly the kind of silent risks that accumulate when drift goes unmanaged.

Two weeks later, the automated drift check catches its first new change: a developer edited an ECS task definition in the console during a memory pressure incident. Alex gets the Slack alert at 9 AM the next morning, opens a PR to codify the change with a link to the incident ticket, and has it merged by lunch. The drift backlog never grows past a single change again.

## Related Skills

- [coding-agent](/skills/coding-agent) -- classifies drift and updates the Terraform code
- [cicd-pipeline](/skills/cicd-pipeline) -- schedules the drift check in CI
- [report-generator](/skills/report-generator) -- produces the drift and change records
