---
name: cloudinary
description: >-
  Manage images and videos with Cloudinary. Use when a user asks to optimize
  images, add image transformations, implement responsive images, upload media,
  or serve optimized assets from a CDN.
license: Apache-2.0
compatibility: 'cloudinary Node SDK 2.x (checked against 2.11.0), next-cloudinary 6.x; any language via the REST API'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/cloudinary/cloudinary_npm
  category: content
  tags: "cloudinary, images, video, cdn, optimization"
---

# Cloudinary

## Overview

Cloudinary is a media management platform — upload, transform, optimize, and deliver images/videos via CDN. On-the-fly transformations (resize, crop, format conversion, AI-based cropping) via URL parameters.

Install the Node SDK with `npm install cloudinary` (and `npm install next-cloudinary` for Next.js). Credentials come from the Cloudinary console as `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` (or the single `CLOUDINARY_URL`); keep the secret on the server only.

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
// result.secure_url → https://res.cloudinary.com/demo-shop/image/upload/v1760000000/products/sneakers.jpg
// result.public_id  → products/sneakers
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
    dpr: 'auto',                 // device pixel ratio (needs client hints; omit for a fixed srcset)
  })
}
// -> https://res.cloudinary.com/demo-shop/image/upload/c_fill,dpr_auto,f_auto,g_auto,h_600,q_auto,w_800/v1/products/sneakers

// Responsive srcset
function getSrcSet(publicId: string) {
  return [320, 640, 960, 1280, 1920]
    .map(w => `${getImageUrl(publicId, { width: w, height: Math.round(w * 0.75) })} ${w}w`)
    .join(', ')
}
```

### Step 3: Next.js Integration

Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (the cloud name is public) and use `next-cloudinary`:

```tsx
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

### Step 4: Signed uploads from the browser

```typescript
// app/api/sign-upload/route.ts — server side; the secret never reaches the client
const timestamp = Math.round(Date.now() / 1000)
const paramsToSign = { timestamp, folder: 'avatars' }
const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!)
// return { timestamp, signature, apiKey, cloudName }; the client POSTs the file with these
// plus folder to https://api.cloudinary.com/v1_1/demo-shop/image/upload
```

## Examples

### Example 1: "Make product photos 800x600, smart-cropped, in the best format"

Call `getImageUrl('products/sneakers', { width: 800, height: 600 })`. The returned URL contains `c_fill`, `g_auto`, `f_auto`, `q_auto`, `w_800` and `h_600` (the SDK sorts them alphabetically, as in Step 2); browsers that support AVIF or WebP receive it, others get JPEG.

### Example 2: "Let users upload avatars without exposing my API secret"

Create the signing route from Step 4, call it before each upload, and upload straight from the browser. Cloudinary rejects the request if `timestamp`/`folder` differ from what was signed.

## Guidelines

- Always use `quality: 'auto'` and `fetch_format: 'auto'` — Cloudinary picks the best format/quality.
- `gravity: 'auto'` uses AI to detect the subject and crop intelligently.
- Use signed uploads for user-generated content — prevents abuse.
- Set upload presets for consistent transformations across your app.
- Plans are credit-based (one credit covers about 1,000 transformations, or 1 GB of storage or bandwidth); check the pricing page for the current free allowance.
- A transformation passed to `upload` is applied to the stored original (it is lost); use URL transformations when you want to keep the source.
