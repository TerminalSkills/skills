---
name: intercom
description: >-
  Add customer messaging and support with Intercom. Use when a user asks to add
  in-app messaging, build a help center, set up customer onboarding flows,
  create product tours, or implement a support ticketing system.
license: Apache-2.0
compatibility: 'Any web app, iOS, Android'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: communication
  tags:
    - intercom
    - chat
    - support
    - onboarding
    - messaging
---

# Intercom

## Overview

Intercom is a customer messaging platform for support, onboarding, and engagement. Includes live chat, help center, product tours, chatbots, and a shared inbox. Industry standard for SaaS customer communication.

## Instructions

### Step 1: Install Messenger

```typescript
// lib/intercom.ts — Initialize Intercom in a web app
export function initIntercom(user?: { id: string; email: string; name: string }) {
  window.Intercom('boot', {
    app_id: process.env.NEXT_PUBLIC_INTERCOM_APP_ID,
    ...(user && {
      user_id: user.id,
      email: user.email,
      name: user.name,
      created_at: Math.floor(Date.now() / 1000),
    }),
  })
}

// Update when user navigates (SPA)
window.Intercom('update', { last_request_at: Math.floor(Date.now() / 1000) })

// Track events for targeting
window.Intercom('trackEvent', 'completed-onboarding', {
  plan: 'pro',
  team_size: 5,
})
```

### Step 2: React Component

```tsx
// components/IntercomProvider.tsx — React wrapper
'use client'
import { useEffect } from 'react'
import { useUser } from '@/hooks/useUser'

export function IntercomProvider({ children }) {
  const { user } = useUser()

  useEffect(() => {
    // Load Intercom script
    const script = document.createElement('script')
    script.innerHTML = `(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/${process.env.NEXT_PUBLIC_INTERCOM_APP_ID}';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};l();}})();`
    document.body.appendChild(script)

    if (user) {
      window.Intercom('boot', {
        app_id: process.env.NEXT_PUBLIC_INTERCOM_APP_ID,
        user_id: user.id,
        email: user.email,
        name: user.name,
      })
    }
  }, [user])

  return children
}
```

### Step 3: Server-Side API

```typescript
// lib/intercom-api.ts — Server-side Intercom operations
const INTERCOM_TOKEN = process.env.INTERCOM_ACCESS_TOKEN!

// Create or update a user
await fetch('https://api.intercom.io/contacts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${INTERCOM_TOKEN}`,
  },
  body: JSON.stringify({
    role: 'user',
    external_id: userId,
    email: 'user@example.com',
    name: 'John Doe',
    custom_attributes: { plan: 'pro', mrr: 49, company_size: 10 },
  }),
})

// Send a message
await fetch('https://api.intercom.io/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${INTERCOM_TOKEN}`,
  },
  body: JSON.stringify({
    from: { type: 'admin', id: 'admin_id' },
    to: { type: 'user', id: 'user_id' },
    message_type: 'inapp',
    body: 'Hey! How are you finding the new dashboard?',
  }),
})
```

## Guidelines

- Intercom starts at $39/seat/month — expensive but full-featured.
- Use custom attributes to segment users (plan, MRR, feature usage).
- Product tours and onboarding flows reduce support tickets significantly.
- For budget alternative, consider Crisp (free tier) or Chatwoot (open-source).
