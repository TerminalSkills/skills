---
title: Build a Media Pipeline for a SaaS App
slug: build-media-pipeline-for-saas
description: >-
  Build a complete media pipeline — user uploads, image optimization,
  responsive delivery, and CDN caching — for a SaaS application using
  UploadThing, Cloudinary, and imgix.
skills:
  - uploadthing-advanced
  - cloudinary
  - imgix
  - sharp-image
  - s3-storage
category: content
tags:
  - images
  - uploads
  - optimization
  - cdn
  - media
---

# Build a Media Pipeline for a SaaS App

Nadia's project management tool lets users upload avatars, attach files to tasks, and embed screenshots in comments. Currently, images are stored as-is in S3 — a 12MB iPhone photo serves to everyone, killing mobile load times. There's no resizing, no format conversion, no CDN. She builds a proper media pipeline.

## Step 1: Upload with Validation

UploadThing handles the upload flow — presigned URLs, multipart for large files, type checking, and auth middleware.

```typescript
// app/api/uploadthing/core.ts — Upload routes with validation
import { createUploadthing } from 'uploadthing/next'

const f = createUploadthing()

export const uploadRouter = {
  avatar: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const user = await auth(req)
      if (!user) throw new Error('Unauthorized')
      return { userId: user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Process through Cloudinary for optimized variants
      const optimized = await cloudinary.uploader.upload(file.url, {
        folder: `avatars/${metadata.userId}`,
        transformation: [
          { width: 256, height: 256, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      })
      await db.users.update(metadata.userId, { avatarUrl: optimized.secure_url })
      return { url: optimized.secure_url }
    }),

  taskAttachment: f({
    image: { maxFileSize: '10MB', maxFileCount: 5 },
    pdf: { maxFileSize: '20MB', maxFileCount: 3 },
  })
    .middleware(async ({ req }) => {
      const user = await auth(req)
      const taskId = req.headers.get('x-task-id')
      // Verify user has access to this task
      const hasAccess = await db.tasks.checkAccess(taskId, user.id)
      if (!hasAccess) throw new Error('No access to this task')
      return { userId: user.id, taskId }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.attachments.create({
        taskId: metadata.taskId,
        uploadedBy: metadata.userId,
        name: file.name,
        url: file.url,
        size: file.size,
        type: file.type,
      })
    }),
}
```

## Step 2: Responsive Image Delivery

For task attachments and screenshots, images serve through imgix for on-the-fly resizing. No pre-processing needed.

```typescript
// lib/media.ts — Image URL helpers
import ImgixClient from '@imgix/js-core'

const imgix = new ImgixClient({
  domain: 'myapp.imgix.net',
  secureURLToken: process.env.IMGIX_TOKEN,
})

export function getAttachmentUrl(key: string, opts: { width?: number; height?: number } = {}) {
  return imgix.buildURL(key, {
    auto: 'format,compress',
    ...opts.width && { w: opts.width },
    ...opts.height && { h: opts.height },
    fit: 'max',                       // fit within dimensions, no crop
  })
}

export function getAttachmentSrcSet(key: string) {
  return imgix.buildSrcSet(key, {
    auto: 'format,compress',
    fit: 'max',
  })
}

// In component
function AttachmentImage({ attachment }) {
  return (
    <img
      src={getAttachmentUrl(attachment.key, { width: 800 })}
      srcSet={getAttachmentSrcSet(attachment.key)}
      sizes="(max-width: 768px) 100vw, 800px"
      alt={attachment.name}
      loading="lazy"
    />
  )
}
```

## Step 3: Thumbnail Generation

```typescript
// For task list view, generate small thumbnails
function TaskAttachmentThumbnail({ attachment }) {
  if (!attachment.type.startsWith('image/')) {
    return <FileIcon type={attachment.type} />
  }

  return (
    <img
      src={getAttachmentUrl(attachment.key, { width: 200, height: 200 })}
      alt={attachment.name}
      className="w-12 h-12 object-cover rounded"
      loading="lazy"
    />
  )
}

// PDF thumbnails via imgix
function PdfThumbnail({ attachment }) {
  const thumbnailUrl = imgix.buildURL(attachment.key, {
    page: 1,           // first page
    fm: 'jpg',
    w: 200,
    h: 280,
  })
  return <img src={thumbnailUrl} alt={`${attachment.name} preview`} />
}
```

## Results

Average image payload drops from 3.2MB to 180KB (94% reduction) — imgix serves WebP/AVIF at the exact dimensions needed. Mobile page load time for task detail goes from 4.2s to 1.1s. The CDN cache hit rate reaches 92% after the first week — subsequent requests for the same image at the same size serve from edge in under 50ms. Avatar uploads process in 2 seconds (upload + Cloudinary face-detect crop + CDN propagation). Zero invalid file uploads — UploadThing's middleware rejects oversized files and wrong types before upload starts. Monthly image delivery cost: $45/month for 500K image requests (vs. $180/month serving raw images from S3 with high bandwidth).
