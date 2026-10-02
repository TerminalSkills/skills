---
name: crossplane
description: >-
  Crossplane for infrastructure as code using Kubernetes CRDs. Use when the user
  needs to provision and manage cloud resources declaratively through Kubernetes
  APIs, compose custom infrastructure abstractions, or build internal platforms.
license: Apache-2.0
compatibility: 'linux, macos (Kubernetes cluster required); Crossplane v2.x'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - crossplane
    - kubernetes
    - infrastructure-as-code
    - cloud
    - platform-engineering
  repository: https://github.com/crossplane/crossplane
---

# Crossplane

## Overview

Crossplane extends Kubernetes to provision and manage cloud infrastructure using Custom Resource Definitions (CRDs). Crossplane v2 made Composite Resources (XRs) and Managed Resources (MRs) namespaced by default and let Compositions assemble any Kubernetes resource, not just Crossplane-managed ones; existing v1 cluster-scoped XRs and Claims still work but are the legacy pattern now.

## Instructions

### Installation

```bash
# Install Crossplane with Helm
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm repo update

helm install crossplane crossplane-stable/crossplane \
  --namespace crossplane-system \
  --create-namespace

# Verify installation
kubectl get pods -n crossplane-system
kubectl api-resources | grep crossplane
```

### AWS Provider

```yaml
# providers/aws-provider.yaml — Install AWS provider families (pin a specific version; check
# https://marketplace.upbound.io for the current release)
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-s3
spec:
  package: xpkg.upbound.io/upbound/provider-aws-s3:v2.8.2
---
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-rds
spec:
  package: xpkg.upbound.io/upbound/provider-aws-rds:v2.8.2
```

```yaml
# providers/aws-config.yaml — AWS provider credentials configuration
apiVersion: v1
kind: Secret
metadata:
  name: aws-creds
  namespace: crossplane-system
type: Opaque
stringData:
  credentials: |
    [default]
    aws_access_key_id = AKIAIOSFODNN7EXAMPLE
    aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
---
apiVersion: aws.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: Secret
    secretRef:
      namespace: crossplane-system
      name: aws-creds
      key: credentials
```

### Managed Resources

```yaml
# resources/s3-bucket.yaml — Provision S3 bucket via Crossplane
apiVersion: s3.aws.upbound.io/v1beta1
kind: Bucket
metadata:
  name: orders-app-data
spec:
  forProvider:
    region: us-east-1
    tags:
      Environment: production
      ManagedBy: crossplane
  providerConfigRef:
    name: default
```

### Composite Resources (v2: namespaced, claim-free)

In Crossplane v2 an XRD defaults to `scope: Namespaced`. A namespaced XR is requested directly — there's no separate Claim kind to define, and the XR itself lives in the caller's namespace.

```yaml
# xrds/database-definition.yaml — XRD for a namespaced database abstraction
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xdatabases.platform.ordersapp.io
spec:
  scope: Namespaced
  group: platform.ordersapp.io
  names:
    kind: XDatabase
    plural: xdatabases
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                size:
                  type: string
                  enum: ["small", "medium", "large"]
                engine:
                  type: string
                  enum: ["postgres", "mysql"]
                  default: postgres
              required:
                - size
```

```yaml
# claims/orders-db.yaml — Request a database directly as a namespaced XR (no Claim kind needed)
apiVersion: platform.ordersapp.io/v1alpha1
kind: XDatabase
metadata:
  name: orders-db
  namespace: team-a
spec:
  size: medium
  engine: postgres
  compositionSelector:
    matchLabels:
      provider: aws
```

A v1-style XRD (`scope: LegacyCluster`, with `claimNames` and a separate `Database` claim kind requested from a different namespace than the XR) still works for backward compatibility, but new platforms should use the namespaced pattern above.

### Compositions use Pipeline mode

Since Crossplane v1.17 the inline `resources:`/patch-and-transform style (`mode: Resources`) is deprecated and receives only security fixes. Current Compositions use `mode: Pipeline`, running one or more installed Functions — commonly `function-patch-and-transform`, which accepts the same base/patches shape as a pipeline step input.

```yaml
# functions/patch-and-transform.yaml — install the function once per cluster
apiVersion: pkg.crossplane.io/v1
kind: Function
metadata:
  name: function-patch-and-transform
spec:
  package: xpkg.crossplane.io/crossplane-contrib/function-patch-and-transform:v0.11.0
```

```yaml
# compositions/database-composition.yaml — Compose RDS from an XDatabase
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: database-aws
  labels:
    provider: aws
spec:
  compositeTypeRef:
    apiVersion: platform.ordersapp.io/v1alpha1
    kind: XDatabase
  mode: Pipeline
  pipeline:
    - step: patch-and-transform
      functionRef:
        name: function-patch-and-transform
      input:
        apiVersion: pt.fn.crossplane.io/v1beta1
        kind: Resources
        resources:
          - name: rds-instance
            base:
              apiVersion: rds.aws.upbound.io/v1beta1
              kind: Instance
              spec:
                forProvider:
                  region: us-east-1
                  engine: postgres
                  storageEncrypted: true
                  skipFinalSnapshot: false
            patches:
              - type: FromCompositeFieldPath
                fromFieldPath: spec.size
                toFieldPath: spec.forProvider.instanceClass
                transforms:
                  - type: map
                    map:
                      small: db.t3.micro
                      medium: db.t3.medium
                      large: db.r6g.large
              - type: FromCompositeFieldPath
                fromFieldPath: spec.engine
                toFieldPath: spec.forProvider.engine
```

### Other clouds

GCP and Azure work the same way, with their own Provider packages and `ProviderConfig` kind — e.g. `xpkg.upbound.io/upbound/provider-gcp-storage` with `gcp.upbound.io/v1beta1` `ProviderConfig` (fields: `projectID`, `credentials.secretRef`). Check `marketplace.upbound.io` for the current package name and version before installing.

### Common Commands

```bash
# Check providers and functions
kubectl get providers
kubectl get functions
kubectl get providerconfigs

# Check managed resources
kubectl get managed
kubectl describe bucket orders-app-data

# Check compositions and composite resources
kubectl get compositions
kubectl get compositeresourcedefinitions
kubectl get composite
kubectl get xdatabases --all-namespaces   # namespaced XRs are requested directly, no claim kind

# Debug
kubectl get events --field-selector involvedObject.name=orders-app-data
crossplane beta trace xdatabase orders-db -n team-a
```

## Examples

### Example 1: "Give the orders team a self-service way to request an S3 bucket, without them writing provider YAML"

1. Install `provider-aws-s3` and apply an `XDatabase`-style XRD plus a `mode: Pipeline` Composition for a bucket abstraction (same shape as the `XDatabase` example above, swapping the base resource for `s3.aws.upbound.io/v1beta1` `Bucket`).
2. The orders team applies only:
   ```yaml
   apiVersion: platform.ordersapp.io/v1alpha1
   kind: XBucket
   metadata:
     name: orders-exports
     namespace: team-a
   spec:
     size: medium
   ```
3. `kubectl get xbuckets -n team-a` shows the XR; `kubectl get managed` shows the `Bucket` Crossplane created underneath it.

Result: the orders team never touches AWS credentials or `forProvider` fields — they request `size: medium` and Crossplane resolves it to the right bucket configuration via the Composition's patches.

### Example 2: "Check why a managed resource is stuck and not reaching READY"

```bash
kubectl get managed
kubectl describe bucket orders-app-data
kubectl get events --field-selector involvedObject.name=orders-app-data
```

Result: `kubectl describe` shows the resource's `Synced`/`Ready` conditions and the last reconcile error (commonly a `ProviderConfig` that doesn't exist yet, or missing IAM permissions on the credentials in the referenced `Secret`); the events feed shows the same error with a timestamp history.

## Guidelines

- Pin every Provider and Function package to an exact version tag — `marketplace.upbound.io` lists current releases; don't rely on a floating/`latest` tag in production.
- Prefer namespaced XRs (v2's default) for new platforms; only reach for `scope: LegacyCluster` + Claims when migrating an existing v1 setup that isn't ready to move yet.
- A Composition is either `mode: Pipeline` (current, extensible via Functions) or the deprecated bare `resources:`/`mode: Resources` style — don't mix both in one Composition.
- Never commit real cloud credentials into a `Secret` manifest; pull them from a secrets manager or CI secret store before applying.
- `crossplane beta trace` is still beta — check `crossplane --help` on your installed CLI version before scripting around its exact output format.
