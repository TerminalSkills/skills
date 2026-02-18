---
name: sharepoint
description: >-
  Build integrations with SharePoint Online for document management, site automation,
  and intranet development. Use when someone asks to "integrate with SharePoint",
  "upload files to SharePoint", "manage SharePoint lists", "create SharePoint site",
  "automate SharePoint", "search SharePoint documents", "SharePoint API", or
  "SharePoint permissions". Covers Graph API for sites, lists, document libraries,
  file operations, search, permissions, and SharePoint Framework (SPFx) development.
license: Apache-2.0
compatibility: "Microsoft Graph API v1.0, SharePoint REST API, SPFx 1.18+. Requires Microsoft 365 tenant."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["sharepoint", "microsoft-365", "document-management", "graph-api", "intranet", "api"]
---

# SharePoint

## Overview

This skill helps AI agents integrate with SharePoint Online for document management, list operations, site automation, and custom development. It covers Microsoft Graph API for sites/lists/files, SharePoint REST API for advanced operations, search, permissions management, and SharePoint Framework (SPFx) for custom web parts.

## Instructions

### Step 1: Authentication

SharePoint is accessed primarily through Microsoft Graph API (same auth as Teams):

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// App registration permissions needed:
//   Sites.ReadWrite.All — read/write all site collections
//   Files.ReadWrite.All — read/write files
//   Lists.ReadWrite.All — read/write lists

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });
```

### Step 2: Sites & Document Libraries

```typescript
// Get site by URL
const site = await graphClient.api('/sites/contoso.sharepoint.com:/sites/engineering')
  .get();
const siteId = site.id;

// List all sites
const sites = await graphClient.api('/sites')
  .filter("siteCollection/root ne null")
  .select('id,displayName,webUrl')
  .get();

// Get document libraries (drives) in a site
const drives = await graphClient.api(`/sites/${siteId}/drives`)
  .get();
const driveId = drives.value[0].id; // Default document library

// List root folder contents
const items = await graphClient.api(`/drives/${driveId}/root/children`)
  .select('id,name,size,lastModifiedDateTime,webUrl,folder,file')
  .get();

// List specific folder contents
const folderItems = await graphClient
  .api(`/drives/${driveId}/root:/Projects/Q1-2026:/children`)
  .get();

// Create folder
await graphClient.api(`/drives/${driveId}/root/children`)
  .post({
    name: 'New Project',
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename',
  });
```

### Step 3: File Operations

```typescript
// Upload small file (< 4MB)
import fs from 'fs';

const fileContent = fs.readFileSync('/path/to/document.pdf');
const uploadedFile = await graphClient
  .api(`/drives/${driveId}/root:/Reports/monthly-report.pdf:/content`)
  .putStream(fileContent);

// Upload large file (> 4MB) — resumable upload session
const uploadSession = await graphClient
  .api(`/drives/${driveId}/root:/LargeFiles/big-dataset.csv:/createUploadSession`)
  .post({
    item: {
      '@microsoft.graph.conflictBehavior': 'replace',
      name: 'big-dataset.csv',
    },
  });

// Upload in chunks
const fileSize = fs.statSync('/path/to/big-dataset.csv').size;
const chunkSize = 10 * 1024 * 1024; // 10MB chunks
const fileStream = fs.createReadStream('/path/to/big-dataset.csv', {
  highWaterMark: chunkSize,
});

let offset = 0;
for await (const chunk of fileStream) {
  const end = Math.min(offset + chunk.length, fileSize);
  await fetch(uploadSession.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': `${chunk.length}`,
      'Content-Range': `bytes ${offset}-${end - 1}/${fileSize}`,
    },
    body: chunk,
  });
  offset = end;
}

// Download file
const fileStream = await graphClient
  .api(`/drives/${driveId}/items/${itemId}/content`)
  .getStream();

// Download by path
const content = await graphClient
  .api(`/drives/${driveId}/root:/Reports/monthly-report.pdf:/content`)
  .get();

// Copy file
await graphClient.api(`/drives/${driveId}/items/${itemId}/copy`)
  .post({
    parentReference: { driveId, path: '/root:/Archive' },
    name: 'monthly-report-backup.pdf',
  });

// Move file
await graphClient.api(`/drives/${driveId}/items/${itemId}`)
  .patch({
    parentReference: { id: targetFolderId },
    name: 'renamed-file.pdf',
  });

// Delete file (to recycle bin)
await graphClient.api(`/drives/${driveId}/items/${itemId}`)
  .delete();

// Get file metadata + sharing links
const fileInfo = await graphClient.api(`/drives/${driveId}/items/${itemId}`)
  .select('id,name,size,webUrl,lastModifiedBy,lastModifiedDateTime')
  .expand('permissions')
  .get();

// Create sharing link
const sharingLink = await graphClient
  .api(`/drives/${driveId}/items/${itemId}/createLink`)
  .post({
    type: 'view', // 'view', 'edit', or 'embed'
    scope: 'organization', // 'organization', 'anonymous', or 'users'
  });
```

### Step 4: SharePoint Lists

```typescript
// Get lists in a site
const lists = await graphClient.api(`/sites/${siteId}/lists`)
  .select('id,displayName,description')
  .get();

// Create a list
const newList = await graphClient.api(`/sites/${siteId}/lists`)
  .post({
    displayName: 'Project Tracker',
    columns: [
      { name: 'ProjectName', text: {} },
      { name: 'Status', choice: { choices: ['Not Started', 'In Progress', 'Complete'] } },
      { name: 'DueDate', dateTime: {} },
      { name: 'Owner', personOrGroup: {} },
      { name: 'Budget', currency: {} },
      { name: 'Priority', number: {} },
    ],
    list: { template: 'genericList' },
  });

// Get list items
const items = await graphClient
  .api(`/sites/${siteId}/lists/${listId}/items`)
  .expand('fields')
  .top(100)
  .get();

// Get items with filter and sort
const filtered = await graphClient
  .api(`/sites/${siteId}/lists/${listId}/items`)
  .expand('fields($select=ProjectName,Status,DueDate,Owner)')
  .filter("fields/Status eq 'In Progress'")
  .orderby('fields/DueDate')
  .get();

// Create list item
await graphClient.api(`/sites/${siteId}/lists/${listId}/items`)
  .post({
    fields: {
      ProjectName: 'Website Redesign',
      Status: 'In Progress',
      DueDate: '2026-04-01',
      Priority: 1,
      Budget: 25000,
    },
  });

// Update list item
await graphClient.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
  .patch({
    Status: 'Complete',
  });

// Delete list item
await graphClient.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
  .delete();

// Bulk create items (batch request)
const batchBody = {
  requests: items.map((item, i) => ({
    id: `${i}`,
    method: 'POST',
    url: `/sites/${siteId}/lists/${listId}/items`,
    body: { fields: item },
    headers: { 'Content-Type': 'application/json' },
  })),
};
await graphClient.api('/$batch').post(batchBody);
```

### Step 5: Search

```typescript
// Search across all SharePoint content
const searchResults = await graphClient.api('/search/query')
  .post({
    requests: [{
      entityTypes: ['driveItem', 'listItem', 'site'],
      query: { queryString: 'quarterly report 2026' },
      from: 0,
      size: 25,
      fields: ['name', 'webUrl', 'lastModifiedDateTime', 'createdBy'],
    }],
  });

// Search with filters
const filteredSearch = await graphClient.api('/search/query')
  .post({
    requests: [{
      entityTypes: ['driveItem'],
      query: { queryString: 'filetype:pdf AND author:"John Smith" AND "budget"' },
      from: 0,
      size: 10,
    }],
  });

// Search within specific site
const siteSearch = await graphClient.api('/search/query')
  .post({
    requests: [{
      entityTypes: ['driveItem'],
      query: { queryString: 'site:contoso.sharepoint.com/sites/engineering report' },
      size: 25,
    }],
  });
```

### Step 6: Permissions

```typescript
// Get site permissions
const permissions = await graphClient.api(`/sites/${siteId}/permissions`)
  .get();

// Grant site permissions
await graphClient.api(`/sites/${siteId}/permissions`)
  .post({
    roles: ['write'],
    grantedToIdentities: [{
      application: {
        id: appId,
        displayName: 'My Integration App',
      },
    }],
  });

// Share file with specific people
await graphClient.api(`/drives/${driveId}/items/${itemId}/invite`)
  .post({
    requireSignIn: true,
    sendInvitation: true,
    roles: ['read'], // 'read', 'write', or 'owner'
    recipients: [
      { email: 'sarah@example.com' },
      { email: 'mike@example.com' },
    ],
    message: 'Please review this document.',
  });

// Remove sharing permission
await graphClient.api(`/drives/${driveId}/items/${itemId}/permissions/${permId}`)
  .delete();
```

### Step 7: Webhooks (Change Notifications)

```typescript
// Subscribe to changes in a document library
const subscription = await graphClient.api('/subscriptions')
  .post({
    changeType: 'created,updated,deleted',
    notificationUrl: 'https://your-app.com/api/sharepoint-webhook',
    resource: `/drives/${driveId}/root`,
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days max
    clientState: 'your-secret-validation-token',
  });

// Webhook handler
app.post('/api/sharepoint-webhook', (req, res) => {
  // Validation request (on subscription creation)
  if (req.query.validationToken) {
    return res.status(200).send(req.query.validationToken);
  }

  // Change notification
  const notifications = req.body.value;
  for (const notification of notifications) {
    console.log('Change detected:', notification.resource, notification.changeType);
    // Process the change (fetch updated item, trigger workflow, etc.)
  }

  res.status(202).send();
});

// Renew subscription before expiry (max 3 days for SharePoint)
await graphClient.api(`/subscriptions/${subscription.id}`)
  .patch({
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });
```

### SharePoint REST API (Advanced)

For operations not available in Graph API:

```typescript
// Direct SharePoint REST API call
const spToken = await getSharePointAccessToken(); // Same Azure AD app

// Get site properties
const siteProps = await fetch(
  'https://contoso.sharepoint.com/sites/engineering/_api/web',
  { headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json;odata=verbose' } }
);

// Get list items with CAML query (complex filtering)
const camlResult = await fetch(
  `https://contoso.sharepoint.com/sites/engineering/_api/web/lists/getbytitle('Tasks')/getitems`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
    },
    body: JSON.stringify({
      query: {
        ViewXml: `<View>
          <Query>
            <Where>
              <And>
                <Eq><FieldRef Name='Status'/><Value Type='Choice'>In Progress</Value></Eq>
                <Leq><FieldRef Name='DueDate'/><Value Type='DateTime'><Today/></Value></Leq>
              </And>
            </Where>
            <OrderBy><FieldRef Name='Priority' Ascending='TRUE'/></OrderBy>
          </Query>
          <RowLimit>50</RowLimit>
        </View>`,
      },
    }),
  }
);
```

## Best Practices

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
