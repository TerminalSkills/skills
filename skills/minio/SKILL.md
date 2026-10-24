---
name: minio
description: >-
  Self-host S3-compatible object storage with MinIO. Use when a user asks to
  set up self-hosted object storage, create an S3-compatible API on their own
  server, store files without AWS, set up a private cloud storage, manage
  buckets and objects, configure storage for backups, host static assets, or
  replace AWS S3 with a self-hosted solution. Covers single-node deployment from
  source, bucket management, presigned URLs, lifecycle policies, and
  integration with apps via the S3 API.
license: Apache-2.0
compatibility: 'Linux, macOS, Docker'
metadata:
  author: terminal-skills
  repository: https://github.com/minio/minio
  version: 1.1.0
  category: devops
  tags:
    - minio
    - s3
    - storage
    - object-storage
    - self-hosted
---

# MinIO

## Overview

MinIO is an S3-compatible object storage server you can self-host. Any tool or SDK that works with AWS S3 works with MinIO: same API, same client libraries. Use it for file uploads, backup storage (restic, pg_dump), static asset hosting, and anywhere you'd use S3 but want the data on your own infrastructure.

**Project status (checked October 2026):** the community repository `minio/minio` is marked "THIS REPOSITORY IS NO LONGER MAINTAINED" (its README points to the commercial AIStor editions). Its last tagged release is `RELEASE.2025-10-15T17-29-55Z`, and the community edition is distributed as source only. The Docker Hub repositories `minio/minio` and `minio/mc` no longer serve anonymous pulls (every tag, including `latest`, is denied), so the repository `Dockerfile` (which starts `FROM minio/minio:latest`) cannot be built either. A server built from source works but gets no fixes, so for a new production deployment weigh that (and the AGPLv3 license) against MinIO's commercial AIStor edition or another S3-compatible server. The S3 usage in Steps 3 to 6 is the same on all of them.

## Instructions

### Step 1: Deployment

Build the server from source (Go 1.24 or newer) and run the binary; to run it in a container, wrap the binary in your own small image. Credentials come from the environment (8 characters minimum for the password).

```bash
# Build a static binary (it also runs in Alpine) into ./bin
CGO_ENABLED=0 GOBIN="$PWD/bin" go install github.com/minio/minio@latest

# Single node, ports bound to localhost only
export MINIO_ROOT_USER=minio-admin MINIO_ROOT_PASSWORD   # export the password from your secret store first
mkdir -p /srv/minio-data
./bin/minio server /srv/minio-data --address 127.0.0.1:9000 --console-address 127.0.0.1:9001

# Console UI: http://127.0.0.1:9001   API endpoint: http://127.0.0.1:9000
# Readiness: curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9000/minio/health/ready   (200)
```

The same binary in a container:

```dockerfile
# Dockerfile (next to the static ./minio binary)
FROM alpine:3
COPY minio /usr/bin/minio
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/minio"]
```

```bash
docker build -t myminio:local .
docker run -d --name minio -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
  -v minio_data:/data -e MINIO_ROOT_USER=minio-admin -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  myminio:local server /data --console-address ":9001"
```

### Step 2: MinIO Client (mc)

```bash
# Install mc (MinIO Client CLI) from source (Go 1.24+); the mc repository is archived too
go install github.com/minio/mc@latest
mc --version

# Configure alias; the secret comes from the environment, not the command line
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc ready local                     # prints: The cluster 'local' is ready

# Bucket operations
mc mb local/uploads                # create bucket
mc mb local/backups
mc ls local                        # list buckets
mc ls local/uploads                # list objects

# Upload/download
mc cp file.txt local/uploads/      # upload file
mc cp local/uploads/file.txt .     # download file
mc cp -r ./data/ local/uploads/    # upload directory recursively

# Sync (like rsync for S3)
mc mirror ./local-dir local/uploads/     # sync local → MinIO (source must be a folder)
mc mirror local/uploads/ ./local-dir     # sync MinIO → local

# Remove
mc rm local/uploads/file.txt
mc rm -r --force local/uploads/old/      # remove recursively
```

### Step 3: S3 SDK Integration (Node.js)

```javascript
// lib/storage.js — S3-compatible client for MinIO
// Uses the standard AWS SDK — works with both MinIO and AWS S3
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',              // required by SDK, MinIO ignores it
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,              // required for MinIO (not virtual-hosted buckets)
})

const BUCKET = 'uploads'

export async function uploadFile(key, body, contentType) {
  /**
   * Upload a file to MinIO.
   * Args:
   *   key: Object key (path in bucket), e.g. "avatars/user123.jpg"
   *   body: File buffer or readable stream
   *   contentType: MIME type, e.g. "image/jpeg"
   */
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return `${process.env.MINIO_ENDPOINT}/${BUCKET}/${key}`
}

export async function getPresignedUrl(key, expiresIn = 3600) {
  /**
   * Generate a presigned URL for temporary download access.
   * Args:
   *   key: Object key in bucket
   *   expiresIn: URL validity in seconds (default: 1 hour)
   */
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3, command, { expiresIn })
}

export async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
```

### Step 4: Presigned Upload URLs (Direct Upload from Browser)

```javascript
// api/upload-url.js — Generate presigned PUT URL for client-side uploads
// Clients upload directly to MinIO, bypassing your app server
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './lib/storage.js' // the client exported in Step 3

export async function generateUploadUrl(filename, contentType) {
  const key = `uploads/${Date.now()}-${filename}`

  const command = new PutObjectCommand({
    Bucket: 'uploads',
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(s3, command, { expiresIn: 300 })    // 5 minutes
  return { url, key }
}

// Client-side usage:
// const { url, key } = await fetch('/api/upload-url?filename=photo.jpg').then(r => r.json())
// await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
```

### Step 5: Bucket Policies and Public Access

```bash
# Make a bucket publicly readable (for static assets)
mc anonymous set download local/public-assets

# Set read-only policy for specific prefix
mc anonymous set download local/uploads/public/

# Remove public access
mc anonymous set none local/uploads

# Bucket versioning (keep old versions of objects)
mc version enable local/documents
```

Scoped credentials for one application or server (verified: the key reads and writes only its own bucket and gets `AccessDenied` on others):

```bash
cat > backup-web-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetBucketLocation"], "Resource": ["arn:aws:s3:::backup-web"] },
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": ["arn:aws:s3:::backup-web/*"] }
  ]
}
EOF
mc admin policy create local backup-web-rw backup-web-policy.json
mc admin user add local backupweb "$BACKUP_WEB_SECRET"
mc admin policy attach local backup-web-rw --user backupweb
```

### Step 6: Lifecycle Rules

```bash
# Auto-delete objects after 30 days
mc ilm rule add local/temp-uploads --expiry-days 30

# List lifecycle rules
mc ilm rule ls local/temp-uploads
```

## Examples

### Example 1: Set up self-hosted file storage for a web app
**User prompt:** "I need file upload/download for my app. I don't want to use AWS. Set up MinIO on my server with presigned URLs for secure uploads."

The agent will:
1. Build and run MinIO (localhost-bound ports, persistent data directory or volume).
2. Create an uploads bucket with appropriate access policies.
3. Write a storage module using the AWS S3 SDK with MinIO endpoint.
4. Implement presigned URL generation for browser-direct uploads.
5. Add a cleanup lifecycle rule for abandoned temporary uploads.

### Example 2: Set up a backup destination for restic
**User prompt:** "I want to back up 3 servers to a central MinIO instance. Each server should have its own bucket."

The agent will:
1. Deploy MinIO on the backup server with TLS (via Caddy/nginx reverse proxy).
2. Create per-server buckets: `backup-web`, `backup-db`, `backup-api`.
3. Create per-server access keys with bucket-scoped policies.
4. Configure restic on each server to use the MinIO S3 endpoint.
5. Set retention lifecycle rules on old backup data.

## Guidelines

- Always set `forcePathStyle: true` in the S3 SDK when connecting to MinIO — MinIO uses path-style URLs (`http://host/bucket/key`), not virtual-hosted style (`http://bucket.host/key`).
- Never run with the default `minioadmin/minioadmin` credentials outside a throwaway test; they are well known and scanners try them. Create scoped users and keys for applications instead of sharing the root account.
- Put MinIO behind a reverse proxy (Caddy, nginx, Traefik) with TLS for production. Never expose the S3 API over plain HTTP on the internet.
- MinIO on a single node with a single drive has no redundancy (the server logs a warning at start): if the disk fails, data is lost. Use erasure coding across at least 4 drives, or keep external backups.
- Presigned URLs are the recommended pattern for file uploads — clients upload directly to MinIO, avoiding the overhead of proxying large files through your application server.
- Any S3-compatible tool works with MinIO: restic, rclone, s3cmd, AWS CLI, Terraform, and every AWS SDK. Set the endpoint URL and it just works.
