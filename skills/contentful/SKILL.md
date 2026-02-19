---
name: contentful
description: >-
  Manage content with Contentful headless CMS. Use when a user asks to set up a headless CMS, manage content via API, build a content-driven website, or integrate structured content into an app.
license: Apache-2.0
compatibility: 'Any platform via REST/GraphQL API'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cms
  tags:
    - contentful
    - cms
    - headless
    - api
    - content
---

# Contentful

## Overview
Contentful is a cloud-based headless CMS. Define content models (schemas), create content in the web editor, and deliver it via REST and GraphQL APIs to any frontend.

## Instructions

### Step 1: Setup
```bash
npm install contentful
```

### Step 2: Fetch Content
```typescript
// lib/contentful.ts — Content delivery client
import { createClient } from 'contentful'

const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,
})

export async function getBlogPosts() {
  const entries = await client.getEntries({ content_type: 'blogPost', order: ['-sys.createdAt'], limit: 10 })
  return entries.items.map(item => ({ id: item.sys.id, title: item.fields.title, body: item.fields.body, slug: item.fields.slug }))
}

export async function getPostBySlug(slug: string) {
  const entries = await client.getEntries({ content_type: 'blogPost', 'fields.slug': slug, limit: 1 })
  return entries.items[0]
}
```

### Step 3: Webhooks
Set up webhooks in Contentful dashboard to trigger rebuilds on content changes (Vercel deploy hooks, Netlify build hooks).

## Guidelines
- Free tier: 1 space, 5 users, 25K records.
- Use Preview API for draft content, Delivery API for published content.
- Content model changes should be done via migration scripts for reproducibility.
- For self-hosted alternatives, consider Directus or Strapi.
