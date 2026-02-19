---
name: istio
description: >-
  Istio service mesh for Kubernetes traffic management, security, and
  observability. Use when the user needs to configure traffic routing, mTLS,
  circuit breaking, fault injection, or observability for microservices.
license: Apache-2.0
compatibility:
  - linux
  - macos
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - istio
    - service-mesh
    - kubernetes
    - traffic-management
    - security
---

# Istio

Istio is a service mesh that provides traffic management, security, and observability for Kubernetes workloads.

## Installation

```bash
# Download and install istioctl
curl -L https://istio.io/downloadIstio | sh -
cd istio-* && export PATH=$PWD/bin:$PATH

# Install with production profile
istioctl install --set profile=default -y

# Enable sidecar injection for namespace
kubectl label namespace default istio-injection=enabled

# Verify installation
istioctl verify-install
istioctl analyze
```

## IstioOperator Configuration

```yaml
# istio-config.yaml — Custom Istio installation profile
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: istio-control-plane
spec:
  profile: default
  meshConfig:
    accessLogFile: /dev/stdout
    enableTracing: true
    defaultConfig:
      tracing:
        sampling: 100
  components:
    ingressGateways:
      - name: istio-ingressgateway
        enabled: true
        k8s:
          service:
            type: LoadBalancer
          hpaSpec:
            minReplicas: 2
            maxReplicas: 5
    pilot:
      k8s:
        resources:
          requests:
            cpu: 500m
            memory: 2Gi
```

## Traffic Management

```yaml
# networking/virtual-service.yaml — Route traffic with weights and matching
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: web-app
spec:
  hosts:
    - web-app
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: web-app
            subset: canary
    - route:
        - destination:
            host: web-app
            subset: stable
          weight: 90
        - destination:
            host: web-app
            subset: canary
          weight: 10
      timeout: 10s
      retries:
        attempts: 3
        perTryTimeout: 3s
        retryOn: 5xx,reset,connect-failure
```

```yaml
# networking/destination-rule.yaml — Define subsets and connection pool
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: web-app
spec:
  host: web-app
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: DEFAULT
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
    - name: stable
      labels:
        version: v1
    - name: canary
      labels:
        version: v2
```

## Gateway and Ingress

```yaml
# networking/gateway.yaml — Istio Gateway for external traffic
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: main-gateway
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: app-tls-cert
      hosts:
        - "app.example.com"
        - "api.example.com"
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "*.example.com"
      tls:
        httpsRedirect: true
```

```yaml
# networking/vs-ingress.yaml — VirtualService bound to Gateway
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: app-ingress
spec:
  hosts:
    - "app.example.com"
  gateways:
    - main-gateway
  http:
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: api-service
            port:
              number: 8080
    - route:
        - destination:
            host: frontend
            port:
              number: 80
```

## Security (mTLS)

```yaml
# security/peer-auth.yaml — Enforce strict mTLS mesh-wide
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT
```

```yaml
# security/authz-policy.yaml — Authorization policy for service access
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: api-access
  namespace: default
spec:
  selector:
    matchLabels:
      app: api-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/default/sa/frontend"]
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/api/*"]
```

## Fault Injection

```yaml
# testing/fault-injection.yaml — Inject delays and aborts for testing
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api-fault-test
spec:
  hosts:
    - api-service
  http:
    - fault:
        delay:
          percentage:
            value: 10
          fixedDelay: 5s
        abort:
          percentage:
            value: 5
          httpStatus: 503
      route:
        - destination:
            host: api-service
```

## Common Commands

```bash
# Proxy and debugging
istioctl proxy-status
istioctl proxy-config routes deploy/web-app
istioctl proxy-config clusters deploy/web-app

# Dashboard access
istioctl dashboard kiali
istioctl dashboard grafana
istioctl dashboard jaeger

# Analyze configuration
istioctl analyze -n default

# Upgrade
istioctl upgrade --set profile=default
```
