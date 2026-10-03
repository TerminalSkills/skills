---
name: uploadthing
description: >-
  Adds type-safe file uploads to TypeScript apps with UploadThing, a hosted file upload and storage service. Use when a user
  asks to implement file uploads, handle image uploads in Next.js, add drag
  and drop file upload, or integrate S3-backed file storage without managing
  infrastructure.
license: Apache-2.0
compatibility: 'uploadthing 7.x, Node.js 18.13+; Next.js, Remix, SolidStart, Express, Fastify, H3'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - uploadthing
    - file-upload
    - s3
    - nextjs
    - images
  repository: https://github.com/pingdotgg/uploadthing
---

# UploadThing

## Overview

UploadThing is a file upload service for TypeScript apps. You define a typed file router on your server (allowed file types, size and count limits, auth in middleware), the client uploads directly to UploadThing's storage, and your server is notified when each upload finishes. React, Solid, Vue, Svelte and vanilla clients are available, plus pre-built `UploadButton` and `UploadDropzone` components for React. Checked against `uploadthing` 7.7.x and `@uploadthing/react` 7.3.x (October 2026).

## Instructions

### Step 1: Install and add the token

```bash
npm install uploadthing @uploadthing/react
```

Create an app in the UploadThing dashboard, copy its token into `.env.local` as `UPLOADTHING_TOKEN` (the SDK reads it automatically; v7 replaced the old `UPLOADTHING_SECRET` and `UPLOADTHING_APP_ID` pair). Never expose it to the browser.

### Step 2: File router (Next.js App Router)

```typescript
// app/api/uploadthing/core.ts
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/lib/auth";          // your own session helper
import { db } from "@/lib/db";

const f = createUploadthing();

export const ourFileRouter = {
  avatarUploader: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const session = await auth(req);
      if (!session) throw new UploadThingError("Not signed in");   // blocks the upload
      return { userId: session.user.id };                          // becomes `metadata` below
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.user.update({ where: { id: metadata.userId }, data: { avatarUrl: file.ufsUrl } });
      return { avatarUrl: file.ufsUrl };   // sent to the client's onClientUploadComplete as serverData
    }),

  documentUploader: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 5 },
    "application/msword": { maxFileSize: "16MB", maxFileCount: 5 },
  })
    .middleware(async ({ req }) => {
      const session = await auth(req);
      if (!session) throw new UploadThingError("Not signed in");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.document.create({
        data: { name: file.name, url: file.ufsUrl, size: file.size, userId: metadata.userId },
      });
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
```

Route config: type keys are `image`, `video`, `audio`, `pdf`, `text`, `blob` or any MIME type; `maxFileSize` takes strings like `"4MB"` (defaults: 4MB for images and PDFs, 16MB video, 8MB audio); `maxFileCount` defaults to 1; `minFileCount`, `contentDisposition` and `acl` (`public-read` or `private`, private needs a paid plan) are also available. Use `file.ufsUrl`; `file.url` is deprecated in v7.

### Step 3: Route handler

```typescript
// app/api/uploadthing/route.ts
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

export const { GET, POST } = createRouteHandler({ router: ourFileRouter });
```

Other frameworks use their own adapter (`uploadthing/express`, `/fastify`, `/h3`, `/remix`, and so on) with the same `createUploadthing` from that adapter's path.

### Step 4: Typed components, styles and SSR hint

```typescript
// utils/uploadthing.ts
import { generateUploadButton, generateUploadDropzone } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

export const UploadButton = generateUploadButton<OurFileRouter>();
export const UploadDropzone = generateUploadDropzone<OurFileRouter>();
```

Styles: with Tailwind v3 wrap the config in `withUt` from `uploadthing/tw`; with Tailwind v4 import `uploadthing/tw/v4` in your CSS; without Tailwind import `@uploadthing/react/styles.css`.

In the root layout, render `<NextSSRPlugin routerConfig={extractRouterConfig(ourFileRouter)} />` (from `@uploadthing/react/next-ssr-plugin` and `uploadthing/server`) before `{children}` so the components know the limits without an extra request.

```tsx
// components/avatar-upload.tsx
"use client";
import { UploadButton } from "@/utils/uploadthing";

export function AvatarUpload() {
  return (
    <UploadButton
      endpoint="avatarUploader"
      onClientUploadComplete={(res) => console.log("Uploaded:", res[0].ufsUrl)}
      onUploadError={(error) => console.error("Upload failed:", error.message)}
    />
  );
}
```

`UploadDropzone` takes the same props. For custom UI use `generateReactHelpers<OurFileRouter>()` and its `useUploadThing("avatarUploader")` hook, which returns `startUpload(files)`, `isUploading` and `routeConfig`.

### Step 5: Server-side file management

```typescript
import { UTApi } from "uploadthing/server";
const utapi = new UTApi();                       // reads UPLOADTHING_TOKEN
await utapi.deleteFiles(["2e0fdb64-9957-4262-8e45-f372ba903ac8_avatar.jpg"]);
const result = await utapi.uploadFiles(new File([pdfBytes], "invoice-2041.pdf"));
```

`UTApi` also lists, renames and signs URLs (`generateSignedURL` for private files). Files are served at `https://<APP_ID>.ufs.sh/f/<FILE_KEY>`; the older `utfs.io` host still works but is not recommended.

## Examples

### Example 1: Avatar upload with a size limit

**User request:** "Let signed-in users upload a profile picture, max 2 MB, and save the URL."

Add `avatarUploader` as in Step 2, the route handler, and `<UploadButton endpoint="avatarUploader" />`. A 5 MB photo is rejected in the browser before upload with an error from `onUploadError`; a valid one triggers `onUploadComplete` on your server, which stores `file.ufsUrl`.

### Example 2: Multi-file PDF dropzone

**User request:** "Users attach up to 5 contracts as PDFs, no other types."

Use `documentUploader` with `pdf: { maxFileSize: "16MB", maxFileCount: 5 }` and render `<UploadDropzone endpoint="documentUploader" onClientUploadComplete={(res) => setCount(res.length)} />`. Dropping a `.png` is refused by the type check; each accepted file creates one `document` row.

## Guidelines

- Always authenticate in `.middleware`; without it anyone who finds the endpoint can upload to your quota.
- `onUploadComplete` runs on your server, not in the browser; keep database writes there and return only small JSON-serializable data.
- Import `createUploadthing` from the adapter matching your framework (`uploadthing/next`, `uploadthing/express`, ...) so middleware gets the right types.
- Use `ufsUrl`, not `url`, and keep `UPLOADTHING_TOKEN` server-only.
- Plans change; at the time of writing the free plan had 2 GB of storage, and paid plans start at $10/month for 100 GB. Check uploadthing.com/pricing.
- Public files are readable by anyone with the link; use `acl: "private"` with signed URLs for sensitive documents.
- If you need full control or no vendor, presign S3 uploads yourself, at the cost of more code.
