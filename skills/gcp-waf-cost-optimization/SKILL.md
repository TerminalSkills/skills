---
name: gcp-waf-cost-optimization
description: |
  Apply the Google Cloud Well-Architected Framework's Cost Optimization pillar
  to evaluate workloads and recommend FinOps practices — billing exports,
  budgets, rightsizing via Active Assist, Spot VMs, Committed Use Discounts,
  storage lifecycle policies, and serverless adoption. Use for cloud cost
  reviews, monthly billing analysis, and architecture cost decisions.
license: Apache-2.0
compatibility: 'gcloud-cli, BigQuery (billing export), Cloud Billing'
metadata:
  author: google-cloud
  version: 1.0.0
  category: devops
  tags:
    - gcp
    - finops
    - cost-optimization
    - well-architected
    - billing
---

# GCP Well-Architected Framework — Cost Optimization

## Overview

Cloud is OpEx, not CapEx — getting cost right requires visibility (where is money going?), accountability (who owns each line item?), and continuous tuning (is each resource still earning its cost?). This skill applies the Google Cloud Well-Architected Framework's Cost Optimization pillar to evaluate a workload and recommend FinOps controls.

## Instructions

### Core Principles

| Principle | What it means in practice |
|---|---|
| **Align spending with business value** | Every dollar should map to a product/team/feature; reject infra that doesn't tie back to a business metric |
| **Foster cost awareness** | Make spend visible to engineers via dashboards, not just to finance |
| **Optimize resource usage** | Rightsize, use cheap-when-fault-tolerant compute (Spot), commit when stable (CUDs) |
| **Optimize continuously** | Cost reviews are recurring; act on Recommender insights monthly |

### Visibility Layer (Foundation)

```bash
# Enable BigQuery billing export — required for granular analysis
gcloud beta billing accounts list  # find your billing account ID
# Then in Console: Billing → Export → BigQuery export → enable "Detailed usage cost data"
```

```sql
-- Top 20 services by cost, last 30 days
SELECT
  service.description AS service,
  SUM(cost) AS cost_usd,
  SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits_usd,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_usd
FROM `my-project.billing_export.gcp_billing_export_resource_v1_*`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY service
ORDER BY net_usd DESC
LIMIT 20;
```

```sql
-- Cost by label (env, team, app) — requires consistent labeling
SELECT
  (SELECT value FROM UNNEST(labels) WHERE key = 'team') AS team,
  (SELECT value FROM UNNEST(labels) WHERE key = 'env') AS env,
  service.description AS service,
  SUM(cost) AS cost_usd
FROM `my-project.billing_export.gcp_billing_export_resource_v1_*`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY team, env, service
ORDER BY cost_usd DESC;
```

### Budgets and Alerts

```bash
# Per-project budget with alerts at 50%, 90%, 100% of forecasted spend
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="prod-monthly-budget" \
  --budget-amount=10000USD \
  --threshold-rule=percent=0.5,basis=current-spend \
  --threshold-rule=percent=0.9,basis=current-spend \
  --threshold-rule=percent=1.0,basis=forecasted-spend \
  --filter-projects=projects/my-project \
  --notifications-rule-pubsub-topic=projects/my-project/topics/billing-alerts
```

Pipe the Pub/Sub topic to a Cloud Function that auto-disables non-critical resources at 95% of budget for dev/test projects.

### Rightsizing via Active Assist

```bash
# List rightsizing recommendations across the project
gcloud recommender recommendations list \
  --project=my-project \
  --location=us-central1-a \
  --recommender=google.compute.instance.MachineTypeRecommender \
  --format='table(content.overview.currentMachineType, content.overview.recommendedMachineType, primaryImpact.costProjection.cost.units)'
```

```bash
# Idle VMs (consider stopping or deleting)
gcloud recommender recommendations list \
  --project=my-project \
  --location=us-central1-a \
  --recommender=google.compute.instance.IdleResourceRecommender
```

```bash
# Idle persistent disks
gcloud recommender recommendations list \
  --project=my-project \
  --location=us-central1-a \
  --recommender=google.compute.disk.IdleResourceRecommender
```

### Cheaper Compute

```bash
# Spot VMs — up to 91% cheaper, can be preempted with 30s notice
gcloud compute instances create batch-worker \
  --zone=us-central1-a \
  --machine-type=n2-standard-4 \
  --provisioning-model=SPOT \
  --instance-termination-action=DELETE
```

```bash
# Committed Use Discount — 1 or 3 year commit, ~57% off for stable workloads
gcloud compute commitments create prod-commit-3y \
  --region=us-central1 \
  --resources=vcpu=64,memory=256 \
  --plan=THIRTY_SIX_MONTH \
  --type=GENERAL_PURPOSE
```

For variable workloads, use **Cloud Run / Cloud Run functions / GKE Autopilot** — pay for actual request seconds, not provisioned capacity. Migrating a low-traffic API from a Compute Engine VM to Cloud Run typically cuts cost 70%+.

### Storage Lifecycle Policies

```bash
# Move objects to cheaper tiers automatically
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      { "action": { "type": "SetStorageClass", "storageClass": "NEARLINE" },
        "condition": { "age": 30 } },
      { "action": { "type": "SetStorageClass", "storageClass": "COLDLINE" },
        "condition": { "age": 90 } },
      { "action": { "type": "SetStorageClass", "storageClass": "ARCHIVE" },
        "condition": { "age": 365 } },
      { "action": { "type": "Delete" },
        "condition": { "age": 2555 } }
    ]
  }
}
EOF
gcloud storage buckets update gs://my-archive-bucket --lifecycle-file=lifecycle.json
```

Storage class pricing (US, per GB-month, approximate): Standard $0.020, Nearline $0.010, Coldline $0.004, Archive $0.0012. Lifecycle rules pay for themselves within weeks on cold data.

### Workload Assessment Questions

When evaluating a workload, work through:

1. Is BigQuery billing export enabled and used in monthly reviews?
2. Are 100% of resources labeled with `env`, `team`, `app`?
3. Are budgets + alerts configured per project / business unit?
4. Are Active Assist rightsizing recommendations reviewed monthly?
5. Is CUD coverage reviewed against actual stable consumption?
6. Are idle disks, IPs, and VMs swept monthly?
7. Are new workloads serverless-by-default unless there's a hard reason not to be?
8. Do object storage buckets have lifecycle policies?
9. Is dev/test on Spot, off-hours shutdown, or cheaper tiers than prod?
10. Are there organization policies preventing expensive defaults (regions, machine types)?

### Validation Checklist

- [ ] **Cost attribution** — 100% of resources carry `env`, `team`, `app` labels
- [ ] **Granular visibility** — BigQuery billing export enabled, queried in monthly reviews
- [ ] **Budgets and alerts** — every project / BU has a budget with 50%/90%/100% alerts
- [ ] **Rightsizing** — Active Assist recommendations reviewed and acted on monthly
- [ ] **Commitments** — CUD coverage reviewed monthly against stable consumption
- [ ] **Idle resource sweeps** — disks, IPs, VMs cleaned up monthly
- [ ] **Managed services first** — serverless preferred for new workloads
- [ ] **Storage tiering** — lifecycle policies on all archival buckets
- [ ] **Org policies** — region / machine type / external IP restrictions enforced
- [ ] **Dev/test cost** — non-prod runs on Spot, scales to zero, or shuts down off-hours
## Examples

### Example 1 — Monthly cost review for a startup

User shares last month's GCP bill ($15k, up from $9k). Pull billing-export data into BigQuery, group by service and label, identify the spike (a forgotten n2-standard-32 in dev with no auto-shutdown). Run Active Assist rightsizing across the project, surface 6 idle disks and 12 oversized VMs. Estimated savings: $4.2k/month. Recommend a CUD for the stable Compute Engine baseline (+$1.8k/month savings) and lifecycle policies on three archival buckets (+$200/month).

### Example 2 — Architectural cost review of a new service

Team is designing a new background job processor. Default proposal is 6 always-on n2-standard-8 VMs ($1.4k/month). Recommend Cloud Run Jobs with `--task-count` matching peak burst — pay only for actual job seconds (~$200/month at expected volume). For the message queue, Pub/Sub instead of self-hosted RabbitMQ on GCE. For object storage, Standard tier with lifecycle to Coldline at 90 days.

## Guidelines

- **Labels first** — without `env`/`team`/`app` labels, every other recommendation is approximate
- BigQuery billing export beats Console reports for any non-trivial analysis
- **Budgets with Pub/Sub alerts** — wire to a function that can auto-disable resources for dev/test
- Recommender insights are passive — schedule a monthly sweep, don't expect them to act themselves
- Spot VMs are the right default for any fault-tolerant workload (CI, batch, inference, dev/test)
- CUDs require >12 months of usage history to size correctly — never commit before that
- Migrate static-VM workloads to Cloud Run / Cloud Run Jobs / GKE Autopilot whenever possible
- Storage lifecycle policies pay for themselves in weeks; there's no reason not to set them
- For multi-team accounts, use Folders + per-folder budgets and aggregated billing rollups
- Set Org Policies to restrict regions and machine types — prevents accidentally provisioning the world's most expensive VM in Sydney
