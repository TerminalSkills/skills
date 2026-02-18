---
name: outlook-email
description: >-
  Send, read, and manage emails via Microsoft Outlook using the Graph API. Use when
  someone asks to "send email via Outlook", "read Outlook inbox", "automate Outlook emails",
  "manage Outlook folders", "Outlook API integration", "email automation with Graph API",
  "search Outlook emails", or "process incoming emails". Covers sending (plain, HTML, attachments),
  reading, searching, folders, rules, and focused inbox via Microsoft Graph API.
license: Apache-2.0
compatibility: "Microsoft Graph API v1.0. Requires Microsoft 365 tenant with Exchange Online."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["outlook", "email", "microsoft-graph", "microsoft-365", "automation", "api"]
---

# Outlook Email

## Overview

This skill helps AI agents send, read, search, and automate emails through Microsoft Outlook via the Graph API. It covers sending messages (plain text, HTML, attachments, inline images), reading and searching mailboxes, folder management, mail rules, and email automation patterns.

## Instructions

### Authentication

```typescript
// Same Azure AD app registration as other Microsoft 365 services
// Permissions needed:
//   Mail.ReadWrite — read/write user's mail
//   Mail.Send — send mail as user
//   MailboxSettings.ReadWrite — manage rules, auto-replies

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

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

### Send Emails

```typescript
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

// Email with file attachment
const fileBuffer = fs.readFileSync('/path/to/report.pdf');
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

// Reply to an email
await graphClient.api(`/users/${userId}/messages/${messageId}/reply`)
  .post({
    comment: 'Thanks for the update. I\'ll review by EOD.',
  });

// Reply all
await graphClient.api(`/users/${userId}/messages/${messageId}/replyAll`)
  .post({
    comment: 'Looks good to me. Let\'s proceed.',
  });

// Forward
await graphClient.api(`/users/${userId}/messages/${messageId}/forward`)
  .post({
    comment: 'FYI — see the proposal below.',
    toRecipients: [{ emailAddress: { address: 'partner@external.com' } }],
  });
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
  const read = msg.isRead ? '  ' : '🔵';
  const att = msg.hasAttachments ? '📎' : '  ';
  console.log(`${read}${att} ${msg.from.emailAddress.address}: ${msg.subject}`);
});

// Get unread messages only
const unread = await graphClient.api(`/users/${userId}/mailFolders/inbox/messages`)
  .filter('isRead eq false')
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
  .filter("from/emailAddress/address eq 'ceo@company.com'")
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
// List mail folders
const folders = await graphClient.api(`/users/${userId}/mailFolders`)
  .select('id,displayName,totalItemCount,unreadItemCount')
  .get();

// Create folder
const newFolder = await graphClient.api(`/users/${userId}/mailFolders`)
  .post({
    displayName: 'Project Alpha',
  });

// Create subfolder
const subFolder = await graphClient.api(`/users/${userId}/mailFolders/${parentFolderId}/childFolders`)
  .post({
    displayName: 'Invoices',
  });

// Move message to folder
await graphClient.api(`/users/${userId}/messages/${messageId}/move`)
  .post({
    destinationId: folderId,
  });

// Mark as read/unread
await graphClient.api(`/users/${userId}/messages/${messageId}`)
  .patch({ isRead: true });

// Batch mark as read
const batchBody = {
  requests: messageIds.map((id, i) => ({
    id: `${i}`,
    method: 'PATCH',
    url: `/users/${userId}/messages/${id}`,
    body: { isRead: true },
    headers: { 'Content-Type': 'application/json' },
  })),
};
await graphClient.api('/$batch').post(batchBody);
```

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

// Auto-reply rule (Out of Office)
await graphClient.api(`/users/${userId}/mailboxSettings`)
  .patch({
    automaticRepliesSetting: {
      status: 'scheduled',
      scheduledStartDateTime: {
        dateTime: '2026-03-15T00:00:00',
        timeZone: 'America/New_York',
      },
      scheduledEndDateTime: {
        dateTime: '2026-03-22T00:00:00',
        timeZone: 'America/New_York',
      },
      internalReplyMessage: '<p>I\'m out of office March 15-21. For urgent matters, contact mike@company.com.</p>',
      externalReplyMessage: '<p>Thank you for your email. I\'m currently out of office and will respond after March 22.</p>',
      externalAudience: 'contactsOnly',
    },
  });
```

### Webhooks (New Email Notifications)

```typescript
// Subscribe to new messages
const subscription = await graphClient.api('/subscriptions')
  .post({
    changeType: 'created',
    notificationUrl: 'https://your-app.com/api/email-webhook',
    resource: `/users/${userId}/mailFolders/inbox/messages`,
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    clientState: 'your-secret-token',
  });

// Webhook handler
app.post('/api/email-webhook', async (req, res) => {
  if (req.query.validationToken) {
    return res.status(200).send(req.query.validationToken);
  }

  for (const notification of req.body.value) {
    const messageId = notification.resourceData.id;
    
    // Fetch the new message
    const msg = await graphClient.api(`/users/${userId}/messages/${messageId}`)
      .select('subject,from,bodyPreview,importance')
      .get();
    
    console.log('New email:', msg.subject, 'from', msg.from.emailAddress.address);
    
    // Process: forward to Slack, trigger workflow, etc.
  }

  res.status(202).send();
});
```

## Best Practices

- Use `$select` on every query — mailbox data is heavy, fetch only needed fields
- Batch operations for bulk updates (mark read, move, delete) — max 20 per batch
- Webhook subscriptions expire in 3 days — set up auto-renewal
- HTML emails: use inline CSS only — email clients strip `<style>` blocks
- Large attachments (>3MB): use upload session instead of inline base64
- Use `$search` for full-text search, `$filter` for structured queries — different syntax
- Rate limits: 10,000 requests per 10 min per app per tenant
- Always set `saveToSentItems: true` when sending — unless intentionally ephemeral
- For automated emails, use a dedicated service account — not a person's mailbox
- Delta queries for efficient polling: `/users/{id}/mailFolders/inbox/messages/delta`
