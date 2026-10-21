---
name: velero
description: >-
  Velero is an open-source tool that backs up and restores Kubernetes cluster
  resources and persistent volumes to object storage. Use this skill when a
  user needs to install Velero, back up namespaces or whole clusters, schedule
  automated backups, restore workloads after a failure, back up volumes with
  file system backup or snapshots, or migrate applications between clusters.
license: Apache-2.0
compatibility: "Kubernetes 1.18+, kubectl, an S3-compatible, GCS or Azure bucket; Velero CLI on linux or macOS"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/velero-io/velero
  tags:
    - velero
    - kubernetes
    - backup
    - disaster-recovery
    - migration
---

# Velero

## Overview

Velero (formerly Heptio Ark, now at github.com/velero-io/velero; latest 1.18.x) has two parts: a server running in the cluster (namespace `velero`) and a local `velero` CLI. Backups are stored in a BackupStorageLocation (an object-storage bucket). Volume data is captured one of three ways: CSI or provider snapshots, file system backup (Kopia, run by the node agent; works for almost any volume type, including NFS and emptyDir; restic is deprecated), or the CSI snapshot data mover (`--snapshot-move-data`). Cloud integrations are plugins whose version must match Velero (plugin 1.14.x for Velero 1.18.x).

## Instructions

1. Install the CLI. Prefer a package manager:

```bash
brew install velero            # macOS and Linuxbrew
choco install velero           # Windows
```

Or download a release and verify the checksum before extracting:

```bash
VER=v1.18.4
curl -sLO https://github.com/velero-io/velero/releases/download/$VER/velero-$VER-linux-amd64.tar.gz
curl -sLO https://github.com/velero-io/velero/releases/download/$VER/CHECKSUM
sha256sum -c --ignore-missing CHECKSUM
tar -xzf velero-$VER-linux-amd64.tar.gz
sudo install velero-$VER-linux-amd64/velero /usr/local/bin/velero
velero version --client-only
```

2. Install the server (the Helm chart is the other supported method). AWS, with credentials taken from environment variables:

```bash
printf '[default]\naws_access_key_id=%s\naws_secret_access_key=%s\n' \
  "$VELERO_AWS_ACCESS_KEY_ID" "$VELERO_AWS_SECRET_ACCESS_KEY" > credentials-velero

velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.14.4 \
  --bucket northwind-velero-backups \
  --backup-location-config region=eu-west-1 \
  --snapshot-location-config region=eu-west-1 \
  --secret-file ./credentials-velero \
  --use-node-agent \
  --wait
rm credentials-velero
```

GCP: `--provider gcp --plugins velero/velero-plugin-for-gcp:v1.14.4 --bucket NAME --secret-file ./gcp-sa.json`. With IAM roles or workload identity use `--no-secret` instead of a key file. Add `--default-volumes-to-fs-backup` to back up every pod volume with file system backup, or `--use-volume-snapshots=false` if there is no snapshot provider.

3. Back up with `velero backup create NAME` and the filters `--include-namespaces`, `--exclude-namespaces`, `--selector`, `--include-resources` / `--exclude-resources` (format `resource.group`, e.g. `deployments.apps`), `--ttl` (default 720h), `--snapshot-volumes=false`, `--default-volumes-to-fs-backup`, `--snapshot-move-data`, `--wait`. Inspect with `velero backup get`, `describe --details`, `logs`.
4. Schedule with `velero schedule create NAME --schedule="0 2 * * *"` (cron in UTC; `@every 24h` also works) plus the same filters. `velero backup create --from-schedule NAME` runs one now; `velero restore create --from-schedule NAME` restores the latest good run.
5. Restore with `velero restore create --from-backup NAME`, optionally `--include-namespaces`, `--include-resources`, `--namespace-mappings old:new`, `--existing-resource-policy update`. Existing objects are skipped unless the policy is `update`. Check `velero restore describe NAME --details`.
6. Volumes with file system backup: in opt-in mode annotate the pod (template) with `backup.velero.io/backup-volumes: data`; in opt-out mode (`--default-volumes-to-fs-backup`) skip volumes with `backup.velero.io/backup-volumes-excludes`. `hostPath` volumes are not supported (`local` is).
7. To migrate, install Velero in the destination cluster against the same bucket (or add it as a `--access-mode ReadOnly` location), wait until `velero backup get` lists the source backups, then restore.

## Examples

### Nightly backup of production with 30-day retention

```bash
velero schedule create prod-nightly \
  --schedule="0 2 * * *" \
  --include-namespaces production,database \
  --default-volumes-to-fs-backup \
  --ttl 720h
velero backup create prod-first-run --from-schedule prod-nightly --wait
velero backup describe prod-first-run --details
```

Result: `Phase: Completed`, with the pod volume backups listed under "Backup Volumes". The schedule itself produces names like `prod-nightly-20261021020000`.

### Restore one namespace into a side-by-side copy

```bash
velero restore create shop-drill \
  --from-backup prod-nightly-20261021020000 \
  --include-namespaces production \
  --namespace-mappings production:production-drill
velero restore describe shop-drill --details
kubectl get pods -n production-drill
```

Result: the restore reaches `Completed` and the pods start in `production-drill` while production is untouched. A drill like this each quarter proves the backups work.

### Migrate to a new cluster

```bash
# old cluster
velero backup create migrate-2026-10 --exclude-namespaces kube-system,velero \
  --default-volumes-to-fs-backup --wait

# new cluster (kubectl context switched), same bucket
velero install --provider aws --plugins velero/velero-plugin-for-aws:v1.14.4 \
  --bucket northwind-velero-backups --backup-location-config region=eu-west-1 \
  --secret-file ./credentials-velero --use-node-agent --wait
velero backup get
velero restore create --from-backup migrate-2026-10
```

Result: `migrate-2026-10` shows up in the new cluster's backup list (Velero syncs the bucket contents every minute or so) and the restore recreates namespaces, workloads and volume data.

## Guidelines

- Test restores. A backup that was never restored is unproven; check `velero backup describe --details` for `PartiallyFailed`.
- Snapshot backups need a matching snapshot plugin or CSI setup; for any other volume use file system backup, which needs `--use-node-agent`.
- File system backup reads live data, so databases may be only crash-consistent; use backup hooks to quiesce them.
- `velero backup delete NAME --confirm` also removes the backup data from the bucket, and `velero uninstall` removes the CRDs. Neither can be undone.
- Keep the plugin image tag in the compatible range for your Velero version and read the upgrade notes before a minor upgrade.
- Backups contain Secrets; restrict bucket access, encrypt the bucket, and delete local credentials files after install.
- Cluster-scoped resources are included only per your filters; see `--include-cluster-scoped-resources` when you filter by namespace and need CRDs or storage classes.
