---
name: azure-blob-storage
description: |
  Store and manage unstructured data with Azure Blob Storage. Create containers,
  upload and organize blobs, configure access tiers (Hot, Cool, Archive) for cost
  optimization, generate SAS tokens for secure temporary access, and set lifecycle
  management policies.
license: Apache-2.0
compatibility:
  - azure-cli
  - python
  - azcopy
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud-services
  tags:
    - azure
    - blob-storage
    - object-storage
    - sas-tokens
---

# Azure Blob Storage

Azure Blob Storage is Microsoft's object storage solution for the cloud. It stores massive amounts of unstructured data — documents, images, videos, backups, and data lakes. Three access tiers (Hot, Cool, Archive) let you optimize costs based on access patterns.

## Core Concepts

- **Storage Account** — top-level namespace for all Azure Storage services
- **Container** — groups blobs, similar to a directory or S3 bucket
- **Blob** — a file (Block, Append, or Page blob types)
- **Access Tier** — Hot (frequent), Cool (infrequent, 30d min), Archive (rare, 180d min)
- **SAS Token** — Shared Access Signature for time-limited, scoped access
- **Lifecycle Policy** — automatic tier transitions and deletion rules

## Storage Account Setup

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
# Get connection string
az storage account show-connection-string \
  --name myappstorageprod \
  --resource-group my-app-rg \
  --query connectionString --output tsv
```

## Container Operations

```bash
# Create a container
az storage container create \
  --name uploads \
  --account-name myappstorageprod \
  --auth-mode login
```

```bash
# List containers
az storage container list \
  --account-name myappstorageprod \
  --auth-mode login \
  --query '[].name' --output tsv
```

## Blob Operations

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

## SAS Tokens

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
# Generate SAS token with Python SDK
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta, timezone

account_name = "myappstorageprod"
account_key = "your-account-key"

sas_token = generate_blob_sas(
    account_name=account_name,
    container_name="uploads",
    blob_name="reports/q4.pdf",
    account_key=account_key,
    permission=BlobSasPermissions(read=True),
    expiry=datetime.now(timezone.utc) + timedelta(hours=1)
)
url = f"https://{account_name}.blob.core.windows.net/uploads/reports/q4.pdf?{sas_token}"
print(f"SAS URL: {url}")
```

```python
# Generate SAS for upload (write permission)
upload_sas = generate_blob_sas(
    account_name=account_name,
    container_name="uploads",
    blob_name="user-uploads/avatar.jpg",
    account_key=account_key,
    permission=BlobSasPermissions(write=True, create=True),
    expiry=datetime.now(timezone.utc) + timedelta(minutes=15)
)
```

## Lifecycle Management

```json
// lifecycle-policy.json — auto-tier and expire blobs
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

```bash
# Apply lifecycle policy
az storage account management-policy create \
  --account-name myappstorageprod \
  --resource-group my-app-rg \
  --policy @lifecycle-policy.json
```

## Python SDK Usage

```python
# Upload and download with Python SDK
from azure.storage.blob import BlobServiceClient

blob_service = BlobServiceClient.from_connection_string("your-connection-string")
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

## AzCopy for Bulk Transfers

```bash
# Sync a local directory to blob storage
azcopy sync './dist' 'https://myappstorageprod.blob.core.windows.net/static?SAS_TOKEN' \
  --delete-destination true
```

```bash
# Copy between storage accounts
azcopy copy \
  'https://source.blob.core.windows.net/data/*?SAS' \
  'https://dest.blob.core.windows.net/data/?SAS' \
  --recursive
```

## Best Practices

- Disable public blob access by default; use SAS tokens for temporary sharing
- Use lifecycle management to automatically move cold data to cheaper tiers
- Use AzCopy for large-scale data transfers (parallel, resumable)
- Enable soft delete for accidental deletion recovery (set retention period)
- Use managed identities and RBAC instead of account keys when possible
- Set minimum TLS version to 1.2
- Use Cool tier for data accessed less than once per month
- Enable blob versioning for critical data protection
