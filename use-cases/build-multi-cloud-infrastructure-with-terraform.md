---
title: Build Multi-Cloud Infrastructure with Terraform
slug: build-multi-cloud-infrastructure-with-terraform
description: >-
  Deploy infrastructure across AWS and GCP using Terraform modules for a company
  that needs multi-cloud redundancy with consistent infrastructure patterns.
skills:
  - terraform-aws
  - terraform-gcp
  - terraform-iac
category: cloud
tags:
  - terraform
  - multi-cloud
  - aws
  - gcp
  - infrastructure
---

# Build Multi-Cloud Infrastructure with Terraform

Your company needs to deploy across AWS and GCP for redundancy and to leverage each cloud's strengths — AWS for the primary workload and GCP for analytics and ML pipelines. This walkthrough structures a Terraform project with shared modules and cloud-specific configurations.

## Step 1: Project Structure

Organize the repository so shared logic lives in modules while cloud-specific configuration stays in environment directories.

```bash
# project-structure.sh — Create the multi-cloud Terraform project layout
mkdir -p terraform/{modules/{networking,compute,database,storage},environments/{aws-production,gcp-production,aws-staging}}

# Each environment directory contains:
# - main.tf (module calls)
# - variables.tf (inputs)
# - outputs.tf (outputs)
# - terraform.tfvars (values)
# - providers.tf (provider config)
```

## Step 2: Configure Providers

Each environment directory has its own provider configuration and remote state backend.

```hcl
# environments/aws-production/providers.tf — AWS production provider and S3 backend
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "aws-production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Environment = "production"
      ManagedBy   = "terraform"
      Cloud       = "aws"
    }
  }
}
```

```hcl
# environments/gcp-production/providers.tf — GCP production provider and GCS backend
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "company-terraform-state-gcp"
    prefix = "gcp-production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
```

## Step 3: Build the AWS Environment

The AWS environment hosts the primary application — VPC, compute instances, RDS database, and S3 for assets.

```hcl
# environments/aws-production/main.tf — AWS production infrastructure
module "vpc" {
  source = "../../modules/networking"

  cloud           = "aws"
  project_name    = var.project_name
  vpc_cidr        = "10.0.0.0/16"
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]
  azs             = ["us-east-1a", "us-east-1b"]
}

module "web_servers" {
  source = "../../modules/compute"

  cloud          = "aws"
  project_name   = var.project_name
  instance_count = 3
  instance_type  = "t3.large"
  subnet_ids     = module.vpc.private_subnet_ids
  vpc_id         = module.vpc.vpc_id
}

module "database" {
  source = "../../modules/database"

  cloud              = "aws"
  project_name       = var.project_name
  engine             = "postgres"
  instance_class     = "db.r6g.large"
  private_subnet_ids = module.vpc.private_subnet_ids
  vpc_id             = module.vpc.vpc_id
  db_password        = var.db_password
}

module "assets" {
  source = "../../modules/storage"

  cloud        = "aws"
  project_name = var.project_name
  bucket_name  = "app-assets"
}
```

```hcl
# environments/aws-production/terraform.tfvars — AWS production values
project_name = "mycompany"
region       = "us-east-1"
```

## Step 4: Build the GCP Environment

GCP hosts the analytics pipeline — a VPC, compute instances for data processing, Cloud SQL for the analytics database, and GCS for data lake storage.

```hcl
# environments/gcp-production/main.tf — GCP production infrastructure
module "vpc" {
  source = "../../modules/networking"

  cloud              = "gcp"
  project_name       = var.project_name
  vpc_cidr           = "10.1.0.0/16"
  public_subnet_cidr = "10.1.1.0/24"
  private_subnet_cidr = "10.1.10.0/24"
  region             = var.region
}

module "data_processors" {
  source = "../../modules/compute"

  cloud          = "gcp"
  project_name   = var.project_name
  instance_count = 2
  machine_type   = "e2-standard-8"
  subnet_id      = module.vpc.private_subnet_id
  region         = var.region
}

module "analytics_db" {
  source = "../../modules/database"

  cloud        = "gcp"
  project_name = var.project_name
  engine       = "postgres"
  db_tier      = "db-custom-4-16384"
  vpc_id       = module.vpc.vpc_id
  region       = var.region
  db_password  = var.db_password
}

module "data_lake" {
  source = "../../modules/storage"

  cloud        = "gcp"
  project_name = var.project_name
  bucket_name  = "data-lake"
  region       = var.region
}
```

## Step 5: Cross-Cloud Connectivity

Set up VPN tunnels between AWS and GCP so the analytics pipeline can access the primary database securely.

```hcl
# modules/vpn-bridge/main.tf — Cross-cloud VPN between AWS and GCP
resource "aws_vpn_gateway" "main" {
  vpc_id = var.aws_vpc_id
  tags   = { Name = "${var.project_name}-vpn-gw" }
}

resource "aws_customer_gateway" "gcp" {
  bgp_asn    = 65000
  ip_address = var.gcp_vpn_ip
  type       = "ipsec.1"
  tags       = { Name = "${var.project_name}-gcp-cgw" }
}

resource "aws_vpn_connection" "to_gcp" {
  vpn_gateway_id      = aws_vpn_gateway.main.id
  customer_gateway_id = aws_customer_gateway.gcp.id
  type                = "ipsec.1"
  static_routes_only  = true
  tags                = { Name = "${var.project_name}-to-gcp" }
}

resource "aws_vpn_connection_route" "gcp_cidr" {
  vpn_connection_id      = aws_vpn_connection.to_gcp.id
  destination_cidr_block = var.gcp_cidr
}
```

## Step 6: Deploy

```bash
# deploy.sh — Initialize and apply both environments
cd environments/aws-production
terraform init
terraform plan -out=plan.tfplan
terraform apply plan.tfplan

cd ../gcp-production
terraform init
terraform plan -out=plan.tfplan
terraform apply plan.tfplan
```

## Step 7: CI/CD Integration

Automate Terraform runs in your CI pipeline so changes go through review before applying.

```yaml
# .github/workflows/terraform.yml — GitHub Actions pipeline for Terraform
name: Terraform
on:
  pull_request:
    paths: ["environments/**", "modules/**"]
  push:
    branches: [main]
    paths: ["environments/**", "modules/**"]

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [aws-production, gcp-production]
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        working-directory: environments/${{ matrix.environment }}
        run: terraform init

      - name: Terraform Plan
        working-directory: environments/${{ matrix.environment }}
        run: terraform plan -no-color
        continue-on-error: true

  apply:
    if: github.ref == 'refs/heads/main'
    needs: plan
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [aws-production, gcp-production]
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Apply
        working-directory: environments/${{ matrix.environment }}
        run: |
          terraform init
          terraform apply -auto-approve
```

The result is a multi-cloud infrastructure where AWS handles the primary workload and GCP powers analytics, connected by a secure VPN tunnel, all managed declaratively through Terraform with CI/CD automation.
