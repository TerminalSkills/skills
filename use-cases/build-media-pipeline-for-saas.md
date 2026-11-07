---
title: Build a Media Pipeline for a SaaS App
slug: build-media-pipeline-for-saas
description: >-
  Build a complete media pipeline — user uploads, image optimization,
  responsive delivery, and CDN caching — for a SaaS application using
  UploadThing, Cloudinary, imgix, sharp, and S3.
skills:
  - uploadthing
  - cloudinary
  - imgix
  - sharp
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

Nadia's project management tool lets users upload avatars, attach files to tasks, and embed screenshots in comments. Currently, images are stored as-is in S3 — a 12MB iPhone photo serves to everyone, killing mobile load times. There's no resizing, no format conversion, no CDN. She builds a proper media pipeline with one tool per job:

| Media | Upload path | Delivery |
|---|---|---|
| Avatars | UploadThing, then copied to Cloudinary | Cloudinary URL with `f_auto,q_auto` |
| Task attachments (images, PDFs) | Presigned POST straight to her S3 bucket | imgix, with the bucket as its Source |
| Comment screenshots | Through the server, cleaned by sharp, then S3 | imgix |

## Step 1: Avatar Upload with UploadThing and Cloudinary

UploadThing handles the browser side — direct upload, type and size checks, and auth middleware. Cloudinary then keeps a face-centred 256x256 copy and serves it in the best format per browser. The UploadThing token goes in `UPLOADTHING_TOKEN` (v7 replaced the old secret/app-id pair), and Cloudinary reads `CLOUDINARY_URL` from the environment.

```typescript
// app/api/uploadthing/core.ts
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError, UTApi } from "uploadthing/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const f = createUploadthing();
const utapi = new UTApi();

export const uploadRouter = {
  avatar: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const user = await auth(req);
      if (!user) throw new UploadThingError("Unauthorized");
      return { userId: user.id };                     // becomes `metadata` below
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Cloudinary fetches the file and stores a 256x256 face-centred crop
      const stored = await cloudinary.uploader.upload(file.ufsUrl, {
        folder: `avatars/${metadata.userId}`,
        transformation: [{ width: 256, height: 256, crop: "fill", gravity: "face" }],
      });
      await db.users.update(metadata.userId, { avatarPublicId: stored.public_id });
      await utapi.deleteFiles(file.key);              // the Cloudinary copy is the one we serve
      return { publicId: stored.public_id };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;

// Delivery URL: format and quality are chosen per browser at request time
export function avatarUrl(publicId: string, size = 128) {
  return cloudinary.url(publicId, {
    width: size, height: size, crop: "fill", gravity: "face",
    quality: "auto", fetch_format: "auto", secure: true,
  });
}
```

```typescript
// app/api/uploadthing/route.ts
import { createRouteHandler } from "uploadthing/next";
import { uploadRouter } from "./core";

export const { GET, POST } = createRouteHandler({ router: uploadRouter });
```

In v7 the file URL is `file.ufsUrl`; `file.url` is deprecated. In the UI, `generateUploadButton<UploadRouter>()` from `@uploadthing/react` gives a typed `<UploadButton endpoint="avatar" />`. The incoming transformation only crops: `f_auto` and `q_auto` belong in the delivery URL, which is what `avatarUrl()` builds.

## Step 2: Task Attachments Straight to S3

Attachments can be 20MB PDFs, so they go from the browser to S3 without passing through the API. A presigned POST (unlike a presigned PUT) lets S3 itself enforce a size range and the content type.

```typescript
// app/api/attachments/sign/route.ts
import { randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await auth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId, contentType } = await req.json();
  if (typeof taskId !== "string" || !(contentType in EXT)) {
    return Response.json({ error: "Unsupported type" }, { status: 415 });
  }
  if (!(await db.tasks.checkAccess(taskId, user.id))) {
    return Response.json({ error: "No access to this task" }, { status: 403 });
  }

  const key = `attachments/${taskId}/${randomUUID()}.${EXT[contentType]}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Expires: 300,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["content-length-range", 1, MAX_BYTES],        // S3 rejects anything outside this range
      ["eq", "$Content-Type", contentType],
    ],
  });
  return Response.json({ url, fields, key });
}
```

The browser sends a `multipart/form-data` POST to `url` with every entry of `fields` first and the `file` field last. When S3 answers 204, the client calls a second endpoint with the `key`; that endpoint does a `HeadObjectCommand` to confirm the object exists, then writes the `attachments` row. Keep the bucket private and add a CORS rule that allows `POST` from the app's origin only. The `s3-storage` skill covers the bucket policy and CORS configuration.

## Step 3: Clean Pasted Screenshots with sharp

Screenshots pasted into comments are small, so they go through the server. sharp checks that the bytes really are an image, applies the EXIF rotation, caps the width, and re-encodes to WebP.

```typescript
// lib/screenshots.ts
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function storeScreenshot(input: Buffer, commentId: string) {
  const body = await sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 2400, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();                 // rejects for a file that is not an image

  const key = `screenshots/${commentId}.webp`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!, Key: key, Body: body, ContentType: "image/webp",
  }));
  return key;
}
```

sharp drops metadata unless you ask for it (`keepMetadata()`), so GPS tags in a phone photo do not reach other users. In a test, a 4000x3000 JPEG with EXIF came out as a 2400x1800 WebP with no EXIF, and `"not an image"` was rejected with "Input buffer contains unsupported image format".

## Step 4: Responsive Delivery with imgix

Create an imgix Source that points at the S3 bucket and enable Secure URLs. imgix resizes on the fly, so nothing is pre-generated.

```typescript
// lib/media.ts
import ImgixClient from "@imgix/js-core";

const imgix = new ImgixClient({
  domain: process.env.IMGIX_DOMAIN!,             // your Source's *.imgix.net domain
  secureURLToken: process.env.IMGIX_TOKEN!,      // server-side only
});

export function attachmentUrl(key: string, opts: { width?: number; height?: number } = {}) {
  return imgix.buildURL(key, {
    auto: "format,compress",
    fit: "max",                                  // fit inside the box, no crop
    ...(opts.width && { w: opts.width }),
    ...(opts.height && { h: opts.height }),
  });
}

export function attachmentSrcSet(key: string) {
  return imgix.buildSrcSet(key, { auto: "format,compress", fit: "max" });
}

export function thumbnailUrl(key: string) {
  return imgix.buildURL(key, { w: 200, h: 200, fit: "crop", auto: "format,compress" });
}

export function pdfPreviewUrl(key: string) {
  return imgix.buildURL(key, { page: 1, fm: "jpg", w: 200, h: 280, fit: "max" });
}
```

```tsx
// Render these from a server component or loader: the token must never reach the browser
<img
  src={attachmentUrl(attachment.key, { width: 800 })}
  srcSet={attachmentSrcSet(attachment.key)}
  sizes="(max-width: 768px) 100vw, 800px"
  alt={attachment.name}
  loading="lazy"
/>
```

For the task list, `thumbnailUrl(key)` gives a 200x200 crop and `pdfPreviewUrl(key)` renders page 1 of a PDF as a JPEG. Each URL carries a signature (`s=`), so changing a parameter on the client returns 403; always build URLs on the server.

## Results

Nadia compared the task detail page before and after on her own staging data: images that used to ship at 3 to 12MB now arrive at the size of the box they are shown in, as AVIF or WebP where the browser supports it, and the mobile load time of the task view dropped accordingly. Oversized or wrong-type uploads are refused before any bytes are stored, avatars come out as consistent 256x256 crops, and screenshots lose their location metadata. Check current pricing for Cloudinary and imgix against your own traffic before committing: both bill by credits and bandwidth, and every distinct parameter combination is a separate transformation.

## Related Skills

- **uploadthing** -- typed avatar upload with auth middleware and size limits.
- **cloudinary** -- face-aware avatar crop and `f_auto,q_auto` delivery.
- **imgix** -- signed on-the-fly resizing, srcset and PDF previews over the S3 bucket.
- **sharp** -- validate, rotate, resize and strip pasted screenshots on the server.
- **s3-storage** -- the bucket, presigned POST uploads and CORS for task attachments.
