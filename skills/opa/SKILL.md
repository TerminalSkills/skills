---
name: opa
description: Expert guidance for OPA (Open Policy Agent), the CNCF policy engine for unified authorization across the stack. Helps developers write Rego policies for Kubernetes admission control, API authorization, infrastructure-as-code validation, and data filtering — enforcing security policies as code.
license: Apache-2.0
compatibility: "OPA 1.x (checked against v1.21.4); Gatekeeper 3.x for Kubernetes; Docker or kubectl optional"
metadata:
  author: terminal-skills
  repository: https://github.com/open-policy-agent/opa
  version: 1.1.0
  category: devops
  tags: "policy, authorization, kubernetes, admission-control, rego"
---

# OPA — Open Policy Agent

## Overview

OPA (Open Policy Agent), the CNCF policy engine for unified authorization across the stack. Helps developers write Rego policies for Kubernetes admission control, API authorization, infrastructure-as-code validation, and data filtering — enforcing security policies as code.

## Instructions

### Rego Policy Language

```rego
# policy/authz.rego — API authorization policy
package authz

import rego.v1

default allow := false

allow if {
    input.user.role == "admin"
}

allow if {
    input.method == "GET"
    input.path[0] == "users"
    input.path[1] == input.user.id
}

# Users can update their own profile
allow if {
    input.method in {"PUT", "PATCH"}
    input.path[0] == "users"
    input.path[1] == input.user.id
    not input.body.role                   # Can't change own role
}

# Managers can approve expenses under $10,000
allow if {
    input.method == "POST"
    input.path == ["expenses", "approve"]
    input.user.role == "manager"
    input.body.amount < 10000
}

```

### Kubernetes Admission Control (Gatekeeper)

```yaml
# Gatekeeper ConstraintTemplate — define reusable policy templates
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        openAPIV3Schema:
          type: object
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequiredlabels

        import rego.v1

        violation contains {"msg": msg} if {
          provided := {label | input.review.object.metadata.labels[label]}
          required := {label | label := input.parameters.labels[_]}
          missing := required - provided
          count(missing) > 0
          msg := sprintf("Missing required labels: %v", [missing])
        }

---
# Apply the constraint — all deployments must have these labels
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: require-team-labels
spec:
  match:
    kinds:
      - apiGroups: ["apps"]
        kinds: ["Deployment"]
  parameters:
    labels:
      - "app.kubernetes.io/name"
      - "team"
```

```yaml
# Block containers running as root. Match Pod, not Deployment: this rule reads
# spec.containers, and a Deployment keeps them under spec.template.spec.
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8snoroot
spec:
  crd:
    spec:
      names:
        kind: K8sNoRoot
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8snoroot

        import rego.v1

        violation contains {"msg": msg} if {
          container := input.review.object.spec.containers[_]
          not container.securityContext.runAsNonRoot
          msg := sprintf("Container %s must set runAsNonRoot: true", [container.name])
        }

---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sNoRoot
metadata:
  name: no-root-containers
spec:
  enforcementAction: dryrun   # audit first; change to deny once the report is clean
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
```

Gatekeeper defaults to `enforcementAction: deny`. Start with `dryrun` (violations appear in the constraint's `status.violations`), then switch to `deny`.

### API Integration

```typescript
// src/middleware/opa-authz.ts — OPA-backed API authorization
import type { Request, Response, NextFunction } from "express";

const OPA_URL = process.env.OPA_URL ?? "http://opa:8181";

export async function authorize(req: Request, res: Response, next: NextFunction) {
  const input = {
    method: req.method,
    path: req.path.split("/").filter(Boolean),
    user: {
      id: req.user?.id,
      role: req.user?.role,
      teams: req.user?.teams ?? [],
    },
    body: req.body,
  };

  try {
    const response = await fetch(`${OPA_URL}/v1/data/authz/allow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error(`OPA answered ${response.status}`);
    const { result } = await response.json();
    // A missing result means the rule was undefined: treat it as denied.
    if (result === true) return next();
    return res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    // Fail closed: if OPA is unreachable, nobody gets in.
    return res.status(503).json({ error: "Authorization service unavailable" });
  }
}

// Usage: app.use(authorize);
```

### Terraform Validation

```rego
# policy/terraform.rego — Validate Terraform plans before apply
package terraform

import rego.v1

# Deny public S3 buckets. AWS provider v4+ sets the ACL on a separate
# aws_s3_bucket_acl resource; older plans put it on aws_s3_bucket itself.
deny contains msg if {
  resource := input.resource_changes[_]
  resource.type in {"aws_s3_bucket", "aws_s3_bucket_acl"}
  resource.change.after.acl in {"public-read", "public-read-write"}
  msg := sprintf("S3 bucket %s must not be public", [resource.address])
}

# Limit instance sizes
deny contains msg if {
  resource := input.resource_changes[_]
  resource.type == "aws_instance"
  not resource.change.after.instance_type in allowed_instance_types
  msg := sprintf("Instance %s uses %s, allowed: %v",
    [resource.address, resource.change.after.instance_type, allowed_instance_types])
}

allowed_instance_types := {"t3.micro", "t3.small", "t3.medium", "m5.large"}
```

## Installation

```bash
# CLI (macOS / Linux with Homebrew)
brew install opa
opa version

# Server in Docker, reachable only from this machine
docker run --rm -p 127.0.0.1:8181:8181 -v "$PWD/policy:/policy:ro" \
  openpolicyagent/opa:latest run --server --addr 0.0.0.0:8181 /policy

# Kubernetes: Gatekeeper via Helm
helm repo add gatekeeper https://open-policy-agent.github.io/gatekeeper/charts
helm install gatekeeper gatekeeper/gatekeeper --namespace gatekeeper-system --create-namespace
```

Pin the image to a release tag in production instead of `latest`. Without `--addr`, `opa run --server` listens on `localhost:8181` only. A static binary from the GitHub releases page comes with a `.sha256` file; verify it before use.

## Examples

### Example 1: Test an authorization policy before wiring it into the API

**User request:** "Write unit tests for my authz.rego and show me a manager approving a $500 expense."

Add `policy/authz_test.rego`:

```rego
package authz_test

import rego.v1

import data.authz

test_manager_approves_small_expense if {
    authz.allow with input as {"method": "POST", "path": ["expenses", "approve"],
        "user": {"id": "m7", "role": "manager"}, "body": {"amount": 500}}
}

test_user_cannot_change_own_role if {
    not authz.allow with input as {"method": "PATCH", "path": ["users", "u1"],
        "user": {"id": "u1", "role": "dev"}, "body": {"role": "admin"}}
}
```

```console
$ opa test policy/ -v
data.authz_test.test_manager_approves_small_expense: PASS
data.authz_test.test_user_cannot_change_own_role: PASS
PASS: 2/2
```

### Example 2: Block a Terraform plan with an oversized instance

**User request:** "Fail CI if the Terraform plan creates an instance type outside our allowed list."

```bash
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json
opa eval -d policy/ -i plan.json --fail-defined "data.terraform.deny[_]"
```

`--fail-defined` makes `opa eval` exit with status 1 when any deny message exists, so CI stops. The output names the offender, for example `Instance aws_instance.web uses c5.4xlarge, allowed: {"m5.large", "t3.medium", "t3.micro", "t3.small"}`.

## Guidelines

1. **Policy as code** — Store policies in Git alongside application code; review policy changes in PRs
2. **Rego testing** — Write unit tests for policies: `opa test policy/ -v`; check syntax with `opa check --strict policy/`; format with `opa fmt -w policy/`
3. **Gatekeeper for K8s** — Use OPA Gatekeeper for admission control; enforce policies at deploy time, not just at runtime
4. **Deny by default** — Start with `default allow := false`; explicitly grant access rather than revoking
5. **Audit logging** — Log OPA decisions for compliance; track who accessed what and which policy allowed/denied it
6. **Rego v1** — OPA 1.x parses Rego v1 by default (`if` and `contains` are required); `import rego.v1` is accepted and harmless, and keeps the files working on 0.x
7. **Fail closed** — An undefined rule returns no `result`; treat a missing result and an unreachable OPA as a denial
