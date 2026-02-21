---
title: "Define Cloud Infrastructure with Pulumi and Ansible"
slug: define-cloud-infrastructure-with-pulumi
description: "Use Pulumi for type-safe infrastructure provisioning and Ansible for configuration management to build reproducible, testable cloud environments."
skills:
  - pulumi
  - ansible-automation
category: devops
tags:
  - infrastructure-as-code
  - pulumi
  - ansible
  - cloud
  - automation
---

# Define Cloud Infrastructure with Pulumi and Ansible

## The Problem

A platform team manages 15 microservices across three AWS environments. Their Terraform codebase has grown to 8,000 lines of HCL with duplicated modules and string-based references that break silently. Post-provisioning configuration -- installing agents, hardening OS settings, deploying monitoring tools -- is handled by a collection of bash scripts that each engineer runs manually and slightly differently.

## The Solution

Using the **pulumi** skill to define infrastructure in TypeScript with compile-time type checking and real programming constructs, paired with the **ansible-automation** skill to handle post-provisioning configuration management with idempotent playbooks that guarantee consistent server state.

## Step-by-Step Walkthrough

### 1. Define the base infrastructure in Pulumi

Create a type-safe infrastructure stack using TypeScript.

> Set up a new Pulumi project in TypeScript for our AWS infrastructure. Create a VPC with public and private subnets across 3 AZs, an ECS Fargate cluster, an RDS PostgreSQL 16 instance in the private subnet, and an ALB. Use Pulumi component resources to make the VPC and database reusable across dev, staging, and production.

Pulumi generates typed classes for each resource. A typo in a subnet CIDR or a missing security group reference triggers a TypeScript compiler error before any infrastructure is created, catching mistakes that Terraform would only surface during `plan` or `apply`.

### 2. Add environment-specific configuration

Use Pulumi stacks to manage per-environment differences.

> Create three Pulumi stacks (dev, staging, prod) with different sizing. Dev gets a t3.micro RDS and 1 Fargate task. Staging gets t3.small with 2 tasks. Production gets r6g.large Multi-AZ RDS with 4 tasks and autoscaling from 4 to 12. Add a stack reference so the monitoring stack can read outputs from the infrastructure stack.

Each stack has its own config file with size parameters. The TypeScript code uses conditional logic and loops -- real programming constructs that eliminate the copy-paste modules common in HCL configurations.

### 3. Configure servers with Ansible playbooks

Run idempotent Ansible playbooks against provisioned infrastructure.

> Write Ansible playbooks that run after Pulumi provisioning. The playbooks should install the CloudWatch agent, configure log rotation at 50 MB with 7-day retention, harden SSH (disable root login, key-only auth), set up unattended security updates, and install our custom monitoring agent from our private apt repository.

The playbooks run against Pulumi's exported inventory. Every task is idempotent -- running the playbook twice produces the same result. When a new server is added to the Pulumi stack, Ansible automatically picks it up and brings it to the correct state.

### 4. Wire Pulumi outputs into Ansible inventory

Connect the two tools so infrastructure changes automatically update configuration.

> Create a dynamic Ansible inventory that reads from Pulumi stack outputs. When Pulumi adds a new EC2 instance, Ansible should automatically include it in the next playbook run. Set up a CI pipeline that runs pulumi up followed by ansible-playbook with the dynamic inventory.

A Python inventory script queries `pulumi stack output --json` and generates host groups. The CI pipeline runs both tools in sequence: Pulumi provisions the infrastructure, then Ansible configures it. A new server goes from zero to fully configured in a single pipeline run.

## Real-World Example

Chen's platform team migrates their 8,000-line Terraform codebase to Pulumi over three sprints. The TypeScript compiler catches 23 configuration bugs during the migration that had been silently present in HCL -- wrong subnet references, missing IAM permissions, invalid CIDR ranges. Post-provisioning setup, which previously took 45 minutes of manual SSH and bash scripts per server, now runs automatically via Ansible in 6 minutes. When the team adds a fourth environment for load testing, the entire stack -- infrastructure and configuration -- deploys in 18 minutes with a single `git push`.
