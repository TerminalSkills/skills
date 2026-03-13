---
name: envoy
description: >-
   You are an expert in Envoy, the high-performance C++ proxy designed for
  cloud-native applications. You help teams configure Envoy as an API gateway,
  service mesh sidecar, and load balancer using its L4/L7 routing, circuit
  breaking, rate limiting, TLS termination, gRPC support, and observability
  features — powering Istio, AWS App Mesh, and most modern service mesh
  implementations.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Infrastructure & DevOps
  tags:
    - proxy
    - service-mesh
    - load-balancer
    - api-gateway
    - observability
    - cloud-native
---

# Envoy Proxy — Cloud-Native Edge and Service Proxy

You are an expert in Envoy, the high-performance C++ proxy designed for cloud-native applications. You help teams configure Envoy as an API gateway, service mesh sidecar, and load balancer using its L4/L7 routing, circuit breaking, rate limiting, TLS termination, gRPC support, and observability features — powering Istio, AWS App Mesh, and most modern service mesh implementations.

## Core Capabilities

### Static Configuration

```yaml
# envoy.yaml — API gateway configuration
static_resources:
  listeners:
    - name: http_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                codec_type: AUTO
                route_config:
                  name: local_routes
                  virtual_hosts:
                    - name: api
                      domains: ["api.example.com"]
                      routes:
                        - match:
                            prefix: "/api/users"
                          route:
                            cluster: users_service
                            timeout: 5s
                            retry_policy:
                              retry_on: "5xx,reset,connect-failure"
                              num_retries: 3
                        - match:
                            prefix: "/api/orders"
                          route:
                            cluster: orders_service
                            timeout: 10s
                        - match:
                            prefix: "/"
                          route:
                            cluster: frontend

                http_filters:
                  - name: envoy.filters.http.cors
                  - name: envoy.filters.http.local_ratelimit
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
                      stat_prefix: http_local_rate_limiter
                      token_bucket:
                        max_tokens: 100
                        tokens_per_fill: 100
                        fill_interval: 60s
                  - name: envoy.filters.http.router

  clusters:
    - name: users_service
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      circuit_breakers:
        thresholds:
          - max_connections: 100
            max_pending_requests: 50
            max_requests: 200
            max_retries: 3
      health_checks:
        - timeout: 2s
          interval: 10s
          healthy_threshold: 2
          unhealthy_threshold: 3
          http_health_check:
            path: /health
      load_assignment:
        cluster_name: users_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: users-svc
                      port_value: 3000

    - name: orders_service
      type: STRICT_DNS
      lb_policy: LEAST_REQUEST
      load_assignment:
        cluster_name: orders_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: orders-svc
                      port_value: 3000

admin:
  address:
    socket_address:
      address: 0.0.0.0
      port_value: 9901
```

### Key Features

```markdown
## Load Balancing
- Round Robin, Least Request, Random, Ring Hash, Maglev
- Zone-aware routing (prefer same-zone backends)
- Weighted clusters for canary deployments

## Circuit Breaking
- Max connections, pending requests, active retries
- Outlier detection: eject unhealthy backends automatically
- Configurable per-cluster thresholds

## Observability
- Built-in Prometheus metrics (/stats/prometheus)
- Distributed tracing (Jaeger, Zipkin, Datadog)
- Access logs (JSON, text, gRPC)
- Admin dashboard (/clusters, /config_dump, /stats)

## TLS
- Automatic TLS termination and origination
- mTLS for service-to-service communication
- SDS (Secret Discovery Service) for dynamic certificate rotation
```

## Installation

```bash
# Docker
docker run -d --name envoy -p 8080:8080 -p 9901:9901 \
  -v $(pwd)/envoy.yaml:/etc/envoy/envoy.yaml \
  envoyproxy/envoy:v1.30-latest

# Kubernetes (as sidecar via Istio)
istioctl install
kubectl label namespace default istio-injection=enabled
```

## Best Practices

1. **Circuit breakers** — Set per-cluster limits; prevent cascading failures when a downstream service is slow
2. **Health checks** — Configure active health checks; Envoy removes unhealthy backends automatically
3. **Retry policies** — Retry on 5xx and connection failures; set `max_retries` and retry budgets to prevent thundering herd
4. **Rate limiting** — Use local rate limiting for simple cases; external rate limit service for distributed limiting
5. **Observability** — Enable Prometheus stats, access logs, and tracing headers; Envoy provides more metrics than most apps emit
6. **xDS for dynamic config** — Use control plane (Istio, custom) for dynamic configuration; avoid static config in production
7. **mTLS everywhere** — Enable mutual TLS between services; Envoy handles certificate rotation via SDS
8. **Admin interface** — Expose admin on internal port only; `/clusters` shows backend health, `/config_dump` for debugging
