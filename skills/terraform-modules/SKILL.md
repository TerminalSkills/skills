---
name: terraform-modules
description: >-
  Build reusable Terraform modules. Use when a user asks to create reusable
  infrastructure components, organize Terraform code, build a module registry,
  or standardize infrastructure across teams and environments.
license: Apache-2.0
compatibility: 'Terraform 1.0+, OpenTofu'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - terraform
    - modules
    - infrastructure
    - iac
    - reusable
---

# Terraform Modules

## Overview

Terraform modules are reusable infrastructure packages. Instead of copy-pasting HCL between projects, define a module once (VPC, ECS cluster, RDS database) and instantiate it with different parameters per environment. Modules enforce consistency, reduce drift, and speed up infrastructure provisioning.

## Instructions

### Step 1: Module Structure

```text
modules/
└── web-service/
    ├── main.tf          # resources
    ├── variables.tf     # input parameters
    ├── outputs.tf       # values exposed to callers
    ├── versions.tf      # provider requirements
    └── README.md        # usage documentation
```

### Step 2: Define a Module

```hcl
# modules/web-service/variables.tf — Module inputs
variable "name" {
  type        = string
  description = "Service name (used for resource naming)"
}

variable "environment" {
  type        = string
  description = "Environment: staging or production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}

variable "container_image" {
  type        = string
  description = "Docker image URI"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 256
  description = "CPU units (256 = 0.25 vCPU)"
}

variable "memory" {
  type    = number
  default = 512
  description = "Memory in MB"
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "health_check_path" {
  type    = string
  default = "/health"
}
```

```hcl
# modules/web-service/main.tf — ECS Fargate service
resource "aws_ecs_service" "this" {
  name            = "${var.name}-${var.environment}"
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [aws_security_group.this.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = var.name
    container_port   = var.container_port
  }

  tags = local.tags
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name}-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn

  container_definitions = jsonencode([{
    name      = var.name
    image     = var.container_image
    essential = true
    portMappings = [{ containerPort = var.container_port }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.name}-${var.environment}"
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

locals {
  tags = {
    Service     = var.name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
```

```hcl
# modules/web-service/outputs.tf — Exposed values
output "service_url" {
  value       = "https://${aws_lb.this.dns_name}"
  description = "Load balancer URL"
}

output "service_arn" {
  value       = aws_ecs_service.this.id
  description = "ECS service ARN"
}
```

### Step 3: Use the Module

```hcl
# environments/production/main.tf — Instantiate module
module "api" {
  source = "../../modules/web-service"

  name            = "api"
  environment     = "production"
  container_image = "ghcr.io/myorg/api:v2.1.0"
  container_port  = 3000
  cpu             = 512
  memory          = 1024
  desired_count   = 3

  cluster_arn        = module.cluster.arn
  subnet_ids         = module.vpc.private_subnet_ids
  execution_role_arn = aws_iam_role.ecs_execution.arn
}

module "web" {
  source = "../../modules/web-service"

  name            = "web"
  environment     = "production"
  container_image = "ghcr.io/myorg/web:v1.8.0"
  container_port  = 3000
  cpu             = 256
  memory          = 512
  desired_count   = 2

  cluster_arn        = module.cluster.arn
  subnet_ids         = module.vpc.private_subnet_ids
  execution_role_arn = aws_iam_role.ecs_execution.arn
}
```

## Guidelines

- Use variables with validation and descriptions — modules are self-documenting.
- Always output resource IDs/ARNs that callers might need.
- Pin module versions when using remote sources: `source = "git::https://...?ref=v1.2.0"`.
- Use `terraform-docs` to auto-generate README from variables and outputs.
- Test modules with Terratest or `terraform validate` in CI.
