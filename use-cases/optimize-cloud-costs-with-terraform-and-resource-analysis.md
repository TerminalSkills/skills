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

Use the **cloud-resource-analyzer** skill to audit every running resource for utilization, waste, and savings opportunities, then use the **terraform-iac** skill to codify the right-sized configuration so the optimizations stick and cost drift cannot recur. The analyzer provides the data; Terraform provides the enforcement.

## Step-by-Step Walkthrough

### 1. Audit current resource utilization

Start by scanning all active cloud resources to identify underutilized instances, unattached volumes, and idle load balancers. The audit should cover compute, storage, networking, and database resources across all regions.

> Analyze our AWS account for cost optimization opportunities. Check EC2 instance CPU and memory utilization over the past 30 days, find unattached EBS volumes, identify idle RDS instances, and flag any Elastic IPs not associated with running instances. Also check for unused load balancers with zero healthy targets, NAT gateways in regions with no active instances, and S3 buckets with no access in 90 days. Output a ranked list of savings opportunities with estimated monthly savings for each.

The audit typically reveals three categories: resources that can be deleted immediately (orphaned volumes, forgotten dev environments), resources that can be downsized (oversized instances), and resources that need lifecycle policies (old snapshots, infrequently accessed storage).

### 2. Identify right-sizing targets

With the utilization report in hand, determine the correct instance types and storage tiers for each workload based on actual usage patterns. The key is using peak utilization, not average -- sizing for 12% average CPU ignores the 3 AM batch job that spikes to 45%.

> Based on the utilization analysis, recommend specific right-sizing changes. Our API servers are on m5.2xlarge but average 12% CPU with a peak of 38%. The staging database is db.r6g.xlarge with 3% connection utilization. The batch processing cluster uses m5.4xlarge but only runs for 2 hours daily. Map each resource to the smallest instance type that maintains a 40% headroom buffer above peak usage. For the batch cluster, recommend a schedule-based scaling approach.

Right-sizing is not just about picking smaller instances. Some workloads benefit more from switching instance families (compute-optimized versus memory-optimized) or moving to ARM-based Graviton instances for a 20% cost reduction at equivalent performance.

### 3. Import existing resources into Terraform

Before making changes, bring any console-created resources under Terraform management so everything is tracked in code. This prevents the "worked in console, broke in Terraform" problem where manual changes conflict with managed infrastructure.

> Generate Terraform import blocks for the 14 resources identified in the audit that are not currently in our Terraform state. Include the three orphaned EBS volumes, the dev environment load balancer, and the forgotten NAT gateway in us-west-2. Generate the corresponding resource blocks with all current attributes so the import does not trigger any changes on the first plan.

### 4. Apply right-sizing changes through Terraform

Codify the recommended instance type changes, storage tier adjustments, and resource deletions in Terraform so they go through plan and review before applying. The Terraform plan output shows exactly what will change before anything is modified, giving the team confidence to act.

> Update our Terraform configuration to right-size the API server ASG from m5.2xlarge to m5.large, change the staging RDS instance from db.r6g.xlarge to db.t4g.medium, delete the three unattached EBS volumes, and remove the unused NAT gateway. Add cost tags to every resource so we can track spend by team. For the batch cluster, add a scheduled scaling policy that scales to zero outside the 2 AM-4 AM processing window.

### 5. Set up ongoing cost governance

Prevent future drift by adding budget alerts and tagging policies to the Terraform configuration. Without governance, costs creep back within a quarter as developers spin up resources through the console.

> Add AWS Budget alerts to our Terraform that notify the engineering Slack channel when monthly spend exceeds $15,000 and $20,000. Create a tagging policy that requires every resource to have team, environment, and cost-center tags. Add a scheduled Lambda that reports untagged resources weekly. Include a Terraform module that automatically applies tags to all resources created by the team.

The governance layer is what separates a one-time cleanup from a sustainable cost practice. Without it, the same $15,000 in waste will accumulate again within two quarters.

## Real-World Example

The platform team at a fintech startup ran the cloud resource analyzer against their 140-resource AWS account on a Monday morning. The audit surfaced $6,200 in monthly waste: four m5.4xlarge instances running a batch job that peaked at 8% CPU, 900 GB of unattached EBS snapshots from a migration completed four months prior, and a redundant NAT gateway in a region they no longer used.

They imported the 14 unmanaged resources into Terraform on Tuesday, verified the import with `terraform plan` showing zero changes, then codified the right-sizing recommendations into the configuration. The plan showed 11 resources would be modified and 6 destroyed. They applied compute changes during a maintenance window on Wednesday night and deleted the orphaned resources on Thursday morning.

The following month's AWS bill dropped to $16,400 -- a 29% reduction. Because every change lives in Terraform, the next quarter's cost review took 30 minutes instead of a full day of console archaeology. The budget alerts caught a developer who spun up a g5.2xlarge GPU instance for an ML experiment and forgot about it -- the team was notified within 48 hours instead of discovering it on the next monthly bill. Six months later, the governance system has kept the bill within 5% of the target, and every new resource is automatically tagged at creation time through the Terraform module.
