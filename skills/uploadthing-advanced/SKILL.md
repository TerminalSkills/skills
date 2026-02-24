---
name: uploadthing-advanced
description: >-
  Handle file uploads in Next.js with UploadThing. Use when adding file
  uploads, implementing image upload with preview, building drag-and-drop
  upload UI, or handling large file uploads with progress.
license: Apache-2.0
compatibility: 'Next.js, React, SolidJS, Svelte'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags: [uploadthing, file-upload, nextjs, s3, drag-drop]
---

# UploadThing (Advanced)

## Overview

UploadThing simplifies file uploads for TypeScript apps. Define upload routes with type-safe middleware (auth, file validation), get pre-built React components (dropzone, button), and files go to S3-compatible storage. No manual S3 configuration.

## Instructions

### Step 1: Upload Router

```typescript
// app/api/uploadthing/core.ts — Server-side upload configuration
import { createUploadthing, type FileRouter } from 'uploadthing/next'

const f = createUploadthing()

export const uploadRouter = {
  // Profile avatar: max 4MB, images only
  avatar: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const user = await auth(req)
      if (!user) throw new Error('Unauthorized')
      return { userId: user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.users.update(metadata.userId, { avatarUrl: file.url })
      return { url: file.url }
    }),

  // Document uploads: PDFs and images, up to 16MB
  documents: f({
    pdf: { maxFileSize: '16MB', maxFileCount: 10 },
    image: { maxFileSize: '8MB', maxFileCount: 10 },
  })
    .middleware(async ({ req }) => {
      const user = await auth(req)
      if (!user) throw new Error('Unauthorized')
      return { userId: user.id, projectId: req.headers.get('x-project-id') }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.documents.create({
        userId: metadata.userId,
        projectId: metadata.projectId,
        name: file.name,
        url: file.url,
        size: file.size,
      })
    }),
} satisfies FileRouter
```

### Step 2: React Components

```tsx
'use client'
import { UploadButton, UploadDropzone } from '@uploadthing/react'
import type { uploadRouter } from '@/app/api/uploadthing/core'

// Simple button
<UploadButton<typeof uploadRouter, 'avatar'>
  endpoint="avatar"
  onClientUploadComplete={(res) => {
    setAvatarUrl(res[0].url)
    toast.success('Avatar updated!')
  }}
  onUploadError={(err) => toast.error(err.message)}
/>

// Drag-and-drop zone with preview
<UploadDropzone<typeof uploadRouter, 'documents'>
  endpoint="documents"
  onClientUploadComplete={(res) => {
    setDocuments(prev => [...prev, ...res.map(f => ({ name: f.name, url: f.url }))])
  }}
  config={{ mode: 'auto' }}    // start upload immediately after drop
/>
```

### Step 3: Custom Upload Hook

```tsx
import { useUploadThing } from '@uploadthing/react'

function CustomUploader() {
  const { startUpload, isUploading, permittedFileInfo } = useUploadThing('documents', {
    onUploadProgress: (progress) => setProgress(progress),
    onClientUploadComplete: (res) => handleComplete(res),
  })

  return (
    <div
      onDrop={(e) => {
        e.preventDefault()
        startUpload(Array.from(e.dataTransfer.files))
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      {isUploading ? <ProgressBar value={progress} /> : <p>Drop files here</p>}
    </div>
  )
}
```

## Guidelines

- Middleware runs server-side — use it for auth and validation before upload starts.
- `onUploadComplete` runs after S3 upload — use it for DB writes and post-processing.
- UploadThing handles presigned URLs, multipart uploads, and retry logic.
- Free tier: 2GB storage, 2GB bandwidth/month. Pro: $10/month for 100GB.
- For custom S3: use `utapi` to manage files programmatically (delete, list, rename).
