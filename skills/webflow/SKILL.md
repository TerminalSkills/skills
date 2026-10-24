---
name: webflow
description: >-
  Webflow is a visual website builder with a built-in CMS and hosting, plus a
  Data API v2 for managing content from code. Use when someone asks to "update
  Webflow CMS from a script", "sync content to Webflow", "publish a Webflow
  item", "Webflow webhook", "Webflow API", "connect Claude to Webflow", or
  "build a site in Webflow". Covers site tokens, CMS items, publishing, live
  content delivery, webhooks with signature checks, the MCP server and code
  components.
license: Apache-2.0
compatibility: "Webflow account and site. Data API v2 over HTTPS (Node 18+ for the examples). Claude Code or another MCP host for the MCP server."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["webflow", "cms", "no-code", "website-builder", "api"]
---

# Webflow

## Overview

Webflow is a visual web design tool with its own CMS, hosting and forms. Designers build pages in the Designer; developers and automations use the **Data API v2** (host `api.webflow.com`, paths start with `/v2`) to read and write CMS content, publish, read form submissions and register webhooks. Webflow also runs a hosted **MCP server** so an AI agent can work on a site, and a **code components** workflow (React components imported into the Designer).

The Data API v1 is a separate, older version; everything here is v2. Webflow's docs expose clean Markdown by appending `.md` to a page URL and a section index at `https://developers.webflow.com/data/llms.txt`.

## Instructions

### Step 1: Get a token

Every call sends `Authorization: Bearer <token>`.

- **Site token**: made in Site settings, Apps & integrations, API access. Scoped to one site and the scopes you tick (for CMS work `cms:read` and `cms:write`, plus `sites:write` to publish the site). Best for internal scripts.
- **Workspace token**: read access across a Workspace, for audits.
- **OAuth app token**: for public integrations and Marketplace apps.

Keep tokens in environment variables (`WEBFLOW_API_TOKEN`, `WEBFLOW_SITE_ID`), never in a Designer custom-code field or client-side JavaScript. Custom-code endpoints need an OAuth app, not a site token.

```bash
curl -s https://api.webflow.com/v2/sites -H "Authorization: Bearer $WEBFLOW_API_TOKEN"
curl -s https://api.webflow.com/v2/sites/$WEBFLOW_SITE_ID/collections -H "Authorization: Bearer $WEBFLOW_API_TOKEN"
```

`GET /collections/{collection_id}` returns the field list. Field `slug` values (not display names) are the keys of `fieldData`.

### Step 2: Create, update and publish CMS items

Items live in two states. A **staged** item is a draft or pending change; a **live** item is what visitors see. Writes go to the staged copy unless you use a `/live` endpoint.

```typescript
// src/webflow.ts
const API = "https://api.webflow.com/v2";
const headers = {
  Authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
  "Content-Type": "application/json",
};

async function wf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 60);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return wf<T>(path, init);
  }
  if (!res.ok) throw new Error(`Webflow ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Create up to 100 items per request (POST /items/insert is the endpoint for new work)
export async function createPosts(collectionId: string, posts: { title: string; slug: string; html: string; imageUrl: string }[]) {
  return wf<{ items: { id: string }[] }>(`/collections/${collectionId}/items/insert`, {
    method: "POST",
    body: JSON.stringify({
      items: posts.map((p) => ({
        isDraft: false, // queue for the next publish; default is true
        fieldData: {
          name: p.title,
          slug: p.slug,
          "post-body": p.html, // rich text is an HTML string
          "thumbnail-image": { url: p.imageUrl }, // public URL, max 4 MB
        },
      })),
    }),
  });
}

// Update one item (PATCH, not PUT)
export const updateTitle = (collectionId: string, itemId: string, name: string) =>
  wf(`/collections/${collectionId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ fieldData: { name } }) });

// Publish specific items without publishing the whole site
export const publishItems = (collectionId: string, itemIds: string[]) =>
  wf<{ publishedItemIds?: string[]; errors?: string[] }>(`/collections/${collectionId}/items/publish`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
```

Facts that bite:
- The create and publish endpoints answer `202`; the work finishes asynchronously.
- New items are drafts by default. `isDraft: false` queues them for the next site publish; `publishItems` makes them live now.
- `isDraft: true` on an already-published item keeps it live and holds the edit as a draft. To take items off the live site call `DELETE /collections/{id}/items/live` with `{"items": [{"id": "..."}]}` (up to 100, answers `204`, and sets `isDraft` back to `true`); setting `isArchived: true` removes it only at the next site-wide publish.
- Update a live item and publish in one call with `PATCH /collections/{id}/items/{item_id}/live`.
- Older `POST /items` and `POST /items/bulk` still work but are no longer listed; they take one locale per item. Create Items (`/items/insert`) takes `cmsLocaleIds` (plural) or `allCmsLocales: true` and rejects unknown properties with `400`.
- List endpoints return at most 100 items; page with `offset` and `limit`. Filter with `filter[<fieldSlug>][<operator>]=value` and sort with `sort[<fieldSlug>]=asc`.
- Rich text API writes drop code blocks (an empty string results). Multi-image, reference and option fields have their own value shapes; see the Field Types reference.

### Step 3: Publish the site

```bash
curl -s -X POST "https://api.webflow.com/v2/sites/$WEBFLOW_SITE_ID/publish" \
  -H "Authorization: Bearer $WEBFLOW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"publishToWebflowSubdomain": true}'
```

Include `publishToWebflowSubdomain` and/or `customDomains` (domain IDs from `GET /sites/{id}/custom_domains`). Add `pageId` to publish one page. A site publish is limited to one successful call per minute.

### Step 4: Serve live content fast

For read-only public content, call the Content Delivery API: same paths, host `api-cdn.webflow.com`, only the `/items/live` reads. Cached responses carry `cf-cache-status: HIT` and are effectively not rate limited, while uncached calls count against your plan limit.

```bash
curl -G "https://api-cdn.webflow.com/v2/collections/$COLLECTION_ID/items/live" \
  -H "Authorization: Bearer $WEBFLOW_CDN_TOKEN" -d limit=100 -d offset=0
```

Use a separate token with only `cms:read` for each delivery channel.

### Step 5: Webhooks with signature checks

Create webhooks through the API (`POST /sites/{site_id}/webhooks` with `triggerType`, `url`; needs `sites:write` plus the event's own read scope, such as `forms:read`), because webhooks made in the dashboard do not send signature headers. Only `form_submission` supports a `filter` (`{"name": "Contact Us"}`). Event types include `form_submission`, `site_publish`, `collection_item_created`, `collection_item_changed`, `collection_item_deleted`, `collection_item_published`, `collection_item_unpublished`, `ecomm_new_order`. Failed deliveries are retried up to 3 times, 10 minutes apart.

```typescript
import { WebflowClient } from "webflow-api"; // npm install webflow-api
import express from "express";

const webflow = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN! });
const app = express();
app.use(express.json());

app.post("/webhooks/webflow", async (req, res) => {
  const age = Date.now() - Number(req.header("x-webflow-timestamp"));
  const valid = await webflow.webhooks.verifySignature({   // returns a Promise: await it
    headers: req.headers as Record<string, string>,
    body: JSON.stringify(req.body),
    secret: process.env.WEBFLOW_WEBHOOK_SECRET!,
  });
  if (!valid || !(age >= 0 && age < 5 * 60 * 1000)) return res.sendStatus(401);
  // handle req.body.triggerType / req.body.payload
  res.sendStatus(200);
});
```

`verifySignature` checks the HMAC-SHA256 of `timestamp:body` only; it does not reject an old timestamp (verified with webflow-api 3.3.4), so also enforce the 5-minute window yourself, as above. The signing key is the webhook's own secret (webhooks made with a site token after 2025-04-14) or the OAuth app's client secret.

### Step 6: Let an agent work on the site (MCP)

```bash
claude mcp add --transport http webflow https://mcp.webflow.com/mcp
```

In Claude Code run `/mcp`, pick `webflow` and finish the OAuth login in the browser, choosing which sites to allow. The server can read and edit CMS collections and items, pages, SEO metadata, forms, assets and components; some Designer actions need the MCP Bridge App open in the Designer. It works within your Webflow roles.

### Step 7: Code components (React in the Designer)

```bash
npm i --save-dev @webflow/webflow-cli @webflow/data-types @webflow/react   # Node 22.13+
```

Add `webflow.json` with `{"library": {"name": "Acme UI", "components": ["./src/**/*.webflow.@(js|jsx|mjs|ts|tsx)"]}}`, then write one `Badge.webflow.tsx` per component that calls `declareComponent(Badge, { name, props })`. Check the code components quickstart for the plan it requires before promising this to a client.

## Examples

### Example 1: Sync blog posts from a headless CMS into Webflow

**User prompt:** "Every night copy new posts from our Contentful space into the Webflow Blog collection and publish them."

The agent reads `GET /collections/{id}` to find the real field slugs (`post-body`, `thumbnail-image`), maps each Contentful entry to `fieldData`, batches up to 100 per `POST /collections/{id}/items/insert` call with `isDraft: true`, collects the returned `items[].id`, then calls `POST /collections/{id}/items/publish` with those ids. It handles `429` by honoring `Retry-After`. Result: `{"publishedItemIds":["66ffa1d3c0..."],"errors":[]}`. Re-runs look items up by `slug` (`GET .../items?slug=my-post`) and `PATCH` instead of creating duplicates.

### Example 2: Slack alert for every form submission

**User prompt:** "Post a Slack message when someone submits the Contact Us form on our Webflow site."

The agent registers a webhook once:

```bash
curl -s -X POST "https://api.webflow.com/v2/sites/$WEBFLOW_SITE_ID/webhooks" \
  -H "Authorization: Bearer $WEBFLOW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"triggerType":"form_submission","url":"https://hooks.acme-web.dev/webflow","filter":{"name":"Contact Us"}}'
```

It stores the webhook's signing key (or the OAuth app's client secret) as `WEBFLOW_WEBHOOK_SECRET`, deploys the handler from Step 5, and forwards `payload.data` (name, email, message) to Slack after the signature and timestamp checks pass. The token needs `forms:read`.

## Guidelines

- API limits: 60 requests per minute on Starter and Basic site plans, 120 on plans with CMS, per API key; `429` carries `Retry-After`. Batch writes (up to 100 items) and use webhooks instead of polling.
- Use slugs from the collection definition, not field labels. A wrong key is rejected with a validation error.
- Publishing is separate from writing. If content "isn't showing up", check `isDraft`, `isArchived` and `lastPublished` on the item, and whether the site was published after a staged change.
- Site-wide publish publishes all staged changes, including other people's drafts. Prefer `items/publish` for targeted releases.
- Images must be on a public URL and at most 4 MB when uploaded via the API.
- Site plans and prices change: Starter is free with limited CMS and 2 static pages; check the Webflow pricing page before promising CMS item counts, bandwidth or form limits.
- Do not use Webflow for server-side logic or heavy transactional apps; use Webflow Cloud or your own backend and keep Webflow for marketing pages, CMS content and forms.
- In the Designer: use classes and combo classes (for example `.card` plus `.is-featured`) instead of per-element styling, and reusable components for navbar, footer and CTA blocks.
