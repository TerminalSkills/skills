---
name: checkov
description: Checkov is an open-source static analysis tool that scans infrastructure-as-code (Terraform, CloudFormation, Kubernetes, Helm, Dockerfile, ARM, Bicep and more) for security misconfigurations and compliance violations. Use it to scan Terraform or Kubernetes manifests before deploy, add a security gate to CI/CD with SARIF output, suppress findings with justification, or write custom policies in Python or YAML.
license: Apache-2.0
compatibility: Python 3.9+ (pip, pipx or Homebrew), or Docker
metadata:
  author: terminal-skills
  repository: https://github.com/bridgecrewio/checkov
  version: 1.1.0
  category: devops
  tags: "iac-security, terraform, kubernetes, compliance, scanning"
---

# Checkov — Infrastructure as Code Security Scanner

## Overview

Checkov (by Prisma Cloud / Bridgecrew, current release 3.3.x) parses IaC files and Terraform plans and evaluates them against 1,000+ built-in policies, with ids like `CKV_AWS_18` or `CKV_K8S_14`. It needs no cloud account and no API key; results stay local unless you pass a Prisma/Bridgecrew key. Exit code is 1 when any check fails, which is what makes it a CI gate.

## Instructions

### Install and scan

```bash
brew install checkov                 # or: pipx install checkov  /  pip install checkov
docker run --rm -v "$(pwd)":/tf bridgecrew/checkov -d /tf   # no local Python needed

checkov -d ./terraform/                                  # scan a directory (all frameworks auto-detected)
checkov -d ./k8s/ --framework kubernetes
checkov -f Dockerfile --framework dockerfile
checkov -d . --check CKV_AWS_18,CKV_AWS_21               # run only these
checkov -d . --skip-check CKV_AWS_18                     # run everything except
checkov -d . --compact --quiet                           # only failures, no code snippets
checkov -d . -o json                                     # also: sarif, junitxml, github_failed_only, cli
checkov -d . -o cli -o sarif --output-file-path console,results.sarif
checkov -d . --soft-fail                                 # report but always exit 0
checkov -d . --config-file .checkov.yaml                 # persist flags; --create-config writes one
```

To evaluate plan values and module inputs, scan the plan JSON: `terraform show -json tfplan > tfplan.json && checkov -f tfplan.json`. Use `--var-file` for variable files and `--download-external-modules true` to resolve remote modules.

### What Checkov catches

```hcl
# CKV_AWS_18: S3 bucket without access logging (CKV2_AWS_6 and CKV_AWS_145 cover public access block / KMS)
resource "aws_s3_bucket" "invoices" {
  bucket = "northwind-invoices-prod"
}

# CKV_AWS_16: RDS instance without storage encryption
resource "aws_db_instance" "billing" {
  engine         = "postgres"
  instance_class = "db.t3.medium"
  # fix: storage_encrypted = true
}

# CKV_AWS_24: security group allows SSH from 0.0.0.0/0
resource "aws_security_group" "bastion" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# CKV_AWS_79: EC2 allows IMDSv1
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  # fix: metadata_options { http_tokens = "required" }
}
```

Common Kubernetes ids: `CKV_K8S_8` liveness probe, `CKV_K8S_9` readiness probe, `CKV_K8S_10`/`11` CPU request/limit, `CKV_K8S_12`/`13` memory request/limit, `CKV_K8S_14` image tag not `latest`, `CKV_K8S_16` privileged container, `CKV_K8S_20` allowPrivilegeEscalation, `CKV_K8S_23` root containers, `CKV_K8S_28` NET_RAW capability, `CKV_K8S_37` capabilities not dropped, `CKV_K8S_40` high UID. List everything with `checkov --list`.

### Suppress a finding with a reason

```hcl
resource "aws_s3_bucket" "audit_logs" {
  #checkov:skip=CKV_AWS_18:Access logging is handled by the organisation CloudTrail
  bucket = "northwind-audit-logs"
}
```

### Custom policies

```python
# custom_checks/s3_naming.py
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck
from checkov.common.models.enums import CheckResult, CheckCategories

class S3BucketNamingConvention(BaseResourceCheck):
    def __init__(self):
        super().__init__(
            name="S3 bucket name must start with the company prefix",
            id="CKV_NORTHWIND_1",
            categories=[CheckCategories.CONVENTION],
            supported_resources=["aws_s3_bucket"],
        )

    def scan_resource_conf(self, conf):
        name = conf.get("bucket", [""])[0]
        return CheckResult.PASSED if isinstance(name, str) and name.startswith("northwind-") else CheckResult.FAILED

check = S3BucketNamingConvention()
```

```yaml
# custom_checks/require_team_tag.yaml
metadata:
  id: "CKV2_NORTHWIND_2"
  name: "Resources must carry a 'team' tag"
  category: "CONVENTION"
definition:
  cond_type: "attribute"
  resource_types: ["aws_instance", "aws_s3_bucket", "aws_rds_cluster"]
  attribute: "tags.team"
  operator: "exists"
```

Load them with `checkov -d . --external-checks-dir custom_checks`. The directory needs an empty `__init__.py` for the Python check to be picked up (the YAML policy loads without it). Custom ids should not collide with built-in `CKV_` ids.

### CI/CD (GitHub Actions)

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v4
  - name: Checkov IaC scan
    uses: bridgecrewio/checkov-action@v12
    with:
      directory: terraform/
      framework: terraform
      output_format: cli,sarif
      output_file_path: console,results.sarif
      baseline: .checkov.baseline
  - uses: github/codeql-action/upload-sarif@v3
    if: always()
    with:
      sarif_file: results.sarif
```

The action fails the job on findings; set `soft_fail: true` while rolling out. Inputs mirror the CLI (`check`, `skip_check`, `config_file`, `soft_fail_on`, `hard_fail_on`).

## Examples

### Example 1: "Add a security gate to our Terraform repo without blocking everyone on day one"

```bash
checkov -d infra/ --create-baseline          # writes infra/.checkov.baseline with today's failures
git add infra/.checkov.baseline
checkov -d infra/ --baseline infra/.checkov.baseline --compact --quiet
```

Result: the baseline run exits 0 on existing debt and fails only when a pull request introduces a new failed check, with output such as `Check: CKV_AWS_16: "Ensure all data stored in the RDS is securely encrypted at rest"  FAILED for resource: aws_db_instance.billing`.

### Example 2: "Checkov flags our Deployment, what do I fix?"

```bash
checkov -f k8s/orders-api.yaml --framework kubernetes --compact --quiet
```

Typical failures are `CKV_K8S_14` (image `orders-api:latest`), `CKV_K8S_13` (no memory limit) and `CKV_K8S_20` (privilege escalation). Pin the image tag, add `resources.limits.memory`, and set `securityContext.allowPrivilegeEscalation: false`, then rerun. A bare Deployment also trips probes, CPU/memory requests, read-only filesystem and other checks (about 20 in total), so work through the list or gate on the ones you adopt with `--check`.

## Guidelines

- Scan on every pull request; Checkov also scans Helm chart directories (`--framework helm`, needs the `helm` binary).
- Start with `--soft-fail` or a baseline, then tighten; never leave a blanket `--skip-check` without a recorded reason.
- Put justification in inline `#checkov:skip=ID:reason` comments so reviewers see it.
- Pin the action and Docker image versions you use; the policy set changes between releases, so new failures can appear after an upgrade.
- Checkov is static: it does not see live cloud state or drift. Pair it with runtime scanning for that.
- Without an API key, results are not uploaded; do not paste `--bc-api-key` into command lines, use the `BC_API_KEY` environment variable.
