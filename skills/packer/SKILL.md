---
name: packer
description: >-
  HashiCorp Packer for building automated machine images. Use when the user needs
  to create AMIs, Docker images, or GCP images using HCL templates with
  provisioners for consistent, reproducible infrastructure images.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - packer
    - machine-images
    - ami
    - docker
    - infrastructure
---

# Packer

Packer automates the creation of machine images for multiple platforms from a single source configuration.

## Installation

```bash
# Install Packer
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install packer

# Verify
packer version
```

## AWS AMI Builder

```hcl
# aws-ubuntu.pkr.hcl — Build Ubuntu AMI with Nginx
packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "app_version" {
  type = string
}

source "amazon-ebs" "ubuntu" {
  ami_name      = "app-{{timestamp}}"
  instance_type = "t3.medium"
  region        = var.aws_region

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]
  }

  ssh_username = "ubuntu"

  tags = {
    Name        = "app-${var.app_version}"
    Environment = "production"
    Builder     = "packer"
  }
}

build {
  sources = ["source.amazon-ebs.ubuntu"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y nginx curl jq",
      "sudo systemctl enable nginx"
    ]
  }

  provisioner "file" {
    source      = "files/nginx.conf"
    destination = "/tmp/nginx.conf"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/nginx.conf /etc/nginx/sites-available/default",
      "sudo nginx -t"
    ]
  }

  provisioner "shell" {
    inline = ["sudo apt-get clean", "sudo rm -rf /var/lib/apt/lists/*"]
  }

  post-processor "manifest" {
    output     = "manifest.json"
    strip_path = true
  }
}
```

## Docker Builder

```hcl
# docker-app.pkr.hcl — Build Docker image with Packer
source "docker" "app" {
  image  = "python:3.12-slim"
  commit = true

  changes = [
    "EXPOSE 8080",
    "WORKDIR /app",
    "CMD [\"python\", \"app.py\"]"
  ]
}

build {
  sources = ["source.docker.app"]

  provisioner "shell" {
    inline = [
      "pip install --no-cache-dir flask gunicorn",
      "mkdir -p /app"
    ]
  }

  provisioner "file" {
    source      = "app/"
    destination = "/app/"
  }

  post-processor "docker-tag" {
    repository = "myregistry.com/myapp"
    tags       = ["latest", var.app_version]
  }

  post-processor "docker-push" {
    login          = true
    login_server   = "myregistry.com"
    login_username = var.registry_user
    login_password = var.registry_pass
  }
}
```

## GCP Image Builder

```hcl
# gcp-image.pkr.hcl — Build GCP Compute Engine image
source "googlecompute" "ubuntu" {
  project_id   = var.gcp_project
  source_image = "ubuntu-2204-jammy-v20240101"
  zone         = "us-central1-a"
  machine_type = "e2-medium"
  ssh_username = "packer"
  image_name   = "app-{{timestamp}}"

  image_labels = {
    environment = "production"
    builder     = "packer"
  }
}

build {
  sources = ["source.googlecompute.ubuntu"]

  provisioner "shell" {
    scripts = [
      "scripts/base-setup.sh",
      "scripts/install-app.sh"
    ]
    environment_vars = [
      "APP_VERSION=${var.app_version}"
    ]
  }

  provisioner "ansible" {
    playbook_file = "ansible/configure.yml"
  }
}
```

## Multi-Builder Template

```hcl
# multi-platform.pkr.hcl — Build for AWS and GCP simultaneously
variable "app_version" {
  type    = string
  default = "1.0.0"
}

source "amazon-ebs" "base" {
  ami_name      = "app-${var.app_version}-{{timestamp}}"
  instance_type = "t3.medium"
  region        = "us-east-1"
  source_ami_filter {
    filters = { name = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" }
    most_recent = true
    owners      = ["099720109477"]
  }
  ssh_username = "ubuntu"
}

source "googlecompute" "base" {
  project_id   = var.gcp_project
  source_image = "ubuntu-2204-jammy-v20240101"
  zone         = "us-central1-a"
  ssh_username = "packer"
  image_name   = "app-${var.app_version}-{{timestamp}}"
}

build {
  sources = [
    "source.amazon-ebs.base",
    "source.googlecompute.base"
  ]

  provisioner "shell" {
    script = "scripts/setup.sh"
  }
}
```

## Common Commands

```bash
# Validate template
packer validate .

# Build image
packer build .
packer build -var "app_version=2.0.0" aws-ubuntu.pkr.hcl

# Build specific source only
packer build -only="amazon-ebs.ubuntu" .

# Initialize plugins
packer init .

# Format HCL files
packer fmt .

# Inspect template
packer inspect .

# Debug mode
PACKER_LOG=1 packer build .
```
