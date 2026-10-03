---
name: packer
description: >-
  HashiCorp Packer builds identical machine images (AWS AMIs, Google Compute images, Docker images and more) from one HCL template, with provisioners that configure the image and plugins for each platform. Use when the user wants to bake an AMI or golden image, build a Docker image with provisioners, write a .pkr.hcl template, or fix packer init, validate and build errors.
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/hashicorp/packer
  tags:
    - packer
    - machine-images
    - ami
    - docker
    - infrastructure
---

# Packer

## Overview

Packer reads a template (HCL2, files ending in `.pkr.hcl`), launches a temporary machine or container from a base image with a **source** (builder), runs **provisioners** against it, then saves the result as an image and runs **post-processors**. Builders live in plugins that `packer init` downloads, so a template must declare the plugins it needs.

Facts to keep in mind (Packer 1.16.1, September 2026):

- Packer is licensed under the Business Source License (BSL 1.1), not an open-source licence; plugins are mostly MPL-2.0. Check the licence terms for competing-product use.
- JSON templates are legacy. Convert with `packer hcl2_upgrade`.
- 1.16 added the `provenance` post-processor (SLSA attestations), a `continue_on_error` argument on provisioner blocks, and `packer verify-attestation`.
- Ubuntu 22.04 (jammy) is still available but 24.04 (noble) is the current LTS base for new images.

## Instructions

### Install

```bash
brew tap hashicorp/tap && brew install hashicorp/tap/packer     # macOS / Linux with Homebrew

# Debian/Ubuntu: HashiCorp's apt repository
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install packer
packer version
```

A manual zip from releases.hashicorp.com must be checked against the `packer_<version>_SHA256SUMS` file before unzipping (`grep linux_amd64.zip packer_1.16.1_SHA256SUMS | sha256sum -c`).

### Workflow

```bash
packer init .          # install the plugins named in required_plugins (do this first)
packer fmt .           # canonical formatting (-check for CI)
packer validate .      # syntax and argument check; some plugins also need their tools or credentials
packer build .         # run every build in the directory
```

Useful flags: `-var "app_version=2.4.0"`, `-var-file=prod.pkrvars.hcl`, `-only='amazon-ebs.ubuntu'`, `-except=...`, `-on-error=ask` (keep the failed instance for debugging), `-parallel-builds=1`, and `PACKER_LOG=1` for debug logs. Variables can also come from `PKR_VAR_<name>` environment variables. `packer init -upgrade .` moves plugins to the newest version allowed by the constraints.

## Examples

### Example 1: Ubuntu 24.04 AMI with Nginx

Request: "Bake an AMI with Nginx and our config for us-east-1."

```hcl
# aws-web.pkr.hcl
packer {
  required_plugins {
    amazon = {
      version = ">= 1.8.0"
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
  ami_name      = "web-${var.app_version}-{{timestamp}}"
  instance_type = "t3.small"
  region        = var.aws_region

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"] # Canonical
  }

  ssh_username = "ubuntu"
  tags = {
    Name    = "web-${var.app_version}"
    Builder = "packer"
  }
}

build {
  sources = ["source.amazon-ebs.ubuntu"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y nginx curl jq",
      "sudo systemctl enable nginx",
    ]
  }

  provisioner "file" {
    source      = "files/nginx.conf"
    destination = "/tmp/nginx.conf"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/nginx.conf /etc/nginx/sites-available/default",
      "sudo nginx -t",
      "sudo apt-get clean && sudo rm -rf /var/lib/apt/lists/*",
    ]
  }

  post-processor "manifest" {
    output     = "manifest.json"
    strip_path = true
  }
}
```

```bash
export AWS_PROFILE=image-builder           # credentials come from the standard AWS chain
packer init . && packer build -var "app_version=2.4.0" .
```

Result: Packer launches a `t3.small`, provisions it, registers the AMI and terminates the instance; `manifest.json` lists the new AMI ID per region. The Canonical owner ID `099720109477` is the real Ubuntu publisher, so keep the `owners` filter to avoid picking a lookalike image.

### Example 2: Docker image with tags

Request: "Build a Python app image with Packer and tag it for our registry."

```hcl
packer {
  required_plugins {
    docker = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/docker"
    }
  }
}

variable "app_version" {
  type    = string
  default = "2.4.0"
}

source "docker" "app" {
  image  = "python:3.13-slim"
  commit = true
  changes = [
    "EXPOSE 8080",
    "WORKDIR /app",
    "CMD [\"python\", \"app.py\"]",
  ]
}

build {
  sources = ["source.docker.app"]

  provisioner "shell" {
    inline = ["mkdir -p /app", "pip install --no-cache-dir flask gunicorn"]
  }

  provisioner "file" {
    source      = "app/"
    destination = "/app/"
  }

  post-processors {
    post-processor "docker-tag" {
      repository = "registry.acme-labs.io/web/api"
      tags       = ["latest", var.app_version]
    }
    post-processor "docker-push" {}   # uses the existing `docker login` credentials
  }
}
```

Result: the image `registry.acme-labs.io/web/api:2.4.0` (and `latest`) exists locally and is pushed. Put `docker-tag` and `docker-push` in one `post-processors` block so they run as a chain; separate blocks run independently from the original artifact. Packer is not a Dockerfile replacement: use it when you want the same provisioners (shell, Ansible) for containers and VMs.

### Example 3: Google Compute image with shell and Ansible provisioners

```hcl
packer {
  required_plugins {
    googlecompute = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/googlecompute"
    }
    ansible = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/ansible"
    }
  }
}

variable "gcp_project" {
  type = string
}

source "googlecompute" "ubuntu" {
  project_id          = var.gcp_project
  source_image_family = "ubuntu-2404-lts-amd64"
  zone                = "us-central1-a"
  machine_type        = "e2-medium"
  ssh_username        = "packer"
  image_name          = "web-{{timestamp}}"
  image_family        = "web"
}

build {
  sources = ["source.googlecompute.ubuntu"]

  provisioner "shell" {
    scripts          = ["scripts/base-setup.sh", "scripts/install-app.sh"]
    environment_vars = ["APP_VERSION=2.4.0"]
  }

  provisioner "ansible" {
    playbook_file = "ansible/configure.yml"
  }
}
```

Result: an image in the `web` family is created in the project. List several sources in `sources` (for example an `amazon-ebs` one) and the same provisioners run once per source; `-only='googlecompute.ubuntu'` builds just one. Pinning `source_image_family` picks the latest image in the family instead of a dated name that is eventually deprecated. The `ansible` provisioner needs the `ansible-playbook` binary on the machine running Packer; `packer validate` fails with "executable file not found" otherwise.

## Guidelines

- Always run `packer init` after changing `required_plugins`; "unknown source type" or "plugin not found" errors almost always mean it was skipped.
- Never commit credentials. Use the cloud provider's default credential chain, `PKR_VAR_*` variables, and `sensitive = true` on secret variables.
- Builds create real, billed resources (instances, snapshots, AMIs). Clean up failed builds and old images; Packer does not delete previous images.
- Make provisioning deterministic: pin package versions or base image families, and end with cache cleanup so images stay small.
- Packer plugins are versioned independently of Packer; pin a lower bound with `version = ">= x.y.z"` and test upgrades.
- Test a template without a cloud account by running `packer validate` (syntax only with `-syntax-only`) and, for Docker, a local build.
- Use `packer build -on-error=ask` to inspect a failed machine, and `PACKER_LOG=1 PACKER_LOG_PATH=packer.log` for details.
- For Kubernetes-only workloads a Dockerfile or Buildpacks is usually simpler; Packer pays off for VM images and golden-image pipelines.
