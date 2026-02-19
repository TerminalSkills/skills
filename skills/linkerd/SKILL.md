---
name: linkerd
description: >-
  Linkerd lightweight service mesh for Kubernetes. Use when the user needs
  automatic mTLS, traffic splitting, retries, and observability with minimal
  resource overhead and operational complexity.
license: Apache-2.0
compatibility:
  - linux
  - macos
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - linkerd
    - service-mesh
    - kubernetes
    - mtls
    - observability
---

# Linkerd

Linkerd is an ultralight service mesh for Kubernetes focused on simplicity, security, and performance.

## Installation

```bash
# Install Linkerd CLI
curl --proto '=https' -sSfL https://run.linkerd.io/install | sh
export PATH=$HOME/.linkerd2/bin:$PATH

# Pre-check cluster
linkerd check --pre

# Install control plane
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -

# Verify installation
linkerd check

# Install viz extension (dashboard, metrics)
linkerd viz install | kubectl apply -f -
linkerd viz check
```

## Mesh Injection

```bash
# Inject sidecar proxies into a deployment
kubectl get deploy web-app -o yaml | linkerd inject - | kubectl apply -f -

# Inject entire namespace
kubectl annotate namespace default linkerd.io/inject=enabled

# Verify meshed pods
linkerd stat deploy -n default
```

```yaml
# deployment.yaml — Deployment with Linkerd injection annotation
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  annotations:
    linkerd.io/inject: enabled
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      annotations:
        linkerd.io/inject: enabled
    spec:
      containers:
        - name: web
          image: myregistry.com/web-app:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
```

## Traffic Splitting

```yaml
# traffic-split.yaml — Canary deployment with 90/10 traffic split
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: web-app-split
spec:
  service: web-app
  backends:
    - service: web-app-stable
      weight: 900
    - service: web-app-canary
      weight: 100
```

```yaml
# services.yaml — Backend services for traffic split
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app
  ports:
    - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: web-app-stable
spec:
  selector:
    app: web-app
    version: stable
  ports:
    - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: web-app-canary
spec:
  selector:
    app: web-app
    version: canary
  ports:
    - port: 8080
```

## Service Profiles

```yaml
# service-profile.yaml — Define routes with retries and timeouts
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: api-service.default.svc.cluster.local
  namespace: default
spec:
  routes:
    - name: GET /api/users
      condition:
        method: GET
        pathRegex: /api/users
      responseClasses:
        - condition:
            status:
              min: 500
              max: 599
          isFailure: true
      timeout: 5s
      isRetryable: true
    - name: POST /api/orders
      condition:
        method: POST
        pathRegex: /api/orders
      timeout: 10s
      isRetryable: false
  retryBudget:
    retryRatio: 0.2
    minRetriesPerSecond: 10
    ttl: 10s
```

## Authorization Policy

```yaml
# authz-policy.yaml — Server and authorization for mTLS access control
apiVersion: policy.linkerd.io/v1beta2
kind: Server
metadata:
  name: api-server
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: api-service
  port: 8080
  proxyProtocol: HTTP/2
---
apiVersion: policy.linkerd.io/v1alpha1
kind: AuthorizationPolicy
metadata:
  name: api-access
  namespace: default
spec:
  targetRef:
    group: policy.linkerd.io
    kind: Server
    name: api-server
  requiredAuthenticationRefs:
    - name: default-mesh-tls
      kind: MeshTLSAuthentication
      group: policy.linkerd.io
---
apiVersion: policy.linkerd.io/v1alpha1
kind: MeshTLSAuthentication
metadata:
  name: default-mesh-tls
  namespace: default
spec:
  identities:
    - "*.default.serviceaccount.identity.linkerd.cluster.local"
```

## Multicluster

```bash
# Link two clusters
linkerd multicluster install | kubectl apply -f -
linkerd multicluster link --cluster-name=west | kubectl --context=east apply -f -

# Export a service to other clusters
kubectl label svc web-app mirror.linkerd.io/exported=true

# Check multicluster status
linkerd multicluster check
linkerd multicluster gateways
```

## Common Commands

```bash
# Observability
linkerd viz stat deploy
linkerd viz routes deploy/web-app
linkerd viz top deploy/web-app
linkerd viz tap deploy/web-app

# Dashboard
linkerd viz dashboard

# Debugging
linkerd diagnostics proxy-metrics -n default pod/web-app-abc123
linkerd identity -n default

# Check and upgrade
linkerd check
linkerd upgrade | kubectl apply -f -
```
