---
name: envoy
description: >-
  Configures Envoy, the high-performance C++ edge and service proxy, as an API gateway, load balancer or service mesh sidecar with L4/L7 routing, retries, circuit breaking, rate limiting, TLS and observability. Use when a user asks to set up Envoy, write an envoy.yaml, route traffic to backends, add health checks or rate limits, do a canary split, read Envoy admin stats, or understand the proxy behind Istio and Envoy Gateway.
license: Apache-2.0
compatibility: "Envoy 1.39 (Docker image envoyproxy/envoy or a package build); config uses the v3 API"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["envoy", "proxy", "service-mesh", "load-balancer", "api-gateway"]
  repository: https://github.com/envoyproxy/envoy
---

# Envoy Proxy — Cloud-Native Edge and Service Proxy

## Overview

Envoy is an open-source L4/L7 proxy written in C++, a graduated CNCF project. It is used directly as an edge proxy or API gateway, and it is the data plane under Istio and Envoy Gateway. Everything is configured in the v3 API (YAML or JSON): listeners accept traffic, filter chains (the HTTP connection manager and its HTTP filters) process it, routes pick a cluster, and clusters list the backend endpoints with load balancing, health checks and circuit breakers.

Configuration comes in two ways: a **static** file passed with `-c`, or **dynamic** discovery (xDS) from a control plane. Start with a static file to learn the model; use xDS for anything that changes at runtime.

## Instructions

### Run Envoy

```bash
docker run --rm --name envoy -p 8080:8080 -p 127.0.0.1:9901:9901 \
  -v "$(pwd)/envoy.yaml:/etc/envoy/envoy.yaml:ro" \
  envoyproxy/envoy:v1.39.2
```

Pin an exact tag; `v1.39-latest` follows the newest patch of that minor release. Debug images are `debug-v1.39.2`, distroless ones `distroless-v1.39.2`. Always validate a file before starting or deploying it:

```bash
docker run --rm -v "$(pwd)/envoy.yaml:/etc/envoy/envoy.yaml:ro" \
  envoyproxy/envoy:v1.39.2 --mode validate -c /etc/envoy/envoy.yaml
# configuration '/etc/envoy/envoy.yaml' OK
```

Envoy also installs from packages (`apt`/`yum` repositories described at https://www.envoyproxy.io/docs/envoy/latest/start/install) and via Homebrew (`brew install envoy`). On Kubernetes, use Envoy Gateway (`helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.9.2 -n envoy-gateway-system --create-namespace`) or Istio, which manage Envoy for you.

### Static configuration: gateway with retries, rate limit, health checks

This file passes `--mode validate` on v1.39.2 and returns `429` after five requests to `/ping` in a minute:

```yaml
# envoy.yaml
static_resources:
  listeners:
    - name: http_listener
      address:
        socket_address: { address: 0.0.0.0, port_value: 8080 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                codec_type: AUTO
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                route_config:
                  name: local_routes
                  virtual_hosts:
                    - name: api
                      domains: ["api.shopfront.dev", "localhost:8080"]
                      routes:
                        - match: { prefix: "/api/users" }
                          route:
                            cluster: users_service
                            timeout: 5s
                            retry_policy:
                              retry_on: "5xx,reset,connect-failure"
                              num_retries: 3
                        - match: { prefix: "/ping" }
                          direct_response: { status: 200, body: { inline_string: "pong\n" } }
                        - match: { prefix: "/" }
                          route: { cluster: frontend }
                http_filters:
                  - name: envoy.filters.http.local_ratelimit
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
                      stat_prefix: http_local_rate_limiter
                      token_bucket: { max_tokens: 5, tokens_per_fill: 5, fill_interval: 60s }
                      filter_enabled:
                        runtime_key: local_rate_limit_enabled
                        default_value: { numerator: 100, denominator: HUNDRED }
                      filter_enforced:
                        runtime_key: local_rate_limit_enforced
                        default_value: { numerator: 100, denominator: HUNDRED }
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
    - name: users_service
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      circuit_breakers:
        thresholds:
          - { max_connections: 100, max_pending_requests: 50, max_requests: 200, max_retries: 3 }
      health_checks:
        - timeout: 2s
          interval: 10s
          healthy_threshold: 2
          unhealthy_threshold: 3
          http_health_check: { path: /health }
      outlier_detection: { consecutive_5xx: 5, interval: 10s, base_ejection_time: 30s }
      load_assignment:
        cluster_name: users_service
        endpoints:
          - lb_endpoints:
              - endpoint: { address: { socket_address: { address: users-svc, port_value: 3000 } } }
    - name: frontend
      type: STRICT_DNS
      load_assignment:
        cluster_name: frontend
        endpoints:
          - lb_endpoints:
              - endpoint: { address: { socket_address: { address: frontend-svc, port_value: 3000 } } }
admin:
  address:
    socket_address: { address: 0.0.0.0, port_value: 9901 }  # inside the container; publish it on 127.0.0.1 only
```

Points that trip people up:

- `envoy.filters.http.router` must be last in `http_filters` and needs its `typed_config` (type `...router.v3.Router`); without it validation fails with "Didn't find a registered implementation".
- The local rate limit filter only enforces limits when `filter_enabled` **and** `filter_enforced` are set; with just `token_bucket` every request passes (tested).
- Every filter except the router also needs its `typed_config` with the `@type` URL. The CORS filter is `envoy.extensions.filters.http.cors.v3.Cors`.
- `domains` is matched against the `Host` header including the port when the client sends one; add `"*"` for a catch-all virtual host.
- `STRICT_DNS` clusters resolve hostnames continually; use `STATIC` for fixed IPs and `LOGICAL_DNS` for large external services.

### Admin interface

The admin listener serves `/stats/prometheus` (Prometheus metrics), `/clusters` (backend health and counters), `/config_dump` (the live config), `/ready`, `/listeners`, and `/logging` (change log levels). It can change runtime state and dump the full config, so bind it to `127.0.0.1` or an internal network and never expose it publicly (in Docker, listen on `0.0.0.0` inside the container and publish with `-p 127.0.0.1:9901:9901`).

### Feature map

- **Load balancing**: `ROUND_ROBIN`, `LEAST_REQUEST`, `RANDOM`, `RING_HASH`, `MAGLEV`, zone-aware routing, weighted clusters for canaries.
- **Resilience**: per-cluster `circuit_breakers`, `outlier_detection` (eject failing hosts), route `retry_policy` and `timeout`.
- **TLS**: termination and origination via `transport_socket` (`envoy.transport_sockets.tls`), mTLS, certificate rotation through SDS.
- **Observability**: stats sinks, access loggers (stdout, file, gRPC), tracing (OpenTelemetry, Zipkin, Datadog).
- **Dynamic config**: xDS (LDS, RDS, CDS, EDS, SDS) from a control plane such as Istio, Envoy Gateway or your own.

## Examples

### Example 1: Run a local gateway and watch rate limiting work

User request: "Put Envoy in front of my users service on port 8080 and limit clients to 5 requests per minute."

```bash
docker run -d --name envoy -p 8080:8080 -p 127.0.0.1:9901:9901 -v "$(pwd)/envoy.yaml:/etc/envoy/envoy.yaml:ro" envoyproxy/envoy:v1.39.2
for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w "%{http_code} " -H 'Host: localhost:8080' http://127.0.0.1:8080/ping; done
# 200 200 200 200 200 429 429
curl -s 127.0.0.1:9901/stats/prometheus | grep local_rate_limit_
docker rm -f envoy
```

The first five requests are served; after the bucket empties Envoy answers 429 until it refills (5 tokens every 60 seconds). The `envoy_http_local_rate_limit_rate_limited` counter shows how many were rejected (2 here).

### Example 2: Canary 10% of /api/users to a new version

User request: "Send a tenth of user-service traffic to v2 and keep the rest on v1."

Replace the `/api/users` route with weighted clusters and add a `users_service_canary` cluster (same shape as `users_service`, address `users-svc-v2`):

```yaml
                        - match: { prefix: "/api/users" }
                          route:
                            weighted_clusters:
                              clusters:
                                - { name: users_service, weight: 90 }
                                - { name: users_service_canary, weight: 10 }
```

```bash
docker run --rm -v "$(pwd)/envoy.yaml:/etc/envoy/envoy.yaml:ro" envoyproxy/envoy:v1.39.2 --mode validate -c /etc/envoy/envoy.yaml
```

Result: validation prints "configuration ... OK"; after deploying, `/clusters` shows request counters per cluster growing roughly 90:10. Raise the weight in steps and watch 5xx rates before going to 100.

## Guidelines

- Validate every change with `--mode validate` in CI; most mistakes (missing `typed_config`, wrong `@type`) are caught there rather than at runtime.
- Set circuit-breaker limits and retry budgets together: retries multiply load on a struggling backend. Retry only idempotent requests unless the route says otherwise.
- Use active health checks plus `outlier_detection`; one catches dead hosts, the other hosts that return errors.
- Local rate limiting is per Envoy instance. For a limit shared across replicas use the global rate limit filter with an external rate limit service.
- Prefer xDS from a control plane in production; hand-edited static files drift across replicas.
- Keep the admin port private, terminate TLS with certificates from a secret store (SDS), and never put private keys in the YAML you commit.
- Envoy is a proxy, not an application server: for a single small service behind one domain, Caddy or nginx is simpler to operate.
