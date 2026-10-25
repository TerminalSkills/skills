---
name: outlook-email
description: >-
  Send, read, and manage emails via Microsoft Outlook using the Graph API. Use
  when someone asks to "send email via Outlook", "read Outlook inbox", "automate
  Outlook emails", "manage Outlook folders", "Outlook API integration", "email
  automation with Graph API", "search Outlook emails", or "process incoming
  emails". Covers sending (plain, HTML, attachments), reading, searching,
  folders, rules, and focused inbox via Microsoft Graph API.
license: Apache-2.0
compatibility: Microsoft Graph API v1.0. Requires Microsoft 365 tenant with Exchange Online.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "outlook, email, microsoft-graph, microsoft-365, automation"
  repository: https://github.com/microsoftgraph/msgraph-sdk-javascript
---

# Outlook Email

## Overview

This skill helps AI agents send, read, search, and automate emails through Microsoft Outlook via the Graph API. It covers sending messages (plain text, HTML, attachments, inline images), reading and searching mailboxes, folder management, mail rules, and email automation patterns.

## Instructions

### Authentication

```typescript
// Microsoft Entra app registration (formerly Azure AD). Application permissions
// (admin consent required) for a daemon using /users/{id}:
//   Mail.ReadWrite             - read/write mail (Mail.Read is enough for reading only)
//   Mail.Send                  - send mail as any user the app can reach
//   MailboxSettings.ReadWrite  - auto-replies and mailbox settings
// For a signed-in person use delegated permissions and /me instead of /users/{id}.
// Application mail permissions cover every mailbox in the tenant unless an Exchange
// admin restricts the app to specific mailboxes.
// npm install @microsoft/microsoft-graph-client @azure/identity

import { ClientSecretCredential } from '@azure/identity';
import fs from 'node:fs';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID!,
  process.env.AZURE_CLIENT_ID!,
  process.env.AZURE_CLIENT_SECRET!
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });
const userId = 'sarah.chen@northwind.com'; // user id or userPrincipalName
```

### Send Emails

```typescript
// sendMail answers 202 Accepted with no body: delivery happens afterwards.
// Simple text email
await graphClient.api(`/users/${userId}/sendMail`)
  .post({
    message: {
      subject: 'Sprint 14 Recap',
      body: {
        contentType: 'Text',
        content: 'Hi team,\n\nSprint 14 is complete. We shipped 3 features and fixed 12 bugs.\n\nBest,\nSarah',
      },
      toRecipients: [
        { emailAddress: { address: 'team@company.com' } },
      ],
    },
    saveToSentItems: true,
  });

// HTML email with CC, BCC, and importance
await graphClient.api(`/users/${userId}/sendMail`)
  .post({
    message: {
      subject: 'Q1 Revenue Report — Action Required',
      body: {
        contentType: 'HTML',
        content: `
          <h2>Q1 2026 Revenue Report</h2>
          <table border="1" cellpadding="8" style="border-collapse:collapse;">
            <tr style="background:#f0f0f0;"><th>Metric</th><th>Value</th><th>Change</th></tr>
            <tr><td>Revenue</td><td>$4.2M</td><td style="color:green;">+23%</td></tr>
            <tr><td>New Customers</td><td>847</td><td style="color:green;">+40%</td></tr>
            <tr><td>Churn</td><td>2.1%</td><td style="color:green;">-38%</td></tr>
          </table>
          <p>Please review and share feedback by Friday.</p>
        `,
      },
      toRecipients: [
        { emailAddress: { address: 'ceo@company.com', name: 'Alex' } },
      ],
      ccRecipients: [
        { emailAddress: { address: 'cfo@company.com', name: 'Morgan' } },
      ],
      bccRecipients: [
        { emailAddress: { address: 'archive@company.com' } },
      ],
      importance: 'high',
      isReadReceiptRequested: false,
    },
  });

// Email with file attachment (inline base64 only for files under 3 MB)
const fileBuffer = fs.readFileSync('./reports/monthly-report-feb-2026.pdf');
await graphClient.api(`/users/${userId}/sendMail`)
  .post({
    message: {
      subject: 'Monthly Report Attached',
      body: { contentType: 'Text', content: 'Please find the monthly report attached.' },
      toRecipients: [{ emailAddress: { address: 'manager@company.com' } }],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'monthly-report-feb-2026.pdf',
          contentType: 'application/pdf',
          contentBytes: fileBuffer.toString('base64'),
        },
      ],
    },
  });

// Reply, reply all, or forward
await graphClient.api(`/users/${userId}/messages/${messageId}/reply`)
  .post({ comment: 'Thanks for the update. I\'ll review by EOD.' });
await graphClient.api(`/users/${userId}/messages/${messageId}/forward`)
  .post({ comment: 'FYI', toRecipients: [{ emailAddress: { address: 'partner@external.com' } }] });
```

### Read Emails

```typescript
// Get inbox messages
const messages = await graphClient.api(`/users/${userId}/mailFolders/inbox/messages`)
  .select('id,subject,from,receivedDateTime,bodyPreview,isRead,importance,hasAttachments')
  .top(25)
  .orderby('receivedDateTime DESC')
  .get();

messages.value.forEach(msg => {
  const read = msg.isRead ? ' ' : '*';
  const att = msg.hasAttachments ? '+' : ' ';
  console.log(`${read}${att} ${msg.from.emailAddress.address}: ${msg.subject}`);
});

// Get unread messages only
const unread = await graphClient.api(`/users/${userId}/mailFolders/inbox/messages`)
  // $orderby properties must also be in $filter, and come first, or Graph returns InefficientFilter
  .filter('receivedDateTime ge 2026-10-01T00:00:00Z and isRead eq false')
  .select('id,subject,from,receivedDateTime,bodyPreview')
  .orderby('receivedDateTime DESC')
  .get();

// Get full message body
const fullMsg = await graphClient.api(`/users/${userId}/messages/${messageId}`)
  .select('subject,body,from,toRecipients,ccRecipients,receivedDateTime,attachments')
  .expand('attachments')
  .get();

console.log('Subject:', fullMsg.subject);
console.log('Body:', fullMsg.body.content); // HTML or Text

// Download attachment
const attachment = await graphClient
  .api(`/users/${userId}/messages/${messageId}/attachments/${attachmentId}`)
  .get();
const fileData = Buffer.from(attachment.contentBytes, 'base64');
fs.writeFileSync(attachment.name, fileData);
```

### Search Emails

```typescript
// Search by subject/body content
const results = await graphClient.api(`/users/${userId}/messages`)
  .search('"quarterly report" OR "Q1 revenue"')
  .select('subject,from,receivedDateTime,bodyPreview')
  .top(20)
  .get();

// Filter by sender
const fromSender = await graphClient.api(`/users/${userId}/messages`)
  .filter("receivedDateTime ge 2026-10-01T00:00:00Z and from/emailAddress/address eq 'ceo@company.com'")
  .select('subject,receivedDateTime,bodyPreview')
  .orderby('receivedDateTime DESC')
  .get();

// Filter by date range
const recentImportant = await graphClient.api(`/users/${userId}/messages`)
  .filter("receivedDateTime ge 2026-02-01T00:00:00Z and importance eq 'high'")
  .select('subject,from,receivedDateTime')
  .orderby('receivedDateTime DESC')
  .get();

// Filter messages with attachments
const withAttachments = await graphClient.api(`/users/${userId}/messages`)
  .filter('hasAttachments eq true')
  .select('subject,from,receivedDateTime')
  .top(20)
  .get();
```

### Folder Management

```typescript
// List, create folders
const folders = await graphClient.api(`/users/${userId}/mailFolders`)
  .select('id,displayName,totalItemCount,unreadItemCount').get();
const newFolder = await graphClient.api(`/users/${userId}/mailFolders`)
  .post({ displayName: 'Project Alpha' });

// Move message to folder, mark as read
await graphClient.api(`/users/${userId}/messages/${messageId}/move`)
  .post({ destinationId: folderId });
await graphClient.api(`/users/${userId}/messages/${messageId}`)
  .patch({ isRead: true });
```

For bulk operations, use `POST /$batch` with up to 20 requests (e.g., batch mark-as-read).

### Mail Rules (Inbox Rules)

```typescript
// Create inbox rule
await graphClient.api(`/users/${userId}/mailFolders/inbox/messageRules`)
  .post({
    displayName: 'Move newsletters to folder',
    sequence: 1,
    isEnabled: true,
    conditions: {
      senderContains: ['newsletter', 'digest', 'weekly-update'],
    },
    actions: {
      moveToFolder: newsletterFolderId,
      markAsRead: true,
    },
  });

```

For auto-replies (Out of Office), use `PATCH /users/{userId}/mailboxSettings` with `automaticRepliesSetting` — set `status: 'scheduled'` with start/end dates, and provide separate `internalReplyMessage` and `externalReplyMessage`.

### Webhooks (New Email Notifications)

```typescript
// Subscribe to new messages. Needs Mail.Read. Outlook message subscriptions last
// under 7 days (10,080 minutes), so renew with PATCH /subscriptions/{id}.
const subscription = await graphClient.api('/subscriptions')
  .post({
    changeType: 'created',
    notificationUrl: 'https://hooks.northwind.com/api/email-webhook',
    resource: `/users/${userId}/mailFolders/inbox/messages`,
    expirationDateTime: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    clientState: process.env.GRAPH_WEBHOOK_SECRET,
  });
```

When the subscription is created Graph POSTs to the URL with a `validationToken` query parameter; answer `200` with that token echoed as `text/plain`. For real notifications, reply `2xx` within 3 seconds, check `clientState`, then fetch the new message by ID from `notification.resourceData.id` and process it (forward to Slack, trigger workflows, etc.).

## Examples

### Example 1: Send a weekly project status report with attachment
**User prompt:** "Send an HTML email to the engineering team at eng-team@northwind.com with the subject 'Sprint 22 Status Report' summarizing our completed features. Attach the burndown chart from ./reports/sprint-22-burndown.png."

The agent will compose an HTML email body with a styled table showing completed features, their owners, and status. It will read the burndown chart file, base64-encode it, and attach it as a `fileAttachment` with the correct content type. The email will be sent via `POST /users/{userId}/sendMail` with `importance: 'normal'`, the HTML body, the attachment array, and `saveToSentItems: true`.

### Example 2: Create an inbox rule to auto-organize client emails
**User prompt:** "Set up an Outlook rule that moves all emails from anyone at @fabrikam.com into a folder called 'Fabrikam Project', and create the folder if it doesn't exist. Also mark those emails as read automatically."

The agent will first create a mail folder named `Fabrikam Project` using `POST /users/{userId}/mailFolders` and capture the returned folder ID. It will then create an inbox message rule via `POST /users/{userId}/mailFolders/inbox/messageRules` with conditions set to `senderContains: ['fabrikam.com']` and actions set to `moveToFolder` (using the new folder ID) and `markAsRead: true`.

## Guidelines

- Use `$select` on every query — mailbox data is heavy, fetch only needed fields
- Batch operations for bulk updates (mark read, move, delete) with `POST /$batch`, max 20 requests per batch
- Mail subscriptions expire in under 7 days — schedule renewal well before `expirationDateTime`
- HTML emails: use inline CSS only — email clients strip `<style>` blocks
- Attachments of 3 MB to 150 MB: create a draft, then `POST .../attachments/createUploadSession`; inline base64 is for files under 3 MB. The default message size limit is 35 MB, set by the tenant admin
- With `$filter` plus `$orderby` on messages, list the `$orderby` properties first in `$filter` (for example `receivedDateTime ge ... and isRead eq false`), otherwise Graph answers `InefficientFilter`
- Use `$search` for full-text search, `$filter` for structured queries — different syntax
- Outlook limits apply per app and mailbox: 10,000 requests per 10 minutes, 4 concurrent requests, 150 MB of uploads per 5 minutes. On `429` wait for the `Retry-After` seconds
- `saveToSentItems` defaults to true; set it to `false` only when you do not want a copy in Sent Items
- For automated emails, use a dedicated service account — not a person's mailbox
- Delta queries for efficient polling: `/users/{id}/mailFolders/inbox/messages/delta`
