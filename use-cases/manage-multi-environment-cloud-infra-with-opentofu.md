---
title: Manage Multi-Environment Cloud Infrastructure with OpenTofu and Terragrunt
slug: manage-multi-environment-cloud-infra-with-opentofu
description: Set up a production-grade infrastructure pipeline using OpenTofu for provisioning with client-side state encryption, and Terragrunt for DRY multi-environment management — deploying identical stacks across dev, staging, and production AWS accounts with dependency ordering, automated drift detection, and infrastructure cost estimation.
skills: [opentofu, terragrunt, terraform-aws]
category: Infrastructure & DevOps
tags: [iac, cloud, aws, multi-environment, infrastructure, devops, automation]
---

# Manage Multi-Environment Cloud Infrastructure with OpenTofu and Terragrunt

Marco is a platform engineer at a 30-person startup scaling from one AWS account to three (dev, staging, prod). The current setup: a single Terraform directory with environment-specific `.tfvars` files, shared state in S3 without encryption, and manual `terraform apply` from a developer's laptop. Last week, someone ran `terraform destroy` in the wrong workspace and took down staging for 4 hours.

Marco rebuilds the infrastructure pipeline using OpenTofu (for state encryption and open-source freedom) and Terragrunt (for DRY configurations across environments with dependency management).

## Step 1: Repository Structure

```markdown
## Directory Layout

infrastructure/
├── terragrunt.hcl                        # Root: remote state, provider config
├── modules/                              # Reusable OpenTofu modules
│   ├── vpc/
│   │   ├── main.tf                       # VPC, subnets, NAT, route tables
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── ecs-cluster/
│   │   ├── main.tf                       # ECS cluster, capacity providers
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── ecs-service/
│   │   ├── main.tf                       # Task def, service, ALB target
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── rds/
│   │   ├── main.tf                       # RDS PostgreSQL, parameter groups
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── monitoring/
│       ├── main.tf                       # CloudWatch dashboards, alarms, SNS
│       ├── variables.tf
│       └── outputs.tf
│
├── dev/
│   ├── account.hcl                       # AWS account ID for dev
│   └── us-east-1/
│       ├── region.hcl
│       ├── env.hcl                       # environment = "dev"
│       ├── vpc/terragrunt.hcl
│       ├── ecs-cluster/terragrunt.hcl
│       ├── api/terragrunt.hcl
│       ├── worker/terragrunt.hcl
│       ├── database/terragrunt.hcl
│       └── monitoring/terragrunt.hcl
│
├── staging/                              # Same structure, different inputs
│   ├── account.hcl
│   └── us-east-1/...
│
└── production/
    ├── account.hcl
    └── us-east-1/...                     # + us-west-2/ for multi-region
```

## Step 2: Root Terragrunt Configuration

```hcl
# infrastructure/terragrunt.hcl — Inherited by all child modules
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
  env_vars     = read_terragrunt_config(find_in_parent_folders("env.hcl"))

  account_id   = local.account_vars.locals.account_id
  region       = local.region_vars.locals.region
  environment  = local.env_vars.locals.environment
  project      = "saasapp"
}

# Remote state: unique key per module, encrypted at rest
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = "${local.project}-tfstate-${local.account_id}"
    key            = "${local.environment}/${local.region}/${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"                    # State always in us-east-1
    encrypt        = true
    dynamodb_table = "${local.project}-tfstate-lock"

    s3_bucket_tags = {
      Name        = "OpenTofu State"
      Environment = local.environment
    }
  }
}

# Generate provider with assumed role per account
generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    terraform {
      required_version = ">= 1.6.0"

      # Client-side state encryption (OpenTofu exclusive)
      encryption {
        key_provider "aws_kms" "state_key" {
          kms_key_id = "alias/${local.project}-state-key"
          region     = "us-east-1"
        }
        method "aes_gcm" "encrypt" {
          keys = key_provider.aws_kms.state_key
        }
        state {
          method   = method.aes_gcm.encrypt
          enforced = true
        }
      }
    }

    provider "aws" {
      region = "${local.region}"

      assume_role {
        role_arn = "arn:aws:iam::${local.account_id}:role/TerraformExecutionRole"
      }

      default_tags {
        tags = {
          Project     = "${local.project}"
          Environment = "${local.environment}"
          ManagedBy   = "opentofu"
          Module      = "${path_relative_to_include()}"
        }
      }
    }
  EOF
}

# Inputs available to all modules
inputs = {
  project     = local.project
  environment = local.environment
  region      = local.region
}
```

## Step 3: Module Configurations with Dependencies

```hcl
# infrastructure/production/us-east-1/api/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../modules/ecs-service"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {                        # For `plan` before vpc exists
    vpc_id             = "vpc-mock"
    private_subnet_ids = ["subnet-a", "subnet-b"]
    alb_listener_arn   = "arn:aws:elasticloadbalancing:mock"
  }
}

dependency "cluster" {
  config_path = "../ecs-cluster"
  mock_outputs = {
    cluster_id   = "cluster-mock"
    cluster_name = "mock-cluster"
  }
}

dependency "database" {
  config_path = "../database"
  mock_outputs = {
    connection_string = "postgresql://mock:5432/app"
    secret_arn        = "arn:aws:secretsmanager:mock"
  }
}

inputs = {
  service_name = "api"
  cluster_id   = dependency.cluster.outputs.cluster_id
  vpc_id       = dependency.vpc.outputs.vpc_id
  subnet_ids   = dependency.vpc.outputs.private_subnet_ids
  listener_arn = dependency.vpc.outputs.alb_listener_arn

  container_image = "111111111111.dkr.ecr.us-east-1.amazonaws.com/api"
  container_port  = 3000

  # Environment-specific sizing
  desired_count = 3                       # Production: 3 instances
  cpu           = 1024                    # 1 vCPU
  memory        = 2048                    # 2 GB

  environment_variables = {
    NODE_ENV     = "production"
    DATABASE_URL = dependency.database.outputs.connection_string
    LOG_LEVEL    = "info"
  }

  secrets = {
    DATABASE_SECRET = dependency.database.outputs.secret_arn
  }

  health_check_path = "/health"
  autoscaling = {
    min_capacity       = 3
    max_capacity       = 10
    cpu_target_percent = 70
  }
}
```

## Step 4: CI/CD Pipeline

```yaml
# .github/workflows/infrastructure.yml
name: Infrastructure
on:
  push:
    branches: [main]
    paths: [infrastructure/**]
  pull_request:
    paths: [infrastructure/**]

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, staging, production]
    steps:
      - uses: actions/checkout@v4
      - uses: opentofu/setup-opentofu@v1
      - uses: gruntwork-io/terragrunt-action@v2

      - name: Plan all modules
        working-directory: infrastructure/${{ matrix.environment }}/us-east-1
        run: terragrunt run-all plan --terragrunt-non-interactive -out=tfplan
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

  apply:
    if: github.ref == 'refs/heads/main'
    needs: plan
    runs-on: ubuntu-latest
    strategy:
      max-parallel: 1                     # Deploy sequentially: dev → staging → prod
      matrix:
        environment: [dev, staging, production]
    environment: ${{ matrix.environment }}  # Requires approval for production
    steps:
      - uses: actions/checkout@v4
      - uses: opentofu/setup-opentofu@v1

      - name: Apply all modules
        working-directory: infrastructure/${{ matrix.environment }}/us-east-1
        run: terragrunt run-all apply --terragrunt-non-interactive
```

## Results

Marco's team has identical, reproducible infrastructure across three AWS accounts. No one can accidentally destroy the wrong environment because each account has its own state, credentials, and approval gates.

- **Deployment time**: 45 minutes (manual) → 12 minutes (automated, parallel modules)
- **Configuration drift**: 23 drifted resources → 0 (weekly drift detection cron)
- **State security**: Unencrypted S3 → KMS-encrypted client-side (OpenTofu exclusive)
- **Code duplication**: 3,200 lines of duplicated `.tf` → 800 lines of modules + 200 lines of Terragrunt configs
- **MTTR for outages**: 4 hours (recreate manually) → 15 minutes (`terragrunt run-all apply` from clean state)
- **Cost visibility**: Infracost runs on every PR showing cost delta before merge
