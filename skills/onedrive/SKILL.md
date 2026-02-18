---
name: onedrive
description: >-
  Manage files and folders in OneDrive and OneDrive for Business via Microsoft
  Graph API. Use when someone asks to "upload to OneDrive", "sync files with
  OneDrive", "share OneDrive files", "manage OneDrive folders", "OneDrive API
  integration", "backup to OneDrive", or "automate file management in OneDrive".
  Covers file CRUD, sharing, sync, search, large file upload, thumbnails, and
  delta queries for change tracking.
license: Apache-2.0
compatibility: >-
  Microsoft Graph API v1.0. OneDrive Personal or OneDrive for Business
  (Microsoft 365).
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - onedrive
    - microsoft-365
    - file-storage
    - cloud-storage
    - graph-api
---

# OneDrive

## Overview

This skill helps AI agents manage files in OneDrive (personal and business) via Microsoft Graph API. It covers file upload/download, folder management, sharing links, permission control, search, thumbnails, large file uploads with resumable sessions, delta queries for efficient sync, and webhook notifications.

## Instructions

### Authentication

```typescript
// Permissions needed:
//   Files.ReadWrite — user's OneDrive
//   Files.ReadWrite.All — all drives (admin, SharePoint included)

// Same Azure AD auth as other Microsoft 365 skills
// graphClient setup identical to Teams/SharePoint/Outlook
```

### File & Folder Operations

```typescript
// Get user's drive info
const drive = await graphClient.api(`/users/${userId}/drive`)
  .select('id,driveType,quota')
  .get();
console.log(`Used: ${(drive.quota.used / 1e9).toFixed(1)} GB / ${(drive.quota.total / 1e9).toFixed(0)} GB`);

// List root folder
const root = await graphClient.api(`/users/${userId}/drive/root/children`)
  .select('id,name,size,lastModifiedDateTime,folder,file,webUrl')
  .orderby('name')
  .get();

// List specific folder (by path)
const items = await graphClient
  .api(`/users/${userId}/drive/root:/Projects/Q1-2026:/children`)
  .select('id,name,size,lastModifiedDateTime,folder,file')
  .get();

// Create folder
await graphClient.api(`/users/${userId}/drive/root/children`)
  .post({
    name: 'New Project',
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename', // 'fail', 'replace', or 'rename'
  });

// Create nested folders (by path)
await graphClient.api(`/users/${userId}/drive/root:/Projects/Q1-2026/Reports:/children`)
  .post({
    name: 'March',
    folder: {},
  });
```

### Upload Files

```typescript
// Simple upload (< 4MB)
const fileBuffer = fs.readFileSync('/path/to/file.pdf');
const uploaded = await graphClient
  .api(`/users/${userId}/drive/root:/Documents/report.pdf:/content`)
  .put(fileBuffer);

console.log('Uploaded:', uploaded.webUrl);

// Large file upload (> 4MB) — resumable session
const uploadSession = await graphClient
  .api(`/users/${userId}/drive/root:/LargeFiles/database-backup.zip:/createUploadSession`)
  .post({
    item: {
      '@microsoft.graph.conflictBehavior': 'replace',
      name: 'database-backup.zip',
    },
  });

const filePath = '/path/to/database-backup.zip';
const fileSize = fs.statSync(filePath).size;
const chunkSize = 10 * 1024 * 1024; // 10MB chunks (must be multiple of 320KB)
const file = fs.openSync(filePath, 'r');

let offset = 0;
while (offset < fileSize) {
  const length = Math.min(chunkSize, fileSize - offset);
  const buffer = Buffer.alloc(length);
  fs.readSync(file, buffer, 0, length, offset);

  const res = await fetch(uploadSession.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': `${length}`,
      'Content-Range': `bytes ${offset}-${offset + length - 1}/${fileSize}`,
    },
    body: buffer,
  });

  offset += length;
  console.log(`Progress: ${Math.round(offset / fileSize * 100)}%`);
}
fs.closeSync(file);
```

### Download Files

```typescript
// Download by item ID
const stream = await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/content`)
  .getStream();
const writer = fs.createWriteStream('/path/to/output.pdf');
stream.pipe(writer);

// Download by path
const content = await graphClient
  .api(`/users/${userId}/drive/root:/Documents/report.pdf:/content`)
  .get();
```

### Move, Copy, Rename, Delete

```typescript
// Rename or move via PATCH
await graphClient.api(`/users/${userId}/drive/items/${itemId}`)
  .patch({ name: 'new-filename.pdf', parentReference: { id: targetFolderId } });

// Copy (async — returns Location header with monitor URL)
await graphClient.api(`/users/${userId}/drive/items/${itemId}/copy`)
  .post({ parentReference: { driveId, id: targetFolderId }, name: 'report-copy.pdf' });

// Delete (sends to recycle bin)
await graphClient.api(`/users/${userId}/drive/items/${itemId}`).delete();
```

### Sharing & Permissions

```typescript
// Create sharing link
const link = await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/createLink`)
  .post({
    type: 'view',    // 'view', 'edit', 'embed'
    scope: 'organization', // 'anonymous', 'organization', 'users'
    expirationDateTime: '2026-04-01T00:00:00Z', // Optional expiry
    password: 'securePassword123', // Optional password protection
  });
console.log('Share link:', link.link.webUrl);

// Share with specific people
const invite = await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/invite`)
  .post({
    requireSignIn: true,
    sendInvitation: true,
    roles: ['read'], // 'read', 'write'
    recipients: [
      { email: 'sarah@company.com' },
      { email: 'external@partner.com' },
    ],
    message: 'Please review the attached report.',
  });

// List permissions on a file
const permissions = await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/permissions`)
  .get();

// Remove permission
await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/permissions/${permId}`)
  .delete();
```

### Search

```typescript
// Search across OneDrive
const results = await graphClient
  .api(`/users/${userId}/drive/root/search(q='quarterly report')`)
  .select('id,name,webUrl,lastModifiedDateTime,size')
  .top(25)
  .get();
```

For advanced full-text search inside files, use the Microsoft Search API with `entityTypes: ['driveItem']` and KQL query syntax.

### Thumbnails & Preview

```typescript
// Get thumbnails (small, medium, large for images, PDFs, Office docs)
const thumbs = await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/thumbnails`)
  .get();

// Embeddable viewer URL
const preview = await graphClient
  .api(`/users/${userId}/drive/items/${itemId}/preview`)
  .post({});
```

### Delta Queries (Efficient Sync)

```typescript
// Initial sync — get all items
let deltaLink;
let allItems = [];

let response = await graphClient.api(`/users/${userId}/drive/root/delta`)
  .select('id,name,deleted,file,folder,parentReference,lastModifiedDateTime')
  .get();

allItems.push(...response.value);

// Follow @odata.nextLink for pagination
while (response['@odata.nextLink']) {
  response = await graphClient.api(response['@odata.nextLink']).get();
  allItems.push(...response.value);
}

// Save deltaLink for next sync
deltaLink = response['@odata.deltaLink'];
console.log(`Initial sync: ${allItems.length} items`);

// --- Later: incremental sync ---
const changes = await graphClient.api(deltaLink).get();

for (const item of changes.value) {
  if (item.deleted) {
    console.log('Deleted:', item.id);
  } else if (item.file) {
    console.log('File changed:', item.name);
  } else if (item.folder) {
    console.log('Folder changed:', item.name);
  }
}

// Save new deltaLink
deltaLink = changes['@odata.deltaLink'];
```

### Webhooks and Conversions

Subscribe to file changes via `/subscriptions` (webhook notifies something changed, then use delta query to get specifics). Convert files server-side by appending `?format=pdf` to the content endpoint — works for Word, Excel, and PowerPoint.

## Examples

### Example 1: Upload project files and share with external partner
**User prompt:** "Upload the proposal.pdf and budget.xlsx files to the 'Acme Partnership' folder in OneDrive, create the folder if it doesn't exist, and generate a view-only sharing link that expires in 30 days for our partner at sarah@acmecorp.com."

The agent will first create the folder using `POST /users/{userId}/drive/root/children` with `name: 'Acme Partnership'` and `conflictBehavior: 'rename'`. It will then upload both files using simple PUT to `/users/{userId}/drive/root:/Acme Partnership/proposal.pdf:/content` and the same for budget.xlsx. Finally, it will create a sharing link with `type: 'view'`, `scope: 'users'`, and an expiration date 30 days from now, then send an invite to sarah@acmecorp.com with read-only permissions and a message explaining the shared documents.

### Example 2: Sync local directory with OneDrive using delta queries
**User prompt:** "Set up an efficient sync script that tracks changes in the /Projects/Q1-2026 folder on OneDrive and downloads only files that have been added or modified since the last sync."

The agent will implement an initial delta sync using `GET /users/{userId}/drive/root:/Projects/Q1-2026:/delta` with select fields for id, name, deleted, file, and lastModifiedDateTime. It will paginate through all results using `@odata.nextLink`, store the `@odata.deltaLink` to a local config file, and download each file's content. On subsequent runs, it will call the stored deltaLink to get only changes since last sync, downloading new or modified files and removing locally deleted ones.

## Guidelines

- Use delta queries for sync — don't re-list entire folders, track changes incrementally
- Large files (>4MB) must use upload sessions — simple PUT has size limits
- `@microsoft.graph.conflictBehavior` — always specify ('fail', 'replace', or 'rename')
- Sharing links with expiry dates and passwords for external sharing — never permanent anonymous links
- Batch requests for multiple operations — max 20 per batch
- Thumbnails are available for images, PDFs, Office docs — use for file previews in UI
- `?format=pdf` for server-side conversion — no need for external tools
- Webhook + delta query pattern: webhook notifies "something changed", delta query shows exactly what
- Rate limits: 10,000 requests per 10 min per app per tenant
- OneDrive for Business uses same API as SharePoint document libraries — they're the same service
- Personal OneDrive uses `/me/drive`, Business uses `/users/{id}/drive` or `/drives/{driveId}`
