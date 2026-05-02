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
  version: 1.0.0
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

```yaml
# Example SLO definition (managed via gcloud or Terraform)
# SLI: HTTP success rate from the load balancer
# SLO: 99.9% of requests succeed over rolling 28 days
displayName: "Web frontend availability"
serviceLevelIndicator:
  requestBased:
    goodTotalRatio:
      goodServiceFilter: |
        metric.type="loadbalancing.googleapis.com/https/request_count"
        resource.labels.url_map_name="web-frontend"
        metric.labels.response_code_class="200"
      totalServiceFilter: |
        metric.type="loadbalancing.googleapis.com/https/request_count"
        resource.labels.url_map_name="web-frontend"
goal: 0.999
rollingPeriod: 2419200s  # 28 days
```

```bash
# Apply via gcloud
gcloud monitoring services create --service-id=web-frontend \
  --display-name="Web frontend"

gcloud alpha monitoring slos create \
  --service=web-frontend \
  --slo-from-file=availability-slo.yaml
```

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
gcloud storage buckets create gs://my-prod-data \
  --location=US --default-storage-class=STANDARD
```

For workloads with multi-region SLOs, deploy to two regions behind a global HTTPS load balancer with `--load-balancing-scheme=EXTERNAL_MANAGED` and use Cloud DNS health checks for failover. Cloud Spanner is the right database when you need synchronous multi-region writes.

### Horizontal Autoscaling

```yaml
# GKE HPA — scale on CPU + custom metrics
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
          selector: { matchLabels: { resource.label.subscription_id: events-sub } }
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
# Backup and DR Service for VMs / GKE / databases
gcloud backup-dr backup-plans create web-tier-plan \
  --location=us-central1 \
  --backup-vault=projects/my-project/locations/us-central1/backupVaults/prod \
  --resource-type=compute.googleapis.com/Instance \
  --backup-rule=rule-id=daily,recurrence=DAILY,retention-days=30 \
  --backup-rule=rule-id=monthly,recurrence=MONTHLY,retention-days=365
```

```bash
# Cloud SQL: enable PITR and test restore quarterly
gcloud sql instances clone orders orders-restore-test \
  --point-in-time='2026-04-15T10:00:00Z'
# Validate the clone, then delete it — proves backups are actually restorable
```

DR testing is not optional. Schedule quarterly:
- **Game days**: simulate a regional outage; force traffic to the secondary region
- **Restore drills**: clone a production DB to a non-prod project from backup, validate row counts and known queries
- **Failure injection**: kill a random pod / zone / dependency in staging; verify SLO holds

### Alerting on Symptoms, Not Causes

```yaml
# Bad: alerts on CPU usage. Good: alerts on user-facing error rate.
displayName: "High error rate — web-frontend"
conditions:
  - displayName: "Error rate > 1% for 5 minutes"
    conditionThreshold:
      filter: |
        metric.type="loadbalancing.googleapis.com/https/request_count"
        resource.labels.url_map_name="web-frontend"
        metric.labels.response_code_class!="200"
      comparison: COMPARISON_GT
      thresholdValue: 0.01
      duration: 300s
notificationChannels:
  - projects/my-project/notificationChannels/oncall-pagerduty
```

Page on:
- SLO burn rate (e.g., 14.4× over 1h, 6× over 6h — Google's multi-window strategy)
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

User reports "users say checkout is broken but our infra dashboards are all green." Audit: alerts are on CPU and disk usage (causes), not on HTTP 5xx rate (symptom). Wire up an SLO on payment success rate, set up multi-window burn-rate alerts (14.4× / 6× / 3× / 1×), and discover a 0.4% baseline error from a flaky third-party that was invisible until measured. Recommend retries with jitter + circuit breaker for graceful degradation.

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
