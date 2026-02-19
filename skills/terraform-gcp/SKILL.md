---
name: terraform-gcp
description: >-
  Infrastructure as Code for Google Cloud Platform using Terraform. Use when
  the user needs to provision GCP resources like Compute Engine instances,
  Cloud Storage buckets, Cloud SQL databases, VPC networks, and IAM bindings.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud
  tags:
    - terraform
    - gcp
    - google-cloud
    - infrastructure-as-code
    - devops
---

# Terraform GCP

Terraform enables declarative infrastructure provisioning on Google Cloud Platform using HCL.

## Provider Configuration

```hcl
# providers.tf — GCP provider with remote state in GCS
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "mycompany-terraform-state"
    prefix = "production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
```

## VPC Network

```hcl
# modules/vpc/main.tf — VPC with custom subnets and Cloud NAT
resource "google_compute_network" "main" {
  name                    = "${var.project_name}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "public" {
  name          = "${var.project_name}-public"
  ip_cidr_range = var.public_subnet_cidr
  region        = var.region
  network       = google_compute_network.main.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

resource "google_compute_subnetwork" "private" {
  name                     = "${var.project_name}-private"
  ip_cidr_range            = var.private_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true
}

resource "google_compute_router" "main" {
  name    = "${var.project_name}-router"
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.project_name}-nat"
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
```

## Compute Engine

```hcl
# modules/compute/main.tf — GCE instance with managed instance group
resource "google_compute_instance_template" "web" {
  name_prefix  = "${var.project_name}-web-"
  machine_type = var.machine_type

  disk {
    source_image = "ubuntu-os-cloud/ubuntu-2204-lts"
    auto_delete  = true
    boot         = true
    disk_size_gb = 30
    disk_type    = "pd-ssd"
  }

  network_interface {
    subnetwork = var.subnet_id
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh", {
    app_version = var.app_version
  })

  service_account {
    email  = var.service_account_email
    scopes = ["cloud-platform"]
  }

  lifecycle { create_before_destroy = true }
}

resource "google_compute_instance_group_manager" "web" {
  name               = "${var.project_name}-web-mig"
  base_instance_name = "${var.project_name}-web"
  zone               = "${var.region}-a"
  target_size        = var.instance_count

  version {
    instance_template = google_compute_instance_template.web.id
  }

  named_port {
    name = "http"
    port = 8080
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.web.id
    initial_delay_sec = 300
  }
}

resource "google_compute_health_check" "web" {
  name               = "${var.project_name}-web-hc"
  check_interval_sec = 10
  timeout_sec        = 5

  http_health_check {
    port         = 8080
    request_path = "/health"
  }
}
```

## Cloud Storage

```hcl
# modules/gcs/main.tf — GCS bucket with lifecycle rules
resource "google_storage_bucket" "main" {
  name     = "${var.project_id}-${var.bucket_name}"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = var.environment != "production"

  versioning { enabled = true }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action { type = "Delete" }
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }
}
```

## Cloud SQL

```hcl
# modules/cloudsql/main.tf — Cloud SQL PostgreSQL with HA
resource "google_sql_database_instance" "main" {
  name             = "${var.project_name}-${var.environment}-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_size         = 100
    disk_autoresize   = true
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }

    database_flags {
      name  = "max_connections"
      value = "200"
    }

    insights_config {
      query_insights_enabled = true
    }
  }

  deletion_protection = var.environment == "production"
}

resource "google_sql_database" "main" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "main" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = var.db_password
}
```

## IAM

```hcl
# modules/iam/main.tf — Service account with role bindings
resource "google_service_account" "app" {
  account_id   = "${var.project_name}-app-sa"
  display_name = "Application Service Account"
}

resource "google_project_iam_member" "app_roles" {
  for_each = toset([
    "roles/storage.objectViewer",
    "roles/cloudsql.client",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app.email}"
}

resource "google_service_account_key" "app" {
  service_account_id = google_service_account.app.name
}
```

## Variables and Outputs

```hcl
# variables.tf — Root module variables
variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}
```

```hcl
# outputs.tf — Root module outputs
output "vpc_id" {
  value = module.vpc.network_id
}

output "db_connection_name" {
  value     = module.cloudsql.connection_name
  sensitive = true
}

output "service_account_email" {
  value = module.iam.service_account_email
}
```

## Common Commands

```bash
# Initialize and apply
terraform init
terraform plan -var-file="environments/production.tfvars"
terraform apply -var-file="environments/production.tfvars"

# Use workspaces for environments
terraform workspace new staging
terraform workspace select production

# Import existing GCP resources
terraform import google_compute_instance.web projects/my-project/zones/us-central1-a/instances/my-vm
```
