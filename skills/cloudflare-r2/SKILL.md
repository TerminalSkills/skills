---
name: cloudflare-r2
description: >-
  Store objects with Cloudflare R2 — S3-compatible storage with zero egress fees.
  Use when a user asks to host files without egress costs, store uploads cheaply,
  replace AWS S3 to save on bandwidth, serve static assets, or set up
  S3-compatible storage with no transfer fees.
license: Apache-2.0
compatibility: 'Any S3 SDK, Wrangler CLI, REST API'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud
  tags:
    - cloudflare
    - r2
    - storage
    - s3
    - object-storage
---

# Cloudflare R2

## Overview

Cloudflare R2 is S3-compatible object storage with zero egress fees — you never pay for bandwidth when users download files. This makes it dramatically cheaper than AWS S3 for serving content. It works with any S3 SDK by changing the endpoint URL.

## Instructions

### Step 1: Setup

```bash
# Install Wrangler CLI
npm install -g wrangler
wrangler login

# Create bucket
wrangler r2 bucket create my-bucket

# Upload file
wrangler r2 object put my-bucket/file.txt --file ./file.txt
```

### Step 2: S3 SDK Integration

```typescript
// lib/r2.ts — Use R2 with standard AWS S3 SDK
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  await r2.send(new PutObjectCommand({
    Bucket: 'my-bucket', Key: key, Body: body, ContentType: contentType,
  }))
}

export async function getPresignedUrl(key: string) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: 'my-bucket', Key: key }), { expiresIn: 3600 })
}
```

### Step 3: Public Bucket with Custom Domain

```bash
# Enable public access via Cloudflare domain
wrangler r2 bucket update my-bucket --public

# Or use a Worker for custom logic (auth, transforms)
```

## Guidelines

- R2 is S3-compatible — any S3 tool (rclone, restic, aws-cli) works by changing the endpoint.
- Zero egress fees mean R2 costs ~80% less than S3 for read-heavy workloads.
- Use R2 + Cloudflare CDN for static assets — files are cached at 300+ edge locations.
- R2 has no minimum storage duration charge (unlike S3 Glacier).
