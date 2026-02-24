---
name: velero
description: >-
  Velero for Kubernetes backup and disaster recovery. Use when the user needs
  to back up cluster resources and persistent volumes, restore workloads,
  migrate between clusters, or schedule automated backups.
license: Apache-2.0
compatibility:
  - linux
  - macos
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - velero
    - kubernetes
    - backup
    - disaster-recovery
    - migration
---

# Velero

Velero backs up and restores Kubernetes cluster resources and persistent volumes for disaster recovery and migration.

## Installation

```bash
# Install Velero CLI
wget https://github.com/vmware-tanzu/velero/releases/download/v1.13.0/velero-v1.13.0-linux-amd64.tar.gz
tar -xzf velero-v1.13.0-linux-amd64.tar.gz
sudo mv velero-v1.13.0-linux-amd64/velero /usr/local/bin/
```

## AWS Setup

```bash
# Install Velero with AWS provider
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.9.0 \
  --bucket my-velero-backups \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./credentials-velero \
  --use-node-agent \
  --default-volumes-to-fs-backup
```

```ini
# credentials-velero — AWS credentials file for Velero
[default]
aws_access_key_id=AKIA...
aws_secret_access_key=...
```

## GCP Setup

```bash
# Install Velero with GCP provider
velero install \
  --provider gcp \
  --plugins velero/velero-plugin-for-gcp:v1.9.0 \
  --bucket my-velero-backups \
  --secret-file ./credentials-velero-gcp.json \
  --use-node-agent
```

## Backup Operations

```bash
# Create a full cluster backup
velero backup create full-backup-$(date +%Y%m%d)

# Backup specific namespace
velero backup create app-backup \
  --include-namespaces production,staging \
  --ttl 720h

# Backup with label selector
velero backup create team-a-backup \
  --selector app.kubernetes.io/team=team-a

# Backup specific resources
velero backup create configs-backup \
  --include-resources configmaps,secrets \
  --include-namespaces default

# Exclude resources
velero backup create partial-backup \
  --exclude-namespaces kube-system,kube-public \
  --exclude-resources events

# Check backup status
velero backup describe full-backup-20240115
velero backup logs full-backup-20240115
velero backup get
```

## Scheduled Backups

```bash
# Create scheduled backup (daily at 2am UTC)
velero schedule create daily-backup \
  --schedule="0 2 * * *" \
  --ttl 168h \
  --include-namespaces production

# Weekly full backup
velero schedule create weekly-full \
  --schedule="0 0 * * 0" \
  --ttl 720h

# List and manage schedules
velero schedule get
velero schedule describe daily-backup
velero schedule delete daily-backup
```

```yaml
# schedule.yaml — Velero Schedule as manifest
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-production
  namespace: velero
spec:
  schedule: "0 2 * * *"
  template:
    includedNamespaces:
      - production
      - database
    ttl: 168h0m0s
    storageLocation: default
    volumeSnapshotLocations:
      - default
    defaultVolumesToFsBackup: true
  useOwnerReferencesInBackup: false
```

## Restore Operations

```bash
# Restore entire backup
velero restore create --from-backup full-backup-20240115

# Restore specific namespace
velero restore create --from-backup full-backup-20240115 \
  --include-namespaces production

# Restore to different namespace (namespace mapping)
velero restore create --from-backup app-backup \
  --namespace-mappings production:production-restored

# Restore specific resources only
velero restore create --from-backup full-backup-20240115 \
  --include-resources deployments,services,configmaps

# Check restore status
velero restore describe restore-name
velero restore logs restore-name
velero restore get
```

## Backup Locations

```yaml
# backup-location.yaml — Additional backup storage location
apiVersion: velero.io/v1
kind: BackupStorageLocation
metadata:
  name: secondary
  namespace: velero
spec:
  provider: aws
  objectStorage:
    bucket: my-velero-secondary
    prefix: backups
  config:
    region: eu-west-1
  accessMode: ReadWrite
```

## Volume Backup Annotations

```yaml
# deployment-with-backup.yaml — Deployment with volume backup annotations
apiVersion: apps/v1
kind: Deployment
metadata:
  name: database
spec:
  template:
    metadata:
      annotations:
        backup.velero.io/backup-volumes: data
    spec:
      containers:
        - name: postgres
          image: postgres:15
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: postgres-data
```

## Cluster Migration

```bash
# Source cluster: create backup
velero backup create migration-backup --include-namespaces production

# Configure destination cluster with same backup location
velero backup-location create source \
  --provider aws \
  --bucket my-velero-backups \
  --config region=us-east-1 \
  --access-mode ReadOnly

# Destination cluster: restore
velero restore create --from-backup migration-backup
```

## Common Commands

```bash
# Status and debugging
velero get backups
velero get restores
velero get schedules

# Plugin management
velero plugin get

# Delete old backups
velero backup delete old-backup-name

# Uninstall
velero uninstall
```
