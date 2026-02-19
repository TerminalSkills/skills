---
name: uploadthing
description: >-
  Handle file uploads in TypeScript apps with UploadThing. Use when a user
  asks to implement file uploads, handle image uploads in Next.js, add drag
  and drop file upload, or integrate S3-backed file storage without managing
  infrastructure.
license: Apache-2.0
compatibility: 'Next.js, SolidStart, Express, Fastify'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - uploadthing
    - file-upload
    - s3
    - nextjs
    - images
---

# UploadThing

## Overview

UploadThing is a file upload service for TypeScript apps. Define upload routes on the server (with auth, file type, and size validation), get pre-built React components for the frontend. Files go to S3-compatible storage. No infrastructure to manage — just define what's allowed and upload.

## Instructions

### Step 1: Setup

```bash
npm install uploadthing @uploadthing/react
```

### Step 2: Server Routes

```typescript
// server/uploadthing.ts — Define upload routes
import { createUploadthing, type FileRouter } from 'uploadthing/server'
import { getSession } from '@/lib/auth'

const f = createUploadthing()

export const uploadRouter = {
  // Avatar upload: max 2MB image, authenticated users only
  avatarUploader: f({ image: { maxFileSize: '2MB', maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const session = await getSession(req)
      if (!session) throw new Error('Not authenticated')
      return { userId: session.user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log(`Avatar uploaded for user ${metadata.userId}: ${file.url}`)
      await db.user.update({
        where: { id: metadata.userId },
        data: { avatarUrl: file.url },
      })
      return { url: file.url }
    }),

  // Document upload: max 10MB, multiple files
  documentUploader: f({
    pdf: { maxFileSize: '10MB', maxFileCount: 5 },
    'application/msword': { maxFileSize: '10MB', maxFileCount: 5 },
  })
    .middleware(async ({ req }) => {
      const session = await getSession(req)
      if (!session) throw new Error('Not authenticated')
      return { userId: session.user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.document.create({
        data: {
          name: file.name,
          url: file.url,
          size: file.size,
          userId: metadata.userId,
        },
      })
    }),
} satisfies FileRouter

export type OurFileRouter = typeof uploadRouter
```

### Step 3: React Components

```tsx
// components/AvatarUpload.tsx — Pre-built upload button
import { UploadButton, UploadDropzone } from '@uploadthing/react'
import type { OurFileRouter } from '@/server/uploadthing'

// Simple button
export function AvatarUpload() {
  return (
    <UploadButton<OurFileRouter, 'avatarUploader'>
      endpoint="avatarUploader"
      onClientUploadComplete={(res) => {
        console.log('Uploaded:', res[0].url)
      }}
      onUploadError={(error) => {
        console.error('Upload failed:', error.message)
      }}
    />
  )
}

// Drag and drop zone
export function DocumentUpload() {
  return (
    <UploadDropzone<OurFileRouter, 'documentUploader'>
      endpoint="documentUploader"
      onClientUploadComplete={(res) => {
        console.log(`${res.length} files uploaded`)
      }}
    />
  )
}
```

## Guidelines

- Free tier: 2GB storage, 2GB transfer/month — enough for MVPs.
- UploadThing handles presigned URLs, multipart upload, and CDN delivery.
- Middleware runs on every upload — use for auth, rate limiting, and validation.
- For self-hosted alternative, use S3 + presigned URLs directly (more work, no vendor lock-in).
