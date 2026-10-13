---
name: terraform-iac
description: >-
  Manages cloud infrastructure using Terraform (and OpenTofu). Use when the
  user wants to write Terraform configurations, provision cloud resources,
  manage state, create modules, set up multi-environment deployments,
  import existing infrastructure, debug plan/apply errors, migrate between
  providers, or implement IaC best practices. Trigger words: terraform,
  opentofu, infrastructure as code, IaC, tf, hcl, terraform module,
  terraform state, terraform plan, terraform apply, terraform import,
  cloud provisioning, AWS terraform, GCP terraform, Azure terraform.
license: Apache-2.0
compatibility: "Terraform 1.11+ or OpenTofu 1.10+. Requires provider credentials (AWS, GCP, Azure, etc.)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/hashicorp/terraform"
  category: devops
  tags: ["terraform", "infrastructure-as-code", "cloud", "devops"]
---

# Terraform IaC

## Overview

Writes, reviews, and manages Terraform/OpenTofu configurations for cloud infrastructure. Covers resource definitions, modules, state management, multi-environment setups, CI/CD integration, drift detection, and migration from manual infrastructure to code. Supports AWS, GCP, Azure, and other providers.

## Instructions

### 1. Project Structure

Standard Terraform project layout:

```
infrastructure/
├── environments/
│   ├── dev/          # main.tf, variables.tf, terraform.tfvars, backend.tf
│   ├── staging/
│   └── production/
├── modules/
│   ├── networking/   # main.tf, variables.tf, outputs.tf
│   ├── compute/
│   └── database/
└── README.md
```

Small projects can keep `main.tf`, `variables.tf`, `outputs.tf` and `backend.tf` in one directory.

### 2. Writing Resources

Follow these conventions:

```hcl
resource "aws_instance" "api_server" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.api.id]
  subnet_id              = module.networking.private_subnet_ids[0]

  tags = merge(var.common_tags, {
    Name = "${var.project}-api-${var.environment}"
  })

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [ami]  # AMI updated by CI/CD
  }
}
```

**Naming:** `snake_case` everywhere, descriptive (`web_server` not `ws1`), files grouped by component (`networking.tf`, `database.tf`).

### 3. Variables and Validation

Always define type, description, and validation:

```hcl
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, production)"
  
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

# Use locals for computed values
locals {
  name_prefix = "${var.project}-${var.environment}"
  is_prod     = var.environment == "production"
  
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Team        = var.team
  }
}
```

### 4. Modules

Write reusable modules for repeated patterns:

```hcl
# modules/ecs-service/variables.tf
variable "name"            { type = string }
variable "container_image" { type = string }
variable "container_port" {
  type    = number
  default = 8080
}
variable "cpu" {
  type    = number
  default = 256
}
variable "memory" {
  type    = number
  default = 512
}

# modules/ecs-service/main.tf (excerpt)
data "aws_region" "current" {}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory

  container_definitions = jsonencode([{
    name         = var.name
    image        = var.container_image
    essential    = true
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = data.aws_region.current.region
        "awslogs-stream-prefix" = var.name
      }
    }
  }])
}

# Usage in root
module "api" {
  source          = "./modules/ecs-service"
  name            = "api"
  container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/api:1.8.2"
  cpu             = 512
  memory          = 1024
}
```

**Module guidelines:**
- One module per logical component (networking, compute, database, monitoring)
- Always define outputs for values other modules need
- Pin module versions: `?ref=v1.2.0` on git sources, `version = "~> 1.2"` on registry modules

### 5. State Management

**Remote state (required for teams):**

```hcl
# AWS S3 backend
terraform {
  backend "s3" {
    bucket       = "northwind-terraform-state"
    key          = "env/production/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true   # native S3 locking (Terraform 1.11+, OpenTofu 1.10+)
    encrypt      = true
  }
}
```

The `dynamodb_table` argument is deprecated; existing setups keep working, and you can migrate by enabling `use_lockfile` alongside it, applying, then removing the DynamoDB table. Backend blocks cannot reference variables, so pass differing values with `terraform init -backend-config=production.s3.tfbackend`.

**State operations:**
```bash
terraform state list

# Move a resource (rename without recreate)
terraform state mv aws_instance.old_name aws_instance.new_name

# Import existing infrastructure
terraform import aws_instance.api_server i-0abc123def456

# Remove from state (without destroying)
terraform state rm aws_instance.temp_server
```

**State safety:**
- Always use remote state with locking (S3 `use_lockfile`, GCS locks natively)
- Never edit state files manually; state holds secrets in plain text, so restrict access
- Use `terraform plan` before every `apply`
- Enable state versioning on the storage bucket

### 6. Multi-Environment Strategy

**Option A: Workspaces** (simple, same config):
```bash
terraform workspace new staging
terraform workspace select production
terraform apply -var-file="production.tfvars"
```

**Option B: Directory per environment** (recommended, different configs):
```
environments/dev/     → smaller instances, single AZ
environments/staging/ → mirrors prod at smaller scale
environments/prod/    → full HA, multi-AZ, larger instances
```


**Option C: Terragrunt** (a separate tool that keeps backend and inputs DRY across directories; see its docs).

### 7. Import Existing Infrastructure

For brownfield environments:

```bash
# 1. Write the resource block first
# 2. Import the real resource into state
terraform import aws_vpc.main vpc-0abc123

# 3. Run plan to see drift
terraform plan

# 4. Adjust config until plan shows no changes
```

Import blocks (1.5+) make imports reviewable in a normal plan; `for_each` in import blocks arrived in 1.7:
```hcl
import {
  to = aws_instance.api_server
  id = "i-0abc123def456"
}
```

Generate a first draft of the resource config (the file must not already exist), then review and trim it:
```bash
terraform plan -generate-config-out=generated.tf
```

### 8. CI/CD Integration

```yaml
# GitHub Actions
- uses: hashicorp/setup-terraform@v3
- name: Terraform Plan
  run: |
    terraform init -input=false
    terraform plan -input=false -out=tfplan -no-color

- name: Terraform Apply
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

**Best practices for CI/CD:**
- Run `plan` on PRs, `apply` only on merge to main, applying the saved `-out=tfplan`
- Use OIDC for cloud credentials (no static keys in CI)
- Add cost estimation with Infracost: `infracost breakdown --path .`
- Run `terraform test` (1.6+) for modules with `.tftest.hcl` files

### 9. Security

- Never commit `.tfvars` files with secrets; use `sensitive = true`, environment variables or a secrets manager, least-privilege IAM roles and encrypted state backends
- Scan configs with `trivy config` (tfsec was folded into Trivy) or `checkov`
- Pin provider versions: `required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }`; commit `.terraform.lock.hcl`
- Keep secrets out of state where possible: ephemeral values and write-only arguments (1.10/1.11+) are never stored, if the provider supports them
- Terraform is under the BSL license; OpenTofu is the MPL-licensed fork and uses the `tofu` command with the same workflow

## Examples

### Example 1: Full AWS VPC + ECS Setup

**Input:** "Set up a production VPC with public/private subnets across 3 AZs, a NAT gateway, an ECS Fargate cluster running our API service behind an ALB, and a PostgreSQL RDS instance in the private subnet. Include security groups that only allow necessary traffic."

**Output:** `modules/vpc`, `modules/ecs-service`, `modules/rds` wired from `environments/production/main.tf`: 3 public + 3 private subnets, NAT gateway, Fargate service behind an ALB, encrypted Multi-AZ PostgreSQL, security groups chained ALB (80/443) → ECS (8080) → RDS (5432). Outputs: ALB DNS name, RDS endpoint. `terraform plan` ends with a summary like `Plan: 47 to add, 0 to change, 0 to destroy.`

### Example 2: Multi-Cloud with Modules

**Input:** "We're running on both AWS and GCP. Create Terraform modules for: a Kubernetes cluster (EKS on AWS, GKE on GCP), a managed database (RDS on AWS, Cloud SQL on GCP), and a CDN (CloudFront on AWS, Cloud CDN on GCP). Each module should have the same interface so we can swap providers."

**Output:** `modules/kubernetes/{aws,gcp}`, `modules/database/{aws,gcp}`, `modules/cdn/{aws,gcp}`, each pair with identical variables (`cluster_name`, `node_count`; `engine`, `size`; `origin_url`, `domain`) and outputs (`cluster_endpoint`, `connection_string`, `cdn_url`), chosen by one `cloud_provider` variable.

## Guidelines

- Run `terraform fmt` and `terraform validate` before committing; use `terraform plan` as a review tool — never apply without reviewing the plan
- Prefer `for_each` over `count` — it handles additions/removals without index shifting
- Use `moved` blocks for refactoring without destroying resources, and `removed` blocks (1.7+) to drop a resource from state without destroying it
- For large configs: split into smaller state files by component (networking, compute, data)
- Use `terraform-docs` to generate module documentation
