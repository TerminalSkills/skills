---
title: "Provision and Manage Cloud Infrastructure with Terraform"
slug: provision-cloud-infrastructure-with-terraform
description: "Go from manual AWS console clicks to a fully codified, version-controlled infrastructure with Terraform modules, multi-environment deployments, and automated drift detection."
skills: [terraform-iac, security-audit, cicd-pipeline]
category: devops
tags: [terraform, infrastructure-as-code, aws, cloud, devops, iac]
---

# Provision and Manage Cloud Infrastructure with Terraform

## The Problem

A growing SaaS company runs 40+ AWS resources created manually through the console over 2 years. Nobody remembers why certain security groups have specific rules. The staging environment "kind of" mirrors production but diverges after every manual hotfix. Last month, someone accidentally deleted a NAT gateway and it took 4 hours to recreate because nobody documented the route table associations. There is no way to spin up a new environment for load testing or a new client without 2 days of clicking through the console. Infrastructure knowledge lives in one engineer's head.

## The Solution

Use `terraform-iac` to codify all existing infrastructure into Terraform modules, `security-audit` to scan configurations for misconfigurations and compliance issues, and `cicd-pipeline` to automate plan/apply workflows with proper review gates.

## Step-by-Step Walkthrough

### 1. Import existing infrastructure into Terraform

```text
We have 40+ AWS resources created manually: a VPC with 6 subnets, 2 NAT
gateways, an ECS Fargate cluster running 5 services behind an ALB, an RDS
PostgreSQL instance, an ElastiCache Redis cluster, 3 S3 buckets, a CloudFront
distribution, and about 15 security groups. Here are the resource IDs
(paste list). Import everything into Terraform, organize into modules
(networking, compute, database, cache, storage, cdn), and make sure
"terraform plan" shows no changes after import.
```

The agent generates import blocks for all 40+ resources, writes the corresponding HCL configurations by querying each resource's current state, organizes them into 6 modules with proper variable extraction, and iterates on `terraform plan` until it reports zero changes — confirming the code exactly matches reality.

### 2. Create reusable modules with multi-environment support

```text
Refactor the imported code into reusable modules. I want to deploy identical
infrastructure to dev, staging, and production with different sizing:
- Dev: single AZ, t3.small instances, db.t3.micro RDS, no Redis
- Staging: 2 AZs, t3.medium instances, db.t3.small RDS, single Redis node
- Production: 3 AZs, t3.large instances, db.r6g.large Multi-AZ RDS, 3-node Redis cluster

Each environment should have its own directory with a tfvars file. Shared
modules should handle the differences through variables. Use S3 + DynamoDB
backend with per-environment state files.
```

The agent creates the directory-per-environment structure with shared modules that accept sizing parameters. Each module has sensible defaults for dev (cost-optimized) and validation rules that prevent accidentally deploying dev-sized resources to production. Backend configuration uses separate state keys per environment with encryption and locking.

### 3. Audit security and fix misconfigurations

```text
Run a security audit on all Terraform configurations. Check for:
- Security groups with 0.0.0.0/0 on non-HTTP ports
- Unencrypted S3 buckets or RDS instances
- Public subnets with resources that should be private
- Missing access logging on ALB and S3
- IAM policies that are too permissive
- Resources missing required tags

Generate a prioritized list of findings with the exact Terraform changes
needed to fix each one.
```

The agent scans all `.tf` files and produces a prioritized findings report: 3 critical (open security groups, unencrypted RDS), 5 high (missing S3 bucket policies, overly permissive IAM), and 8 medium (missing logging, tag compliance). Each finding includes the exact HCL diff to apply. Critical fixes are implemented immediately; others go into a separate PR.

### 4. Set up CI/CD for infrastructure changes

```text
Create a GitHub Actions pipeline for Terraform:
- On PR: run fmt check, validate, plan, post plan output as PR comment
- On merge to main: apply the exact plan that was reviewed
- Add Infracost to show cost impact on every PR
- Add tfsec/checkov security scanning
- Use OIDC for AWS credentials (no static access keys)
- Separate workflows per environment: dev auto-applies, staging needs 1 approval,
  production needs 2 approvals

Also set up a weekly drift detection job that runs "terraform plan" and
alerts if anything changed outside Terraform.
```

The agent generates GitHub Actions workflows with reusable composite actions for plan/apply, OIDC trust configuration for AWS, Infracost integration showing monthly cost changes in PR comments, tfsec scanning that blocks PRs with critical findings, environment-specific approval gates using GitHub Environments, and a scheduled drift detection workflow that posts alerts to Slack when manual changes are detected.

### 5. Spin up a new environment on demand

```text
Create a "terraform workspace" command or script that provisions a complete
isolated environment from scratch for load testing or client demos. It should:
1. Accept a name and sizing tier (small/medium/large)
2. Create all resources with proper naming (prefix with environment name)
3. Deploy the latest container images from ECR
4. Output the ALB URL, database endpoint, and SSH bastion IP
5. Have a destroy command that tears everything down cleanly
6. Set a TTL tag so we can auto-destroy forgotten environments after 7 days

This should take under 15 minutes to provision.
```

The agent creates a wrapper script using Terraform workspaces, a tfvars template with three sizing presets, a provisioning script that runs init/apply and outputs connection details, a destroy script with confirmation prompt, and a Lambda-based janitor that scans for expired TTL tags daily and destroys orphaned environments.

## Real-World Example

A CTO at a 30-person SaaS company has 40+ AWS resources created over 2 years through the console. Only one senior engineer knows how everything connects. Spinning up a staging replica takes 2 days of manual work, and last month a deleted NAT gateway caused a 4-hour outage.

1. She imports all existing infrastructure into Terraform — for the first time, the team can see the entire architecture as code
2. Reusable modules allow deploying dev/staging/prod with a single tfvars change — new environments take 12 minutes instead of 2 days
3. Security audit finds 3 critical misconfigurations (open ports, unencrypted storage) that had been there for months
4. CI/CD pipeline catches a teammate's PR that would have opened port 22 to the internet — blocked before merge
5. Weekly drift detection catches a manual security group change made during an incident — the team adds it properly through Terraform
6. After 3 months: zero configuration drift, new environments in minutes, and infrastructure knowledge is shared across the entire team
