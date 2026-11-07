---
name: prometheus
description: >-
  Prometheus is an open-source monitoring server that scrapes metrics from your services over HTTP, stores them as time series, and evaluates PromQL queries and alerting rules. Use this skill to write prometheus.yml scrape configs and service discovery, add recording and alerting rules, validate them with promtool, unit-test alerts, query the HTTP API, and set retention. Trigger phrases: "set up Prometheus", "scrape this service", "write an alert rule", "PromQL query", "promtool check", "reload Prometheus config". Alert routing lives in prometheus-alertmanager.
license: Apache-2.0
compatibility: "Linux, macOS or Windows release binary (Prometheus 3.x), or Docker 24+; Go is not needed"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "prometheus, promql, monitoring, alerting-rules, promtool"
  repository: https://github.com/prometheus/prometheus
---

# Prometheus — metrics collection, PromQL and alerting rules

## Overview

Prometheus pulls metrics from HTTP endpoints (`/metrics`) on a schedule, stores them locally in its own time-series database, and lets you query them with PromQL. It also evaluates rule files on a timer: recording rules precompute expensive expressions, alerting rules turn a PromQL condition into an alert that Prometheus sends to Alertmanager.

This skill covers the server itself: configuration, discovery of targets, rules, `promtool`, the query API and retention. Routing and delivery of alerts (receivers, grouping, silences) belong to `prometheus-alertmanager`. For long-term or multi-cluster storage see `thanos` or `victoriametrics`; for a broader stack design see `observability-setup`.

## Instructions

### Installation

Use the release tarball from the project's GitHub releases (it contains `prometheus`, `promtool` and a sample `prometheus.yml`) and verify it against the `sha256sums.txt` file published with the release.

```bash
VERSION=3.15.1   # take the current tag from https://github.com/prometheus/prometheus/releases
curl -fLO https://github.com/prometheus/prometheus/releases/download/v${VERSION}/prometheus-${VERSION}.linux-amd64.tar.gz
curl -fLO https://github.com/prometheus/prometheus/releases/download/v${VERSION}/sha256sums.txt
sha256sum --ignore-missing -c sha256sums.txt
tar xzf prometheus-${VERSION}.linux-amd64.tar.gz
cd prometheus-${VERSION}.linux-amd64 && ./prometheus --version
```

Docker (the image keeps its config at `/etc/prometheus/prometheus.yml`):

```bash
docker run -d --name prometheus -p 127.0.0.1:9090:9090 \
  -v "$PWD/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$PWD/rules:/etc/prometheus/rules:ro" \
  prom/prometheus
```

### Configuration file

`prometheus.yml` has four parts you will touch: `global`, `rule_files`, `scrape_configs` and (optionally) `alerting`. This example scrapes itself plus two hosts discovered from a JSON file:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - rules/*.yml            # paths are relative to this file

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["127.0.0.1:9090"]
        labels:
          env: staging

  - job_name: node
    file_sd_configs:
      - files: ["targets/node.json"]   # re-read automatically when it changes
        refresh_interval: 1m
```

`targets/node.json` is a list of target groups:

```json
[{"targets": ["10.0.4.11:9100", "10.0.4.12:9100"], "labels": {"team": "platform"}}]
```

Other discovery mechanisms (`kubernetes_sd_configs`, `dns_sd_configs`, `consul_sd_configs`, `ec2_sd_configs`, ...) go in the same place; check what a job resolves to with `promtool check service-discovery prometheus.yml node`, which prints discovered labels before and after `relabel_configs`.

To send alerts, add an `alerting` block pointing at Alertmanager (see `prometheus-alertmanager` for the receiving side):

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["127.0.0.1:9093"]
```

Retention and storage settings live in the config file as well: the `--storage.tsdb.retention.time` and `.size` flags are deprecated in 3.x in favour of this block (the default is 15 days when nothing is set):

```yaml
storage:
  tsdb:
    retention:
      time: 30d
      size: 20GB
```

### Rules

Recording rule, in `rules/recording.yml`:

```yaml
groups:
  - name: http_recording
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(prometheus_http_requests_total[5m]))
```

Alerting rule, in `rules/alerts.yml`:

```yaml
groups:
  - name: availability
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 5m                 # must hold for 5 minutes before firing
        labels:
          severity: page
        annotations:
          summary: "{{ $labels.instance }} of job {{ $labels.job }} is down"
```

Rule files are only loaded through `rule_files` in the config. There is no command-line flag for them.

### Validate before you deploy

```bash
promtool check config prometheus.yml          # also checks every file named in rule_files
promtool check rules rules/alerts.yml rules/recording.yml
```

`check config` fails if a file matched by a `rule_files` glob is not a rule file. Keep unit-test files in a different directory (such as `tests/`), never under `rules/`.

### Unit-test alerts with promtool

A test feeds synthetic series and asserts which alerts exist at a given time:

```yaml
# tests/alerts_test.yml
rule_files:
  - ../rules/alerts.yml
evaluation_interval: 1m
tests:
  - interval: 1m
    input_series:
      - series: 'up{job="node", instance="10.0.4.11:9100"}'
        values: '1 1 0 0 0 0 0 0'
    alert_rule_test:
      - eval_time: 3m
        alertname: InstanceDown
        exp_alerts: []
      - eval_time: 8m
        alertname: InstanceDown
        exp_alerts:
          - exp_labels:
              severity: page
              job: node
              instance: 10.0.4.11:9100
            exp_annotations:
              summary: "10.0.4.11:9100 of job node is down"
```

```bash
promtool test rules tests/alerts_test.yml     # prints SUCCESS or a diff of expected vs got
```

### Run, reload, query

```bash
./prometheus --config.file=prometheus.yml \
  --web.listen-address=127.0.0.1:9090 \
  --storage.tsdb.path=data \
  --web.enable-lifecycle
```

`--web.enable-lifecycle` enables `POST /-/reload` (and `/-/quit`); without it only `SIGHUP` reloads the config (`kill -HUP <pid>`). A failed reload keeps the old config running.

```bash
curl -s http://127.0.0.1:9090/-/ready
curl -s -X POST http://127.0.0.1:9090/-/reload
curl -sG http://127.0.0.1:9090/api/v1/query --data-urlencode 'query=up == 0'
curl -sG http://127.0.0.1:9090/api/v1/query_range \
  --data-urlencode 'query=job:http_requests:rate5m' \
  --data-urlencode "start=$(date -d '-1 hour' +%s)" --data-urlencode "end=$(date +%s)" --data-urlencode 'step=60'
curl -s http://127.0.0.1:9090/api/v1/targets?state=active
curl -s http://127.0.0.1:9090/api/v1/rules
curl -s http://127.0.0.1:9090/api/v1/label/job/values
promtool query instant http://127.0.0.1:9090 'count(up)'
```

Responses are JSON with `"status":"success"` and a `data` object (`resultType` is `vector`, `matrix`, ...). Use `--data-urlencode` for any expression containing brackets or braces.

### Useful PromQL

```promql
up == 0                                                  # targets that failed their last scrape
sum by (job) (rate(http_requests_total[5m]))             # per-second request rate per job
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
100 * (1 - node_filesystem_avail_bytes / node_filesystem_size_bytes)   # disk used %
predict_linear(node_filesystem_avail_bytes[6h], 4 * 3600) < 0          # disk full within 4 hours
```

Use `rate()` on counters, never on gauges; wrap a ratio's numerator and denominator in the same `sum by (...)`.

## Examples

### Example 1: Monitor two new servers and page when one dies

**Request:** "Our two new hosts at 10.0.4.11 and 10.0.4.12 run node_exporter on 9100. Scrape them and alert if either is down for 5 minutes. Check it before I deploy."

```bash
mkdir -p rules targets tests
# write targets/node.json, rules/alerts.yml and tests/alerts_test.yml as shown above,
# add the `node` job and `rule_files: [rules/*.yml]` to prometheus.yml
promtool check config prometheus.yml
promtool test rules tests/alerts_test.yml
./prometheus --config.file=prometheus.yml --web.listen-address=127.0.0.1:9090 --web.enable-lifecycle &
sleep 10
curl -s http://127.0.0.1:9090/api/v1/rules | head -c 300
```

**Result:** `check config` reports the rule files it found and ends with `SUCCESS`, `test rules` prints `SUCCESS`, and the rules API shows group `availability` with `InstanceDown` in state `pending` while the hosts are unreachable (it becomes `firing` once the 5 minutes pass). Wire Alertmanager next with `prometheus-alertmanager`.

### Example 2: Precompute a dashboard query and change retention

**Request:** "The request-rate panel is slow and we only need 30 days of data."

```bash
# add rules/recording.yml (see above) and the storage.tsdb.retention block to prometheus.yml
promtool check config prometheus.yml
curl -s -X POST http://127.0.0.1:9090/-/reload -w '%{http_code}\n'
promtool query instant http://127.0.0.1:9090 'job:http_requests:rate5m'
```

**Result:** the reload returns `200`; after one evaluation interval the instant query returns one sample per job, and the dashboard can query `job:http_requests:rate5m` instead of recomputing `rate()` over raw series. Retention applies from the next block cleanup, not instantly.

## Guidelines

- Always run `promtool check config` and `promtool test rules` before reloading; a bad reload is rejected, but a valid yet wrong expression silently never fires.
- Alerts need `for:` unless the condition is already a settled signal; without it, one failed scrape pages someone.
- Bind the server to `127.0.0.1` or put it behind a reverse proxy with TLS and authentication. Prometheus has no login of its own, and `--web.enable-lifecycle` and `--web.enable-admin-api` let anyone who can reach the port reload, stop or delete data. Do not enable them on a public interface.
- Keep label cardinality low: never put user IDs, URLs with parameters or request IDs into labels.
- Scrape interval 15s to 1m is typical; an `evaluation_interval` longer than the alert's `for:` makes alerts lag.
- Prometheus is single-node storage. For high availability run two identical servers; for months of history use remote write to `thanos` or `victoriametrics` instead of huge local retention.
- Not the right tool for logs or traces, or for event-per-row data (use a database or log store).
