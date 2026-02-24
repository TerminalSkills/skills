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
  version: 1.0.0
  category: business
  tags:
    - crisp
    - chat
    - support
    - helpdesk
    - live-chat
---

# Crisp

## Overview

Crisp is an all-in-one customer messaging platform: live chat widget, shared inbox, knowledge base, chatbot, and CRM. Free tier supports 2 operators with unlimited conversations.

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

```tsx
// components/CrispChat.tsx — Crisp in React/Next.js
'use client'
import { useEffect } from 'react'

export function CrispChat() {
  useEffect(() => {
    window.$crisp = []
    window.CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_ID!
    const s = document.createElement('script')
    s.src = 'https://client.crisp.chat/l.js'
    s.async = true
    document.head.appendChild(s)
  }, [])
  return null
}

// Set user data when they log in
window.$crisp.push(['set', 'user:email', ['john@example.com']])
window.$crisp.push(['set', 'user:nickname', ['John']])
window.$crisp.push(['set', 'session:data', [['plan', 'pro'], ['mrr', '49']]])
```

### Step 3: API Integration

```typescript
// lib/crisp.ts — Send messages and manage conversations via API
const CRISP_ID = process.env.CRISP_IDENTIFIER!
const CRISP_KEY = process.env.CRISP_KEY!
const WEBSITE_ID = process.env.CRISP_WEBSITE_ID!

// Send a message to a conversation
await fetch(`https://api.crisp.chat/v1/website/${WEBSITE_ID}/conversation/${sessionId}/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
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

## Guidelines

- Free tier: 2 operators, unlimited conversations, chat widget, mobile apps.
- Pro ($25/mo): chatbot, knowledge base, audio/video calls, integrations.
- Use session data to pass user context (plan, MRR, last action) to support agents.
- Crisp chatbot can handle FAQs automatically before routing to humans.
