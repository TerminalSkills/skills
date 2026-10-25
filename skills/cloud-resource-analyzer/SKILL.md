---
name: cloud-resource-analyzer
description: >-
  Finds orphaned, idle, and underutilized cloud resources across AWS, GCP, or
  Azure accounts. Use when someone needs to audit cloud spending, find unused
  EBS volumes, stale snapshots, unattached IPs, idle load balancers, or
  oversized RDS instances. Trigger words: cloud waste, orphaned resources,
  unused volumes, cloud audit, infrastructure cleanup, cloud bill analysis.
license: Apache-2.0
compatibility: "Requires AWS CLI v2, gcloud, or az CLI configured with read access"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "cloud, cost-optimization, aws, infrastructure-audit"
---

# Cloud Resource Analyzer

## Overview

This skill scans cloud provider accounts for resources that are costing money but providing no value — orphaned storage volumes, stale snapshots, unattached elastic IPs, idle load balancers, and oversized databases. It produces a prioritized cleanup report with estimated savings and safe deletion scripts. The examples use AWS CLI v2; GCP and Azure need the equivalent `gcloud` and `az` queries.

## Instructions

### Step 1: Determine Cloud Provider and Access

Check which CLI tools are available and configured:

```bash
aws sts get-caller-identity 2>/dev/null && echo "AWS: configured"
gcloud config get-value project 2>/dev/null && echo "GCP: configured"
az account show 2>/dev/null && echo "Azure: configured"
```

Scan every region that has resources, not only the default one. List them with `aws ec2 describe-regions` (add `--all-regions` to the filter only if opt-in regions are in use).

### Step 2: Scan for Orphaned Storage (AWS Example)

```bash
# Unattached EBS volumes (status "available" = not attached to any instance)
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query 'Volumes[].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime,Tags:Tags}' \
  --output json

# Snapshots older than 90 days (cutoff computed at run time, so the query never goes stale)
# GNU date shown; on macOS use: date -u -v-90d +%Y-%m-%dT%H:%M:%SZ
CUTOFF=$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)
aws ec2 describe-snapshots --owner-ids self \
  --query "Snapshots[?StartTime<=\`\"$CUTOFF\"\`].{ID:SnapshotId,Size:VolumeSize,Start:StartTime,Desc:Description}" \
  --output json

# Snapshots that an AMI still depends on cannot be deleted; list them so they are excluded
aws ec2 describe-images --owners self \
  --query 'Images[].BlockDeviceMappings[].Ebs.SnapshotId' --output text

# Unassociated Elastic IPs (AssociationId is null when the address is idle)
aws ec2 describe-addresses --query 'Addresses[?AssociationId==null].{IP:PublicIp,AllocID:AllocationId}' \
  --output json
```

### Step 3: Scan for Idle Compute and Network

```bash
# List target groups, then check each one for unhealthy targets
aws elbv2 describe-target-groups \
  --query 'TargetGroups[].{Name:TargetGroupName,ARN:TargetGroupArn}' --output table

aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:418273906541:targetgroup/checkout-api/3f2a9c1d8e7b6a50 \
  --query 'TargetHealthDescriptions[?TargetHealth.State!=`healthy`]'

# RDS instance with average CPU over 14 days (GNU date; macOS: date -u -v-14d)
START=$(date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
aws cloudwatch get-metric-statistics --namespace AWS/RDS \
  --metric-name CPUUtilization --period 86400 --statistics Average \
  --start-time "$START" --end-time "$END" \
  --dimensions Name=DBInstanceIdentifier,Value=orders-db-prod
```

A low average CPU is a candidate, not a verdict. Check connections, IOPS and memory before recommending a smaller class.

### Step 4: Calculate Costs

Use these list prices (US East, on-demand) for estimates. Use a 720-hour month. Confirm your region's prices in the AWS Pricing Calculator before reporting totals:
- EBS gp3: $0.08/GB-month; gp2: $0.10/GB-month
- EBS snapshots (standard): $0.05/GB-month
- Public IPv4 address, in use or idle: $0.005/hour, about $3.60/month. An unattached Elastic IP is charged the same way.
- Application Load Balancer: $0.0225/hour (about $16.20/month) plus per-LCU charges
- Network Load Balancer: $0.0225/hour (about $16.20/month) plus per-NLCU charges. The base price is not $6.75.
- NAT Gateway: $0.045/hour per AZ (about $32.40/month) plus per-GB processing. The figure is taken from the AWS example, so check your region.

RDS instance and S3 storage prices vary by engine, class and region. Look them up rather than reusing a remembered number.

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
Cloud Resource Audit — AWS account 418273906541
Region: us-east-1
────────────────────────────────────────────────

STORAGE WASTE
  Unattached EBS volumes: 4 volumes, 450 GiB total          $36.00/mo
  Snapshots older than 90 days (no AMI): 23, 1,200 GiB      $60.00/mo

NETWORK WASTE
  Unassociated Elastic IPs: 2                                $7.20/mo
  ALB with 0 healthy targets: 1                             $16.20/mo
  NAT Gateway with <1 GB/mo traffic: 1                      $32.40/mo

NOT PRICED (look up in Pricing Calculator)
  RDS orders-db-prod: 3% avg CPU over 14 days, db.r5.xlarge
    → candidate for downsizing after checking connections and memory
  S3 buckets with no recent access: 2 buckets, 340 GiB
    → confirm with S3 Storage Lens or server access logs first

Total priced waste: $151.90/mo ($1,823/year)
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
- **AMI dependency** — a snapshot referenced by an AMI cannot be deleted; deregister the AMI first, and only with the owner's approval
- **Cross-reference dependencies** — check if volumes are referenced by Terraform state, K8s PVCs, or backup policies before flagging
- **Multi-region** — remind users to scan all active regions, not just the default
- **Cost estimates are approximate** — based on on-demand list prices; reserved instances, savings plans and free tiers may change the real bill
- **Sensitive data** — warn about volumes that might contain database data or secrets
- **Idle is not unused** — low CPU or zero traffic can still mean a standby, a DR copy or a quarterly job; ask the owner before tagging
