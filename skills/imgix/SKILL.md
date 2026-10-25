---
name: imgix
description: >-
  Optimize and transform images with imgix, a real-time image CDN driven by URL
  parameters. Use when serving responsive images, implementing an image CDN,
  signing image URLs, adding real-time transformations, extracting video
  thumbnails, or optimizing Core Web Vitals with image delivery.
license: Apache-2.0
compatibility: 'Any web app, React, Next.js'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: content
  tags: "imgix, images, cdn, optimization, responsive"
  repository: https://github.com/imgix/js-core
---

# imgix

## Overview

imgix is a real-time image processing CDN. Create a Source in the imgix dashboard that points at your image storage (S3, GCS, Azure, R2, a web folder and others), and it serves optimized, transformed images via URL parameters. No pre-processing needed — transformations happen on request and are cached globally. Client libraries: `@imgix/js-core` (URL and `srcset` builder, 3.x) and `react-imgix` (9.x, React 15 through 19).

Install: `npm install @imgix/js-core react-imgix`.

## Instructions

### Step 1: URL API

```typescript
// lib/imgix.ts — Image URL builder
import ImgixClient from '@imgix/js-core'

const client = new ImgixClient({
  domain: 'myapp.imgix.net',
  secureURLToken: process.env.IMGIX_TOKEN,    // server-side only: sign URLs to prevent tampering
})

// Responsive image with auto format/quality
const url = client.buildURL('photos/hero.jpg', {
  w: 1200,
  h: 630,
  fit: 'crop',
  auto: 'format,compress',    // AVIF where supported, else WebP/JPEG/PNG, plus compression
  crop: 'faces',               // crop around detected faces
})

// Generate srcset for responsive images
const srcset = client.buildSrcSet('photos/hero.jpg', {
  auto: 'format,compress',
  fit: 'crop',
  ar: '16:9',
})
```

### Step 2: React Component

```tsx
import Imgix from 'react-imgix'

function ProductImage({ path, alt }: { path: string; alt: string }) {
  return (
    <Imgix
      src={`https://myapp.imgix.net/${path}`}
      sizes="(max-width: 768px) 100vw, 50vw"
      imgixParams={{
        auto: 'format,compress',
        fit: 'crop',
        ar: '1:1',
      }}
      htmlAttributes={{ alt, loading: 'lazy' }}
    />
  )
}
```

### Step 3: Video Thumbnails

Video needs a Source with the imgix video feature enabled. `video-thumbnail=<seconds>` returns a still image; `fm` is optional and only picks the output image format (`jpg` here):

```typescript
const thumbnail = client.buildURL('videos/demo.mp4', {
  fm: 'jpg',
  'video-thumbnail': 3,   // frame at 3 seconds; 0 triggers auto-selection, not the first frame
  w: 640,
})
```

Use `video-thumbnail=0.04` for roughly the first frame at 24 fps.

## Examples

### Example 1: Open Graph image for a blog post

Request: "Make a 1200x630 social card from our hero photo, cropped around the person's face."

```typescript
const og = client.buildURL('blog/2026/launch-hero.jpg', {
  w: 1200, h: 630, fit: 'crop', crop: 'faces', auto: 'format,compress',
})
```

Result: a signed `https://myapp.imgix.net/blog/2026/launch-hero.jpg?ixlib=js-3.8.0&w=1200&h=630&fit=crop&crop=faces&auto=format%2Ccompress&s=...` URL. Put it in the `og:image` meta tag.

### Example 2: Responsive product grid with srcset

Request: "Product thumbnails are square and heavy; serve the right size per screen."

```typescript
const srcset = client.buildSrcSet('products/sku-1042.jpg', { ar: '1:1', fit: 'crop', auto: 'format,compress' },
  { minWidth: 300, maxWidth: 1200 })
```

Result: a `srcset` string with one signed URL per width from 300w to 1200w. Use it in `<img srcset={srcset} sizes="(max-width: 768px) 50vw, 25vw">`, or let `react-imgix` build it as in Step 2.

## Guidelines

- `auto=format,compress` negotiates AVIF/WebP/JPEG per browser and compresses — always include it.
- Enable Secure URLs on the Source and sign URLs in production: a changed path or parameter returns 403 Forbidden, so re-sign after any edit. Never ship `secureURLToken` to the browser; sign on the server. If the token leaks, create a new secured Source and cut over.
- imgix doesn't store images — it proxies from your origin (S3, GCS, HTTP).
- Use `buildSrcSet()` for responsive images — generates proper `srcset` with widths.
- Pricing is credit-based: management (storage, per GB), delivery (bandwidth, per GB) and transformation credits. Serving the same URLs repeatedly keeps transformation costs low, so avoid generating many unique parameter combinations.
