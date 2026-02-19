---
name: turnstile
description: >-
  Add invisible bot protection with Cloudflare Turnstile. Use when a user asks to add CAPTCHA without user interaction, protect forms from bots invisibly, or replace reCAPTCHA with a frictionless alternative.
license: Apache-2.0
compatibility: 'Any web framework'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - turnstile
    - cloudflare
    - captcha
    - bot-protection
    - security
---

# Cloudflare Turnstile

## Overview
Turnstile is Cloudflare's free, privacy-preserving CAPTCHA alternative. It runs invisibly — no puzzles, no checkboxes. Users don't even know it's there.

## Instructions

### Step 1: Frontend
```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<form>
  <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY" data-callback="onVerify"></div>
</form>
<script>function onVerify(token) { document.getElementById('token').value = token }</script>
```

### Step 2: Server Verification
```typescript
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET!, response: token, remoteip: ip }),
  })
  const data = await res.json()
  return data.success
}
```

## Guidelines
- Completely free, unlimited verifications.
- Invisible by default — zero friction for users.
- Works well alongside Cloudflare WAF but doesn't require Cloudflare hosting.
- Always verify server-side — the token is a one-time use proof of humanity.
