---
name: istio
description: >-
  Istio is an open-source service mesh that adds traffic management, mTLS security and observability to Kubernetes workloads through sidecar proxies or ambient mode.
  Use when the user needs to install Istio, configure traffic routing and canary releases, mTLS, authorization policies,
  circuit breaking, fault injection, ingress gateways, or tracing for microservices.
license: Apache-2.0
compatibility: 'linux, macos; a Kubernetes cluster and kubectl; istioctl matching the Istio release (1.31.x at time of writing)'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/istio/istio
  category: devops
  tags:
    - istio
    - service-mesh
    - kubernetes
    - traffic-management
    - security
---

# Istio

## Overview

Istio is a service mesh for Kubernetes. A control plane (`istiod`) configures Envoy sidecar proxies (or, in ambient mode, per-node `ztunnel` plus optional waypoint proxies) so that routing, retries, mutual TLS, access policy and telemetry are handled outside application code. This skill covers installation with `istioctl`, the core resources (VirtualService, DestinationRule, Gateway API, PeerAuthentication, AuthorizationPolicy, Telemetry) and debugging.

## Instructions

### Install

Prefer a package manager, or download the release archive and verify its checksum. Do not pipe the `downloadIstio` script into a shell.

```bash
brew install istioctl            # macOS / Linuxbrew

# or: pinned release archive with checksum verification (Linux x86-64)
ISTIO_VERSION=1.31.1
BASE=https://github.com/istio/istio/releases/download/$ISTIO_VERSION
curl -fsSLO $BASE/istioctl-$ISTIO_VERSION-linux-amd64.tar.gz
curl -fsSLO $BASE/istioctl-$ISTIO_VERSION-linux-amd64.tar.gz.sha256
sha256sum -c istioctl-$ISTIO_VERSION-linux-amd64.tar.gz.sha256
tar xzf istioctl-$ISTIO_VERSION-linux-amd64.tar.gz && sudo install istioctl /usr/local/bin/

istioctl x precheck                              # check the cluster first
istioctl install --set profile=default -y        # or profile=demo for evaluation, profile=ambient for ambient mode
kubectl label namespace shop istio-injection=enabled   # sidecar mode: restart pods afterwards
istioctl analyze --all-namespaces                # lint configuration
```

`istioctl verify-install` no longer exists; use `istioctl analyze` and `kubectl -n istio-system get pods`. `istioctl upgrade` is just an alias of `istioctl install`. Do not skip more than two minor versions per upgrade; for production prefer a canary control plane with `--set revision=1-31-1` and `istioctl tag set`. For ambient mode label namespaces with `istio.io/dataplane-mode=ambient` instead.

### IstioOperator options

```yaml
# istio-config.yaml: apply with `istioctl install -f istio-config.yaml`
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  profile: default
  meshConfig:
    accessLogFile: /dev/stdout
    extensionProviders:
      - name: zipkin
        zipkin:
          service: zipkin.observability.svc.cluster.local
          port: 9411
  components:
    ingressGateways:
      - name: istio-ingressgateway
        enabled: true
        k8s:
          hpaSpec: { minReplicas: 2, maxReplicas: 5 }
```

Tracing is switched on per mesh, namespace or workload with the Telemetry API, not with `meshConfig.defaultConfig.tracing`:

```yaml
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: mesh-default
  namespace: istio-system
spec:
  tracing:
    - providers:
        - name: zipkin
      randomSamplingPercentage: 5.0
```

### Traffic management

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: web-app
  namespace: shop
spec:
  hosts: [web-app]
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination: { host: web-app, subset: canary }
    - route:
        - destination: { host: web-app, subset: stable }
          weight: 90
        - destination: { host: web-app, subset: canary }
          weight: 10
      timeout: 10s
      retries:
        attempts: 3
        perTryTimeout: 3s
        retryOn: 5xx,reset,connect-failure
---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: web-app
  namespace: shop
spec:
  host: web-app
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http: { http1MaxPendingRequests: 100, http2MaxRequests: 1000 }
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
    - name: stable
      labels: { version: v1 }
    - name: canary
      labels: { version: v2 }
```

### Ingress with the Kubernetes Gateway API (recommended)

Gateway API CRDs are not installed on most clusters. At the time of writing the Istio docs install v1.6.0:

```bash
kubectl kustomize "github.com/kubernetes-sigs/gateway-api/config/crd?ref=v1.6.0" | kubectl apply -f -
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shop-gateway
  namespace: istio-ingress
spec:
  gatewayClassName: istio
  listeners:
    - name: https
      hostname: shop.acme-store.dev
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: shop-tls-cert
      allowedRoutes:
        namespaces: { from: All }
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop
  namespace: shop
spec:
  parentRefs:
    - name: shop-gateway
      namespace: istio-ingress
  hostnames: ["shop.acme-store.dev"]
  rules:
    - matches:
        - path: { type: PathPrefix, value: /api }
      backendRefs:
        - name: api-service
          port: 8080
    - backendRefs:
        - name: frontend
          port: 80
```

Istio creates the gateway Deployment and Service automatically for a `Gateway` with `gatewayClassName: istio`. The older `networking.istio.io` `Gateway` (with `selector: istio: ingressgateway` and a VirtualService bound through `gateways:`) is still supported if you run the `istio-ingressgateway` component.

### Security

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system   # root namespace = mesh-wide
spec:
  mtls:
    mode: STRICT
---
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: api-access
  namespace: shop
spec:
  selector:
    matchLabels:
      app: api-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/shop/sa/frontend"]
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/api/*"]
```

### Fault injection

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: api-fault-test
  namespace: shop
spec:
  hosts: [api-service]
  http:
    - fault:
        delay: { percentage: { value: 10 }, fixedDelay: 5s }
        abort: { percentage: { value: 5 }, httpStatus: 503 }
      route:
        - destination: { host: api-service }
```

### Debugging

```bash
istioctl proxy-status                          # is every proxy synced with istiod?
istioctl proxy-config routes deploy/web-app -n shop
istioctl proxy-config clusters deploy/web-app -n shop
istioctl analyze -n shop
istioctl dashboard kiali                       # needs the Kiali addon installed
```

## Examples

### Example 1: Canary release of web-app at 10%

**User request:** "Send 10% of traffic for web-app to v2 and let my QA header always hit v2."

Label the Deployments `version: v1` and `version: v2`, apply the VirtualService and DestinationRule above, then check with `istioctl analyze -n shop` (expected: `No validation issues found`) and `istioctl proxy-config routes deploy/web-app -n shop`. Requests with `x-canary: true` go to v2; others split 90/10. Raise the weight in steps and watch 5xx rates in Kiali or Prometheus before moving on.

### Example 2: Turn on strict mTLS safely

**User request:** "Make all service-to-service traffic encrypted."

Inject sidecars (or enroll namespaces in ambient mode) everywhere first, apply a `PeerAuthentication` with `mode: PERMISSIVE` in `shop`, confirm in Kiali that every edge shows a padlock, then change to `STRICT` mesh-wide as above. Result: plaintext calls from non-mesh pods now fail with connection resets, which is the intended signal to fix them.

## Guidelines

- Sidecars only appear on pods created after labeling a namespace; run `kubectl rollout restart deployment -n shop`.
- Keep the `istioctl` version within one minor version of the control plane and upgrade one minor at a time.
- Do not apply STRICT mTLS or a deny-all `AuthorizationPolicy` before checking every caller is in the mesh; roll out in PERMISSIVE and `ALLOW` first.
- `v1beta1`/`v1alpha3` networking and security APIs are still accepted, but new manifests should use `v1`.
- Run `istioctl analyze` before every apply; most misconfigurations (wrong host, missing subset) are caught there.
- Sampling 100% of traces is for demos; production needs about 1-5%.
- Never hard-code TLS keys in manifests: use Kubernetes Secrets (`credentialName`/`certificateRefs`).
- A mesh adds CPU, memory and latency per pod; do not use it for a handful of services that only need an ingress controller.
