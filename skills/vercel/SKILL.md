---
name: vercel
description: >-
  Deploy frontend and fullstack apps with Vercel. Use when a user asks to deploy Next.js, host static sites, set up preview deployments, configure serverless functions, or add custom domains.
license: Apache-2.0
compatibility: 'Next.js, React, Vue, Svelte, static sites'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: deployment
  tags:
    - vercel
    - deploy
    - hosting
    - nextjs
    - serverless
---

# Vercel

## Overview
Vercel deploys frontend and fullstack apps with zero config. Preview deployments on every PR, edge functions, global CDN. Built by the Next.js team.

## Instructions

### Step 1: Deploy
```bash
npm i -g vercel
vercel          # deploy preview
vercel --prod   # deploy production
```

### Step 2: Environment Variables
```bash
vercel env add DATABASE_URL production
vercel env pull    # pull to local .env
```

### Step 3: Serverless Functions
```typescript
// api/hello.ts — Auto-detected serverless function
export default function handler(req, res) {
  res.json({ message: 'Hello from Vercel' })
}
```

### Step 4: Edge Middleware
```typescript
// middleware.ts — Runs at the edge before every request
import { NextResponse } from 'next/server'
export function middleware(request) {
  if (request.geo?.country === 'DE') return NextResponse.redirect(new URL('/de', request.url))
}
```

## Guidelines
- Auto-detects framework (Next.js, Nuxt, SvelteKit, Astro).
- Every PR gets a unique preview URL.
- Serverless functions: 60s timeout (Hobby), 300s (Pro).
- Free tier: 100GB bandwidth, 100 deployments/day.
