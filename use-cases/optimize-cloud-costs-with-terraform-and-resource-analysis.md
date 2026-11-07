---
title: "Optimize Cloud Costs with Terraform and Resource Analysis"
slug: optimize-cloud-costs-with-terraform-and-resource-analysis
description: "Audit cloud infrastructure for waste, right-size resources with data-driven recommendations, and codify changes in Terraform to prevent cost drift."
skills:
  - terraform-iac
  - cloud-resource-analyzer
category: devops
tags:
  - cloud-costs
  - terraform
  - right-sizing
  - infrastructure
---

# Optimize Cloud Costs with Terraform and Resource Analysis

## The Problem

A Series B startup's AWS bill climbed from $8,000 to $23,000 per month over six months without a proportional increase in traffic. Nobody knows which resources are oversized, which are idle, and which were spun up for a demo three months ago and never torn down. The infrastructure was built through a mix of Terraform and console clicks, so there is no single source of truth for what should exist versus what actually exists. The CTO asked the team to "cut cloud costs" but without visibility into what is actually running and what is wasted, every suggestion is a guess. The team tried manually checking the AWS console, but with resources spread across four regions and two accounts, no one could produce a complete picture.

## The Solution

Use the **cloud-resource-analyzer** skill to audit running resources for waste with read-only AWS CLI queries, then use the **terraform-iac** skill to codify the right-sized configuration so the optimizations stick and cost drift cannot recur. The analyzer provides the data; Terraform provides the enforcement.

## Step-by-Step Walkthrough

### 1. Audit current resource utilization

Scan every region that has resources (`aws ec2 describe-regions`), with credentials that have read-only access:

> Analyze our AWS account for cost optimization opportunities, region by region. Find unattached EBS volumes, snapshots older than 90 days that no AMI depends on, Elastic IPs with no association, load balancers whose target groups have no healthy targets, NAT gateways with almost no traffic, and RDS instances with low CPU and connection counts over 14 days. Price each finding with a 720-hour month and rank by monthly savings. Do not delete anything.

The skill's queries return three kinds of findings: resources to delete (orphaned volumes, forgotten dev environments), resources to downsize, and resources that need lifecycle policies (old snapshots). Two things the CLI cannot tell you on its own: EC2 memory utilization (CloudWatch has none unless the CloudWatch agent is installed) and S3 access patterns (use S3 Storage Lens or server access logs before archiving a bucket). Treat both as open questions in the report, not as findings.

### 2. Identify right-sizing targets

Use peak utilization, not the average. A server averaging 12% CPU with a 38% peak on an 8 vCPU `m5.2xlarge` peaks at about 3 vCPUs, so an `m5.large` (2 vCPUs) would be saturated. The smallest size that fits is `m5.xlarge` (4 vCPUs, peak near 76%).

> Recommend right-sizing changes from the 30-day CloudWatch data. The API servers are on m5.2xlarge with 12% average and 38% peak CPU. The staging database is db.r6g.xlarge with 3% connection utilization. The batch cluster uses m5.4xlarge but runs 2 hours a day. For each, name the smallest instance type that keeps peak CPU under 80%, check memory before shrinking (an `m5.xlarge` has 16 GiB against 32 GiB), and for the batch cluster recommend scheduled scaling.

Moving to a Graviton (ARM) family such as `m6g` or `m7g` is priced about 20% below the comparable x86 instance, but the AMI and every container image must be built for arm64. Test one instance before moving the group. For the staging database, a burstable `db.t4g.medium` (2 vCPUs, 4 GiB) is only safe if `FreeableMemory` and the working set fit in 4 GiB.

### 3. Import existing resources into Terraform

Bring the console-created resources you intend to keep under Terraform before changing them. Orphaned volumes and the forgotten NAT gateway do not need importing: snapshot the volumes, then delete them with the CLI or remove them in the console.

> Write `import` blocks for the resources we are keeping that are not in Terraform state: the dev environment load balancer, its target groups, and the staging RDS instance. Then run `terraform plan -generate-config-out=generated.tf` and review the generated resource blocks.

```hcl
import {
  to = aws_db_instance.staging
  id = "staging-orders-db"
}
```

```console
$ terraform plan -generate-config-out=generated.tf
```

`-generate-config-out` (Terraform 1.5 and later) refuses to overwrite an existing file and its output is a starting template: remove conflicting arguments, replace literals with variables, and run `terraform plan` again until it reports no changes before you apply the import.

### 4. Apply right-sizing changes through Terraform

Make the instance changes in code so they go through plan and review:

> Change the API server launch template from m5.2xlarge to m5.xlarge and the staging RDS instance to db.t4g.medium. Add a scheduled action for the batch Auto Scaling group that scales it to zero outside the 02:00-04:00 window. Show me the plan before anything is applied.

```hcl
resource "aws_autoscaling_schedule" "batch_up" {
  scheduled_action_name  = "batch-up"
  autoscaling_group_name = aws_autoscaling_group.batch.name
  recurrence             = "0 2 * * *"
  time_zone              = "UTC"
  min_size               = 0
  max_size               = 4
  desired_capacity       = 4
}

resource "aws_autoscaling_schedule" "batch_down" {
  scheduled_action_name  = "batch-down"
  autoscaling_group_name = aws_autoscaling_group.batch.name
  recurrence             = "0 4 * * *"
  time_zone              = "UTC"
  min_size               = 0
  max_size               = 0
  desired_capacity       = 0
}
```

Read the plan for any `must be replaced` marker on a database before applying; a class change on RDS causes a reboot, so apply it in a maintenance window.

### 5. Set up ongoing cost governance

> Add an `aws_budgets_budget` with a monthly cost limit and two notifications, at 75% and 100% of the limit, sent to an SNS topic that Amazon Q Developer in chat applications (formerly AWS Chatbot) posts to our Slack channel. Add `default_tags` to the AWS provider block with team, environment, and cost-center. Add an AWS Config managed rule `required-tags` that reports resources missing those tags.

```hcl
resource "aws_budgets_budget" "monthly" {
  name         = "monthly-total"
  budget_type  = "COST"
  limit_amount = "20000"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 75
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.cost_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.cost_alerts.arn]
  }
}
```

The SNS topic must be in the same account, unencrypted (or use a KMS key that allows Budgets), and carry an access policy that lets the `budgets.amazonaws.com` service principal `SNS:Publish`, with `aws:SourceAccount` and `aws:SourceArn` conditions; otherwise the budget fails with "Invalid SNS topic". The `required-tags` rule (`REQUIRED_TAGS`, up to six tag keys) covers only supported resource types and does not block untagged resources, it only reports them.

`default_tags` applies tags to every resource the provider creates, so the team does not need a separate tagging module. The tags only appear in Cost Explorer after you activate them as cost allocation tags in the Billing console. Budgets data refreshes a few times a day, so an alert is hours behind, not minutes.

## Real-World Example

The platform team at a fintech startup (an example, with its own numbers) ran the analysis against a 140-resource AWS account on a Monday. The audit found about $6,200 a month in waste: four `m5.4xlarge` instances running a batch job that peaked at 8% CPU, 900 GB of snapshots left from a migration four months earlier, and a NAT gateway in a region they no longer used.

They imported the unmanaged resources they kept on Tuesday and checked that `terraform plan` showed no changes. The right-sizing plan then showed 11 resources modified and 6 destroyed. They applied compute changes during a maintenance window on Wednesday night and deleted the orphaned resources on Thursday morning after taking snapshots. The next month's bill fell from $23,000 to $16,400. The budget alert later flagged a forgotten `g5.2xlarge` GPU instance within two days instead of at the next monthly bill, and the next quarterly cost review took 30 minutes.

## Related Skills

- **cloud-resource-analyzer**: read-only AWS CLI queries for orphaned, idle and oversized resources, with list prices for the savings estimate (steps 1-2).
- **terraform-iac**: plan/apply workflow and `import` blocks with `-generate-config-out` (step 3), reused for the scaling and governance changes in steps 4-5.
