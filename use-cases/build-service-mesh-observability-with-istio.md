---
title: Build Service Mesh Observability with Istio
slug: build-service-mesh-observability-with-istio
description: Deploy Istio service mesh on Kubernetes to get automatic mTLS, traffic observability, request tracing, and circuit breaking across microservices — without changing application code.
skills: [istio, typescript, docker-helper, kubernetes-helm, prometheus]
category: devops
tags:
  - service-mesh
  - istio
  - kubernetes
  - observability
  - mtls
---

# Build Service Mesh Observability with Istio

## The Problem

Alex leads platform engineering at a 55-person e-commerce company running 24 microservices on Kubernetes. Debugging production issues is a nightmare: when checkout latency spikes, the team spends hours tracing requests across services with `kubectl logs`. There's no encryption between services (everything trusts the cluster network), no circuit breakers (one slow service cascades failures everywhere), and no traffic visibility. Last month, a database migration in the inventory service caused 4 hours of cascading failures across checkout, payments, and shipping, because nobody could see the dependency chain or shed load automatically.

## Step 0: Rehearse on a Local Cluster with Container-Ready Images

Alex rehearses on a throwaway [kind](https://kind.sigs.k8s.io/) cluster (nodes run as Docker containers). Services run as a non-root, numeric user, which satisfies `runAsNonRoot` pod policies:

```dockerfile
# checkout-service/Dockerfile — multi-stage build, non-root runtime
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app ./
USER 1000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t checkout-service:1.0.0 checkout-service/
kind create cluster --name mesh-lab && kind load docker-image checkout-service:1.0.0 --name mesh-lab
```

## Step 1: Install Istio with Helm

Helm is a supported Istio install path that fits GitOps. Three charts, in order: `base` (CRDs), `istiod` (control plane), `gateway`. Settings live in a reviewed values file:

```yaml
# istio/istiod-values.yaml — control plane, sidecar defaults and mesh settings
autoscaleMin: 2                # two istiod replicas for availability
resources:
  requests: { cpu: 500m, memory: 2048Mi }
global:
  proxy:
    resources:
      requests: { cpu: 50m, memory: 64Mi }
      limits: { cpu: 500m, memory: 256Mi }
meshConfig:
  accessLogFile: /dev/stdout
  accessLogEncoding: JSON
  defaultConfig:
    holdApplicationUntilProxyStarts: true     # app starts after the sidecar is ready
    # Envoy circuit-breaker stats are not exported by default; opt in
    proxyStatsMatcher:
      inclusionRegexps:
        - ".*outlier_detection.*"
        - ".*upstream_cx_overflow.*"
        - ".*upstream_rq_pending_overflow.*"
  extensionProviders:
    - name: otel-tracing
      opentelemetry:
        service: jaeger-collector.observability.svc.cluster.local
        port: 4317
```

```bash
helm repo add istio https://istio-release.storage.googleapis.com/charts && helm repo update
helm install istio-base istio/base -n istio-system --create-namespace --wait
helm install istiod istio/istiod -n istio-system -f istio/istiod-values.yaml --wait
helm install istio-ingress istio/gateway -n istio-ingress --create-namespace --wait

istioctl analyze --all-namespaces            # lint the mesh configuration
kubectl -n istio-system get pods             # istiod should be Running
kubectl label namespace default istio-injection=enabled
kubectl -n default rollout restart deployment  # injection applies to new pods only
```

Mutual TLS is on by default but permissive: sidecars still accept plaintext, so "automatic mTLS" alone does not mean all traffic is encrypted. After every workload has a sidecar, enforce it mesh-wide:

```yaml
# istio/peer-authentication.yaml — apply in PERMISSIVE first, then switch to STRICT
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system      # root namespace = mesh-wide
spec:
  mtls:
    mode: STRICT
```

The default outbound policy (`ALLOW_ANY`) stays: `REGISTRY_ONLY` blocks every external call until each host has a `ServiceEntry`.

## Step 2: Configure Traffic Policies and Circuit Breakers

Destination rules define how traffic flows between services. Circuit breakers (outlier detection) eject unhealthy endpoints before they drag down their callers.

```yaml
# istio/destination-rules.yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: checkout-service
  namespace: default
spec:
  host: checkout-service
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100, connectTimeout: 5s }
      http: { http1MaxPendingRequests: 50, http2MaxRequests: 100, maxRequestsPerConnection: 10 }
    outlierDetection:
      consecutive5xxErrors: 3         # eject after 3 consecutive 5xx
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
      minHealthPercent: 30            # only enforce while more than 30% of hosts are healthy
    loadBalancer:
      simple: LEAST_REQUEST
---
# Timeout and safe retries for payments (inventory-service gets its own, stricter DestinationRule the same way)
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payment-service
  namespace: default
spec:
  hosts: [payment-service]
  http:
    - route:
        - destination: { host: payment-service }
      retries:
        attempts: 2
        perTryTimeout: 2s
        retryOn: connect-failure,refused-stream   # the request never reached the app
      timeout: 10s                                # total, including retries
```

Retries on `5xx` are deliberately not enabled for payments: a charge request that failed after reaching the service may already have been processed, and retrying it could charge the customer twice. Only failures where the request never reached the application are retried.

## Step 3: Collect Metrics, Traces and the Service Graph

Prometheus scrapes the sidecars, Jaeger receives traces, and Kiali draws the graph. Prometheus comes from the `kube-prometheus-stack` chart (see the `prometheus` skill), Kiali from its own chart:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add kiali https://kiali.org/helm-charts && helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.ruleSelectorNilUsesHelmValues=false --wait
helm install kiali-server kiali/kiali-server -n istio-system \
  --set auth.strategy=anonymous \
  --set external_services.prometheus.url=http://monitoring-kube-prometheus-prometheus.monitoring:9090

kubectl create namespace observability
kubectl -n observability create deployment jaeger --image=jaegertracing/jaeger:2.23.0 --port=4317
kubectl -n observability expose deployment jaeger --name=jaeger-collector --port=4317
istioctl dashboard kiali      # port-forwards to localhost only; anonymous auth is for this access path
```

Two more resources make it work: a `PodMonitor` that scrapes each sidecar's Envoy port, and a `Telemetry` resource that turns tracing on (the Telemetry API, not `meshConfig.defaultConfig.tracing`, controls sampling):

```yaml
# istio/telemetry.yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: envoy-stats
  namespace: istio-system
spec:
  namespaceSelector: { any: true }
  selector: {}
  podMetricsEndpoints:
    - port: http-envoy-prom
      path: /stats/prometheus
      interval: 15s
---
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: mesh-default
  namespace: istio-system
spec:
  tracing:
    - providers: [{ name: otel-tracing }]
      randomSamplingPercentage: 10.0
```

Services must still forward trace headers (`traceparent`, `x-request-id`) on outgoing calls; the sidecar cannot link a service's inbound and outbound requests by itself. The Grafana dashboard is generated in TypeScript and loaded through Grafana's sidecar as a labeled ConfigMap:

```typescript
// src/monitoring/dashboards.ts — writes the dashboard JSON for a ConfigMap labeled grafana_dashboard=1
import { writeFileSync } from "node:fs";

const dest = 'reporter="destination"';
const byService = "by (destination_service_name)";
const latency = (q: number) =>
  `histogram_quantile(${q}, sum(rate(istio_request_duration_milliseconds_bucket{${dest}}[5m])) by (destination_service_name, le))`;

function panel(title: string, x: number, y: number, w: number, expr: string, legend = "{{destination_service_name}}") {
  return { title, type: "timeseries", gridPos: { h: 8, w, x, y }, targets: [{ expr, legendFormat: legend, refId: "A" }] };
}

export function meshDashboard() {
  const panels = [
    panel("Request rate (req/s)", 0, 0, 12, `sum(rate(istio_requests_total{${dest}}[5m])) ${byService}`),
    panel("5xx error rate (%)", 12, 0, 12,
      `100 * sum(rate(istio_requests_total{${dest},response_code=~"5.."}[5m])) ${byService} / sum(rate(istio_requests_total{${dest}}[5m])) ${byService}`),
    panel("P95 latency (ms)", 0, 8, 12, latency(0.95)),
    panel("P99 latency (ms)", 12, 8, 12, latency(0.99)),
    panel("Circuit breaker ejections", 0, 16, 12,
      "sum(envoy_cluster_outlier_detection_ejections_active) by (cluster_name)", "{{cluster_name}}"),
    panel("Connection pool overflow", 12, 16, 12,
      "sum(rate(envoy_cluster_upstream_cx_overflow[5m])) by (cluster_name)", "{{cluster_name}}"),
  ];
  return { title: "Service Mesh Overview", uid: "mesh-overview", schemaVersion: 39, panels, time: { from: "now-1h", to: "now" }, refresh: "10s" };
}

writeFileSync("mesh-overview.json", JSON.stringify(meshDashboard(), null, 2));
```

```bash
kubectl -n monitoring create configmap mesh-overview --from-file=mesh-overview.json
kubectl -n monitoring label configmap mesh-overview grafana_dashboard=1
```

## Step 4: Alert on Mesh Health

The rules watch error rate, circuit-breaker ejections and plaintext traffic, the signals that would have caught the inventory incident (add a P99 latency rule on `istio_request_duration_milliseconds_bucket` the same way):

```yaml
# istio/prometheus-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: istio-mesh-alerts
  namespace: monitoring
spec:
  groups:
    - name: service-mesh-health
      rules:
        - alert: ServiceHighErrorRate
          expr: |
            sum(rate(istio_requests_total{reporter="destination",response_code=~"5.."}[5m])) by (destination_service_name)
            / sum(rate(istio_requests_total{reporter="destination"}[5m])) by (destination_service_name) > 0.05
          for: 2m
          labels: { severity: warning }
          annotations:
            summary: "{{ $labels.destination_service_name }} error rate above 5%"
            description: "Error rate is {{ $value | humanizePercentage }}"
        - alert: CircuitBreakerActive
          expr: sum(envoy_cluster_outlier_detection_ejections_active) by (cluster_name) > 0
          for: 1m
          labels: { severity: warning }
          annotations:
            summary: "Hosts are being ejected for {{ $labels.cluster_name }}"
        - alert: PlaintextTrafficInMesh
          expr: |
            sum(rate(istio_requests_total{reporter="destination",connection_security_policy!="mutual_tls"}[10m])) > 0
          for: 5m
          labels: { severity: warning }
          annotations:
            summary: "Plaintext requests reached a mesh workload"
```

`PlaintextTrafficInMesh` should be silent before the switch to `STRICT`; while `PERMISSIVE`, anything it reports is a client without a sidecar.

## Results

After rolling Istio out across all 24 microservices, the example team reports:

- **Root cause in minutes**: Kiali's graph and the Jaeger traces show the dependency chain and where latency or errors start, replacing `kubectl logs` archaeology (the team measured about 12 minutes against about 4 hours)
- **Contained failures**: during a later database migration, circuit breakers ejected the failing inventory hosts and checkout kept serving
- **Encrypted east-west traffic**: strict mTLS enforced mesh-wide, with no application code changes
- **Sidecar cost**: extra latency and per-pod CPU and memory are real; the team measured them before sizing `global.proxy.resources`

## Related Skills

- [istio](/skills/istio): the mesh resources used throughout (DestinationRule, VirtualService, PeerAuthentication, Telemetry)
- [docker-helper](/skills/docker-helper): the multi-stage, non-root service image and the local kind rehearsal
- [kubernetes-helm](/skills/kubernetes-helm): installing Istio, Prometheus and Kiali from Helm charts
- [prometheus](/skills/prometheus): scraping the sidecars and writing the alert rules
- [typescript](/skills/typescript): the typed Grafana dashboard generator
