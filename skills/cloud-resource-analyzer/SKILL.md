---
name: cloud-resource-analyzer
description: >-
  Finds orphaned, idle, and underutilized cloud resources across AWS, GCP, or
  Azure accounts. Use when someone needs to audit cloud spending, find unused
  EBS volumes, stale snapshots, unattached IPs, idle load balancers, or
  oversized RDS instances. Trigger words: cloud waste, orphaned resources,
  unused volumes, cloud audit, infrastructure cleanup, cloud bill analysis.
license: Apache-2.0
compatibility: "Requires AWS CLI, gcloud, or az CLI configured with read access"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["cloud", "cost-optimization", "aws", "infrastructure-audit"]
---

# Cloud Resource Analyzer

## Overview

This skill scans cloud provider accounts for resources that are costing money but providing no value — orphaned storage volumes, stale snapshots, unattached elastic IPs, idle databases, and oversized instances. It produces a prioritized cleanup report with estimated savings and safe deletion scripts.

## Instructions

### Step 1: Determine Cloud Provider and Access

Check which CLI tools are available and configured:

```bash
aws sts get-caller-identity 2>/dev/null && echo "AWS: configured"
gcloud config get-value project 2>/dev/null && echo "GCP: configured"
az account show 2>/dev/null && echo "Azure: configured"
```

### Step 2: Scan for Orphaned Storage (AWS Example)

```bash
# Unattached EBS volumes
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query 'Volumes[].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime,Tags:Tags}' \
  --output json

# Snapshots older than 90 days with no active AMI
aws ec2 describe-snapshots --owner-ids self \
  --query 'Snapshots[?StartTime<=`2025-11-01`].{ID:SnapshotId,Size:VolumeSize,Start:StartTime,Desc:Description}' \
  --output json

# Unassociated Elastic IPs
aws ec2 describe-addresses --query 'Addresses[?AssociationId==null].{IP:PublicIp,AllocID:AllocationId}' \
  --output json
```

### Step 3: Scan for Idle Compute and Network

```bash
# Load balancers with no healthy targets
aws elbv2 describe-target-health --target-group-arn <arn> \
  --query 'TargetHealthDescriptions[?TargetHealth.State!=`healthy`]'

# RDS instances with < 5% average CPU over 14 days
aws cloudwatch get-metric-statistics --namespace AWS/RDS \
  --metric-name CPUUtilization --period 86400 --statistics Average \
  --start-time $(date -d '14 days ago' -Iseconds) --end-time $(date -Iseconds) \
  --dimensions Name=DBInstanceIdentifier,Value=<instance-id>
```

### Step 4: Calculate Costs

Use these reference monthly costs for estimates:
- EBS gp3: $0.08/GiB-month
- EBS snapshots: $0.05/GiB-month
- Elastic IP (unattached): $3.60/month
- ALB idle: $16.20/month + LCU charges
- NLB idle: $6.75/month

### Step 5: Generate Cleanup Report

Organize findings by category with estimated monthly cost. Sort by savings descending. Include:
- Resource ID, type, region
- Creation date and relevant tags
- Why it's considered orphaned/idle
- Estimated monthly cost
- Recommended action (delete, downsize, archive)

### Step 6: Create Safe Cleanup Scripts

Generate scripts with:
- `--dry-run` flag that only lists what would be deleted
- Tag-based grace period (tag resources `scheduled-for-deletion: <date+7d>`)
- Snapshot before delete for EBS volumes
- Confirmation prompts for production resources

## Examples

### Example 1: Full AWS Audit

**User prompt:**
```
Scan our AWS account for wasted cloud resources
```

**Agent output:**
```
Cloud Resource Audit — AWS account 123456789012
Region: us-east-1
────────────────────────────────────────────────

STORAGE WASTE
  Unattached EBS volumes: 4 volumes, 450 GiB total          $36.00/mo
  Stale snapshots (>90 days, no AMI): 23 snapshots, 1.2 TiB $60.00/mo
  S3 buckets with no access in 90 days: 2 buckets, 340 GiB  $7.82/mo

NETWORK WASTE
  Unassociated Elastic IPs: 2                                $7.20/mo
  ALBs with 0 healthy targets: 1                             $16.20/mo
  NAT Gateway with <1GB/mo traffic: 1                        $32.40/mo

COMPUTE WASTE
  RDS db.r5.xlarge at 3% avg CPU: 1 instance                $274.00/mo
  → Recommend downsize to db.r5.large                        saves $137.00/mo

Total monthly waste: $296.62/mo ($3,559/year)
```

### Example 2: Targeted EBS Cleanup

**User prompt:**
```
Find and clean up orphaned EBS volumes in us-west-2
```

**Agent output:**
```
Found 3 unattached EBS volumes in us-west-2:

vol-0abc123  200Gi gp3  Created: 2025-05-12  Tag: postgres-backup    $16.00/mo
vol-0def456  100Gi gp3  Created: 2025-08-30  Tag: jenkins-workspace  $8.00/mo
vol-0ghi789   50Gi gp2  Created: 2025-10-15  Tag: none               $5.00/mo

Cleanup script generated: cleanup-ebs-us-west-2.sh
  ./cleanup-ebs-us-west-2.sh --dry-run    # Preview only
  ./cleanup-ebs-us-west-2.sh --execute    # Tag for deletion in 7 days
  ./cleanup-ebs-us-west-2.sh --force      # Delete immediately (creates snapshots first)
```

## Guidelines

- **Read-only by default** — never delete resources without explicit user confirmation
- **Grace period pattern** — always recommend tagging resources for deletion before actually deleting
- **Snapshot before delete** — for EBS volumes, always create a snapshot before removal
- **Cross-reference dependencies** — check if volumes are referenced by Terraform state, K8s PVCs, or backup policies before flagging
- **Multi-region** — remind users to scan all active regions, not just the default
- **Cost estimates are approximate** — based on on-demand pricing; reserved instances or savings plans may differ
- **Sensitive data** — warn about volumes that might contain database data or secrets
