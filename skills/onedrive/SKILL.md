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
  version: 1.1.0
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
//   Files.ReadWrite     — delegated: the signed-in user's own OneDrive (use /me/drive)
//   Files.ReadWrite.All — delegated or application: any drive the app may reach
// Application permissions work only for work/school accounts, not personal OneDrive.
// npm install @microsoft/microsoft-graph-client @azure/identity

import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID, process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET);
const graphClient = Client.initWithMiddleware({
  authProvider: new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  }),
});
const userId = 'sarah.chen@contoso.com'; // app-only calls address a user; delegated calls use /me/drive
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

// Create a subfolder by path
await graphClient.api(`/users/${userId}/drive/root:/Projects/Q1-2026/Reports:/children`)
  .post({
    name: 'March',
    folder: {},
  });
```

### Upload Files

```typescript
// Simple upload (up to 250 MB)
const fileBuffer = fs.readFileSync('./proposal.pdf');
const uploaded = await graphClient
  .api(`/users/${userId}/drive/root:/Documents/proposal.pdf:/content`)
  .put(fileBuffer);

console.log('Uploaded:', uploaded.webUrl);

// Large file upload (over 250 MB, or any file you want resumable) — upload session
const uploadSession = await graphClient
  .api(`/users/${userId}/drive/root:/LargeFiles/database-backup.zip:/createUploadSession`)
  .post({
    item: {
      '@microsoft.graph.conflictBehavior': 'replace',
      name: 'database-backup.zip',
    },
  });

const filePath = './database-backup.zip';
const fileSize = fs.statSync(filePath).size;
const chunkSize = 10 * 1024 * 1024; // 10 MiB chunks: a multiple of 320 KiB, under 60 MiB
const file = fs.openSync(filePath, 'r');

let offset = 0;
while (offset < fileSize) {
  const length = Math.min(chunkSize, fileSize - offset);
  const buffer = Buffer.alloc(length);
  fs.readSync(file, buffer, 0, length, offset);

  const res = await fetch(uploadSession.uploadUrl, {
    method: 'PUT',
    headers: {
      // no Authorization header: the uploadUrl is pre-authenticated and a token can cause 401
      'Content-Length': `${length}`,
      'Content-Range': `bytes ${offset}-${offset + length - 1}/${fileSize}`,
    },
    body: buffer,
  });

  if (!res.ok) throw new Error(`Chunk upload failed: ${res.status} ${await res.text()}`);
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
const writer = fs.createWriteStream('./output.pdf');
stream.pipe(writer);

// Download by path
const content = await graphClient
  .api(`/users/${userId}/drive/root:/Documents/proposal.pdf:/content`)
  .getStream();
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
    type: 'view',    // 'view', 'edit', 'embed' (embed: OneDrive Personal only)
    scope: 'organization', // 'anonymous' (admins may disable it), 'organization' (Business/SharePoint only), 'users'
    expirationDateTime: '2026-12-31T00:00:00Z', // Optional expiry
    // password: supported on OneDrive Personal only
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
      { email: 'priya.nair@contoso.com' },
      { email: 'mark.ellis@northwind.example' },
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
const thumbs = await graphClient.api(`/users/${userId}/drive/items/${itemId}/thumbnails`).get();
// Embeddable viewer URL (OneDrive for Business / SharePoint only)
const preview = await graphClient.api(`/users/${userId}/drive/items/${itemId}/preview`).post({});
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

deltaLink = changes['@odata.deltaLink'];
```

### Webhooks and Conversions

Subscribe to file changes via `/subscriptions` (webhook notifies something changed, then use delta query to get specifics). Subscriptions on OneDrive for Business can target only the drive root; personal OneDrive allows any folder. Convert files server-side by requesting `.../content?format=pdf` (source files up to 2 MB; `format=pdf` for Office, text and Loop types, `format=jpg` also needs `width` and `height`; the call answers 302 to a short-lived download URL).

## Examples

### Example 1: Upload project files and share with external partner
**User prompt:** "Upload the proposal.pdf and budget.xlsx files to the 'Contoso Partnership' folder in OneDrive, create the folder if it doesn't exist, and generate a view-only sharing link that expires in 30 days for our partner at sarah.chen@northwind.example."

The agent will first create the folder using `POST /users/{userId}/drive/root/children` with `name: 'Contoso Partnership'` and `conflictBehavior: 'fail'` (a 409 means the folder already exists, so carry on). It will then upload both files using simple PUT to `/users/{userId}/drive/root:/Contoso Partnership/proposal.pdf:/content` and the same for budget.xlsx. Finally, it will create a sharing link with `type: 'view'`, `scope: 'users'`, and an expiration date 30 days from now, then send an invite to sarah.chen@northwind.example with read-only permissions and a message explaining the shared documents.

### Example 2: Sync local directory with OneDrive using delta queries
**User prompt:** "Set up an efficient sync script that downloads only the OneDrive files that were added or modified since the last sync."

The agent will implement an initial delta sync using `GET /users/{userId}/drive/root/delta` with select fields for id, name, deleted, file, and lastModifiedDateTime. It will paginate through all results using `@odata.nextLink`, store the `@odata.deltaLink` to a local state file, and download each file's content. On subsequent runs, it will call the stored deltaLink to get only changes since last sync, downloading new or modified files and removing locally deleted ones. Delta is documented only on the drive root, so limiting it to one folder (such as /Projects/Q1-2026) means keeping a map of item IDs under that folder and ignoring other changes.

## Guidelines

- Use delta queries for sync — don't re-list entire folders, track changes incrementally
- Simple PUT is limited to 250 MB; larger files must use an upload session
- `@microsoft.graph.conflictBehavior` — always specify ('fail', 'replace', or 'rename')
- Sharing links with expiry dates for external sharing (passwords work only on OneDrive Personal) — never permanent anonymous links
- Batch requests for multiple operations — max 20 per batch
- Thumbnails are available for images, PDFs, Office docs — use for file previews in UI
- Webhook + delta query pattern: webhook notifies "something changed", delta query shows exactly what
- URL-encode folder and file names with spaces or `#`/`%` when building `root:/path:` URLs
- Throttling returns 429 with a `Retry-After` header: wait that long and retry (the SDK middleware retries by default)
- OneDrive for Business uses same API as SharePoint document libraries — they're the same service
- Personal OneDrive uses `/me/drive`, Business uses `/users/{id}/drive` or `/drives/{driveId}`
