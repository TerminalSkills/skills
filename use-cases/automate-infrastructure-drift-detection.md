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

A 25-person SaaS team manages 120 cloud resources with Terraform. Over the past year, engineers have made 40+ manual changes through the cloud console during incidents — a security group rule here, a scaling parameter there. Now the Terraform state is out of sync with reality. Running `terraform plan` shows 23 unexpected changes. Nobody knows which manual changes were intentional fixes versus mistakes, and applying the plan might revert a critical hotfix that was never codified. The team is afraid to run Terraform at all.

## The Solution

Use the **coding-agent** skill to analyze drift, reconcile differences, and generate updated Terraform code. Use the **cicd-pipeline** skill to set up automated drift detection on a schedule. Use the **report-generator** to produce clear drift reports for the team.

```bash
npx terminal-skills install coding-agent cicd-pipeline report-generator
```

## Step-by-Step Walkthrough

### 1. Capture the current drift

Tell the agent to analyze your infrastructure:

```
Run terraform plan on our ./infrastructure directory and parse the output. For each drifted resource, classify the change as: security-related, performance-related, configuration-related, or unknown. Show me what changed and when it might have been changed manually.
```

### 2. The agent categorizes the drift

```
Infrastructure Drift Report — 23 resources out of sync:

SECURITY (fix in IaC immediately):
- aws_security_group.api — port 9090 opened (not in Terraform)
- aws_iam_role.lambda_exec — extra policy attached: AmazonS3FullAccess
- aws_s3_bucket.uploads — public access block disabled

PERFORMANCE (likely intentional hotfixes):
- aws_autoscaling_group.web — min_size changed 2→4 (probably incident response)
- aws_rds_instance.primary — instance_class db.r5.large→db.r5.2xlarge
- aws_elasticache.redis — node_type cache.t3.medium→cache.r6g.large

CONFIGURATION:
- 14 resources with tag changes or minor parameter updates

UNKNOWN:
- 3 resources with changes that don't match any recent incident
```

### 3. Reconcile drift into code

```
For the 6 security and performance changes: update the Terraform code to match the current cloud state where the change was intentional. For the 3 security issues (port 9090, S3 public access, extra IAM policy), flag them as likely unauthorized and create a plan to revert.
```

### 4. The agent updates Terraform files

The agent modifies the Terraform HCL to codify the intentional changes and generates a targeted plan to revert the risky ones:

```
Updated files:
- infrastructure/autoscaling.tf — min_size updated to 4
- infrastructure/rds.tf — instance_class updated to db.r5.2xlarge
- infrastructure/elasticache.tf — node_type updated to cache.r6g.large

Revert plan (apply with caution):
- Remove port 9090 from api security group
- Remove AmazonS3FullAccess from lambda role
- Re-enable public access block on uploads bucket
```

### 5. Generate compliance documentation

```
For each reconciled change, generate a change record documenting: what changed, why (incident reference if applicable), who approved the reconciliation, and the date codified. We need this for our SOC 2 audit trail.
```

```
Change Records Generated:
- CR-001: ASG min_size 2→4, Incident INC-2024-089 (Jan 15 traffic spike), codified Feb 17
- CR-002: RDS instance upgrade, Incident INC-2024-091 (slow query cascade), codified Feb 17
- CR-003: ElastiCache upgrade, Capacity planning decision (ticket OPS-445), codified Feb 17
- CR-004: Security group port 9090 REVERTED, unauthorized change, no incident reference
- CR-005: IAM policy REVERTED, unauthorized over-permission, no incident reference
- CR-006: S3 public access REVERTED, unauthorized change, escalated to security team

Exported to: infrastructure/drift-records/2025-02-17.md
```

### 6. Set up automated drift detection

```
Create a GitHub Actions workflow that runs terraform plan every 6 hours, compares against last known state, and posts a Slack notification if any new drift is detected. Include the drift classification in the alert.
```

## Real-World Example

Alex, a DevOps engineer at a 25-person SaaS team, discovers that nobody has run `terraform apply` in three months because the plan shows 23 unexpected changes and the team is afraid of breaking production.

1. Alex asks the agent to analyze the drift — it categorizes 23 changes into security risks, intentional hotfixes, and minor config changes
2. The agent flags 3 security concerns: an open port, an overly permissive IAM policy, and a public S3 bucket — all likely from rushed incident response
3. Alex has the agent update Terraform to codify the 6 intentional performance changes and generate revert plans for the 3 security issues
4. After applying the reconciled Terraform, the plan shows zero drift for the first time in months
5. The automated drift check runs every 6 hours — the next time someone makes a console change during an incident, Alex gets a Slack alert within hours and can codify it immediately instead of letting it rot

## Tips for Preventing Drift

- **Require a Terraform PR for every console change** — even during incidents, file a follow-up PR within 24 hours
- **Use policy-as-code tools** (like OPA or Sentinel) alongside drift detection to prevent unauthorized changes
- **Tag manual changes** in the cloud console with an incident ID so the drift detector can auto-correlate
- **Review drift reports weekly** — do not let reconciliation become its own backlog of technical debt

## Related Skills

- [security-audit](../skills/security-audit/) -- Audit drifted security configurations for compliance risks
- [report-generator](../skills/report-generator/) -- Generate weekly drift summary reports for leadership
