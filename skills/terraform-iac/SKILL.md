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
compatibility: "Terraform 1.5+ or OpenTofu 1.6+. Requires provider credentials (AWS, GCP, Azure, etc.)."
metadata:
  author: terminal-skills
  version: "1.0.0"
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
│   ├── dev/
│   │   ├── main.tf          # Environment-specific config
│   │   ├── variables.tf     # Environment variables
│   │   ├── terraform.tfvars  # Variable values
│   │   └── backend.tf       # State backend config
│   ├── staging/
│   └── production/
├── modules/
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── compute/
│   ├── database/
│   └── monitoring/
├── shared/
│   └── providers.tf         # Provider version constraints
└── README.md
```

For smaller projects, a flat structure is acceptable:
```
├── main.tf
├── variables.tf
├── outputs.tf
├── terraform.tfvars
└── backend.tf
```

### 2. Writing Resources

Follow these conventions:

```hcl
# Use meaningful resource names that describe purpose
resource "aws_instance" "api_server" {
  ami           = var.ami_id
  instance_type = var.instance_type

  # Group related arguments
  vpc_security_group_ids = [aws_security_group.api.id]
  subnet_id              = module.networking.private_subnet_ids[0]

  # Tags on everything
  tags = merge(var.common_tags, {
    Name = "${var.project}-api-${var.environment}"
    Role = "api-server"
  })

  # Lifecycle rules when needed
  lifecycle {
    create_before_destroy = true
    ignore_changes        = [ami]  # AMI updated by CI/CD
  }
}
```

**Naming conventions:**
- Resources: `snake_case`, descriptive (`web_server` not `ws1`)
- Variables: `snake_case`, prefixed by component when ambiguous (`db_instance_type`)
- Outputs: `snake_case`, prefixed by module name in root (`networking_vpc_id`)
- Files: group by logical component (`networking.tf`, `compute.tf`, `database.tf`)

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

variable "instance_type" {
  type        = string
  description = "EC2 instance type for the API server"
  default     = "t3.medium"

  validation {
    condition     = can(regex("^t3\\.", var.instance_type))
    error_message = "Only t3 instance types are allowed for cost control."
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
variable "name" {
  type        = string
  description = "Service name"
}

variable "container_image" {
  type        = string
  description = "Docker image URI"
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

# modules/ecs-service/main.tf
resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory

  container_definitions = jsonencode([{
    name      = var.name
    image     = var.container_image
    essential = true
    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = var.name
      }
    }
  }])
}

# Usage in root
module "api" {
  source          = "./modules/ecs-service"
  name            = "api"
  container_image = "123456.dkr.ecr.us-east-1.amazonaws.com/api:latest"
  cpu             = 512
  memory          = 1024
}
```

**Module guidelines:**
- One module per logical component (networking, compute, database, monitoring)
- Expose only necessary variables — sensible defaults for everything else
- Always define outputs for values other modules need
- Pin module source versions: `source = "git::https://...?ref=v1.2.0"`

### 5. State Management

**Remote state (required for teams):**

```hcl
# AWS S3 backend
terraform {
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "env/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

**State operations:**
```bash
# List all resources in state
terraform state list

# Show details of a resource
terraform state show aws_instance.api_server

# Move a resource (rename without recreate)
terraform state mv aws_instance.old_name aws_instance.new_name

# Import existing infrastructure
terraform import aws_instance.api_server i-0abc123def456

# Remove from state (without destroying)
terraform state rm aws_instance.temp_server
```

**State safety:**
- Always use remote state with locking (DynamoDB for S3, GCS native for GCP)
- Never edit state files manually
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

Each environment references shared modules with different variable values.

**Option C: Terragrunt** (DRY multi-environment):
```hcl
# terragrunt.hcl
terraform {
  source = "../../modules//networking"
}

inputs = {
  environment   = "production"
  vpc_cidr      = "10.0.0.0/16"
  az_count      = 3
}
```

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

Terraform 1.5+ supports import blocks:
```hcl
import {
  to = aws_instance.api_server
  id = "i-0abc123def456"
}
```

Generate config automatically:
```bash
terraform plan -generate-config-out=generated.tf
```

### 8. CI/CD Integration

```yaml
# GitHub Actions
- name: Terraform Plan
  run: |
    terraform init
    terraform plan -out=tfplan -no-color
    
- name: Terraform Apply
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

**Best practices for CI/CD:**
- Always run `plan` on PRs, `apply` only on merge to main
- Use `-out=tfplan` to ensure apply matches the reviewed plan
- Store plan artifacts for audit trails
- Use OIDC for cloud credentials (no static keys in CI)
- Add cost estimation with Infracost: `infracost breakdown --path .`

### 9. Security

- Never commit `.tfvars` files with secrets — use environment variables or a secrets manager
- Use `sensitive = true` on variables containing secrets
- Enable encryption on state backends
- Use IAM roles with least privilege for Terraform execution
- Scan configs with `tfsec`, `checkov`, or `trivy config`
- Pin provider versions: `required_providers { aws = { version = "~> 5.0" } }`

## Examples

### Example 1: Full AWS VPC + ECS Setup

**Input:** "Set up a production VPC with public/private subnets across 3 AZs, a NAT gateway, an ECS Fargate cluster running our API service behind an ALB, and a PostgreSQL RDS instance in the private subnet. Include security groups that only allow necessary traffic."

**Output:** Complete Terraform config with:
- VPC module: 3 public + 3 private subnets, NAT gateway, route tables, flow logs
- ECS module: Fargate cluster, task definition, service with ALB target group
- RDS module: PostgreSQL Multi-AZ, encrypted, private subnet group, automated backups
- Security groups: ALB (80/443 from internet) → ECS (8080 from ALB only) → RDS (5432 from ECS only)
- Outputs: ALB DNS name, RDS endpoint, ECS cluster ARN

### Example 2: Multi-Cloud with Modules

**Input:** "We're running on both AWS and GCP. Create Terraform modules for: a Kubernetes cluster (EKS on AWS, GKE on GCP), a managed database (RDS on AWS, Cloud SQL on GCP), and a CDN (CloudFront on AWS, Cloud CDN on GCP). Each module should have the same interface so we can swap providers."

**Output:** Standardized modules with identical input/output interfaces:
- `modules/kubernetes/aws/` and `modules/kubernetes/gcp/` — both accept `cluster_name`, `node_count`, `node_type`, output `cluster_endpoint`, `kubeconfig`
- `modules/database/aws/` and `modules/database/gcp/` — both accept `engine`, `size`, output `connection_string`
- `modules/cdn/aws/` and `modules/cdn/gcp/` — both accept `origin_url`, `domain`, output `cdn_url`
- Provider selection via a single variable: `cloud_provider = "aws"` or `"gcp"`

## Guidelines

- Always run `terraform fmt` before committing — consistent formatting
- Run `terraform validate` to catch syntax errors early
- Use `terraform plan` as a review tool — never apply without reviewing the plan
- Prefer `for_each` over `count` — it handles additions/removals without index shifting
- Use `data` sources to reference existing resources, not hardcoded IDs
- Tag every resource with at least: Project, Environment, ManagedBy, Team
- Keep modules focused — one module should do one thing well
- Document modules with a README.md including usage examples
- Use `moved` blocks for refactoring without destroying resources
- For large configs: split into smaller state files by component (networking, compute, data)
- Pin all provider and module versions for reproducible builds
- Use `terraform-docs` to auto-generate module documentation
