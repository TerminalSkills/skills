---
name: kyverno
description: Kyverno is a Kubernetes-native policy engine that validates, mutates, and generates resources and verifies image signatures using YAML policies (no Rego required). Use when a user asks to enforce Pod security or resource limits with admission policies, inject defaults, create per-namespace NetworkPolicies or quotas, verify cosign signatures, test policies with the kyverno CLI, or migrate ClusterPolicy to ValidatingPolicy before Kyverno 1.20.
license: Apache-2.0
compatibility: Kyverno 1.19 on Kubernetes 1.33–1.35 (Helm 3 to install); the kyverno CLI tests policies without a cluster
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/kyverno/kyverno
  tags:
  - kubernetes
  - policy
  - admission-control
  - mutation
  - validation
---

# Kyverno — Kubernetes Native Policy Engine

## Overview

Kyverno runs as an admission controller plus background scanner. Policies are ordinary Kubernetes resources written in YAML, with the logic in CEL expressions (the language Kubernetes itself uses for `ValidatingAdmissionPolicy`).

**Write new policies with the CEL policy types** in `policies.kyverno.io/v1` (stable since 1.18). `ClusterPolicy`, `Policy` and `CleanupPolicy` (`kyverno.io`) are deprecated in 1.19 and scheduled for removal in 1.20 (estimated November 2026). Each new type has a namespaced twin (`NamespacedValidatingPolicy`, …) that namespace owners can manage.

| Kind (short name) | Does | Replaces `ClusterPolicy` rule |
| --- | --- | --- |
| `ValidatingPolicy` (`vpol`) | Allow, audit or deny resources | `validate` |
| `MutatingPolicy` (`mpol`) | Patch new or existing resources | `mutate` |
| `GeneratingPolicy` (`gpol`) | Create or clone resources on a trigger | `generate` |
| `ImageValidatingPolicy` (`ivpol`) | Verify image signatures and attestations | `verifyImages` |
| `DeletingPolicy` (`dpol`) | Delete matching resources on a schedule | `CleanupPolicy` |

## Instructions

### Install

```bash
helm repo add kyverno https://kyverno.github.io/kyverno/ && helm repo update
# Production: three admission replicas (a single replica is fine for a test cluster)
helm install kyverno kyverno/kyverno -n kyverno --create-namespace \
  --set admissionController.replicas=3 --set backgroundController.replicas=2 \
  --set cleanupController.replicas=2 --set reportsController.replicas=2
# Optional: the Pod Security Standards as policies, Audit by default (more: https://kyverno.io/policies/)
helm install kyverno-policies kyverno/kyverno-policies -n kyverno --set podSecurityStandard=baseline
# CLI for local testing: package manager …
brew install kyverno                 # or: kubectl krew install kyverno  ->  kubectl kyverno
# … or a release archive, verified against the published checksums
VERSION=v1.19.1
curl -fsSLO https://github.com/kyverno/kyverno/releases/download/$VERSION/kyverno-cli_${VERSION}_linux_x86_64.tar.gz
curl -fsSLO https://github.com/kyverno/kyverno/releases/download/$VERSION/checksums.txt
sha256sum --check --ignore-missing checksums.txt     # kyverno-cli_v1.19.1_linux_x86_64.tar.gz: OK
tar -xzf kyverno-cli_${VERSION}_linux_x86_64.tar.gz kyverno && install -D -m 0755 kyverno ~/.local/bin/kyverno
```

### Validation Policies

```yaml
# pod-hardening.yaml — limits required, no privileged containers, no :latest
apiVersion: policies.kyverno.io/v1
kind: ValidatingPolicy
metadata:
  name: pod-hardening
spec:
  validationActions: [Audit]          # Audit = report only, Warn = kubectl warning, Deny = block
  matchConstraints:
    resourceRules:
      - {apiGroups: [''], apiVersions: [v1], operations: [CREATE, UPDATE], resources: [pods]}
  variables:
    - name: containers
      expression: object.spec.containers + object.spec.?initContainers.orValue([])
  validations:
    - message: Every container needs CPU and memory limits.
      expression: >-
        variables.containers.all(c, has(c.resources) && has(c.resources.limits)
          && 'cpu' in c.resources.limits && 'memory' in c.resources.limits)
    - message: Privileged containers are not allowed.
      expression: variables.containers.all(c, !c.?securityContext.?privileged.orValue(false))
    - messageExpression: "'Pin a version tag or digest instead of latest: ' + variables.containers.map(c, c.image).join(', ')"
      expression: variables.containers.map(c, image(c.image)).all(i, i.containsDigest() || i.tag() != 'latest')
```

- A policy that matches only `pods` is extended automatically to Deployments, ReplicaSets, StatefulSets, DaemonSets, Jobs and CronJobs (autogen); narrow it with `spec.autogen.podControllers.controllers`.
- Optional fields need `has()` or the `?` operator; a missing field otherwise raises an evaluation error. `image()` comes from Kyverno's CEL libraries (also `resource.Get()`, `http.Get()`); an untagged image counts as `latest`.
- Background scans of existing resources are on by default (`spec.evaluation.background.enabled`); results land in PolicyReports: `kubectl get policyreport -A`.

### Mutation Policies

```yaml
# pod-defaults.yaml — security defaults, default requests, pull secret for the private registry
apiVersion: policies.kyverno.io/v1
kind: MutatingPolicy
metadata:
  name: pod-defaults
spec:
  autogen: {podControllers: {controllers: []}}     # mutate Pods only (see the note below)
  matchConstraints:
    resourceRules:
      - {apiGroups: [''], apiVersions: [v1], operations: [CREATE], resources: [pods]}
  mutations:
    - patchType: ApplyConfiguration   # merge-style; list entries are matched by name
      applyConfiguration:
        expression: >-
          Object{spec: Object.spec{
            securityContext: Object.spec.securityContext{
              runAsNonRoot: true,
              seccompProfile: Object.spec.securityContext.seccompProfile{type: "RuntimeDefault"}
            },
            containers: object.spec.containers.map(c, Object.spec.containers{
              name: c.name,
              securityContext: Object.spec.containers.securityContext{allowPrivilegeEscalation: false},
              resources: Object.spec.containers.resources{requests: Object.spec.containers.resources.requests{
                cpu: c.?resources.?requests.?cpu.orValue(c.?resources.?limits.?cpu.orValue("100m")),
                memory: c.?resources.?requests.?memory.orValue(c.?resources.?limits.?memory.orValue("256Mi"))
              }}
            })
          }}
    - patchType: JSONPatch            # RFC 6902; required for atomic lists such as capabilities.drop (keeps an existing add list)
      jsonPatch:
        expression: >-
          object.spec.containers.map(c, JSONPatch{op: "add",
            path: "/spec/containers/" + string(object.spec.containers.indexOf(c)) + "/securityContext/capabilities",
            value: {"drop": dyn(["ALL"]), "add": dyn(c.?securityContext.?capabilities.?add.orValue([]))}})
    - patchType: JSONPatch
      jsonPatch:
        expression: >-
          object.spec.containers.exists(c, c.image.startsWith("ghcr.io/northwind/"))
          && !has(object.spec.imagePullSecrets)
          ? [JSONPatch{op: "add", path: "/spec/imagePullSecrets", value: [{"name": "ghcr-northwind"}]}]
          : []
```

`ApplyConfiguration` cannot change atomic lists or maps (the error is `may not mutate atomic arrays, maps or structs`), so use `JSONPatch` for those. Autogen rewrites `ApplyConfiguration` expressions for pod controllers but not `JSONPatch` paths: a Pod policy with a `JSONPatch` either disables autogen as above or fails on Deployments with `no such key: containers`. To patch resources that already exist, set `spec.evaluation.mutateExisting.enabled: true` and grant the background controller RBAC on the targets. Mutations run in order inside one policy; the order across policies is not guaranteed.

### Generation Policies

```yaml
# namespace-defaults.yaml — default-deny NetworkPolicy and a ResourceQuota in every new namespace
apiVersion: policies.kyverno.io/v1
kind: GeneratingPolicy
metadata:
  name: namespace-defaults
spec:
  evaluation:
    synchronize: {enabled: true}      # revert manual edits; follow policy changes
    generateExisting: {enabled: true} # also cover namespaces that already exist
  matchConstraints:
    resourceRules:
      - {apiGroups: [''], apiVersions: [v1], operations: [CREATE], resources: [namespaces]}
  matchConditions:
    - name: skip-system-namespaces
      expression: "!(object.metadata.name in ['kube-system', 'kube-public', 'kyverno'])"
  variables:
    - name: ns
      expression: object.metadata.name
    - name: downstream
      expression: >-
        [
          {"apiVersion": dyn("networking.k8s.io/v1"), "kind": dyn("NetworkPolicy"),
           "metadata": dyn({"name": "default-deny-ingress"}),
           "spec": dyn({"podSelector": dyn({}), "policyTypes": dyn(["Ingress"])})},
          {"apiVersion": dyn("v1"), "kind": dyn("ResourceQuota"),
           "metadata": dyn({"name": "default-quota"}),
           "spec": dyn({"hard": dyn({"requests.cpu": "4", "requests.memory": "8Gi",
             "limits.cpu": "8", "limits.memory": "16Gi", "pods": "50"})})}
        ]
  generate:
    - expression: generator.Apply(variables.ns, variables.downstream)
```

To clone instead of template, fetch the source with `resource.Get("v1", "secrets", "platform", "ghcr-northwind")` and pass it to `generator.Apply(variables.ns, [variables.source])`. With `synchronize`, deleting the trigger deletes the generated resources. The background controller needs RBAC for every kind it creates.

### Verify Image Signatures

```yaml
# verify-images.yaml — only images signed by the release workflow (cosign keyless) may run
apiVersion: policies.kyverno.io/v1
kind: ImageValidatingPolicy
metadata:
  name: verify-northwind-images
spec:
  validationActions: [Deny]
  webhookConfiguration: {timeoutSeconds: 15}       # default 10, maximum 30
  matchConstraints:
    resourceRules:
      - {apiGroups: [''], apiVersions: [v1], operations: [CREATE, UPDATE], resources: [pods]}
  matchImageReferences:
    - glob: ghcr.io/northwind/*
  attestors:
    - name: ci
      cosign:
        keyless:
          identities:
            - subject: https://github.com/northwind/checkout-api/.github/workflows/release.yml@refs/heads/main
              issuer: https://token.actions.githubusercontent.com
        ctlog: {url: https://rekor.sigstore.dev}
  validations:
    - message: Image is not signed by the northwind release workflow.
      expression: >-   # every matched image must be verified, init containers included, or the Pod is rejected
        (images.containers + images.initContainers + images.ephemeralContainers)
          .all(i, verifyImageSignatures(i, [attestors.ci]) > 0)
```

Use `subjectRegExp` to accept several workflows, or `cosign.key.data` with a PEM public key. In the cluster the tag is rewritten to the verified digest (`validationConfigurations.mutateDigest`, default true). Private registries: list pull secrets under `spec.credentials.secrets`; they must live in the Kyverno namespace, and the Pod's own `imagePullSecrets` are not used. On the CLI, verification needs digest references (`image:tag@sha256:…`) and network access to the registry and Rekor.

### Exceptions and Local Testing

```yaml
# exception.yaml — needs the chart values features.policyExceptions.enabled=true and
# features.policyExceptions.namespace=policy-exceptions (exceptions are off by default)
apiVersion: policies.kyverno.io/v1
kind: PolicyException
metadata:
  name: allow-node-exporter
  namespace: policy-exceptions
spec:
  policyRefs:
    - {name: pod-hardening, kind: ValidatingPolicy}
  matchConditions:
    - name: node-exporter-pods
      expression: object.metadata.namespace == 'monitoring' && object.metadata.name.startsWith('node-exporter')
  expiresAt: "2027-03-31T00:00:00Z"
```

```bash
kyverno apply pod-hardening.yaml --resource manifests/ --table        # dry run; exit code 1 on any failure
helm template charts/checkout-api | kyverno apply policies/ --resource -      # rendered charts via stdin
kyverno apply pod-hardening.yaml --resource manifests/ --exception exception.yaml
kyverno apply policies/ --cluster --policy-report                     # scan the current kubectl context
kyverno test tests/                    # runs every kyverno-test.yaml below tests/
```

```yaml
# tests/kyverno-test.yaml — expected results, checked by `kyverno test`
apiVersion: cli.kyverno.io/v1alpha1
kind: Test
metadata: {name: pod-hardening}
policies: [../pod-hardening.yaml]
resources: [pods.yaml]
results:
  - {policy: pod-hardening, isValidatingPolicy: true, kind: Pod, resources: [checkout-api], result: pass}
  - {policy: pod-hardening, isValidatingPolicy: true, kind: Pod, resources: [debug-shell], result: fail}
```

## Examples

### Example 1: Stop `:latest` and missing limits without blocking anyone yet

**User request:** "Pods keep landing in our cluster with `:latest` and no limits. Add a Kyverno policy, but only report for now."

Save `pod-hardening.yaml` from above with `validationActions: [Audit]`, then check the repository's manifests before touching the cluster:

```
$ kyverno apply pod-hardening.yaml --resource k8s/
Applying 1 policy rule(s) to 3 resource(s)...
policy pod-hardening -> resource payments/Pod/debug-shell failed:
1 -  Pin a version tag or digest instead of latest: ghcr.io/northwind/debug-shell:latest
policy pod-hardening -> resource payments/Deployment/checkout-api failed:
1 -  Every container needs CPU and memory limits.

pass: 1, fail: 2, warn: 0, error: 0, skip: 0
```

Then `kubectl apply -f pod-hardening.yaml`, confirm it with `kubectl get vpol`, read violations of running workloads with `kubectl get policyreport -A`, and change the action to `[Deny]` once the reports are clean.

### Example 2: Migrate a ClusterPolicy before upgrading to 1.20

**User request:** "We still have this `require-labels` ClusterPolicy with a `pattern`. Convert it so the upgrade does not break us."

The legacy rule `validate.pattern.metadata.labels: {team: "?*", app: "?*"}` with `validationFailureAction: Enforce` becomes:

```yaml
apiVersion: policies.kyverno.io/v1
kind: ValidatingPolicy
metadata:
  name: require-team-labels
spec:
  validationActions: [Deny]           # was validationFailureAction: Enforce
  matchConstraints:                   # was match.any[].resources.kinds
    resourceRules:
      - {apiGroups: [apps], apiVersions: [v1], operations: [CREATE, UPDATE], resources: [deployments, statefulsets]}
  validations:                        # was validate.pattern
    - message: Deployments and StatefulSets need non-empty 'team' and 'app' labels.
      expression: "['team', 'app'].all(l, object.metadata.?labels[l].orValue('') != '')"
```

Other mappings: `preconditions` → `matchConditions`, `context` → `variables`, `{{ request.object }}` → `object`, `patchStrategicMerge` → `ApplyConfiguration`, `exclude` → `matchConstraints.excludeResourceRules`. Run `kyverno apply policies/ --resource k8s/ --warnings-as-errors` in CI: it fails while any legacy policy remains (`Error: found 1 deprecation warning(s) and --warnings-as-errors is set`).

## Guidelines

1. **Audit before Deny** — start with `validationActions: [Audit]`, read the PolicyReports, then enforce.
2. **Migrate before 1.20** — legacy `ClusterPolicy`, `CleanupPolicy` and `kyverno.io` PolicyExceptions stop working when the types are removed; `kubectl get cpol,pol,cleanpol,ccleanpol -A` lists what is left in a cluster, and `sum(kyverno_deprecated_api_requests_total) by (kind)` shows which legacy kinds are still being created or updated. Read the release notes of every minor version and upgrade with Helm, not by re-applying `install.yaml`.
3. **A fail-closed webhook can block the cluster** — policies fail closed by default; give Kyverno its own namespace, run three admission replicas and keep that namespace excluded (the chart default). If the API server is stuck because Kyverno is down, delete `kyverno-resource-validating-webhook-cfg` and `kyverno-resource-mutating-webhook-cfg`; Kyverno recreates them.
4. **Test in CI** — `kyverno apply` and `kyverno test` need no cluster; keep a `kyverno-test.yaml` next to each policy.
5. **Exceptions are a bypass** — restrict them to one namespace only platform admins can write to and give each an `expiresAt`.
6. **Not a runtime sensor** — Kyverno acts at admission and in background scans; it does not watch running processes (use Falco or Tetragon), and it complements rather than replaces RBAC.
