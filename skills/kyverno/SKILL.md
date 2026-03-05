---
name: kyverno
description: Expert guidance for Kyverno, the Kubernetes-native policy engine that validates, mutates, and generates resources using YAML policies (no Rego required). Helps developers enforce security policies, automate resource defaults, and ensure compliance across Kubernetes clusters.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - kubernetes
  - policy
  - admission-control
  - mutation
  - validation
---

# Kyverno — Kubernetes Native Policy Engine


## Overview

You are an expert in Kyverno, the Kubernetes-native policy engine that validates, mutates, and generates resources using YAML policies (no Rego required). You help developers enforce security policies, automate resource defaults, and ensure compliance across Kubernetes clusters.

## Instructions

### Validation Policies

```yaml
# Require resource limits on all containers
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
  annotations:
    policies.kyverno.io/title: Require Resource Limits
    policies.kyverno.io/severity: medium
spec:
  validationFailureAction: Enforce       # Block non-compliant resources
  background: true
  rules:
    - name: check-resource-limits
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "All containers must have CPU and memory limits set."
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"

---
# Disallow privileged containers
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
  rules:
    - name: no-privileged
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Privileged containers are not allowed."
        pattern:
          spec:
            containers:
              - securityContext:
                  privileged: "!true"

---
# Disallow latest tag
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
    - name: no-latest
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Using 'latest' tag is not allowed. Pin to a specific version."
        pattern:
          spec:
            containers:
              - image: "!*:latest"

---
# Require labels
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-labels
      match:
        any:
          - resources:
              kinds: ["Deployment", "StatefulSet"]
      validate:
        message: "Resources must have 'team' and 'app' labels."
        pattern:
          metadata:
            labels:
              team: "?*"
              app: "?*"
```

### Mutation Policies

```yaml
# Auto-add security defaults to all pods
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: add-security-defaults
spec:
  rules:
    - name: add-run-as-nonroot
      match:
        any:
          - resources:
              kinds: ["Pod"]
      mutate:
        patchStrategicMerge:
          spec:
            securityContext:
              runAsNonRoot: true
              seccompProfile:
                type: RuntimeDefault
            containers:
              - (name): "*"
                securityContext:
                  allowPrivilegeEscalation: false
                  capabilities:
                    drop: ["ALL"]

---
# Auto-add resource defaults if not specified
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: add-default-resources
spec:
  rules:
    - name: set-default-limits
      match:
        any:
          - resources:
              kinds: ["Pod"]
      mutate:
        patchStrategicMerge:
          spec:
            containers:
              - (name): "*"
                resources:
                  limits:
                    +(memory): "512Mi"     # + means only add if not set
                    +(cpu): "500m"
                  requests:
                    +(memory): "256Mi"
                    +(cpu): "100m"

---
# Auto-add image pull secrets
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: add-pull-secret
spec:
  rules:
    - name: add-registry-secret
      match:
        any:
          - resources:
              kinds: ["Pod"]
      preconditions:
        all:
          - key: "{{ request.object.spec.containers[].image }}"
            operator: AnyIn
            value: ["ghcr.io/*", "myregistry.com/*"]
      mutate:
        patchStrategicMerge:
          spec:
            imagePullSecrets:
              - name: registry-credentials
```

### Generation Policies

```yaml
# Auto-create NetworkPolicy for every new namespace
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: generate-default-networkpolicy
spec:
  rules:
    - name: default-deny-ingress
      match:
        any:
          - resources:
              kinds: ["Namespace"]
      generate:
        synchronize: true                # Keep in sync if policy changes
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        name: default-deny
        namespace: "{{ request.object.metadata.name }}"
        data:
          spec:
            podSelector: {}
            policyTypes:
              - Ingress

---
# Auto-create ResourceQuota for namespaces
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: generate-quota
spec:
  rules:
    - name: default-quota
      match:
        any:
          - resources:
              kinds: ["Namespace"]
      exclude:
        any:
          - resources:
              namespaces: ["kube-system", "kyverno"]
      generate:
        apiVersion: v1
        kind: ResourceQuota
        name: default-quota
        namespace: "{{ request.object.metadata.name }}"
        data:
          spec:
            hard:
              requests.cpu: "4"
              requests.memory: "8Gi"
              limits.cpu: "8"
              limits.memory: "16Gi"
              pods: "50"

```

### Verify Image Signatures

```yaml
# Enforce cosign signature verification
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-images
spec:
  validationFailureAction: Enforce
  webhookTimeoutSeconds: 30
  rules:
    - name: verify-signature
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myorg/*"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor:
                      url: "https://rekor.sigstore.dev"
```

## Installation

```bash
# Helm
helm repo add kyverno https://kyverno.github.io/kyverno/
helm install kyverno kyverno/kyverno -n kyverno --create-namespace

# Install policy library
kubectl apply -f https://raw.githubusercontent.com/kyverno/policies/main/pod-security/...

# CLI (for testing policies locally)
brew install kyverno
kyverno apply policy.yaml --resource pod.yaml
```


## Examples

### Example 1

**User request:** "Help me set up Kyverno"

The agent follows the instructions above to configure Kyverno with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Kyverno configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **YAML, not Rego** — Kyverno policies are pure YAML; lower barrier to entry than OPA/Gatekeeper for Kubernetes teams
2. **Audit before enforce** — Start with `validationFailureAction: Audit` to see violations without blocking; switch to `Enforce` once clean
3. **Mutate for defaults** — Use mutation policies to inject security defaults; developers don't need to remember boilerplate
4. **Generate for consistency** — Auto-create NetworkPolicies, ResourceQuotas, and RBAC for every namespace
5. **Image verification** — Enforce cosign signature verification; prevent unsigned images from running in the cluster
6. **Policy library** — Start with Kyverno's policy library (kyverno.io/policies); covers Pod Security Standards, best practices, and compliance
7. **Test with CLI** — Use `kyverno apply` and `kyverno test` locally before deploying policies to the cluster
8. **Exceptions via annotations** — Use `policies.kyverno.io/exclude` annotations for legitimate exceptions; document the reason
