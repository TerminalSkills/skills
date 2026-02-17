---
name: file-upload-processor
description: >-
  When the user needs to build file upload functionality for a web application.
  Use when the user mentions "file upload," "image upload," "upload endpoint,"
  "multipart upload," "presigned URL," "S3 upload," "file validation," "upload
  to cloud storage," or "accept user files." Handles upload endpoints, file
  validation (type, size, magic bytes), cloud storage integration, and upload
  status tracking. For image/video processing after upload, see media-transcoder.
license: Apache-2.0
compatibility: "Node.js 18+, Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["file-upload", "cloud-storage", "s3", "validation"]
---

# File Upload Processor

## Overview

Builds secure file upload endpoints for web applications. Handles multipart form uploads, presigned URL generation for large files, file type validation via magic bytes (not just extensions), size limits, cloud storage integration (S3, GCS, R2), and upload status tracking. Produces production-ready code with streaming (no temp files on disk for small files).

## Instructions

### 1. Choose Upload Strategy

Based on file size:

- **Small files (< 10MB)**: Stream through server to storage. Simple, one request.
- **Medium files (10-100MB)**: Server-side streaming with progress tracking.
- **Large files (> 100MB)**: Presigned multipart upload — client uploads directly to S3.

### 2. File Validation

Always validate by magic bytes, never trust file extensions:

```typescript
const MAGIC_BYTES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // + "WEBP" at offset 8
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'video/mp4': null, // Check for "ftyp" at offset 4
  'video/webm': [0x1A, 0x45, 0xDF, 0xA3],
};

function detectFileType(buffer: Buffer): string | null {
  // Read first 12 bytes
  // Match against known signatures
  // Return MIME type or null if unknown
}
```

Additional validation:
- Check file size BEFORE reading the full body (Content-Length header)
- Set hard limits on multer/busboy to abort oversized uploads
- Scan for double extensions: `image.jpg.exe`
- Reject files with null bytes in filename

### 3. Storage Integration

```typescript
// S3-compatible storage client
class StorageService {
  async upload(key: string, stream: Readable, contentType: string): Promise<string>
  async getPresignedUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>
  async getPresignedDownloadUrl(key: string, expiresIn: number): Promise<string>
  async initiateMultipartUpload(key: string): Promise<{ uploadId: string, parts: PresignedPart[] }>
  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>
  async delete(key: string): Promise<void>
}
```

Key naming convention: `{type}/{userId}/{fileId}/{filename}`

### 4. Upload Status Tracking

Database model:

```
files:
  id: UUID
  user_id: UUID
  original_name: string
  storage_key: string
  mime_type: string
  size_bytes: bigint
  status: enum(uploading, uploaded, processing, processed, failed)
  variants: jsonb (null until processed)
  error: text (null unless failed)
  created_at: timestamp
  updated_at: timestamp
```

### 5. API Endpoints

```
POST   /api/files/upload          — Multipart form upload (< 100MB)
POST   /api/files/presign         — Get presigned URL for large file upload
POST   /api/files/multipart/init  — Start multipart upload (> 100MB)
POST   /api/files/multipart/complete — Complete multipart upload
GET    /api/files/:id/status      — Get upload/processing status
GET    /api/files/:id/download    — Get presigned download URL
DELETE /api/files/:id             — Soft delete file
```

## Examples

### Example 1: Express Upload Endpoint

**Prompt**: "Create a file upload endpoint for my Express app. Accept images and PDFs, store in S3."

**Output**: Upload route with multer streaming, magic-byte validation, S3 upload, database record creation, and error handling. Returns file ID for status polling.

### Example 2: Presigned Upload for Large Videos

**Prompt**: "Users upload videos up to 2GB. I don't want them going through my server."

**Output**: Presigned URL generation endpoint, client-side upload code with progress tracking, multipart upload for files > 100MB, and a webhook endpoint to confirm upload completion and trigger processing.

## Guidelines

- **Stream, don't buffer** — never load entire files into memory
- **Validate magic bytes** — file extensions lie, magic bytes don't
- **Set upload limits at every layer** — nginx, reverse proxy, and application
- **Generate unique storage keys** — include user ID and file ID, never use original filename as key
- **Return immediately** — upload ack should be instant, processing happens async
- **Clean up on failure** — if DB write fails, delete the S3 object; if S3 fails, don't create DB record
- **Rate limit uploads** — per user, per time window (e.g., 20 uploads per hour)
