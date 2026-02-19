---
name: netlify
description: >-
  Deploy sites and serverless functions with Netlify. Use when a user asks to deploy a JAMstack site, set up continuous deployment from Git, add serverless functions, configure form handling, or set up identity/auth.
license: Apache-2.0
compatibility: 'Any static site, Next.js, Remix, Astro, SvelteKit'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: deployment
  tags:
    - netlify
    - deploy
    - hosting
    - jamstack
    - serverless
---

# Netlify

## Overview
Netlify pioneered JAMstack deployment. Git-connected CI/CD, serverless functions, form handling, identity, and a global CDN.

## Instructions

### Step 1: Deploy
```bash
npm i -g netlify-cli
netlify init     # connect to Git repo
netlify deploy   # preview
netlify deploy --prod
```

### Step 2: Serverless Functions
```typescript
// netlify/functions/hello.ts — Serverless function
export default async (req, context) => {
  return new Response(JSON.stringify({ message: 'Hello' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### Step 3: netlify.toml
```toml
# netlify.toml — Build and redirect configuration
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

## Guidelines
- Free tier includes 100GB bandwidth, 300 build minutes/month.
- Netlify Functions support background execution (up to 15 min).
- Built-in form handling — add `netlify` attribute to any HTML form.
- Deploy Previews for every PR, with unique URLs.
