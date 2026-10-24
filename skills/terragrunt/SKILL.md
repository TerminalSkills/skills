---
name: terragrunt
description: >-
  Terragrunt is a thin wrapper around OpenTofu and Terraform that keeps
  configuration DRY, generates remote-state backends and providers, and runs
  many modules in dependency order. Use it when a user asks how to share
  backend and provider settings across environments or AWS accounts, wire
  outputs between modules with dependency blocks, run plan or apply across a
  whole directory tree (run --all), add hooks, or migrate from run-all and the
  old terragrunt- flags to the 1.x CLI.
license: Apache-2.0
compatibility: Terragrunt 1.x (1.2.1 checked on 2026-10-24) and OpenTofu or Terraform on PATH
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/gruntwork-io/terragrunt
  tags:
    - iac
    - terraform
    - opentofu
    - dry
    - multi-environment
---

# Terragrunt — DRY Terraform/OpenTofu Wrapper

## Overview

Terragrunt reads a `terragrunt.hcl` in each directory (a "unit"), downloads the module named in `terraform { source }`, generates backend and provider files, passes `inputs` as variables, and then runs `tofu` or `terraform`. A `run --all` command walks a directory tree and runs every unit in dependency order. This skill follows the 1.x CLI: flags no longer start with `terragrunt-`, environment variables start with `TG_`, `run-all` is replaced by `run --all`, and the shared root file is named `root.hcl`, not `terragrunt.hcl`.

## Instructions

### 1. Install

```bash
brew install terragrunt          # or: mise use terragrunt
terragrunt --version
```

Terragrunt also needs OpenTofu or Terraform. By default it finds `tofu` or `terraform` on `PATH`; pick one explicitly with `--tf-path` or `TG_TF_PATH=/usr/local/bin/tofu`. When downloading a release archive instead, check it against the `SHA256SUMS` file on the releases page before extracting. Do not pipe an install script into a shell.

### 2. Layout

```text
infrastructure/
├── root.hcl                  # shared remote_state, provider generation, locals
├── modules/                  # plain OpenTofu/Terraform modules
│   ├── vpc/
│   └── ecs-service/
└── production/
    ├── account.hcl           # locals { account_id = "111111111111" }
    └── us-east-1/
        ├── region.hcl        # locals { region = "us-east-1" }
        ├── env.hcl           # locals { environment = "production" }
        ├── vpc/terragrunt.hcl
        ├── database/terragrunt.hcl
        └── api/terragrunt.hcl
```

### 3. Root configuration

Name the shared file `root.hcl` so that Terragrunt never mistakes it for a unit.

```hcl
# infrastructure/root.hcl
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
  env_vars     = read_terragrunt_config(find_in_parent_folders("env.hcl"))

  account_id  = local.account_vars.locals.account_id
  region      = local.region_vars.locals.region
  environment = local.env_vars.locals.environment
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket       = "northwind-terraform-state-${local.account_id}"
    key          = "${path_relative_to_include()}/terraform.tfstate"
    region       = local.region
    encrypt      = true
    use_lockfile = true    # native S3 locking, needs OpenTofu >= 1.10; older setups use dynamodb_table
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "aws" {
  region              = "${local.region}"
  allowed_account_ids = ["${local.account_id}"]
  default_tags {
    tags = {
      Environment = "${local.environment}"
      ManagedBy   = "terragrunt"
    }
  }
}
EOF
}
```

### 4. A unit with dependencies

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

  mock_outputs                            = { vpc_id = "vpc-00000000", private_subnet_ids = ["subnet-00000000"] }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

dependency "database" {
  config_path = "../database"

  mock_outputs                            = { connection_string = "postgres://mock" }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

inputs = {
  service_name    = "api"
  vpc_id          = dependency.vpc.outputs.vpc_id
  subnet_ids      = dependency.vpc.outputs.private_subnet_ids
  database_url    = dependency.database.outputs.connection_string
  desired_count   = 3
  container_image = "northwind/api:2.14.0"
}
```

Always name the include block (`include "root"`); the unnamed form is deprecated. `mock_outputs` let `plan` work before the dependency has been applied; keep `apply` out of the allowed list.

### 5. Commands

```bash
cd infrastructure/production/us-east-1/api
terragrunt plan
terragrunt apply

cd ..                                         # whole region, dependency order
terragrunt run --all plan
terragrunt run --all --non-interactive apply
terragrunt run --all --filter './api' --filter './database' -- plan
terragrunt run --all --parallelism 2 -- apply
terragrunt dag graph | dot -Tpng > deps.png   # DOT output
terragrunt list --dag --tree                  # units and dependencies
```

Terragrunt 1.x no longer creates backend resources (the S3 bucket) on its own. Pass `--backend-bootstrap` (or `TG_BACKEND_BOOTSTRAP=true`) the first time, or run `terragrunt backend bootstrap`.

### 6. Hooks

```hcl
terraform {
  before_hook "tflint" {
    commands = ["plan", "apply"]
    execute  = ["tflint", "--chdir", "."]
  }
}
```

## Examples

### Example 1: "Add a staging environment that reuses the production modules"

Copy `production/` to `staging/`, change `account_id`, `environment` and the sizes in `inputs` (for example `desired_count = 1`). Nothing else changes: backend keys come from `path_relative_to_include()`, so staging state never collides with production. Verify with `cd infrastructure/staging/us-east-1 && terragrunt run --all plan`.

### Example 2: "I upgraded Terragrunt and `run-all` complains about flags"

Rewrite the old commands: `terragrunt run-all plan` becomes `terragrunt run --all plan`; `--terragrunt-non-interactive` becomes `--non-interactive`; `--terragrunt-include-dir api` becomes `--queue-include-dir api` (an alias of `--filter`); `--terragrunt-working-dir` becomes `--working-dir`; `TERRAGRUNT_TFPATH` becomes `TG_TF_PATH`; `graph-dependencies` becomes `dag graph`. Rename the root `terragrunt.hcl` to `root.hcl` and change `find_in_parent_folders()` to `find_in_parent_folders("root.hcl")`.

## Guidelines

- One state per unit. Never point two units at the same `key`.
- Keep modules free of Terragrunt-specific code; they must work with plain `tofu apply`.
- Pin module `source` refs (a git tag) for anything beyond local development, and pin container image tags; avoid `latest`.
- `run --all apply` changes many resources at once and appends `-auto-approve` to every unit on its own. Run `run --all plan` first and review it; add `--no-auto-approve` if you want each unit to ask before applying, and keep `--non-interactive` for CI.
- Do not use workspaces; Terragrunt isolates state per unit.
- Put credentials in the environment or a role, never in `.hcl` files. Use `allowed_account_ids` to stop a plan from running against the wrong AWS account.
- `terragrunt hcl fmt` formats HCL files.
