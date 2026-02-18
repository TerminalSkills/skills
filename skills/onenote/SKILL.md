---
name: onenote
description: >-
  Create, read, and manage OneNote notebooks, sections, and pages via Microsoft Graph API.
  Use when someone asks to "create OneNote pages", "read OneNote notes", "automate OneNote",
  "save to OneNote", "extract OneNote content", "organize OneNote notebooks", or "OneNote API".
  Covers notebooks, sections, pages (create with HTML), content extraction, and search.
license: Apache-2.0
compatibility: "Microsoft Graph API v1.0. Requires Microsoft 365 account with OneNote."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["onenote", "microsoft-365", "notes", "graph-api", "api"]
---

# OneNote

## Overview

This skill helps AI agents integrate with Microsoft OneNote via the Graph API. It covers creating and managing notebooks, sections, and pages, generating rich page content with HTML, extracting text and images, and searching across notes.

## Instructions

### Authentication

```typescript
// Same Azure AD app as other Microsoft 365 services
// Permissions needed:
//   Notes.ReadWrite — read/write user's notebooks
//   Notes.ReadWrite.All — access all notebooks (admin)
//   Notes.Create — create only

import { Client } from '@microsoft/microsoft-graph-client';
// ... same auth setup as other Graph API skills
```

### Notebooks & Sections

```typescript
// List notebooks
const notebooks = await graphClient.api(`/users/${userId}/onenote/notebooks`)
  .select('id,displayName,createdDateTime,lastModifiedDateTime')
  .get();

// Create notebook
const notebook = await graphClient.api(`/users/${userId}/onenote/notebooks`)
  .post({ displayName: 'Project Notes' });

// List sections in a notebook
const sections = await graphClient
  .api(`/users/${userId}/onenote/notebooks/${notebookId}/sections`)
  .select('id,displayName')
  .get();

// Create section
const section = await graphClient
  .api(`/users/${userId}/onenote/notebooks/${notebookId}/sections`)
  .post({ displayName: 'Meeting Notes' });

// Create section group (for organizing sections)
const group = await graphClient
  .api(`/users/${userId}/onenote/notebooks/${notebookId}/sectionGroups`)
  .post({ displayName: 'Q1 2026' });
```

### Create Pages

OneNote pages are created using HTML. The API accepts a subset of HTML with OneNote-specific data attributes.

```typescript
// Simple page
await graphClient.api(`/users/${userId}/onenote/sections/${sectionId}/pages`)
  .header('Content-Type', 'application/xhtml+xml')
  .post(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sprint 14 Standup — March 1, 2026</title>
      <meta name="created" content="2026-03-01T09:30:00-05:00" />
    </head>
    <body>
      <h1>Sprint 14 Daily Standup</h1>
      <p>Date: March 1, 2026 | Attendees: Sarah, Mike, Dani</p>
      
      <h2>Sarah</h2>
      <ul>
        <li><b>Yesterday:</b> Completed payment retry logic PR #142</li>
        <li><b>Today:</b> Start integration tests for retry flow</li>
        <li><b>Blockers:</b> None</li>
      </ul>
      
      <h2>Mike</h2>
      <ul>
        <li><b>Yesterday:</b> Reviewed 3 PRs, fixed CI flakiness</li>
        <li><b>Today:</b> Dashboard performance optimization</li>
        <li><b>Blockers:</b> Need access to production Datadog</li>
      </ul>
      
      <h2>Action Items</h2>
      <ul>
        <li data-tag="to-do">Grant Mike Datadog access — Sarah</li>
        <li data-tag="to-do">Schedule sprint demo for Friday — Dani</li>
      </ul>
      
      <h2>Notes</h2>
      <p>Sprint velocity tracking at 38 points, capacity is 42. On track for all commitments.</p>
    </body>
    </html>
  `);

// Page with table
await graphClient.api(`/users/${userId}/onenote/sections/${sectionId}/pages`)
  .header('Content-Type', 'application/xhtml+xml')
  .post(`
    <!DOCTYPE html>
    <html>
    <head><title>Weekly Metrics</title></head>
    <body>
      <h1>Weekly Metrics — Feb 24-28, 2026</h1>
      <table border="1">
        <tr><th>Metric</th><th>Value</th><th>Target</th><th>Status</th></tr>
        <tr><td>Revenue</td><td>$98,200</td><td>$90,000</td><td>✅ Above</td></tr>
        <tr><td>Sign-ups</td><td>142</td><td>150</td><td>⚠️ Below</td></tr>
        <tr><td>Churn</td><td>0.4%</td><td>0.5%</td><td>✅ Below</td></tr>
        <tr><td>NPS</td><td>72</td><td>65</td><td>✅ Above</td></tr>
      </table>
    </body>
    </html>
  `);

// Page with image from URL
await graphClient.api(`/users/${userId}/onenote/sections/${sectionId}/pages`)
  .header('Content-Type', 'application/xhtml+xml')
  .post(`
    <!DOCTYPE html>
    <html>
    <head><title>Architecture Diagram</title></head>
    <body>
      <h1>System Architecture — v2</h1>
      <img src="https://example.com/architecture-diagram.png" alt="Architecture diagram" />
      <p>Updated March 2026. Changes: added Redis cache layer, split API gateway.</p>
    </body>
    </html>
  `);
```

#### OneNote HTML Tags Reference

```html
<!-- Tags for to-do items, important, etc. -->
<p data-tag="to-do">Task to complete</p>
<p data-tag="important">Important note</p>
<p data-tag="question">Open question</p>
<p data-tag="remember-for-later">Remember this</p>
<p data-tag="definition">Term definition</p>
<p data-tag="highlight">Highlighted text</p>
<p data-tag="contact">Contact info</p>
<p data-tag="address">Physical address</p>
<p data-tag="phone-number">Phone number</p>
<p data-tag="web-site-to-visit">URL to visit</p>
<p data-tag="idea">Idea</p>
<p data-tag="critical">Critical item</p>
<p data-tag="project-a">Project A tag</p>
<p data-tag="project-b">Project B tag</p>

<!-- Date/time stamp -->
<meta name="created" content="2026-03-01T09:00:00-05:00" />

<!-- Indentation for outlines -->
<ul>
  <li>Level 1
    <ul>
      <li>Level 2
        <ul><li>Level 3</li></ul>
      </li>
    </ul>
  </li>
</ul>
```

### Read Pages

```typescript
// List pages in a section
const pages = await graphClient
  .api(`/users/${userId}/onenote/sections/${sectionId}/pages`)
  .select('id,title,createdDateTime,lastModifiedDateTime')
  .orderby('lastModifiedDateTime DESC')
  .top(50)
  .get();

// Get page content (returns HTML)
const pageContent = await graphClient
  .api(`/users/${userId}/onenote/pages/${pageId}/content`)
  .get();
// Returns full HTML of the page

// Get page metadata
const pageMeta = await graphClient
  .api(`/users/${userId}/onenote/pages/${pageId}`)
  .select('id,title,createdDateTime,lastModifiedDateTime,contentUrl')
  .get();
```

### Update Pages

```typescript
// Append content to existing page
await graphClient.api(`/users/${userId}/onenote/pages/${pageId}/content`)
  .patch([
    {
      target: 'body',
      action: 'append',
      position: 'after',
      content: '<h2>Update — March 2</h2><p>Sprint demo completed successfully. All 3 features demoed.</p>',
    },
  ]);

// Replace specific element
await graphClient.api(`/users/${userId}/onenote/pages/${pageId}/content`)
  .patch([
    {
      target: '#status-section', // Element with data-id="status-section"
      action: 'replace',
      content: '<p data-id="status-section">Status: <b>Complete</b> ✅</p>',
    },
  ]);

// Prepend content
await graphClient.api(`/users/${userId}/onenote/pages/${pageId}/content`)
  .patch([
    {
      target: 'body',
      action: 'prepend',
      content: '<p style="color:red;"><b>⚠️ UPDATED: See new figures below</b></p>',
    },
  ]);
```

### Search

```typescript
// Search across all OneNote content
const results = await graphClient
  .api(`/users/${userId}/onenote/pages`)
  .filter("contains(title, 'standup')")
  .select('id,title,createdDateTime,parentSection')
  .expand('parentSection($select=displayName)')
  .orderby('lastModifiedDateTime DESC')
  .get();

// Full-text search via Microsoft Search API
const searchResults = await graphClient.api('/search/query')
  .post({
    requests: [{
      entityTypes: ['driveItem'],
      query: { queryString: 'filetype:one AND "sprint planning"' },
      size: 20,
    }],
  });
```

### Common Patterns

#### Meeting Notes Template
```typescript
async function createMeetingNotes(sectionId, meeting) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${meeting.subject} — ${meeting.date}</title>
      <meta name="created" content="${meeting.startTime}" />
    </head>
    <body>
      <h1>${meeting.subject}</h1>
      <p><b>Date:</b> ${meeting.date} | <b>Time:</b> ${meeting.time}</p>
      <p><b>Attendees:</b> ${meeting.attendees.join(', ')}</p>
      
      <h2>Agenda</h2>
      <ul>${meeting.agenda.map(item => `<li>${item}</li>`).join('')}</ul>
      
      <h2>Discussion Notes</h2>
      <p><i>(To be filled during meeting)</i></p>
      
      <h2>Action Items</h2>
      <ul>
        <li data-tag="to-do">Action item 1 — Owner</li>
        <li data-tag="to-do">Action item 2 — Owner</li>
      </ul>
      
      <h2>Decisions Made</h2>
      <ul>
        <li data-tag="important">Decision 1</li>
      </ul>
    </body>
    </html>
  `;

  return await graphClient
    .api(`/users/${userId}/onenote/sections/${sectionId}/pages`)
    .header('Content-Type', 'application/xhtml+xml')
    .post(html);
}
```

## Best Practices

- Pages are created with HTML — use valid XHTML (close all tags, quote attributes)
- OneNote API supports a subset of HTML — stick to basic tags (h1-h6, p, ul, ol, table, img, b, i)
- Use `data-tag` attributes for to-do items, important notes, etc. — renders as OneNote tags
- Set `<title>` in HTML head — it becomes the page title in OneNote
- Use `<meta name="created">` to set custom creation timestamps
- Page updates use PATCH with target/action arrays — not full HTML replacement
- Images can be inline (base64 in multipart request) or URL references
- Search works on page titles via `$filter`; for full-text, use Microsoft Search API
- Rate limits: same as other Graph API resources (10,000 per 10 min)
- OneNote pages are stored in OneDrive — large notebooks count against storage quota
