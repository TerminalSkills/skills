---
name: azure-blob-storage
description: |
  Store and manage unstructured data with Azure Blob Storage. Create containers,
  upload and organize blobs, configure access tiers (Hot, Cool, Archive) for cost
  optimization, generate SAS tokens for secure temporary access, and set lifecycle
  management policies.
license: Apache-2.0
compatibility: 'Azure CLI 2.x, Python 3.10+ with azure-storage-blob 12.31, AzCopy 10'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/Azure/azure-sdk-for-python
  category: devops
  tags: "azure, blob-storage, object-storage, sas-tokens"
---

# Azure Blob Storage

## Overview

Azure Blob Storage is Microsoft's object storage solution for the cloud. It stores massive amounts of unstructured data — documents, images, videos, backups, and data lakes. Three access tiers (Hot, Cool, Archive) let you optimize costs based on access patterns.

## Instructions

### Core Concepts

- **Storage Account** — top-level namespace for all Azure Storage services
- **Container** — groups blobs, similar to a directory or S3 bucket
- **Blob** — a file (Block, Append, or Page blob types)
- **Access Tier** — Hot (frequent), Cool (infrequent, 30d min), Cold (rare, 90d min), Archive (offline, 180d min; must be rehydrated before reading)
- **SAS Token** — Shared Access Signature for time-limited, scoped access. A user delegation SAS (signed with Microsoft Entra credentials) is preferred over one signed with the account key; it can last at most 7 days
- **Lifecycle Policy** — automatic tier transitions and deletion rules

### Storage Account Setup

Commands below use `--auth-mode login`, so the signed-in identity needs a data-plane role on the account (for example Storage Blob Data Contributor); account Owner alone does not grant blob access.

```bash
# Create a storage account
az storage account create \
  --name myappstorageprod \
  --resource-group my-app-rg \
  --location eastus \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false
```

```bash
# Get connection string (contains the account key: keep it in an environment variable, never in code)
az storage account show-connection-string \
  --name myappstorageprod \
  --resource-group my-app-rg \
  --query connectionString --output tsv
```

### Container Operations

```bash
# Create a container
az storage container create \
  --name uploads \
  --account-name myappstorageprod \
  --auth-mode login
```

The `static` and `backups` containers used in the examples below are created the same way (`--name static`, `--name backups`).

### Blob Operations

```bash
# Upload a file
az storage blob upload \
  --account-name myappstorageprod \
  --container-name uploads \
  --name releases/v1.2.0/app.zip \
  --file ./build/app.zip \
  --tier Hot \
  --auth-mode login
```

```bash
# Upload a directory
az storage blob upload-batch \
  --account-name myappstorageprod \
  --destination static \
  --source ./dist \
  --auth-mode login \
  --overwrite
```

```bash
# Download a blob
az storage blob download \
  --account-name myappstorageprod \
  --container-name uploads \
  --name releases/v1.2.0/app.zip \
  --file ./app.zip \
  --auth-mode login
```

```bash
# List blobs
az storage blob list \
  --account-name myappstorageprod \
  --container-name uploads \
  --prefix releases/ \
  --auth-mode login \
  --query '[].name' --output tsv
```

```bash
# Set blob access tier
az storage blob set-tier \
  --account-name myappstorageprod \
  --container-name backups \
  --name old-backup.tar.gz \
  --tier Archive \
  --auth-mode login
```

Reading an Archive blob requires rehydration first: run `az storage blob set-tier --tier Hot --rehydrate-priority Standard ...` and wait (up to 15 hours for Standard priority; High priority is faster and costs more).

### SAS Tokens

```bash
# Generate a SAS token for a single blob (read access, 1 hour)
az storage blob generate-sas \
  --account-name myappstorageprod \
  --container-name uploads \
  --name reports/q4.pdf \
  --permissions r \
  --expiry $(date -u -d '+1 hour' +%Y-%m-%dT%H:%MZ) \
  --auth-mode login \
  --as-user \
  --output tsv
```

```bash
# Generate a container-level SAS (list + read, 24 hours)
az storage container generate-sas \
  --account-name myappstorageprod \
  --name uploads \
  --permissions lr \
  --expiry $(date -u -d '+24 hours' +%Y-%m-%dT%H:%MZ) \
  --auth-mode login \
  --as-user \
  --output tsv
```

```python
# User delegation SAS (pip install azure-storage-blob azure-identity)
import os
from datetime import datetime, timedelta, timezone
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, BlobSasPermissions, generate_blob_sas

account_name = "myappstorageprod"
service = BlobServiceClient(
    f"https://{account_name}.blob.core.windows.net",
    credential=DefaultAzureCredential(),
)
start = datetime.now(timezone.utc)
expiry = start + timedelta(hours=1)
delegation_key = service.get_user_delegation_key(start, expiry)

sas_token = generate_blob_sas(
    account_name=account_name,
    container_name="uploads",
    blob_name="reports/q4.pdf",
    user_delegation_key=delegation_key,
    permission=BlobSasPermissions(read=True),
    expiry=expiry,
)
print(f"https://{account_name}.blob.core.windows.net/uploads/reports/q4.pdf?{sas_token}")
```

For an upload link use `BlobSasPermissions(create=True, write=True)` and a short expiry such as 15 minutes. A SAS signed with the account key (`account_key=os.environ["AZURE_STORAGE_KEY"]`) also works, but it cannot be revoked without rotating the key.

### Lifecycle Management

```json
{
  "rules": [
    {
      "name": "archiveLogs",
      "enabled": true,
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["logs/"]
        },
        "actions": {
          "baseBlob": {
            "tierToCool": {"daysAfterModificationGreaterThan": 30},
            "tierToArchive": {"daysAfterModificationGreaterThan": 90},
            "delete": {"daysAfterModificationGreaterThan": 365}
          }
        }
      }
    },
    {
      "name": "cleanupSnapshots",
      "enabled": true,
      "type": "Lifecycle",
      "definition": {
        "filters": {"blobTypes": ["blockBlob"]},
        "actions": {
          "snapshot": {
            "delete": {"daysAfterCreationGreaterThan": 90}
          }
        }
      }
    }
  ]
}
```

Save the JSON above as `lifecycle-policy.json` (JSON allows no comments).

```bash
# Apply lifecycle policy
az storage account management-policy create \
  --account-name myappstorageprod \
  --resource-group my-app-rg \
  --policy @lifecycle-policy.json
```

### Python SDK Usage

```python
# Upload and download with Python SDK
import os
from azure.storage.blob import BlobServiceClient

blob_service = BlobServiceClient.from_connection_string(os.environ["AZURE_STORAGE_CONNECTION_STRING"])
container = blob_service.get_container_client("uploads")

# Upload
with open("report.pdf", "rb") as f:
    container.upload_blob(name="reports/2024/q4.pdf", data=f, overwrite=True)

# Download
blob = container.get_blob_client("reports/2024/q4.pdf")
with open("downloaded.pdf", "wb") as f:
    stream = blob.download_blob()
    f.write(stream.readall())

# List blobs
for blob in container.list_blobs(name_starts_with="reports/"):
    print(f"{blob.name} ({blob.size} bytes, tier: {blob.blob_tier})")
```

### AzCopy for Bulk Transfers

```bash
# Sync a local directory to blob storage (azcopy login uses your Entra identity)
azcopy login
azcopy sync './dist' 'https://myappstorageprod.blob.core.windows.net/static' \
  --delete-destination true
```

```bash
# Copy between storage accounts (run azcopy login first; the source URL carries a SAS)
azcopy copy \
  "https://sourceprodstore.blob.core.windows.net/data/?$SOURCE_SAS" \
  "https://destprodstore.blob.core.windows.net/data/" \
  --recursive
```

## Examples

### Example 1: "Share the Q4 report with a customer for one hour"

Run the user delegation SAS script above for `reports/q4.pdf`, and send the resulting URL. It opens the PDF until the expiry, then returns HTTP 403.

### Example 2: "Move logs older than 30 days to cheaper storage and delete after a year"

Save the lifecycle JSON above as `lifecycle-policy.json` and run the `az storage account management-policy create` command; blobs under `logs/` move to Cool after 30 days, Archive after 90 and are deleted after 365 days. Rules are evaluated about once a day, not immediately.

## Guidelines

- Disable public blob access by default; use SAS tokens for temporary sharing
- Use lifecycle management to automatically move cold data to cheaper tiers
- Use AzCopy for large-scale data transfers (parallel, resumable)
- Enable soft delete for accidental deletion recovery: `az storage account blob-service-properties update --account-name myappstorageprod --resource-group my-app-rg --enable-delete-retention true --delete-retention-days 14`
- Use managed identities and RBAC instead of account keys when possible
- Set minimum TLS version to 1.2
- Use Cool tier for data accessed less than once per month; moving blobs out of Cool, Cold or Archive before the minimum retention period incurs an early-deletion charge
- Enable blob versioning for critical data: the same command with `--enable-versioning true`
- `--delete-destination true` in `azcopy sync` deletes destination blobs missing from the source; run with `--dry-run` first
