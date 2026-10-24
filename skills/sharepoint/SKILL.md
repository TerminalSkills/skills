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
  Microsoft Graph API v1.0, @microsoft/microsoft-graph-client 3.x, SharePoint
  REST API, SPFx 1.23 (Node.js 22). Requires Microsoft 365 tenant.
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/microsoftgraph/msgraph-sdk-javascript
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

Not covered here: the SharePoint Azure ACS app-only model (client ID and secret registered through `appregnew.aspx`) is retired; app-only access to the SharePoint REST API now requires a Microsoft Entra app with a certificate, while Microsoft Graph accepts a client secret.

## Instructions

### Step 1: Authentication

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// App-only permissions (admin consent): Sites.ReadWrite.All covers sites, lists and libraries.
// Prefer Sites.Selected plus a per-site grant (see Guidelines) so the app reaches only the sites it needs.
const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID!, process.env.AZURE_CLIENT_ID!, process.env.AZURE_CLIENT_SECRET!
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
// Upload small file (simple PUT, up to 250 MB)
await graphClient.api(`/drives/${driveId}/root:/Reports/monthly-report.pdf:/content`).putStream(fileContent);

// Upload large file — resumable upload session (recommended above 10 MiB)
const session = await graphClient
  .api(`/drives/${driveId}/root:/LargeFiles/dataset.csv:/createUploadSession`)
  .post({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: 'dataset.csv' } });
// PUT chunks to session.uploadUrl with Content-Range headers (no Authorization header on that URL).
// Each chunk must be a multiple of 320 KiB (327,680 bytes) and under 60 MiB; 5-10 MiB is recommended.

// Download, copy, move, delete
await graphClient.api(`/drives/${driveId}/items/${itemId}/content`).getStream();
await graphClient.api(`/drives/${driveId}/items/${itemId}/copy`).post({ parentReference: { driveId, id: archiveFolderId }, name: 'backup.pdf' }); // async: 202 Accepted
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
  fields: { ProjectName: 'Website Redesign', Status: 'In Progress', DueDate: '2026-12-01', Budget: 25000 },
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
    region: 'EUR', // required with app-only tokens (e.g. NAM, EUR); look up your tenant's region
  }],
});

// Search with filters (file type, author, site)
await graphClient.api('/search/query').post({
  requests: [{ entityTypes: ['driveItem'], region: 'EUR', query: { queryString: 'filetype:pdf AND author:"Maria Ortega"' } }],
});
```

### Step 6: Webhooks

```typescript
// Subscribe to document library changes (drive root supports only changeType "updated";
// your endpoint must answer Graph's validation request by echoing the validationToken)
const subscription = await graphClient.api('/subscriptions').post({
  changeType: 'updated',
  notificationUrl: 'https://your-app.com/api/sharepoint-webhook',
  resource: `/drives/${driveId}/root`,
  expirationDateTime: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
  clientState: 'your-secret-token',
});

// Renew before expiry (driveItem and list subscriptions live at most 42,300 minutes, under 30 days)
await graphClient.api(`/subscriptions/${subscription.id}`).patch({
  expirationDateTime: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
});
// A notification only says "something changed"; call /drives/{id}/root/delta to get the changes.
```

## Examples

### Example 1: Automate monthly report uploads to a SharePoint document library
**User prompt:** "Write a script that uploads a generated PDF report to our SharePoint Engineering site's Reports folder each month, creating the folder if it doesn't exist."

The agent will:
1. Authenticate with Microsoft Graph using the Azure AD app credentials
2. Resolve the site ID via `/sites/contoso.sharepoint.com:/sites/engineering`
3. Get the default drive ID from `/sites/{siteId}/drives`
4. Check if the monthly folder exists under Reports; if not, create it with `POST /drives/{driveId}/root/children`
5. Upload the PDF using the small-file API (`PUT /drives/{driveId}/root:/Reports/2026-10/monthly-report.pdf:/content`) or a resumable upload session for large files

### Example 2: Build a project tracker with SharePoint lists
**User prompt:** "Create a SharePoint list called 'Project Tracker' with columns for project name, status, due date, and budget. Then add three sample projects and filter for in-progress items."

The agent will:
1. Create the list via `POST /sites/{siteId}/lists` with text, choice, dateTime, and currency columns
2. Add three items using `POST /sites/{siteId}/lists/{listId}/items` with realistic data (e.g., "Website Redesign" at $25,000 In Progress)
3. Query filtered results with `.filter("fields/Status eq 'In Progress'")` and `.orderby('fields/DueDate')`
4. Return the filtered items showing only in-progress projects sorted by due date

## Guidelines

- Use Graph API over SharePoint REST API when possible: cleaner, better documented, same auth as Teams
- Least privilege: grant the app `Sites.Selected`, then give it one site with `POST /sites/{siteId}/permissions` and body `{ "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "3f0c1c2e-6a7b-4d58-9a1e-5b2f8c7d4e10", "displayName": "Report uploader" } }] }` (calling this needs `Sites.FullControl.All`)
- Batch requests for bulk operations (`/$batch`): max 20 requests per batch
- Simple PUT upload works up to 250 MB; use upload sessions for anything larger or unreliable
- Webhooks on drives and lists expire after at most 42,300 minutes; set up a renewal job
- Use `$select` and `$expand` to reduce payload size
- Delta queries (`/drives/{id}/root/delta`) for syncing: tracks changes since last check
- Document libraries are just "drives" in Graph API, same endpoints as OneDrive
- List column names are internal names (no spaces); values go in the `fields` object
- Throttling returns `429` with a `Retry-After` header; honor it and batch or reduce calls (SharePoint limits are per app and tenant, based on resource units, not a fixed call count)
- The Search API indexes content inside documents (Word, PDF, etc.), not just filenames; it takes one request per call
- SPFx (custom web parts): current release 1.23.2 needs Node.js 22; scaffold with `npm install -g yo @microsoft/generator-sharepoint` then `yo @microsoft/sharepoint`
