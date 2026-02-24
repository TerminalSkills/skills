---
name: cloudinary
description: >-
  Manage images and videos with Cloudinary. Use when a user asks to optimize
  images, add image transformations, implement responsive images, upload media,
  or serve optimized assets from a CDN.
license: Apache-2.0
compatibility: 'Any language, React, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags: [cloudinary, images, video, cdn, optimization]
---

# Cloudinary

## Overview

Cloudinary is a media management platform — upload, transform, optimize, and deliver images/videos via CDN. On-the-fly transformations (resize, crop, format conversion, AI-based cropping) via URL parameters.

## Instructions

### Step 1: Upload

```typescript
// lib/cloudinary.ts — Upload and transform
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Upload image
const result = await cloudinary.uploader.upload(filePath, {
  folder: 'products',
  transformation: [
    { width: 1200, height: 1200, crop: 'limit' },     // max dimensions
    { quality: 'auto', fetch_format: 'auto' },          // auto-optimize
  ],
})
// result.secure_url → https://res.cloudinary.com/myapp/image/upload/v1234/products/abc.jpg
```

### Step 2: URL Transformations

```typescript
// Generate optimized URLs without re-uploading
function getImageUrl(publicId: string, options: { width: number; height: number }) {
  return cloudinary.url(publicId, {
    width: options.width,
    height: options.height,
    crop: 'fill',
    gravity: 'auto',             // AI-based smart crop
    quality: 'auto',             // auto quality
    fetch_format: 'auto',        // WebP/AVIF based on browser
    dpr: 'auto',                 // device pixel ratio
  })
}

// Responsive srcset
function getSrcSet(publicId: string) {
  return [320, 640, 960, 1280, 1920]
    .map(w => `${getImageUrl(publicId, { width: w, height: Math.round(w * 0.75) })} ${w}w`)
    .join(', ')
}
```

### Step 3: Next.js Integration

```tsx
// next.config.js
module.exports = {
  images: {
    loader: 'cloudinary',
    path: 'https://res.cloudinary.com/myapp/image/upload/',
  },
}

// Or use next-cloudinary
import { CldImage } from 'next-cloudinary'

<CldImage
  src="products/sneakers"
  width={800}
  height={600}
  crop="fill"
  gravity="auto"
  alt="Product image"
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

## Guidelines

- Always use `quality: 'auto'` and `fetch_format: 'auto'` — Cloudinary picks the best format/quality.
- `gravity: 'auto'` uses AI to detect the subject and crop intelligently.
- Use signed uploads for user-generated content — prevents abuse.
- Set upload presets for consistent transformations across your app.
- Free tier: 25 credits/month (~25K transformations or 25GB storage).
