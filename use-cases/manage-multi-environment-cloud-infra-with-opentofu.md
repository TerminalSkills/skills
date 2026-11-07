---
title: Manage Multi-Environment Cloud Infrastructure with OpenTofu and Terragrunt
slug: manage-multi-environment-cloud-infra-with-opentofu
description: Set up a production-grade infrastructure pipeline using OpenTofu for provisioning with client-side state encryption, and Terragrunt for DRY multi-environment management — deploying identical stacks across dev, staging, and production AWS accounts with dependency ordering, automated drift detection, and infrastructure cost estimation.
skills: [opentofu, terragrunt, terraform-iac]
category: devops
tags: [iac, cloud, aws, multi-environment, infrastructure, devops, automation]
---

# Manage Multi-Environment Cloud Infrastructure with OpenTofu and Terragrunt

Marco is a platform engineer at a 30-person startup scaling from one AWS account to three (dev, staging, prod). The current setup: a single Terraform directory with environment-specific `.tfvars` files, shared state in S3 without encryption, and manual `terraform apply` from a developer's laptop. Last week, someone ran `terraform destroy` in the wrong workspace and took down staging for 4 hours.

Marco rebuilds the infrastructure pipeline using OpenTofu (for state encryption and open-source freedom) and Terragrunt (for DRY configurations across environments with dependency management).

## Step 1: Repository Structure

Terragrunt 1.x expects the shared root file to be named `root.hcl`, so it is never mistaken for a unit. Every directory with a `terragrunt.hcl` is a unit with its own state.

```text
infrastructure/
├── root.hcl                              # Remote state, provider, encryption
├── modules/                              # Plain OpenTofu modules (work with `tofu apply` too)
│   ├── vpc/  ecs-cluster/  ecs-service/  rds/  monitoring/
├── dev/
│   ├── account.hcl                       # locals { account_id = "111111111111" }
│   └── us-east-1/
│       ├── region.hcl                    # locals { region = "us-east-1" }
│       ├── env.hcl                       # locals { environment = "dev" }
│       ├── vpc/terragrunt.hcl
│       ├── ecs-cluster/terragrunt.hcl
│       ├── api/terragrunt.hcl
│       ├── database/terragrunt.hcl
│       └── monitoring/terragrunt.hcl
├── staging/...                           # Same structure, different inputs
└── production/...                        # Same structure, larger sizes
```

## Step 2: Root Configuration

The root file generates the S3 backend and the provider for every unit. State encryption is OpenTofu's own `encryption` block, which encrypts state and plan files before they reach S3 (the S3 `encrypt = true` setting only encrypts at rest on the server side).

```hcl
# infrastructure/root.hcl
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
  env_vars     = read_terragrunt_config(find_in_parent_folders("env.hcl"))

  account_id  = local.account_vars.locals.account_id
  region      = local.region_vars.locals.region
  environment = local.env_vars.locals.environment
  project     = "saasapp"
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket       = "${local.project}-tfstate-${local.account_id}"
    key          = "${local.region}/${path_relative_to_include()}/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true      # S3-native locking (OpenTofu 1.10+); no DynamoDB table needed
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    terraform {
      required_version = ">= 1.10.0"

      encryption {
        key_provider "aws_kms" "state_key" {
          kms_key_id = "alias/${local.project}-state-key"
          key_spec   = "AES_256"
          region     = "us-east-1"
        }
        method "aes_gcm" "main" {
          keys = key_provider.aws_kms.state_key
        }
        state {
          method   = method.aes_gcm.main
          enforced = true
        }
        plan {
          method   = method.aes_gcm.main
          enforced = true
        }
      }
    }

    provider "aws" {
      region              = "${local.region}"
      allowed_account_ids = ["${local.account_id}"]

      default_tags {
        tags = {
          Project     = "${local.project}"
          Environment = "${local.environment}"
          ManagedBy   = "opentofu"
        }
      }
    }
  EOF
}

inputs = {
  project     = local.project
  environment = local.environment
  region      = local.region
}
```

`allowed_account_ids` makes a plan fail outright if the credentials belong to a different AWS account, which is the guard against the "wrong environment" accident from the intro. Do not rename the key provider or method once state is encrypted; their names are stored in the state files.

The first run needs the state bucket and KMS key to exist. Terragrunt 1.x no longer creates the bucket on its own: run `terragrunt run --all --backend-bootstrap plan` once per account (or `terragrunt backend bootstrap` in a unit). Create the KMS key and its `alias/saasapp-state-key` yourself first; Terragrunt does not manage it.

## Step 3: Units with Dependencies

```hcl
# infrastructure/production/us-east-1/api/terragrunt.hcl
include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../../modules/ecs-service"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id             = "vpc-00000000"
    private_subnet_ids = ["subnet-00000001", "subnet-00000002"]
    alb_listener_arn   = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener/app/mock/0/0"
  }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

dependency "cluster" {
  config_path = "../ecs-cluster"
  mock_outputs                            = { cluster_id = "mock-cluster" }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

dependency "database" {
  config_path = "../database"
  mock_outputs                            = { secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:mock" }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

inputs = {
  service_name = "api"
  cluster_id   = dependency.cluster.outputs.cluster_id
  vpc_id       = dependency.vpc.outputs.vpc_id
  subnet_ids   = dependency.vpc.outputs.private_subnet_ids
  listener_arn = dependency.vpc.outputs.alb_listener_arn

  container_image = "111111111111.dkr.ecr.us-east-1.amazonaws.com/api:2.14.0"
  container_port  = 3000

  desired_count = 3                       # production sizing; dev uses 1
  cpu           = 1024
  memory        = 2048

  environment_variables = {
    NODE_ENV  = "production"
    LOG_LEVEL = "info"
  }

  # The task reads the database credentials from Secrets Manager at start-up,
  # so no connection string lands in the task definition or in state.
  secrets = {
    DATABASE_SECRET = dependency.database.outputs.secret_arn
  }

  health_check_path = "/health"
}
```

`mock_outputs` let `plan` run before a dependency has been applied; `apply` is deliberately left out of the allowed commands, so a missing dependency stops the run instead of deploying against fake values. Pin the image to a tag (or digest), never `latest`.

To see what Terragrunt will do and in which order:

```console
$ cd infrastructure/production/us-east-1
$ terragrunt list --dag --tree
$ terragrunt run --all plan
```

Marco's existing resources are not rebuilt: the **terraform-iac** workflow for brownfield infrastructure applies. He writes an `import { to = ..., id = ... }` block in the module, runs `terragrunt plan` to review the import in a normal plan, and adjusts the code until the plan shows no changes. He pins provider versions (`version = "~> 6.0"`) in each module's `required_providers`, commits the `.terraform.lock.hcl` files, and scans the modules with `trivy config` before merging.

## Step 4: CI/CD Pipeline

Static AWS keys in CI secrets are replaced by GitHub OIDC: each environment has a role (`TerraformExecutionRole`) in its own account that trusts the repository, and the job assumes it with `aws-actions/configure-aws-credentials`.

```yaml
# .github/workflows/infrastructure.yml
name: Infrastructure
on:
  push:
    branches: [main]
    paths: [infrastructure/**]
  pull_request:
    paths: [infrastructure/**]

permissions:
  id-token: write
  contents: read

env:
  ACCOUNT_IDS: '{"dev":"111111111111","staging":"222222222222","production":"333333333333"}'

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, staging, production]
    steps:
      - uses: actions/checkout@v7
      - uses: gruntwork-io/terragrunt-action@v3
        with:                              # no tg_command: installs the tools only
          tg_version: "1.2.1"
          tofu_version: "1.13.9"
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::${{ fromJSON(env.ACCOUNT_IDS)[matrix.environment] }}:role/TerraformExecutionRole
          aws-region: us-east-1
      - name: Plan all units
        working-directory: infrastructure/${{ matrix.environment }}/us-east-1
        run: terragrunt run --all --non-interactive plan

  apply:
    if: github.ref == 'refs/heads/main'
    needs: plan
    runs-on: ubuntu-latest
    strategy:
      max-parallel: 1                      # dev, then staging, then production
      matrix:
        environment: [dev, staging, production]
    environment: ${{ matrix.environment }} # production requires a reviewer
    steps:
      - uses: actions/checkout@v7
      - uses: gruntwork-io/terragrunt-action@v3
        with:
          tg_version: "1.2.1"
          tofu_version: "1.13.9"
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::${{ fromJSON(env.ACCOUNT_IDS)[matrix.environment] }}:role/TerraformExecutionRole
          aws-region: us-east-1
      - name: Apply all units
        working-directory: infrastructure/${{ matrix.environment }}/us-east-1
        run: terragrunt run --all --non-interactive apply
```

`run --all apply` adds `-auto-approve` to every unit itself, which is why the reviewed `plan` job and the production environment approval matter. Terragrunt 1.x renamed the old `--terragrunt-non-interactive` flag to `--non-interactive` and `run-all` to `run --all`; pipelines written for 0.x need those edits.

## Step 5: Drift Detection and Cost Estimates

A weekly job runs the plan with OpenTofu's `-detailed-exitcode`, which exits 2 when the real infrastructure differs from the code. Terragrunt passes that exit code through `run --all`, so the job fails and notifies the team:

```yaml
# .github/workflows/drift.yml (same setup steps as the plan job)
on:
  schedule:
    - cron: "0 6 * * 1"
jobs:
  drift:
    # ... checkout, terragrunt-action, configure-aws-credentials ...
    steps:
      - name: Detect drift
        working-directory: infrastructure/production/us-east-1
        run: terragrunt run --all --non-interactive -- plan -detailed-exitcode
```

For cost, the `infracost/actions/diff@v5` action compares the base and head checkouts of a pull request and comments the monthly cost change; it needs an `INFRACOST_API_KEY` secret.

## Results

Marco's team now has the same stack in three AWS accounts. Each account has its own state, its own role and its own approval gate, and `allowed_account_ids` stops a plan from running against the wrong account.

- **Duplication**: one set of modules plus short `terragrunt.hcl` files per environment instead of per-environment copies and `.tfvars` files
- **State security**: state and plan files are encrypted client-side with a KMS key; losing access to that key means losing the state, so the key policy is part of the recovery plan
- **Deployments**: no more `apply` from a laptop; every change goes through a plan on the pull request and an approved apply on merge
- **Drift**: the weekly job turns manual console changes into a failed check instead of a surprise during the next apply

## Related Skills

- **opentofu** -- client-side state and plan encryption, S3-native locking, the `tofu` workflow
- **terragrunt** -- `root.hcl`, generated backend and provider, `dependency` blocks, `run --all`
- **terraform-iac** -- importing existing resources, provider pinning, CI practices and security scanning
