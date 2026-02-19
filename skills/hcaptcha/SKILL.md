---
name: hcaptcha
description: >-
  Add bot protection with hCaptcha. Use when a user asks to add CAPTCHA to forms, protect against bots, add human verification, or replace reCAPTCHA with a privacy-friendly alternative.
license: Apache-2.0
compatibility: 'Any web framework, React, vanilla JS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - hcaptcha
    - captcha
    - bot-protection
    - security
    - forms
---

# hCaptcha

## Overview
hCaptcha is a privacy-friendly CAPTCHA service — the most popular Google reCAPTCHA alternative. It blocks bots while respecting user privacy (GDPR-compliant by default).

## Instructions

### Step 1: Frontend
```html
<!-- Add to form page -->
<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
<form action="/submit" method="POST">
  <div class="h-captcha" data-sitekey="YOUR_SITE_KEY"></div>
  <button type="submit">Submit</button>
</form>
```

### Step 2: React Integration
```tsx
import HCaptcha from '@hcaptcha/react-hcaptcha'

function Form() {
  const [token, setToken] = useState('')
  return (
    <form onSubmit={() => submitWithToken(token)}>
      <HCaptcha sitekey="YOUR_SITE_KEY" onVerify={setToken} />
      <button disabled={!token}>Submit</button>
    </form>
  )
}
```

### Step 3: Server Verification
```typescript
// Verify token server-side (REQUIRED — never trust client-side only)
async function verifyHCaptcha(token: string): Promise<boolean> {
  const res = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: process.env.HCAPTCHA_SECRET!, response: token }),
  })
  const data = await res.json()
  return data.success
}
```

## Guidelines
- Always verify tokens server-side — client-side verification can be bypassed.
- Free tier: unlimited verifications for most sites.
- Use invisible mode for seamless UX on low-risk forms.
