---
name: gcp-waf-reliability
description: |
  Apply the Google Cloud Well-Architected Framework's Reliability pillar — define
  user-centric SLOs, eliminate single points of failure with multi-zone/region
  redundancy, configure horizontal autoscaling, observability via Cloud
  Monitoring, graceful degradation patterns, DR testing, and blameless
  postmortems. Use for production readiness reviews and SRE practices.
license: Apache-2.0
compatibility: 'gcloud-cli, Cloud Monitoring, Cloud Logging, Backup and DR Service'
metadata:
  author: google-cloud
  version: 1.1.0
  category: devops
  tags:
    - gcp
    - reliability
    - sre
    - well-architected
    - slo
---

# GCP Well-Architected Framework — Reliability

## Overview

Reliability is measured by user experience, not infrastructure uptime. A system can be 100% green on the infra dashboard while users see broken checkout — that's the gap SLOs close. This skill applies the Google Cloud Well-Architected Framework's Reliability pillar to design, evaluate, and harden production workloads.

## Instructions

The Reliability pillar groups its principles into four focus areas: scoping (understand the architecture and its failure modes), observation (monitoring), response (recovery) and learning (postmortems).

### Core Principles

| Principle | What it means |
|---|---|
| **Define reliability via user experience** | Measure what users feel (request success rate, latency p99, page-load time), not just CPU/disk |
| **Set realistic SLO targets** | 99.9% is roughly 43 min/month of error budget; 99.99% is 4 min — pick what your business actually needs |
| **Build redundancy** | No single zone, region, or service should take down the user experience |
| **Scale horizontally** | More instances, not bigger instances; this is also fault tolerance |
| **Detect via observability** | Metrics + logs + traces; alert on user-facing symptoms, not on causes |
| **Degrade gracefully** | Read-only mode, cached responses, queue-and-retry beat hard failures |
| **Test failure recovery** | Practice failover, restore-from-backup, regional evacuation |
| **Blameless postmortems** | Document the system flaw that allowed the human error |

### Defining SLIs and SLOs

The Cloud Monitoring SLO API has no `gcloud monitoring services` or `slos` commands (`gcloud monitoring` only manages alerts, dashboards, policies, snoozes and uptime checks). Create the service and the SLO with the REST API:

```bash
PROJECT=orders-prod-4821
TOKEN=$(gcloud auth print-access-token)

curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/$PROJECT/services?serviceId=web-frontend" \
  -d '{"displayName": "Web frontend", "custom": {}}'

curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/$PROJECT/services/web-frontend/serviceLevelObjectives?serviceLevelObjectiveId=availability-28d" \
  -d @availability-slo.json
```

```json
{
  "displayName": "99.9% of requests succeed over 28 days",
  "goal": 0.999,
  "rollingPeriod": "2419200s",
  "serviceLevelIndicator": {
    "requestBased": {
      "goodTotalRatio": {
        "goodServiceFilter": "resource.type=\"https_lb_rule\" metric.type=\"loadbalancing.googleapis.com/https/request_count\" resource.labels.url_map_name=\"web-frontend\" metric.labels.response_code_class=\"200\"",
        "totalServiceFilter": "resource.type=\"https_lb_rule\" metric.type=\"loadbalancing.googleapis.com/https/request_count\" resource.labels.url_map_name=\"web-frontend\""
      }
    }
  }
}
```

`rollingPeriod` must be a whole number of days, at most 30. Alternatively use `calendarPeriod` (`DAY`, `WEEK`, `FORTNIGHT`, `MONTH`).

### Multi-Zone and Multi-Region Redundancy

```bash
# Regional GKE cluster (control plane + nodes across 3 zones)
gcloud container clusters create-auto prod \
  --region=us-central1  # NOT --zone, which is single-zone

# Regional Cloud SQL (synchronous standby in another zone)
gcloud sql instances create orders \
  --availability-type=REGIONAL \
  --region=us-central1

# Regional persistent disks (replicated synchronously across two zones)
gcloud compute disks create app-data \
  --type=pd-balanced --size=500GB \
  --region=us-central1 --replica-zones=us-central1-a,us-central1-b
```

```bash
# Multi-region Cloud Storage (geo-redundant by default)
gcloud storage buckets create gs://orders-prod-4821-data \
  --location=US --default-storage-class=STANDARD
```

For workloads with multi-region SLOs, deploy to two regions behind one global external Application Load Balancer (`--load-balancing-scheme=EXTERNAL_MANAGED`) with a backend service per region and health checks; the load balancer shifts traffic away from an unhealthy region by itself, so no DNS failover is needed. Cloud Spanner is the right database when you need synchronous multi-region writes.

### Horizontal Autoscaling

```yaml
# GKE HPA — scale on CPU + an external metric (needs the Custom Metrics Stackdriver Adapter installed)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3              # never below 3 (one per zone)
  maxReplicas: 50
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
    - type: External
      external:
        metric:
          name: pubsub.googleapis.com|subscription|num_undelivered_messages
          selector: { matchLabels: { resource.labels.subscription_id: events-sub } }
        target: { type: AverageValue, averageValue: "100" }
```

```bash
# Cloud Run autoscaling: minimum instances avoids cold-start pain on critical paths
gcloud run services update api \
  --min-instances=2 --max-instances=100 \
  --concurrency=80 --cpu-boost
```

### Health Checks and Graceful Degradation

```yaml
# Kubernetes liveness + readiness — readiness gates traffic
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /ready, port: 8080 }   # checks DB connection, deps
  periodSeconds: 5
  failureThreshold: 2
startupProbe:
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
  periodSeconds: 5
```

```python
# Circuit breaker — degrade gracefully when downstream is slow/failing
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30)
def fetch_recommendations(user_id):
    return recommendations_service.get(user_id, timeout=2)

def render_homepage(user_id):
    try:
        recs = fetch_recommendations(user_id)
    except Exception:
        recs = cached_default_recommendations()  # graceful fallback
    return template.render(recommendations=recs)
```

### Backup, Restore, and DR Testing

```bash
# Backup and DR Service: plan for Compute Engine VMs (also supports Filestore, file.googleapis.com/Instance)
gcloud backup-dr backup-plans create web-tier-plan \
  --location=us-central1 \
  --backup-vault=projects/orders-prod-4821/locations/us-central1/backupVaults/prod \
  --resource-type=compute.googleapis.com/Instance \
  --backup-rule=rule-id=daily,recurrence=DAILY,retention-days=30,backup-window-start=1,backup-window-end=7 \
  --backup-rule=rule-id=weekly,recurrence=WEEKLY,days-of-week=SUNDAY,retention-days=90,backup-window-start=1,backup-window-end=7
```

```bash
# Cloud SQL: enable PITR and test restore quarterly
gcloud sql instances clone orders orders-restore-test \
  --point-in-time='2026-10-23T10:00:00Z'
# Needs point-in-time recovery enabled on the source. Validate the clone, then delete it.
```

DR testing is not optional. Schedule quarterly:
- **Game days**: simulate a regional outage; force traffic to the secondary region
- **Restore drills**: clone a production DB to a non-prod project from backup, validate row counts and known queries
- **Failure injection**: kill a random pod / zone / dependency in staging; verify SLO holds

### Alerting on Symptoms, Not Causes

Alert on the SLO, not on CPU. Cloud Monitoring reads burn rate with the time-series selector `select_slo_burn_rate`, and a burn-rate alerting policy fires when the error budget is spent faster than the threshold you set. Two limits from Google's docs: the lookback period doubles as the compliance period, and alerts cannot use a lookback longer than 24 hours. Google suggests starting a fast-burn alert at 10x the baseline with a 1 or 2 hour lookback, plus a slow-burn alert with a longer lookback and a lower threshold. Create the policy from the console or the Monitoring API, and attach a notification channel (PagerDuty, Slack, e-mail).

Page on:
- SLO burn rate (SRE workbook multi-window values: 14.4× over 1h, 6× over 6h; its 1× over 3 days tier does not fit the 24-hour lookback limit, so use Google's slow-burn starting point of 2× over 24h instead)
- User-facing error rate
- Latency p99 above SLO

Don't page on:
- CPU above 80% (autoscaling handles this)
- Disk above 80% (alert someone, but not on-call)
- Single-instance health (the load balancer handles this)

### Validation Checklist

- [ ] **User-focused SLIs/SLOs** explicitly defined and dashboarded
- [ ] **No single zone** — every tier is regional (GKE regional cluster, Cloud SQL HA, regional PDs, multi-region GCS)
- [ ] **Autoscaling enabled** with min ≥ 3 (one per zone) and a concrete max
- [ ] **Liveness + readiness + startup probes** configured for all critical pods
- [ ] **Health checks trigger automated failover** at the load balancer level
- [ ] **PodDisruptionBudgets** for every Deployment serving traffic
- [ ] **Backups are scheduled AND restored** at least quarterly
- [ ] **Graceful degradation patterns** in place (circuit breakers, retries with exponential backoff, rate limiting)
- [ ] **Game days / chaos engineering** run regularly
- [ ] **Blameless postmortem template** + tracking system exists and is used

## Examples

### Example 1 — Production readiness review for a new service

User wants to ship a payments API. Walk through: defined SLOs (99.95% success, p99 < 500ms), regional GKE Autopilot cluster, Cloud SQL with `availability-type=REGIONAL`, HPA min=3 max=30, PDB minAvailable=2, readiness probe checking DB connectivity, alerting on SLO burn rate (not CPU), Backup-and-DR daily snapshots, and a quarterly restore drill on the calendar. Block ship if any of those are missing.

### Example 2 — Diagnose unreliability complaints despite green dashboards

User reports "users say checkout is broken but our infra dashboards are all green." Audit: alerts are on CPU and disk usage (causes), not on HTTP 5xx rate (symptom). Wire up an SLO on payment success rate, set up multi-window burn-rate alerts (14.4× over 1h, 6× over 6h, 2× over 24h), and discover a 0.4% baseline error from a flaky third-party that was invisible until measured. Recommend retries with jitter + circuit breaker for graceful degradation.

## Guidelines

- **SLOs measure user experience** — pick metrics from the load balancer or app, not from the kernel
- Default to **regional** everything; single-zone is dev-only
- **Min replicas ≥ 3** for any tier behind a regional load balancer
- **Alert on symptoms**, not causes — a CPU alert wakes the wrong person
- Use **multi-window burn-rate alerts** (Google SRE workbook approach), not simple thresholds
- **Test failure recovery** quarterly — backups you've never restored aren't backups
- **PodDisruptionBudgets** prevent autoscaler / upgrade rollouts from breaking SLOs
- For **graceful degradation**, ship with circuit breakers, retries with exponential backoff + jitter, and read-only fallbacks
- **Blameless postmortems** focus on the system flaw — humans will keep making mistakes; the system shouldn't let them cause outages
- For multi-region SLOs, use Cloud Spanner / multi-region GCS / global HTTPS LB; resist the urge to shard yourself
