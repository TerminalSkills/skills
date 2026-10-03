---
name: gcp-networking-observability
description: |
  Investigate Google Cloud networking issues by analyzing VPC Flow Logs,
  firewall logs, Cloud NAT logs, threat logs, and networking metrics. Run
  Connectivity Tests for path diagnostics and use BigQuery linked datasets
  for high-volume traffic analysis. Use when troubleshooting connection
  failures, latency, packet loss, or top-talkers.
license: Apache-2.0
compatibility: 'gcloud-cli, bq-cli, BigQuery, Cloud Logging, Cloud Monitoring'
metadata:
  author: google-cloud
  version: 1.1.0
  category: devops
  tags:
    - gcp
    - vpc
    - networking
    - observability
    - flow-logs
---

# GCP Networking Observability

## Overview

Google Cloud emits multiple network telemetry streams: VPC Flow Logs (sampled IP traffic), firewall rule logs, Cloud NAT translation logs, Cloud Firewall Plus / Cloud IDS threat logs, and aggregated metrics in Cloud Monitoring. Connectivity Tests provide static path analysis for "why can't A reach B?" questions. The right source depends on the question — pick one and stop, do not chase verification across tools.

## Instructions

### Telemetry Streams

| Stream | Use it for |
|---|---|
| **VPC Flow Logs** | Top talkers, bytes/packets between IPs, traffic trends, egress analysis |
| **Firewall Logs** | DENY events, verifying ALLOW rules, audit of who hit which rule |
| **Cloud NAT Logs** | Port exhaustion, source NAT translation auditing |
| **Threat Logs** | Cloud Firewall Plus / Cloud IDS — malicious patterns from deep packet inspection |
| **Networking Metrics** | Time-series throughput, RTT, packet loss for performance dashboards |
| **Connectivity Tests** | Static reachability analysis between two endpoints |

### Enabling VPC Flow Logs

```bash
# Enable flow logs on a subnet (5% sampling, full metadata)
gcloud compute networks subnets update prod-subnet \
  --region=us-central1 \
  --enable-flow-logs \
  --logging-aggregation-interval=interval-5-sec \
  --logging-flow-sampling=0.5 \
  --logging-metadata=include-all
```

```bash
# Upgrade the log bucket to Log Analytics, then link it to BigQuery
# (one-time setup; the project's _Default bucket already receives these logs)
gcloud logging buckets update _Default --location=global --enable-analytics

gcloud logging links create network_logs_link \
  --bucket=_Default --location=global
```

The link creates a BigQuery dataset in the same project containing a virtual view named `_AllLogs` that covers every log type in the bucket — no per-log-type sink or table management needed.

### Top-Talker Analysis (BigQuery)

Always prefer **BigQuery on the linked dataset's `_AllLogs` view** for volume-based queries. Cloud Logging's Logs Explorer is for spot-checking, not aggregation. Log Analytics uses snake_case column names (`json_payload`, `log_id`, `timestamp`), not the camelCase field names shown in Logs Explorer.

```sql
-- Top 20 source→destination IP pairs by bytes (last 24 hours)
SELECT
  json_payload.connection.src_ip AS src,
  json_payload.connection.dest_ip AS dst,
  json_payload.connection.dest_port AS dst_port,
  SUM(CAST(json_payload.bytes_sent AS INT64)) AS total_bytes,
  COUNT(*) AS flows
FROM `my-project.network_logs_link._AllLogs`
WHERE log_id = 'compute.googleapis.com/vpc_flows'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY src, dst, dst_port
ORDER BY total_bytes DESC
LIMIT 20;
```

```sql
-- Find external egress (to non-RFC1918) by VM
SELECT
  json_payload.src_instance.vm_name AS vm,
  json_payload.connection.dest_ip AS external_dst,
  SUM(CAST(json_payload.bytes_sent AS INT64)) / POW(1024, 3) AS gb_sent
FROM `my-project.network_logs_link._AllLogs`
WHERE log_id = 'compute.googleapis.com/vpc_flows'
  AND NOT NET.IP_IN_NET(json_payload.connection.dest_ip, '10.0.0.0/8')
  AND NOT NET.IP_IN_NET(json_payload.connection.dest_ip, '172.16.0.0/12')
  AND NOT NET.IP_IN_NET(json_payload.connection.dest_ip, '192.168.0.0/16')
  AND DATE(timestamp) = CURRENT_DATE()
GROUP BY vm, external_dst
ORDER BY gb_sent DESC
LIMIT 50;
```

If the query returns NULL VM names, the subnet has `EXCLUDE_ALL_METADATA` set. Retry using `json_payload.connection.src_ip` as the join key.

### Firewall DENY Analysis

```sql
-- Top denied connection attempts (firewall rule + source IP)
SELECT
  json_payload.rule_details.reference AS rule,
  json_payload.connection.src_ip AS src,
  json_payload.connection.dest_port AS port,
  COUNT(*) AS hits
FROM `my-project.network_logs_link._AllLogs`
WHERE log_id = 'compute.googleapis.com/firewall'
  AND json_payload.disposition = 'DENIED'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
GROUP BY rule, src, port
ORDER BY hits DESC
LIMIT 25;
```

### Connectivity Tests (Static Path Analysis)

```bash
# Test reachability between a VM and an external IP
gcloud network-management connectivity-tests create vm-to-api \
  --source-instance=projects/my-project/zones/us-central1-a/instances/web-1 \
  --destination-ip-address=203.0.113.10 \
  --destination-port=443 \
  --protocol=TCP

# Run and read the result
gcloud network-management connectivity-tests run vm-to-api
gcloud network-management connectivity-tests describe vm-to-api \
  --format='value(reachabilityDetails.result,reachabilityDetails.traces)'
```

Connectivity Tests answer reachability questions deterministically — no log digging. If the result is `REACHABLE`, the path works; `UNREACHABLE` includes the failing hop and rule.

### Cloud NAT Port Exhaustion

```sql
-- Find which VMs are saturating NAT ports
SELECT
  json_payload.endpoint.vm_name AS vm,
  COUNT(*) AS allocations,
  COUNTIF(json_payload.allocation_status = 'DROPPED') AS dropped
FROM `my-project.network_logs_link._AllLogs`
WHERE log_id = 'compute.googleapis.com/nat_flows'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
GROUP BY vm
ORDER BY dropped DESC
LIMIT 10;
```

If `dropped > 0`, increase `min-ports-per-vm` on the Cloud NAT config or add more NAT IPs.

### Networking Metrics (Cloud Monitoring)

```bash
# Pull RTT/latency time series via Monitoring API
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/my-project/timeSeries?\
filter=metric.type%3D%22networking.googleapis.com/vm_flow/rtt%22&\
interval.startTime=2026-04-15T00:00:00Z&\
interval.endTime=2026-04-15T01:00:00Z"
```

For dashboards, link the [Flow Analyzer](https://console.cloud.google.com/net-intelligence/flow-analyzer) — it's the fastest way to view top-N traffic without writing SQL.

### Investigation Workflow

1. **Identify the right primary source** for the question:
   - "Why is connection failing?" → Connectivity Tests + firewall logs
   - "Who is sending the most data?" → VPC Flow Logs (BigQuery)
   - "What changed in latency?" → Networking metrics (Monitoring)
2. **Run one query** against the primary source.
3. **Present the answer** — even if the answer is `0`, `null`, or "no traffic." Stop there.
4. Never run a second source to "verify" — different tools have different sampling and aggregation, comparing them creates rabbit holes.
## Examples

### Example 1 — App can't reach a third-party API

User reports their service in `us-central1` can't connect to a payments API. Run a Connectivity Test from the Cloud Run service to the API IP on port 443 — the result names the failing hop (e.g., `firewall-rule deny-egress-public`). Update the rule, rerun the test, confirm `REACHABLE`. No need to dig through firewall logs.

### Example 2 — Surprise egress bill

User sees a $4k spike in egress charges for the month. Query VPC Flow Logs in BigQuery grouped by source VM and external destination IP, ordered by bytes. Top result: a VM exfiltrating 800 GB to a single IP. Cross-check the destination IP against threat intel, kill the VM, file an incident. One query — done.

## Guidelines

- **Pick one source per question** — never query a second tool to "double-check" the first
- **Always use BigQuery on `_AllLogs`** for volume/aggregation queries; Logs Explorer is for spot-checks
- **Print the SQL before running it** — the user should see what you're querying
- **Time-range upfront** — calculate "last 1 hour" / "yesterday" once, don't re-derive
- **Treat `0` / `null` / `no traffic` as a conclusive answer** — don't search for "more interesting" data
- For routine reachability questions, **Connectivity Tests beat log mining** every time
- Enable VPC Flow Logs at 0.5–1.0 sampling for active troubleshooting; 0.05–0.1 for baseline
- Link the log bucket to BigQuery via Log Analytics rather than a classic export sink — one `_AllLogs` view covers every log type, instead of managing a separate per-log-type table
- Watch `EXCLUDE_ALL_METADATA` subnets — VM names will be NULL, fall back to IPs
- For NAT port exhaustion, increase `min-ports-per-vm` or scale NAT IPs before app changes
