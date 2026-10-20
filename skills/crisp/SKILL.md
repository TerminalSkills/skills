---
name: crisp
description: >-
  Add live chat and customer support with Crisp. Use when a user asks to add
  a chat widget, implement live customer support, set up a help desk, create
  a knowledge base, or add a chatbot to a website.
license: Apache-2.0
compatibility: 'Any website, React, Vue, mobile apps'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  repository: https://github.com/crisp-im/crisp-sdk-web
  tags:
    - crisp
    - chat
    - support
    - helpdesk
    - live-chat
---

# Crisp

## Overview

Crisp is an all-in-one customer messaging platform: live chat widget, shared inbox, knowledge base, chatbot, and CRM. The Free plan includes a website chat widget, a shared inbox and 2 seats; paid plans are flat per workspace (Mini $45, Essentials $95, Plus $295 per month in October 2026, with a 14-day trial of all features).

## Instructions

### Step 1: Add Chat Widget

```html
<!-- Add to your website — basic installation -->
<script type="text/javascript">
  window.$crisp=[];window.CRISP_WEBSITE_ID="YOUR_WEBSITE_ID";
  (function(){d=document;s=d.createElement("script");
  s.src="https://client.crisp.chat/l.js";
  s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
</script>
```

### Step 2: React Integration

Use the official wrapper `crisp-sdk-web` (1.2.x), which injects the script and gives typed methods:

```bash
npm install crisp-sdk-web
```

```tsx
// components/CrispChat.tsx: Crisp in React/Next.js
'use client'
import { useEffect } from 'react'
import { Crisp } from 'crisp-sdk-web'

export function CrispChat({ email, nickname, plan }: { email?: string; nickname?: string; plan?: string }) {
  useEffect(() => {
    Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID!)
    if (email) Crisp.user.setEmail(email)
    if (nickname) Crisp.user.setNickname(nickname)
    if (plan) Crisp.session.setData({ plan })
  }, [email, nickname, plan])
  return null
}
```

Without the wrapper, the plain `$crisp` array takes the same data. Note the double nesting of `session:data`:

```js
window.$crisp.push(['set', 'user:email', ['maria.lopez@northwind.io']])
window.$crisp.push(['set', 'user:nickname', ['Maria Lopez']])
window.$crisp.push(['set', 'session:data', [[['plan', 'pro'], ['mrr', '49']]]])
window.$crisp.push(['set', 'session:event', [[['plan_upgraded', { plan: 'pro' }, 'green']]]])
```

To start chat only after login, call `Crisp.configure(id, { autoload: false })` and `Crisp.load()` later. To tie a conversation to a user across devices, call `Crisp.setTokenId(...)` with a unique secret per user before loading, and clear it on logout.

### Step 3: API Integration

```typescript
// lib/crisp.ts — Send messages and manage conversations via API
// Website token keypair: Settings > Workspace Settings > Advanced configuration > API Token
const CRISP_ID = process.env.CRISP_TOKEN_ID!
const CRISP_KEY = process.env.CRISP_TOKEN_KEY!
const WEBSITE_ID = process.env.CRISP_WEBSITE_ID!

// Send a message to a conversation
await fetch(`https://api.crisp.chat/v1/website/${WEBSITE_ID}/conversation/${sessionId}/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Crisp-Tier': 'website',   // required for website tokens
    Authorization: `Basic ${Buffer.from(`${CRISP_ID}:${CRISP_KEY}`).toString('base64')}`,
  },
  body: JSON.stringify({
    type: 'text',
    from: 'operator',
    origin: 'chat',
    content: 'Thanks for reaching out! Let me help you.',
  }),
})
```

## Examples

### Example 1: Chat widget with the customer's plan

Request: "Add Crisp to our Next.js dashboard and show support which plan the user is on."

Install `crisp-sdk-web`, render `<CrispChat email={user.email} nickname={user.name} plan={user.plan} />` in the root layout, and set `NEXT_PUBLIC_CRISP_WEBSITE_ID`. In the Crisp inbox the conversation shows the visitor's email and the `plan` session data.

### Example 2: Reply from a script

Request: "Post an operator reply into conversation session_1b2c3d."

Run the Step 3 `fetch` with `WEBSITE_ID` from `CRISP_WEBSITE_ID`. A successful call returns HTTP 200 with a JSON body whose `error` is `false`, and the message appears in the conversation as an operator message. Website tokens allow 10,000 requests a day for one workspace.

## Guidelines

- The Free plan has 2 seats, the chat widget, shared inbox and mobile apps, with no AI credits. The shared email inbox arrives on Mini; the chatbot builder, knowledge base and omnichannel inbox start on Essentials; check https://crisp.chat/en/pricing/ before promising a feature.
- Use session data to pass user context (plan, MRR, last action) to support agents.
- Identity verification: sign the user's email with HMAC-SHA256 using your verification secret on your backend only, never in the browser (needs Mini or higher).
- Keep the token keypair in environment variables; if it leaks, regenerate it in the workspace settings. Plugin tokens (Marketplace) are for multi-workspace integrations and use a different `X-Crisp-Tier`.
