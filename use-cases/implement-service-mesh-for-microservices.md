---
title: Implement Service Mesh for Microservices
slug: implement-service-mesh-for-microservices
description: >-
  Add Istio service mesh to an existing Kubernetes cluster to gain traffic
  management, mutual TLS, circuit breaking, and observability for a
  microservices architecture.
skills:
  - istio
  - kubernetes-helm
  - docker-helper
category: devops
tags:
  - istio
  - service-mesh
  - kubernetes
  - microservices
  - mtls
---

# Implement Service Mesh for Microservices

You have an existing Kubernetes cluster running a microservices application: a frontend, an API gateway, several backend services, and a database. Services talk plain HTTP with no encryption, no retries and no traffic control. This walkthrough adds Istio to give you mutual TLS, traffic management and observability. It uses the classic sidecar data plane; Istio also offers ambient mode (no sidecars), covered in the `istio` skill.

## Step 1: Verify the Services Together Locally

Before deploying to Kubernetes with Istio, check that the microservices work together with Docker Compose. Keep credentials out of the file and bind published ports to localhost.

```yaml
# compose.yaml (the top-level `version:` key is obsolete and omitted)
services:
  frontend:
    build: ./frontend
    ports: ["127.0.0.1:3000:3000"]
    environment:
      API_URL: http://api-gateway:8080
  api-gateway:
    build: ./api-gateway
    ports: ["127.0.0.1:8080:8080"]
    environment:
      USERS_SERVICE: http://users:8081
      ORDERS_SERVICE: http://orders:8082
      PAYMENTS_SERVICE: http://payments:8083
  users:
    build: ./users
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD:?set DB_PASSWORD}@postgres:5432/users
  orders:
    build: ./orders
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD:?set DB_PASSWORD}@postgres:5432/orders
      PAYMENTS_SERVICE: http://payments:8083
  payments:
    build: ./payments
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD:?set DB_PASSWORD}@postgres:5432/payments
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro   # CREATE DATABASE users; orders; payments;
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

```console
$ echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env
$ docker compose up -d --wait
$ curl http://127.0.0.1:8080/health
$ docker compose down
```

## Step 2: Install Istio on the Cluster

Install an `istioctl` that matches the release you want (1.31.x at the time of writing) from the GitHub release, checking the published checksum, then install the default profile (istiod plus an ingress gateway).

```console
$ ISTIO_VERSION=1.31.3
$ BASE=https://github.com/istio/istio/releases/download/$ISTIO_VERSION
$ curl -fsSLO $BASE/istioctl-$ISTIO_VERSION-linux-amd64.tar.gz
$ curl -fsSLO $BASE/istioctl-$ISTIO_VERSION-linux-amd64.tar.gz.sha256
$ sha256sum -c istioctl-$ISTIO_VERSION-linux-amd64.tar.gz.sha256
$ tar xzf istioctl-$ISTIO_VERSION-linux-amd64.tar.gz && sudo install istioctl /usr/local/bin/

$ istioctl x precheck
$ istioctl install --set profile=default -y
$ kubectl -n istio-system get pods

$ kubectl create namespace microservices
$ kubectl label namespace microservices istio-injection=enabled
```

`istioctl verify-install` no longer exists; the pod listing and `istioctl analyze` replace it.

## Step 3: Deploy the Application with Helm

With injection enabled, every pod created in the namespace gets an Envoy proxy. Deploy with Helm (see the `kubernetes-helm` skill for chart structure); the chart must label Deployments with `app` and `version` (used by the canary step).

```console
$ helm upgrade --install microservices ./helm/microservices \
    --namespace microservices --set global.image.tag=v1.0.0 --wait --timeout 5m
$ kubectl get pods -n microservices
$ istioctl proxy-status
$ istioctl analyze -n microservices
```

`istioctl proxy-status` lists every injected proxy and whether it is in sync with istiod. In `kubectl get pods`, a pod shows `2/2` when the proxy is a regular container, or `1/1` when Istio runs it as a Kubernetes native sidecar (init container), which it does automatically on supported Kubernetes versions.

## Step 4: Enable Strict mTLS

Roll out in two moves. First apply `PERMISSIVE` and confirm in Kiali (Step 8) that every edge between services is encrypted; then switch to `STRICT`, which rejects plaintext from any pod without a sidecar. A `PeerAuthentication` in the root namespace `istio-system` applies mesh-wide.

```yaml
# security/peer-authentication.yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT        # start with PERMISSIVE
```

```console
$ kubectl apply -f security/peer-authentication.yaml
$ istioctl proxy-config secret deploy/api-gateway -n microservices
```

The second command lists the workload certificate (`default`) and root CA that proxies use for mTLS. Anything outside the mesh that calls a service directly, such as a monitoring agent, now needs a sidecar or an explicit exception.

## Step 5: Traffic Management

Destination rules set connection limits and circuit breaking, and virtual services add timeouts and retries. Istio keeps one `DestinationRule` per host: put the circuit-breaking policy and the canary subsets (Step 7) in the same rule, or one silently wins.

```yaml
# networking/destination-rules.yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: users
  namespace: microservices
spec:
  host: users
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 50 }
      http: { http1MaxPendingRequests: 50, http2MaxRequests: 100 }
    outlierDetection:
      consecutive5xxErrors: 3
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
    - name: stable
      labels: { version: v1 }
    - name: canary
      labels: { version: v2 }
---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payments
  namespace: microservices
spec:
  host: payments
  trafficPolicy:
    connectionPool:
      http: { http1MaxPendingRequests: 25, http2MaxRequests: 50 }
    outlierDetection:
      consecutive5xxErrors: 2
      interval: 10s
      baseEjectionTime: 60s
```

```yaml
# networking/virtual-services.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: api-gateway
  namespace: microservices
spec:
  hosts: [api-gateway]
  http:
    - route:
        - destination: { host: api-gateway }
      timeout: 15s
      retries:
        attempts: 3
        perTryTimeout: 5s
        retryOn: 5xx,reset,connect-failure
```

Retry only idempotent calls: a `POST /payments` retried on `5xx` can charge twice unless the service accepts an idempotency key. Scope `retries` to the routes that are safe.

## Step 6: Ingress Gateway with TLS

The gateway's TLS secret must live in the namespace of the ingress gateway workload (`istio-system` with the default profile), not in the application namespace.

```console
$ kubectl create secret tls app-tls-cert -n istio-system --cert=app.crt --key=app.key
```

```yaml
# networking/gateway.yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: app-gateway
  namespace: microservices
spec:
  selector:
    istio: ingressgateway
  servers:
    - port: { number: 443, name: https, protocol: HTTPS }
      tls:
        mode: SIMPLE
        credentialName: app-tls-cert
      hosts: ["app.example.com"]
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: app-ingress
  namespace: microservices
spec:
  hosts: ["app.example.com"]
  gateways: [app-gateway]
  http:
    - match:
        - uri: { prefix: /api }
      route:
        - destination: { host: api-gateway, port: { number: 8080 } }
    - route:
        - destination: { host: frontend, port: { number: 3000 } }
```

Istio also supports the Kubernetes Gateway API (`gateway.networking.k8s.io/v1`); the `istio` skill shows the equivalent resources. The Istio `Gateway` above remains supported.

## Step 7: Canary Deployment

Run `version: v2` Deployments of `users` next to `v1` and shift traffic with weights. The `stable` and `canary` subsets are defined in the `users` rule from Step 5.

```yaml
# canary/users-canary.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: users-canary
  namespace: microservices
spec:
  hosts: [users]
  http:
    - route:
        - destination: { host: users, subset: stable }
          weight: 90
        - destination: { host: users, subset: canary }
          weight: 10
```

Raise the canary weight in steps (10, 25, 50, 100) while watching 5xx rates in Kiali or Prometheus, and set it back to 0 to roll back instantly.

## Step 8: Observability

The Istio release ships sample manifests for Prometheus, Grafana, Jaeger and Kiali. They are for evaluation, not production hardening. Pin them to the same release as your control plane.

```console
$ for a in prometheus grafana jaeger kiali; do
    kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.31/samples/addons/$a.yaml
  done
$ istioctl dashboard kiali
```

`istioctl dashboard` also opens `grafana`, `jaeger` and `prometheus`; it port-forwards to localhost only. Jaeger shows traces only if the applications propagate trace headers (`traceparent`, `x-request-id`), which Envoy does not do for them.

## Verification

```console
$ istioctl proxy-status
$ istioctl analyze -n microservices
$ kubectl get virtualservices,destinationrules,gateways -n microservices
$ curl --cacert ca.crt https://app.example.com/api/health
```

Services now communicate over mutual TLS, have retries and circuit breaking, support canary releases through traffic splitting, and can be observed in Kiali, Grafana and Jaeger.

## Related Skills

- `istio` - installation, traffic, security and debugging for the mesh
- `kubernetes-helm` - chart structure and releases for the application
- `docker-helper` - Dockerfiles and the local Compose stack
