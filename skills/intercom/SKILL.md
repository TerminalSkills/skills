---
name: intercom
description: >-
  Adds customer messaging and support to a product with Intercom: the Messenger chat widget, user identification, product tours, help center, and the REST API for contacts and messages. Use when a user asks to add in-app chat, install Intercom in a React or Next.js app, secure the Messenger with JWTs, track events for targeting, sync users to Intercom from a backend, or send in-app messages.
license: Apache-2.0
compatibility: "Intercom workspace; web apps (JavaScript snippet or @intercom/messenger-js-sdk), iOS, Android; Node.js 18+ for the server examples"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["intercom", "chat", "support", "onboarding", "messaging"]
---

# Intercom

## Overview

Intercom is a customer messaging platform: live chat, a shared inbox, help center, product tours, in-app messages and the Fin AI agent. Two integration surfaces matter to developers. The **Messenger** runs in the browser (or iOS/Android) and shows the chat widget for a visitor or logged-in user. The **REST API** (`https://api.intercom.io`) runs on your server to manage contacts, conversations and messages with an access token.

Checked against the Intercom developer docs in October 2026. Two older practices are outdated: the HMAC `user_hash` identity verification is deprecated in favour of JWTs (`intercom_user_jwt`), and a hand-pasted loader snippet is no longer needed in React apps because the `@intercom/messenger-js-sdk` package loads the widget.

## Instructions

### Step 1: Install the Messenger in a React or Next.js app

Your workspace ID (`app_id`) is in the Intercom URL after `apps/`. It is public, so a `NEXT_PUBLIC_` variable is fine.

```bash
npm install @intercom/messenger-js-sdk
```

```tsx
// components/IntercomProvider.tsx
'use client'
import { useEffect } from 'react'
import Intercom, { shutdown } from '@intercom/messenger-js-sdk'

type Props = {
  user?: { id: string; email: string; name: string; createdAt: number; intercomJwt: string }
}

export function IntercomProvider({ user }: Props) {
  useEffect(() => {
    Intercom({
      app_id: process.env.NEXT_PUBLIC_INTERCOM_APP_ID!,
      // api_base: 'https://api-iam.eu.intercom.io',   // EU-hosted workspaces; AU: api-iam.au.intercom.io
      ...(user && {
        user_id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.createdAt,          // Unix seconds
        intercom_user_jwt: user.intercomJwt, // signed on your server, see Step 2
      }),
    })
    return () => shutdown()                  // clears the session; also call on logout
  }, [user?.id])

  return null
}
```

Other exports of the package: `update`, `trackEvent`, `show`, `hide`, `showNewMessage`, `startTour`, `showArticle`. The plain `window.Intercom('boot' | 'update' | 'trackEvent' | 'shutdown', ...)` API works the same if you use the JavaScript snippet instead. Anonymous visitors: boot with only `app_id`.

### Step 2: Secure the Messenger with a JWT

Without verification anyone can impersonate a user by changing `user_id` in the browser. Take the Messenger secret key from Settings, Messenger, Security, keep it as `INTERCOM_MESSENGER_SECRET`, and sign a token on the server for the logged-in user.

```typescript
// app/api/intercom-jwt/route.ts — server only
import jwt from 'jsonwebtoken'

export function signIntercomJwt(user: { id: string; email: string; name: string }) {
  return jwt.sign(
    { user_id: user.id, email: user.email, name: user.name },   // user_id is required
    process.env.INTERCOM_MESSENGER_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' },
  )
}
```

Send exactly one of `intercom_user_jwt` or `user_hash`; both together returns HTTP 400. After tests pass, enforce verification in the Messenger security settings.

### Step 3: Track events and update on navigation

```typescript
import { trackEvent, update } from '@intercom/messenger-js-sdk'

update()                                                  // after a client-side route change
trackEvent('completed-onboarding', { plan: 'pro', team_size: 5 })   // targets tours, messages, workflows
```

### Step 4: Server-side API

Create a token under Developer Hub, then use a version header so behaviour does not change under you. Regional workspaces use `api.eu.intercom.io` or `api.au.intercom.io`.

```typescript
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.INTERCOM_ACCESS_TOKEN}`,
  'Intercom-Version': '2.16',
}

// Create a contact (a user needs an email or an external_id)
const contact = await fetch('https://api.intercom.io/contacts', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    role: 'user',
    external_id: 'usr_8f31c2',
    email: 'maria.keller@brightdesk.io',
    name: 'Maria Keller',
    custom_attributes: { plan: 'pro', mrr: 49, company_size: 10 },
  }),
}).then((r) => r.json())

// Send an in-app message from an admin to that contact
await fetch('https://api.intercom.io/messages', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    message_type: 'inapp',
    from: { type: 'admin', id: '394051' },
    to: { type: 'user', id: contact.id },
    body: 'Hi Maria, how are you finding the new dashboard?',
  }),
})
```

Creating a contact and messaging it immediately can return 404 for a moment; retry after a short delay. The official Node client is `intercom-client` (`new IntercomClient({ token })`), which has typed methods for the same endpoints. Custom attributes must exist as data attributes in the workspace to be used for segmentation.

## Examples

### Example 1: Add chat to a Next.js SaaS for logged-in users

Request: "Put the Intercom chat widget in our Next.js app and make sure users can't spoof each other."

Install `@intercom/messenger-js-sdk`, add `IntercomProvider` to the root layout inside the authenticated area, add the server function `signIntercomJwt`, pass its output as `intercomJwt`, then turn on "Enforce identity verification" in Messenger settings.

Result: the widget appears bottom-right; the user's name and email show in the Intercom inbox, and a request without a valid `intercom_user_jwt` is rejected.

### Example 2: Sync plan changes and tag power users

Request: "When someone upgrades to Pro, update their Intercom contact and record an event."

On the Stripe webhook handler, call the Contacts API (`PUT /contacts/{id}` with `custom_attributes: { plan: 'pro' }`) and fire `trackEvent('upgraded-to-pro', { seats: 5 })` from the client after checkout. Build a segment on `plan = pro`.

Result: the contact shows `plan: pro` in Intercom and the tour or message targeted at that segment starts for the next session.

## Guidelines

- Never put `INTERCOM_ACCESS_TOKEN` or the Messenger secret in client code; only `app_id` is public.
- Always call `shutdown()` on logout so the next person on a shared browser does not see the previous conversation.
- Pricing is per seat plus usage for the Fin AI agent and changes often; check intercom.com/pricing. Cheaper or self-hosted options are Crisp and Chatwoot.
- Rate limits apply to the API (HTTP 429); batch contact syncs and back off.
- Do not set identity-sensitive attributes (plan, role) from the browser; set them through the signed JWT or the server API.
- Intercom is not the tool for a plain status page or transactional email; use a dedicated service for those.
