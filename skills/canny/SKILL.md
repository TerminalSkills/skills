---
name: canny
description: >-
  Canny is a hosted product-feedback tool with feature-request boards, voting,
  a public roadmap and a changelog. Use when a user asks to set up a feature
  request board, identify logged-in users in Canny, embed the feedback widget,
  create or list posts through the Canny API, change a post's status, or verify
  Canny webhooks.
license: Apache-2.0
compatibility: "Any web app (browser SDK) plus a server for the REST API. Requires a Canny account."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "canny, feedback, roadmap, feature-requests, product"
---

# Canny

## Overview

Canny collects product feedback: users post ideas to boards, vote, comment and follow status changes, while your team triages, links ideas to Jira/Linear and publishes a roadmap and changelog. You integrate in three ways: a link to your Canny site (`your-company.canny.io`) or an embedded widget, the browser SDK that identifies the logged-in user, and the REST API plus webhooks on your server. Docs: https://developers.canny.io

## Instructions

### Step 1: Link to your board and identify users

Put a link carrying `data-canny-link` where users will find it (the attribute is required, otherwise the visitor is not authenticated), and load the SDK and call `identify` for logged-in users. Admins are never identified, so test with a non-admin account.

```html
<a data-canny-link href="https://northwind-app.canny.io">Give feedback</a>
```

```tsx
// components/CannyIdentify.tsx
'use client'
import Script from 'next/script'
import { useEffect } from 'react'

declare global { interface Window { Canny: (...args: unknown[]) => void } }

type Viewer = {
  id: string; email: string; name: string; avatarUrl?: string
  createdAt: string; plan: string; cannyHash: string // HMAC computed on the server
}

export function CannyIdentify({ viewer }: { viewer: Viewer }) {
  useEffect(() => {
    window.Canny?.('identify', {
      appID: process.env.NEXT_PUBLIC_CANNY_APP_ID,
      user: {
        id: viewer.id,
        email: viewer.email,
        name: viewer.name,
        avatarURL: viewer.avatarUrl,
        created: new Date(viewer.createdAt).toISOString(),
        customFields: { plan: viewer.plan },
      },
      hash: viewer.cannyHash,
    })
  }, [viewer])
  return <Script src="https://sdk.canny.io/sdk.js" strategy="afterInteractive" />
}
```

If the `Canny` function is not defined yet when the effect runs, use the loader snippet from https://developers.canny.io/install, which queues calls until the SDK arrives.

### Step 2: Sign identify requests

In the admin security settings, "Identify security" makes Canny reject identify calls without a per-user hash, which prevents impersonation. Compute it on the server with your secret API key (from company settings, never shipped to the browser):

```typescript
// lib/canny-hash.ts
import crypto from 'node:crypto'

export function cannyHash(userId: string): string {
  return crypto.createHmac('sha256', process.env.CANNY_API_KEY!).update(userId).digest('hex')
}
```

Roll out the hash first, then switch the setting on. Companies (with `monthlySpend`) can be sent in `user.companies` inside `identify` to segment feedback by revenue.

### Step 3: Embed the widget (optional)

The widget is an advanced option; Canny recommends linking to the full site for most apps. For a widget, add an empty `div` with a `data-canny` attribute and call `Canny('render', { boardToken, basePath, ssoToken, theme })` (`theme` is `light`, `dark` or `auto`). `basePath` syncs URLs, for example `'/feedback'`, and your router must serve `/feedback/*` on the same page. Private boards require an `ssoToken` generated on your server (https://developers.canny.io/install/widget/sso).

### Step 4: Use the REST API

Every call is a `POST` to `https://canny.io/api/v1/...` with a JSON body (or form fields) containing `apiKey`, and `Content-Type: application/json`. Create the author first: `users/create_or_update` returns Canny's own `id`, which is what `authorID` and `voterID` expect, not your application user id.

```typescript
// lib/canny.ts
const BASE = 'https://canny.io/api/v1'

async function canny<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.CANNY_API_KEY, ...body }),
  })
  if (res.status === 429) throw new Error(`Rate limited, retry after ${res.headers.get('Retry-After')}s`)
  if (!res.ok) throw new Error(`Canny ${path} failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function submitIdea(user: { id: string; email: string; name: string }, boardID: string) {
  const author = await canny<{ id: string }>('users/create_or_update', {
    userID: user.id, email: user.email, name: user.name,
  })
  return canny<{ id: string }>('posts/create', {
    authorID: author.id,
    boardID,
    title: 'Dark mode for the dashboard',
    details: 'Our night-shift dispatchers want a dark theme for the live map.',
    customFields: { source: 'support-ticket' },
  })
}

export function topPosts(boardID: string) {
  return canny<{ posts: { id: string; title: string; score: number; status: string }[]; hasMore: boolean }>(
    'posts/list', { boardID, sort: 'score', limit: 20, status: 'open,under review' })
}

export function markPlanned(postID: string, adminID: string) {
  return canny('posts/change_status', {
    postID, changerID: adminID, status: 'planned', shouldNotifyVoters: true,
    commentValue: 'Scheduled for the next release.',
  })
}
```

Other useful endpoints: `boards/list`, `votes/create` (`postID`, `voterID`, optional `votePriority` 0, 10 or 20), `comments/create`, `tags/list`, `posts/change_board`, and changelog `entries/create`. List endpoints paginate with `skip`/`limit` (posts: `hasMore` tells you to continue) or with a `cursor` on v2 endpoints such as `users/list`.

### Step 5: Verify webhooks

Canny signs webhooks to the Standard Webhooks spec (headers `webhook-id`, `webhook-timestamp`, `webhook-signature`); the signing secret is in API settings once a webhook exists. Verify the raw body before parsing:

```typescript
// app/api/canny-webhook/route.ts
import { Webhook } from 'standardwebhooks'

export async function POST(req: Request) {
  const raw = await req.text()
  const wh = new Webhook(process.env.CANNY_WEBHOOK_SECRET!) // the whsec_... secret
  let event: { type: string; object: { id: string; title?: string } }
  try {
    event = wh.verify(raw, Object.fromEntries(req.headers)) as typeof event
  } catch {
    return new Response('invalid signature', { status: 400 })
  }
  if (event.type === 'post.created') console.log('New idea', event.object.title)
  return new Response('ok')
}
```

Event types include `post.created`, `post.edited`, `post.deleted`, status changes, votes and comments; see the Event types section of the API reference.

## Examples

### Example 1: Push support-ticket requests into Canny

**Request:** "When a support agent tags a ticket 'feature-request', add it to our Feature Requests board under the customer's name."

Run `boards/list` once to get the board id, then call `submitIdea(customer, boardID)` from the ticket webhook handler. The result is `{ "id": "..." }` for the new post, which appears on the board with the customer as author.

### Example 2: Close the loop when something ships

**Request:** "Mark 'Dark mode' as complete and tell everyone who voted."

```bash
curl -s https://canny.io/api/v1/posts/change_status \
  -d apiKey="$CANNY_API_KEY" -d postID=6a2889c586d7b8843bf4cf05 \
  -d changerID=6a2889c586d7b8843bf4cf07 -d status=complete -d shouldNotifyVoters=true
```

The response is the updated post object; voters get an email, and a changelog entry can be added with `entries/create`.

## Guidelines

- Keep `CANNY_API_KEY` on the server; only the app ID and board token are public.
- Respect rate limits (per key: Free 5/s, 100/min, 1,000/h; paid plans 10/s, 300/min, 5,000/h; Business 20/s, 600/min, 15,000/h) and wait `Retry-After` seconds after a 429. Sync users in a scheduled job, not on every request.
- `authorID`, `voterID` and `changerID` are Canny ids, not your own user ids.
- Changing a post to its current status triggers no notifications.
- `users/find_or_create` is deprecated; use `users/create_or_update`.
- Plans and prices change; check canny.io/pricing instead of trusting numbers in this skill.
