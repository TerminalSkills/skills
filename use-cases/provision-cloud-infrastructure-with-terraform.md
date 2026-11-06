---
title: "Provision and Manage Cloud Infrastructure with Terraform"
slug: provision-cloud-infrastructure-with-terraform
description: "Go from manual AWS console clicks to a fully codified, version-controlled infrastructure with Terraform modules, multi-environment deployments, and automated drift detection."
skills: [terraform-iac, checkov, cicd-pipeline]
category: devops
tags: [terraform, infrastructure-as-code, aws, cloud, devops, iac]
---

# Provision and Manage Cloud Infrastructure with Terraform

## The Problem

A 30-person SaaS company has 40+ AWS resources created manually through the console over two years. Nobody remembers why certain security groups have specific rules. The staging environment "kind of" mirrors production but diverges after every manual hotfix. Last month, someone accidentally deleted a NAT gateway and it took 4 hours to recreate because nobody documented the route table associations.

The scariest part: infrastructure knowledge lives in one engineer's head. When she's on vacation, nobody can spin up a new environment or debug networking issues. Creating a staging replica for load testing takes 2 days of clicking through the AWS console. Onboarding a new engineer to the infrastructure takes a week of shadowing. Every manual change is a gamble — there's no review process, no audit trail, and no way to roll back.

## The Solution

Using the **terraform-iac**, **checkov**, and **cicd-pipeline** skills, the approach is to import all existing resources into Terraform (matching reality exactly), refactor into reusable modules with multi-environment support, audit for security misconfigurations, and set up a CI/CD pipeline with plan/apply workflows, cost estimates, and drift detection.

## Step-by-Step Walkthrough

### Step 1: Import Existing Infrastructure

```text
We have 40+ AWS resources created manually: a VPC with 6 subnets, 2 NAT
gateways, an ECS Fargate cluster running 5 services behind an ALB, an RDS
PostgreSQL instance, an ElastiCache Redis cluster, 3 S3 buckets, a CloudFront
distribution, and about 15 security groups. Here are the resource IDs.
Import everything into Terraform, organize into modules, and make sure
"terraform plan" shows no changes after import.
```

This is the most tedious part of adopting Terraform — and the most important to get right. Every resource needs an `import` block, a corresponding HCL configuration that matches its current state exactly, and verification that `terraform plan` shows zero drift. Import blocks (Terraform 1.5+) make the imports reviewable in a normal plan, and Terraform can draft the configuration for you:

```hcl
import {
  to = aws_vpc.main
  id = "vpc-0abc123"
}
```

```bash
terraform plan -generate-config-out=generated.tf   # the file must not exist yet; review and trim the draft
terraform plan                                     # repeat until it reports no changes
```

The resources organize into 6 modules:

```
terraform/
  modules/
    networking/    # VPC, subnets, NAT gateways, route tables
    compute/       # ECS cluster, task definitions, services, ALB
    database/      # RDS PostgreSQL, parameter groups, subnet groups
    cache/         # ElastiCache Redis, replication groups
    storage/       # S3 buckets, policies, lifecycle rules
    cdn/           # CloudFront distribution, origins, behaviors
  environments/
    dev/
    staging/
    production/
  main.tf
  variables.tf
  backend.tf
```

The final `terraform plan` reports zero changes — the code exactly matches reality. For the first time, the entire infrastructure is visible as code. The NAT gateway that took 4 hours to recreate? It's now defined in 15 lines of HCL with all its route table associations documented inline.

### Step 2: Create Reusable Modules with Multi-Environment Support

```text
Refactor the imported code into reusable modules. I want to deploy identical
infrastructure to dev, staging, and production with different sizing:
- Dev: single AZ, 0.5 vCPU / 1 GB Fargate tasks, db.t3.micro RDS, no Redis
- Staging: 2 AZs, 1 vCPU / 2 GB tasks, db.t3.small RDS, single Redis node
- Production: 3 AZs, 2 vCPU / 4 GB tasks, db.r6g.large Multi-AZ RDS, 3-node Redis cluster
Use an S3 backend with native locking and per-environment state files.
```

Each environment gets its own directory with a `tfvars` file that sets sizing parameters. The shared modules handle the differences through variables with sensible defaults and validation rules:

```hcl
# modules/database/variables.tf
variable "environment" {
  type = string
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"  # Cost-optimized default for dev

  validation {
    condition     = !(var.environment == "production" && startswith(var.instance_class, "db.t3"))
    error_message = "Production must use r-class instances for memory-optimized workloads."
  }
}
```

That validation rule prevents a common mistake: accidentally deploying dev-sized resources to production (a rule that refers to another variable needs Terraform 1.9 or newer). The backend uses a separate state key per environment, with encryption and S3 native locking, so two engineers can't run `terraform apply` against production simultaneously:

```hcl
terraform {
  backend "s3" {
    bucket       = "example-terraform-state"
    key          = "env/production/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true   # Terraform 1.11+; replaces the deprecated dynamodb_table
  }
}
```

Backend blocks cannot reference variables, so per-environment values go in a file passed with `terraform init -backend-config=production.s3.tfbackend`.

Spinning up a new environment goes from 2 days of console clicking to 12 minutes of `terraform apply`.

### Step 3: Security Audit

```text
Run a security audit on all Terraform configurations. Check for security groups
with 0.0.0.0/0 on non-HTTP ports, unencrypted S3 buckets or RDS instances,
public subnets with resources that should be private, missing access logging,
overly permissive IAM policies, and resources missing required tags.
```

The agent runs Checkov, which evaluates the `.tf` files against its built-in AWS policies (no cloud account or API key needed), then ranks the findings by risk:

```bash
pip install checkov            # in a virtual environment
checkov -d terraform/ --compact --quiet
```

On the open SSH rule and the unencrypted database it reports, among many other findings, `CKV_AWS_24` (no security group ingress from `0.0.0.0/0` to port 22) and `CKV_AWS_16` (RDS encrypted at rest); the command exits with code 1 when any check fails. Checkov covers the encryption, open-port and logging checks; the tag and "unused rule" findings below come from the agent reading the code, not from a scanner. The result is a prioritized report:

**Critical (fix immediately):**
- Security group `sg-0a8f3c` allows inbound SSH (port 22) from `0.0.0.0/0` — opened during a debugging session and never reverted
- RDS instance has `storage_encrypted = false` — the default that nobody overrode
- S3 bucket `company-uploads` has no bucket policy and no customer-managed KMS key (S3 already encrypts new objects with SSE-S3 by default, so this is a key-control finding, not plaintext storage)

**High:**
- 3 S3 buckets missing access logging
- IAM role `ecs-task-role` has `s3:*` permission instead of scoped actions
- 2 security groups with unused ingress rules from decommissioned services

**Medium:**
- 8 resources missing required cost-allocation tags
- ALB access logging not enabled
- No lifecycle rules on S3 buckets (storage costs growing unchecked)

Each finding includes a suggested HCL diff to review. The critical SSH exposure — the kind of misconfiguration that gets exploited in real breaches — is a one-line change:

```hcl
# Before (CRITICAL: open to the internet)
cidr_blocks = ["0.0.0.0/0"]

# After (restricted to office VPN)
cidr_blocks = ["10.20.0.0/16"]
```

That security group had been open for 8 months. Nobody knew.

### Step 4: Set Up CI/CD for Infrastructure Changes

```text
Create a GitHub Actions pipeline for Terraform. On PR: fmt, validate, plan,
post plan as PR comment. On merge: apply the reviewed plan. Add Infracost for
cost impact, Checkov for security scanning, OIDC for AWS auth. Dev auto-applies,
staging and production wait for approval.
```

The pipeline turns infrastructure changes into a standard code review workflow:

```yaml
# .github/workflows/terraform-pr.yml
name: terraform-pr
on: pull_request
permissions:
  id-token: write       # OIDC
  contents: read
  pull-requests: write  # plan comment
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: hashicorp/setup-terraform@v4
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.TF_PLAN_ROLE_ARN }}
          aws-region: us-east-1
      - run: terraform fmt -check -recursive
      - run: terraform -chdir=environments/staging init -input=false
      - run: terraform -chdir=environments/staging validate
      - run: pipx run checkov -d . --compact --quiet   # exits non-zero on failed checks
      - run: terraform -chdir=environments/staging plan -input=false -out=tfplan -no-color
      - run: terraform -chdir=environments/staging show -no-color tfplan | head -c 60000 > plan.txt
      - run: gh pr comment "$PR" --body-file plan.txt   # a comment holds at most 65,536 characters
        env:
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
```

**On pull request:** `terraform fmt -check`, `terraform validate`, the Checkov scan, then `terraform plan`, whose output the last step posts as a pull request comment so reviewers see exactly what will change. **Infracost** (`infracost breakdown --path .`, needs an `INFRACOST_API_KEY`) adds a cost estimate comment such as "This change will increase monthly cost by $23.40".

**On merge to main:** each environment is a job that references a GitHub Environment. Dev has no protection rules and applies immediately. Staging and production list required reviewers, and the job waits for approval. GitHub lets any one of the listed reviewers approve, so "2 approvals for production" is enforced where it can be: branch protection on `main` requires two approving reviews on the pull request.

**AWS authentication** uses OIDC through `aws-actions/configure-aws-credentials`, so no static access keys are stored in GitHub secrets. The IAM role's trust policy is scoped to the repository, and the apply role to the `main` branch or the environment.

**Weekly drift detection** runs `terraform plan -detailed-exitcode` on a schedule (exit code 2 means the real infrastructure differs from the code) and alerts Slack if anything changed outside of Terraform. This catches the "quick fix in the console" that never gets codified — exactly the pattern that caused the original infrastructure documentation problem.

### Step 5: On-Demand Environment Provisioning

```text
Create a script that provisions a complete isolated environment from scratch
for load testing or client demos. Accept a name and sizing tier, deploy
everything, output connection details, and set a TTL for auto-cleanup.
```

The provisioning script wraps Terraform workspaces with three sizing presets (small, medium, large) and adds operational guardrails:

```bash
# Provision a load-test environment
./provision.sh --name load-test-q1 --tier medium --ttl 7d

# Output:
# ALB URL: https://load-test-q1.internal.company.com
# Database: load-test-q1.abc123.us-east-1.rds.amazonaws.com
# Bastion: 10.0.5.42
# TTL: expires 7 days after creation
```

The TTL is the most important feature. The script passes the expiry date as a `ttl_expires` variable that the configuration exposes as an output and as a default tag on every resource. A scheduled pipeline job runs daily, reads `terraform output -raw ttl_expires` in each workspace and runs `terraform destroy` on the expired ones with the same OIDC role, so the cleanup goes through the same state and locking as the creation. No more forgotten load-test environments silently running up the AWS bill for months.

Provisioning takes under 15 minutes. Destruction is a single command with a confirmation prompt.

## Real-World Example

Three months after the migration to Terraform, the impact is visible across the engineering organization. The NAT gateway incident can't repeat — the route table associations are documented in code, and recreating the entire networking stack takes `terraform apply` and 8 minutes.

New environments spin up in 12 minutes instead of 2 days. The Checkov step in CI catches a teammate's PR that would have opened port 22 to the internet — blocked before merge, exactly the kind of misconfiguration that sat undetected for 8 months in the old world.

The weekly drift detection proves its value in week two: it catches a manual security group change made during an on-call incident. Instead of forgetting about it (the old pattern), the team codifies the change in Terraform through a proper PR. Infrastructure knowledge is no longer trapped in one person's head — it's in version-controlled code that anyone on the team can read, review, and modify.

## Related Skills

- **terraform-iac** — imports, modules, multi-environment layout, remote state and drift detection (Steps 1, 2 and 5).
- **checkov** — static scan of the Terraform code for open ports, unencrypted storage and similar misconfigurations (Step 3, and a CI gate in Step 4).
- **cicd-pipeline** — the GitHub Actions workflows for plan on pull request, gated apply and scheduled drift checks (Step 4).
