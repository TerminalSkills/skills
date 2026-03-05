---
name: checkov
description: Expert guidance for Checkov, the static analysis tool for infrastructure-as-code that scans Terraform, CloudFormation, Kubernetes, Helm, Dockerfile, and ARM templates for security misconfigurations and compliance violations. Helps developers integrate Checkov into CI/CD pipelines and write custom policies.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - iac-security
  - terraform
  - kubernetes
  - compliance
  - scanning
---

# Checkov — Infrastructure as Code Security Scanner


## Overview


Checkov, the static analysis tool for infrastructure-as-code that scans Terraform, CloudFormation, Kubernetes, Helm, Dockerfile, and ARM templates for security misconfigurations and compliance violations. Helps developers integrate Checkov into CI/CD pipelines and write custom policies.


## Instructions

### Scanning

```bash
# Install
pip install checkov

# Scan Terraform files
checkov -d ./terraform/

# Scan Kubernetes manifests
checkov -d ./k8s/ --framework kubernetes

# Scan Dockerfiles
checkov -f Dockerfile --framework dockerfile

# Scan with specific checks
checkov -d . --check CKV_AWS_18,CKV_AWS_21   # Only specific checks

# Skip specific checks
checkov -d . --skip-check CKV_AWS_18          # Skip S3 logging check

# Output formats
checkov -d . -o json                           # JSON for CI/CD
checkov -d . -o sarif                          # SARIF for GitHub Security tab
checkov -d . -o junitxml                       # JUnit for test reports
```

### What Checkov Catches

```hcl
# Terraform — Checkov flags these misconfigurations:

# ❌ CKV_AWS_18: S3 bucket without access logging
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
  # Missing: logging { target_bucket = "..." }
}

# ❌ CKV_AWS_145: RDS without encryption
resource "aws_db_instance" "main" {
  engine         = "postgres"
  instance_class = "db.t3.medium"
  # Missing: storage_encrypted = true
}

# ❌ CKV_AWS_24: Security group with 0.0.0.0/0 on SSH
resource "aws_security_group_rule" "ssh" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  cidr_blocks = ["0.0.0.0/0"]    # Open SSH to the world
}

# ❌ CKV_AWS_79: EC2 without metadata service v2
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t3.micro"
  # Missing: metadata_options { http_tokens = "required" }
}
```

```yaml
# Kubernetes — Checkov flags these:

# ❌ CKV_K8S_1: Container running as root
# ❌ CKV_K8S_8: No liveness probe
# ❌ CKV_K8S_9: No readiness probe
# ❌ CKV_K8S_12: No memory limit
# ❌ CKV_K8S_13: No memory request
# ❌ CKV_K8S_20: Privileged container
# ❌ CKV_K8S_28: No CPU limit
# ❌ CKV_K8S_37: No capabilities drop
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          image: myapp:latest      # ❌ CKV_K8S_14: Using 'latest' tag
          # Missing: all security context, probes, and resource limits
```

### Custom Policies

```python
# custom_checks/s3_naming.py — Custom Checkov policy in Python
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck
from checkov.common.models.enums import CheckResult, CheckCategories

class S3BucketNamingConvention(BaseResourceCheck):
    def __init__(self):
        name = "S3 bucket name must start with company prefix"
        id = "CKV_CUSTOM_1"
        supported_resources = ["aws_s3_bucket"]
        categories = [CheckCategories.CONVENTION]
        super().__init__(name=name, id=id, categories=categories,
                         supported_resources=supported_resources)

    def scan_resource_conf(self, conf):
        bucket_name = conf.get("bucket", [""])[0]
        if bucket_name.startswith("mycompany-"):
            return CheckResult.PASSED
        return CheckResult.FAILED

check = S3BucketNamingConvention()
```

```yaml
# custom_checks/require_tags.yaml — Custom policy in YAML (simpler)
metadata:
  id: "CKV_CUSTOM_2"
  name: "All resources must have 'team' and 'environment' tags"
  category: "CONVENTION"
definition:
  cond_type: "attribute"
  resource_types:
    - "aws_instance"
    - "aws_s3_bucket"
    - "aws_rds_cluster"
  attribute: "tags.team"
  operator: "exists"
```

### CI/CD Integration

```yaml
# .github/workflows/security.yml
- name: Checkov IaC Scan
  uses: bridgecrewio/checkov-action@v12
  with:
    directory: terraform/
    framework: terraform
    output_format: sarif
    output_file_path: checkov.sarif
    soft_fail: false                    # Fail the pipeline on findings
    skip_check: CKV_AWS_18             # Skip known exceptions

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: checkov.sarif
```

## Installation

```bash
pip install checkov

# Or via Docker
docker run -v $(pwd):/tf bridgecrew/checkov -d /tf

# Or via Homebrew
brew install checkov
```


## Examples


### Example 1: Setting up Checkov for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Checkov for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# Install`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting what checkov catches issues

**User request:**

```
Checkov is showing errors in our what checkov catches. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Checkov issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **Scan in CI/CD** — Run Checkov on every PR; catch misconfigurations before they reach production
2. **Start permissive, tighten gradually** — Begin with `--soft-fail` to see findings without blocking; gradually enable hard-fail as you fix issues
3. **Skip with justification** — When skipping checks, add inline comments explaining why: `#checkov:skip=CKV_AWS_18:Logging handled by org-level trail`
4. **Custom policies for your org** — Write policies for naming conventions, tagging requirements, and organizational standards
5. **SARIF for GitHub** — Output SARIF and upload to GitHub Security tab; findings appear inline on pull requests
6. **Baseline file** — Use `--baseline` to establish a baseline of existing findings; only flag new issues in PRs
7. **Multiple frameworks** — Scan Terraform, Kubernetes, Dockerfiles, and Helm charts in the same pipeline
8. **Bridgecrew platform** — Use the Bridgecrew platform for centralized policy management and drift detection across teams
