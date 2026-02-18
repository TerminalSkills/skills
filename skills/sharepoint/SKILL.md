---
name: sharepoint
description: >-
  Build integrations with SharePoint Online for document management, site
  automation, and intranet development. Use when someone asks to "integrate with
  SharePoint", "upload files to SharePoint", "manage SharePoint lists", "create
  SharePoint site", "automate SharePoint", "search SharePoint documents",
  "SharePoint API", or "SharePoint permissions". Covers Graph API for sites,
  lists, document libraries, file operations, search, permissions, and
  SharePoint Framework (SPFx) development.
license: Apache-2.0
compatibility: >-
  Microsoft Graph API v1.0, SharePoint REST API, SPFx 1.18+. Requires Microsoft
  365 tenant.
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - sharepoint
    - microsoft-365
    - document-management
    - graph-api
    - intranet
---

# SharePoint

## Overview

This skill helps AI agents integrate with SharePoint Online for document management, list operations, site automation, and custom development. It covers Microsoft Graph API for sites/lists/files, SharePoint REST API for advanced operations, search, permissions management, and SharePoint Framework (SPFx) for custom web parts.

## Instructions

### Step 1: Authentication

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// Permissions: Sites.ReadWrite.All, Files.ReadWrite.All, Lists.ReadWrite.All
const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID, process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET
);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});
const graphClient = Client.initWithMiddleware({ authProvider });
```

### Step 2: Sites & Document Libraries

```typescript
// Get site by URL
const site = await graphClient.api('/sites/contoso.sharepoint.com:/sites/engineering').get();

// Get document libraries (drives)
const drives = await graphClient.api(`/sites/${site.id}/drives`).get();
const driveId = drives.value[0].id;

// List folder contents
const items = await graphClient.api(`/drives/${driveId}/root/children`)
  .select('id,name,size,lastModifiedDateTime,webUrl').get();

// Create folder
await graphClient.api(`/drives/${driveId}/root/children`).post({
  name: 'New Project', folder: {}, '@microsoft.graph.conflictBehavior': 'rename',
});
```

### Step 3: File Operations

```typescript
// Upload small file (< 4MB)
await graphClient.api(`/drives/${driveId}/root:/Reports/monthly-report.pdf:/content`).putStream(fileContent);

// Upload large file (> 4MB) — resumable upload session
const session = await graphClient
  .api(`/drives/${driveId}/root:/LargeFiles/dataset.csv:/createUploadSession`)
  .post({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: 'dataset.csv' } });
// Upload in 10MB chunks with Content-Range headers to session.uploadUrl

// Download, copy, move, delete
await graphClient.api(`/drives/${driveId}/items/${itemId}/content`).getStream();
await graphClient.api(`/drives/${driveId}/items/${itemId}/copy`).post({ parentReference: { driveId, path: '/root:/Archive' }, name: 'backup.pdf' });
await graphClient.api(`/drives/${driveId}/items/${itemId}`).patch({ parentReference: { id: targetFolderId } });
await graphClient.api(`/drives/${driveId}/items/${itemId}`).delete();

// Create sharing link
await graphClient.api(`/drives/${driveId}/items/${itemId}/createLink`).post({
  type: 'view', scope: 'organization',
});
```

### Step 4: SharePoint Lists

```typescript
// Create a list
await graphClient.api(`/sites/${siteId}/lists`).post({
  displayName: 'Project Tracker',
  columns: [
    { name: 'ProjectName', text: {} },
    { name: 'Status', choice: { choices: ['Not Started', 'In Progress', 'Complete'] } },
    { name: 'DueDate', dateTime: {} },
    { name: 'Budget', currency: {} },
  ],
  list: { template: 'genericList' },
});

// Get items with filter
const items = await graphClient.api(`/sites/${siteId}/lists/${listId}/items`)
  .expand('fields($select=ProjectName,Status,DueDate)')
  .filter("fields/Status eq 'In Progress'")
  .orderby('fields/DueDate').get();

// Create / Update / Delete items
await graphClient.api(`/sites/${siteId}/lists/${listId}/items`).post({
  fields: { ProjectName: 'Website Redesign', Status: 'In Progress', DueDate: '2026-04-01', Budget: 25000 },
});
await graphClient.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({ Status: 'Complete' });
await graphClient.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).delete();

// Bulk create (batch request)
const batchBody = {
  requests: items.map((item, i) => ({
    id: `${i}`, method: 'POST', url: `/sites/${siteId}/lists/${listId}/items`,
    body: { fields: item }, headers: { 'Content-Type': 'application/json' },
  })),
};
await graphClient.api('/$batch').post(batchBody);
```

### Step 5: Search

```typescript
// Search across all SharePoint content
const results = await graphClient.api('/search/query').post({
  requests: [{
    entityTypes: ['driveItem', 'listItem', 'site'],
    query: { queryString: 'quarterly report 2026' },
    from: 0, size: 25,
  }],
});

// Search with filters (file type, author, site)
await graphClient.api('/search/query').post({
  requests: [{ entityTypes: ['driveItem'], query: { queryString: 'filetype:pdf AND author:"John Smith"' } }],
});
```

### Step 6: Webhooks

```typescript
// Subscribe to document library changes
const subscription = await graphClient.api('/subscriptions').post({
  changeType: 'created,updated,deleted',
  notificationUrl: 'https://your-app.com/api/sharepoint-webhook',
  resource: `/drives/${driveId}/root`,
  expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  clientState: 'your-secret-token',
});

// Renew before expiry (max 3 days for SharePoint)
await graphClient.api(`/subscriptions/${subscription.id}`).patch({
  expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
});
```

## Examples

### Example 1: Automate monthly report uploads to a SharePoint document library
**User prompt:** "Write a script that uploads a generated PDF report to our SharePoint Engineering site's Reports folder each month, creating the folder if it doesn't exist."

The agent will:
1. Authenticate with Microsoft Graph using the Azure AD app credentials
2. Resolve the site ID via `/sites/contoso.sharepoint.com:/sites/engineering`
3. Get the default drive ID from `/sites/{siteId}/drives`
4. Check if the monthly folder exists under Reports; if not, create it with `POST /drives/{driveId}/root/children`
5. Upload the PDF using the small-file API (`PUT /drives/{driveId}/root:/Reports/2026-02/monthly-report.pdf:/content`) or a resumable upload session if the file exceeds 4MB

### Example 2: Build a project tracker with SharePoint lists
**User prompt:** "Create a SharePoint list called 'Project Tracker' with columns for project name, status, due date, and budget. Then add three sample projects and filter for in-progress items."

The agent will:
1. Create the list via `POST /sites/{siteId}/lists` with text, choice, dateTime, and currency columns
2. Add three items using `POST /sites/{siteId}/lists/{listId}/items` with realistic data (e.g., "Website Redesign" at $25,000 In Progress)
3. Query filtered results with `.filter("fields/Status eq 'In Progress'")` and `.orderby('fields/DueDate')`
4. Return the filtered items showing only in-progress projects sorted by due date

## Guidelines

- Use Graph API over SharePoint REST API when possible — cleaner, better documented, same auth as Teams
- Batch requests for bulk operations (`/$batch`) — max 20 requests per batch
- Large file uploads (> 4MB) must use upload sessions — direct PUT has size limits
- SharePoint webhooks expire after 3 days max — set up a renewal job
- Use `$select` and `$expand` to reduce payload size — don't fetch everything
- Delta queries (`/drives/{id}/root/delta`) for syncing — tracks changes since last check
- Document libraries are just "drives" in Graph API — same endpoints as OneDrive
- Column names in list APIs are internal names (no spaces) — use `fields` object for values
- Rate limits: 10,000 API calls per minute per tenant — use batching for high-volume operations
- Search API indexes content inside documents (Word, PDF, etc.) — not just filenames
