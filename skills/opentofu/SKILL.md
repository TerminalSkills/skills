---
name: opentofu
description: >-
  OpenTofu is the open-source (MPL-2.0, Linux Foundation) fork of Terraform: it
  provisions cloud infrastructure from HCL files with the `tofu` command and
  reads existing Terraform configurations, providers and state. Use when
  someone asks to "set up OpenTofu", "migrate from Terraform to OpenTofu",
  "encrypt Terraform state", "write a tofu module", "add tests to my
  infrastructure code", or "store state in S3 with locking".
license: Apache-2.0
compatibility: 'OpenTofu 1.13 on Linux, macOS or Windows (64-bit); cloud credentials for the providers you use'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/opentofu/opentofu
  tags:
    - opentofu
    - iac
    - terraform-alternative
    - infrastructure
    - state-encryption
---

# OpenTofu

## Overview

OpenTofu (`tofu`) is a drop-in replacement for the Terraform CLI that stayed open source after HashiCorp moved Terraform to the BSL license. It reads the same `.tf` files and the same registry providers and modules. Migrating is mostly "run `tofu` instead of `terraform`". It also has features Terraform does not: client-side encryption of state and plan files, `lifecycle { enabled = ... }`, `for_each` on providers, and variables in `backend` and module `source` blocks. This skill covers install, project layout, state encryption, remote state, tests, migration and CI use. It was checked against OpenTofu 1.13.2.

## Instructions

### 1. Install

```bash
brew install opentofu                      # macOS, Linux (Homebrew)
sudo snap install --classic opentofu       # Linux with snap
tofu version                               # expect: OpenTofu v1.13.x
```

Other options (deb/rpm repositories, Windows winget, a standalone installer script) are listed at https://opentofu.org/docs/intro/install/. If you use the standalone script, download it to a file, read it, and run it from the file; do not pipe it into a shell. The script verifies its downloads with cosign or GnuPG, so one of them must be installed. For a manual install, download the release zip and `tofu_<version>_SHA256SUMS` from the GitHub release page and run `sha256sum -c` before unzipping.

### 2. Write and run a configuration

```hcl
# main.tf
terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "project" {
  type    = string
  default = "billing-api"
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

provider "aws" {
  region = var.region
}

locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "opentofu"
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "${var.project}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.region}a", "${var.region}b", "${var.region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = var.environment != "production" # one NAT outside production saves cost

  tags = local.common_tags
}
```

```bash
tofu init                      # download providers and modules, write .terraform.lock.hcl
tofu fmt -recursive            # canonical formatting
tofu validate                  # syntax and type check, no cloud calls
tofu plan -out=plan.tfplan     # preview and save the plan
tofu apply plan.tfplan         # apply exactly what was reviewed
tofu state list                # resources tracked in state
tofu destroy                   # destructive: tears everything down; review its plan first
```

Commit `.terraform.lock.hcl`; never commit `.terraform/`, `*.tfstate` or `*.tfvars` that hold secrets.

### 3. Encrypt state and plans

Encryption is configured in the `terraform` block and applies to local state, remote state and saved plans. A tested minimal setup with a passphrase (at least 16 characters):

```hcl
terraform {
  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method   = method.aes_gcm.main
      enforced = true # refuse to read or write unencrypted state
    }
    plan {
      method   = method.aes_gcm.main
      enforced = true
    }
  }
}

variable "state_passphrase" {
  type      = string
  sensitive = true
}
```

```bash
export TF_VAR_state_passphrase="correct-horse-battery-staple-9271"   # from your secret store, not from git
tofu init && tofu plan -out=plan.tfplan && tofu apply plan.tfplan
```

For production prefer a KMS key provider so there is no passphrase to leak. AWS example (`key_spec` is required; the other built-in providers are GCP KMS, Azure Key Vault and OpenBao):

```hcl
key_provider "aws_kms" "prod" {
  kms_key_id = "alias/opentofu-state"
  key_spec   = "AES_256"
  region     = "eu-west-1"
}
```

Migrating an existing unencrypted state: first add a `method "unencrypted" "legacy" {}` and set `fallback { method = method.unencrypted.legacy }` inside the `state` block, with `enforced = false`. Run `tofu apply` once so the state is rewritten encrypted. Then remove the fallback and set `enforced = true`. Do not rename key providers or methods after data is encrypted, because their names are stored in the file; to change a key, put the old one in a `fallback` block. Losing the key means losing the state.

### 4. Remote state

```hcl
terraform {
  backend "s3" {
    bucket       = "acme-tofu-state-eu-west-1"
    key          = "billing-api/staging/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true   # S3-native locking; the DynamoDB table (dynamodb_table) is the older way
    encrypt      = true
  }
}
```

Since OpenTofu 1.8 a backend block may reference input variables, as long as their values are given at init time (`-var`, `TF_VAR_*`). Separate environments with separate state keys (or directories); workspaces share one backend config and are easy to apply to the wrong environment.

### 5. Language features worth using

```hcl
resource "aws_elasticache_cluster" "sessions" {
  # ... arguments ...
  lifecycle {
    enabled = var.environment == "production"   # OpenTofu 1.11+: replaces count = 0/1
  }
}

import {                      # declarative import, reviewed in plan
  to = aws_s3_bucket.logs
  id = "acme-access-logs"
}

removed {                     # stop managing a resource without destroying it
  from = aws_instance.legacy_bastion
  lifecycle {
    destroy = false
  }
}
```

### 6. Test

`*.tftest.hcl` files run with `tofu test`. A `command = plan` run creates no cloud resources, but the real AWS provider still needs credentials to configure itself, so mock it (verified with `tofu test` on 1.13.2: `Success! 1 passed, 0 failed.`):

```hcl
# tests/sizing.tftest.hcl
mock_provider "aws" {}

variables {
  environment = "production"
}

run "production_uses_three_nat_gateways" {
  command = plan
  assert {
    condition     = length(module.vpc.azs) == 3
    error_message = "production must span three availability zones"
  }
}
```

`mock_provider` also lets `command = apply` runs work without credentials; computed attributes then get generated values.

### 7. Migrate from Terraform

1. Read the migration guide for your Terraform version (https://opentofu.org/docs/intro/migration/); state written by newer Terraform releases may not be readable.
2. Back up the state file or enable bucket versioning.
3. Run `tofu init` in the same directory, then `tofu plan`. It should show no changes.
4. Replace `terraform` with `tofu` in CI. Provider and module sources resolve through the OpenTofu registry, which mirrors the public ones.

## Examples

### Example 1: Encrypt the state of an existing project

**User prompt:** "Our Terraform state in S3 has database passwords in plaintext. Switch to OpenTofu and encrypt it."

The agent installs OpenTofu, runs `tofu init` and a clean `tofu plan` to prove the switch is a no-op, then adds an `encryption` block with an `aws_kms` key provider, `aes_gcm` method and a temporary `unencrypted` fallback. It runs `tofu apply` so the state is rewritten encrypted and confirms the object in S3 starts with a JSON `meta` header instead of resource data. After that it removes the fallback, sets `enforced = true`, and reports that the KMS key policy is now a recovery dependency.

### Example 2: Add tests and a CI gate

**User prompt:** "Make sure nobody merges a change that makes staging create three NAT gateways."

The agent writes `tests/nat.tftest.hcl` with a `command = plan` run, `environment = "staging"`, and an assertion on the number of NAT gateways in the plan. It runs `tofu test` locally, shows the passing output (`Success! 1 passed, 0 failed.`), and adds `tofu fmt -check -recursive`, `tofu validate` and `tofu test` as CI steps before `tofu plan`.

## Guidelines

- Always apply a saved plan (`plan -out=…` then `apply plan.tfplan`) in CI so what was reviewed is what runs
- Treat the encryption passphrase or KMS key as critical: without it the state cannot be read, and there is no recovery
- `enforced = true` blocks reading unencrypted state; leave it `false` only during a migration
- Pin provider and module versions with `~>` ranges and commit `.terraform.lock.hcl`
- State holds secrets even for `sensitive` values; encrypt it and restrict access to the bucket
- Do not use `-target` in routine workflows; it can leave state inconsistent with the configuration
- Features added after the Terraform fork point (state encryption, `lifecycle.enabled`, provider `for_each`) make configurations unusable in Terraform; do not adopt them if you must be able to switch back
- Never run `tofu destroy` or `apply -auto-approve` against production without a human reading the plan
