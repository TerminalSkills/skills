---
name: linkerd
description: >-
  Linkerd is a lightweight service mesh for Kubernetes that adds automatic mTLS, retries,
  timeouts, traffic splitting, authorization policy and golden-metric observability without
  changing application code. Use when installing Linkerd, meshing a namespace, running a
  canary rollout, restricting which services can call each other, or linking clusters.
license: Apache-2.0
compatibility: 'Kubernetes cluster with kubectl; Gateway API CRDs; Helm 3 optional; Linux or macOS CLI'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/linkerd/linkerd2"
  category: devops
  tags: "linkerd, service-mesh, kubernetes, mtls, observability"
---

# Linkerd

## Overview

Linkerd is a CNCF service mesh with a small Rust sidecar proxy. Once a workload is meshed, traffic between meshed pods is encrypted with mutual TLS and reported as success rate, request rate and latency.

Release model (as of this writing): the Linkerd project itself publishes only **edge** releases (`edge-26.10.1` is the newest; the numbers are year.month.count). Numbered releases such as 2.20 are cut from edge by vendors (Buoyant Enterprise for Linkerd). The docs and examples below use the edge CLI and charts. Pick one release line and keep the CLI, control plane and extensions on matching versions (`linkerd version` shows client and server).

Configuration has moved to Gateway API types: retries, timeouts and traffic splits use `HTTPRoute`; the old SMI `TrafficSplit` is no longer developed and `ServiceProfile` is legacy.

## Instructions

### Install

Prerequisites: the Gateway API CRDs (check with `kubectl get crd httproutes.gateway.networking.k8s.io`; the Linkerd 2.20 docs list 1.2.1 to 1.5.1 as compatible):

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
```

Install the CLI by taking the `linkerd2-cli-edge-<version>-<os>-<arch>` binary for your platform from the GitHub releases page of `linkerd/linkerd2` (the newest edge), or with Homebrew (`brew install linkerd`, which currently installs 2.20, the build matching edge-26.6.3; its `linkerd install` deploys that version, not the newest edge). Then:

```bash
linkerd check --pre                           # is the cluster ready?
linkerd install --crds | kubectl apply -f -   # CRDs first
linkerd install | kubectl apply -f -          # control plane; trust anchor and issuer certificates are generated
linkerd check
linkerd viz install | kubectl apply -f -      # optional metrics stack, tap and dashboard
linkerd viz check
```

The generated certificates are fine for trying Linkerd. For production use Helm with your own certificates (the CLI `--ha` flag and the chart's `values-ha.yaml` give high availability):

```bash
helm repo add linkerd-edge https://helm.linkerd.io/edge
helm install linkerd-crds linkerd-edge/linkerd-crds -n linkerd --create-namespace
helm install linkerd-control-plane linkerd-edge/linkerd-control-plane -n linkerd \
  --set-file identityTrustAnchorsPEM=ca.crt \
  --set-file identity.issuer.tls.crtPEM=issuer.crt \
  --set-file identity.issuer.tls.keyPEM=issuer.key
```

Rotate the issuer certificate before it expires (cert-manager can automate it). Do not run `linkerd install` twice for the same cluster; use `linkerd upgrade | kubectl apply -f -` or `helm upgrade`.

### Mesh workloads

```bash
kubectl annotate namespace shop linkerd.io/inject=enabled      # new pods in the namespace get the proxy
kubectl rollout restart deploy -n shop                         # existing pods need a restart
kubectl get deploy web-app -n shop -o yaml | linkerd inject - | kubectl apply -f -   # one workload
linkerd -n shop check --proxy
```

The annotation `linkerd.io/inject: enabled` can also sit in a Deployment's pod template metadata.

### Retries and timeouts (annotations)

Set them on a `Service` (all traffic to it) or on an `HTTPRoute` whose parent is that Service. The calling pod must be meshed, since both run in the client proxy.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: shop
  annotations:
    retry.linkerd.io/http: 5xx
    retry.linkerd.io/limit: "2"
    retry.linkerd.io/timeout: 1s
    timeout.linkerd.io/request: 5s
spec:
  selector:
    app: api-service
  ports:
    - port: 8080
```

Retry only idempotent requests; bodies over 64 KiB are not retried. Retries and timeouts do not work for headless services, and are ignored if a `ServiceProfile` exists for the Service.

### Traffic splitting (canary)

```yaml
apiVersion: policy.linkerd.io/v1beta2
kind: HTTPRoute
metadata:
  name: web-app-canary
  namespace: shop
spec:
  parentRefs:
    - name: web-app
      kind: Service
      group: core
      port: 8080
  rules:
    - backendRefs:
        - name: web-app
          port: 8080
          weight: 90
        - name: web-app-canary
          port: 8080
          weight: 10
```

`web-app` and `web-app-canary` are ordinary Services selecting the stable and canary pods. Meshed clients calling `web-app` are split 90/10; change the weights to shift traffic, and verify with `linkerd viz stat -n shop --from deploy/frontend deploy`.

### Authorization policy

A `Server` describes a pod port; once one exists, only traffic allowed by a policy reaches it (kubelet probes are authorized automatically until an `HTTPRoute` is attached to the Server; then authorize them explicitly). Authorize callers by mesh identity:

```yaml
apiVersion: policy.linkerd.io/v1beta3
kind: Server
metadata:
  name: api-server
  namespace: shop
spec:
  podSelector:
    matchLabels:
      app: api-service
  port: 8080
  proxyProtocol: HTTP/1
---
apiVersion: policy.linkerd.io/v1alpha1
kind: MeshTLSAuthentication
metadata:
  name: shop-frontend-only
  namespace: shop
spec:
  identities:
    - "frontend.shop.serviceaccount.identity.linkerd.cluster.local"
---
apiVersion: policy.linkerd.io/v1alpha1
kind: AuthorizationPolicy
metadata:
  name: api-allow-frontend
  namespace: shop
spec:
  targetRef:
    group: policy.linkerd.io
    kind: Server
    name: api-server
  requiredAuthenticationRefs:
    - name: shop-frontend-only
      kind: MeshTLSAuthentication
      group: policy.linkerd.io
```

Check the result with `linkerd viz authz -n shop deploy/api-service`. Metrics scraping and other legitimate callers also need to be allowed once a `Server` exists (`linkerd viz allow-scrapes -n shop` outputs the policy for Prometheus).

### Multicluster

```bash
linkerd --context=east multicluster install | kubectl --context=east apply -f -
linkerd --context=west multicluster install | kubectl --context=west apply -f -
linkerd --context=east multicluster link-gen --cluster-name east | kubectl --context=west apply -f -
kubectl --context=east -n shop label svc web-app mirror.linkerd.io/exported=true
linkerd --context=west multicluster check
linkerd --context=west multicluster gateways
```

`multicluster link` was replaced by `link-gen`. Both clusters must share a trust anchor. Exported services appear in the other cluster as `web-app-east`.

### Observability and debugging

```bash
linkerd viz stat deploy -n shop            # success rate, RPS, latency
linkerd viz top deploy/web-app -n shop     # live per-path view
linkerd viz tap deploy/web-app -n shop     # sample live requests
linkerd viz edges deploy -n shop           # which identities talk to which
linkerd viz dashboard                      # opens the web dashboard
linkerd identity -n shop web-app-6d9f7c5b8-xk2lp   # inspect a pod's certificate
linkerd diagnostics proxy-metrics -n shop po/web-app-6d9f7c5b8-xk2lp
```

## Examples

### Example 1: Mesh a namespace and confirm mTLS

**User request:** "Add Linkerd to our shop namespace and prove traffic is encrypted"

Install the Gateway API CRDs, run `linkerd install --crds | kubectl apply -f -` and `linkerd install | kubectl apply -f -`, then `linkerd viz install | kubectl apply -f -`. Annotate the namespace and `kubectl rollout restart deploy -n shop`. `linkerd viz edges deploy -n shop` lists each client/server pair with its identity and a `SECURED` column; `linkerd viz stat deploy -n shop` shows a MESHED count equal to the pod count.

### Example 2: 10% canary of a new version

**User request:** "Send 10% of traffic to web-app v2 and watch errors"

Create the `web-app-canary` Service (selector `version: canary`) and the `HTTPRoute` above. Watch `linkerd viz stat -n shop --from deploy/frontend deploy`: it shows each backend deployment's share of requests, success rate and latency. If the canary's success rate holds, change the weights to 50/50 and then 0/100; to roll back, set the canary weight to 0.

## Guidelines

- Linkerd only works for meshed pods: the proxy is added when a pod is created, so restart workloads after annotating.
- Protocol detection fails for server-speaks-first protocols (MySQL, SMTP); mark such ports opaque with the `config.linkerd.io/opaque-ports` annotation.
- Test an authorization policy in a non-production namespace first: creating a `Server` denies everything not explicitly allowed. `config.linkerd.io/default-inbound-policy` sets the default for a namespace.
- Do not mix retry annotations with a `ServiceProfile` on the same Service; the profile wins and the annotations are silently ignored.
- Keep the trust anchor and issuer keys outside the cluster repository; never commit them.
- Run `linkerd check` after every install, upgrade and extension change.
- Viz is for troubleshooting and light dashboards; for long retention send proxy metrics to your own Prometheus.
