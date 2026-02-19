---
name: ghost-cms
description: >-
  Build blogs and publications with Ghost CMS. Use when a user asks to set up
  a blog, create a newsletter, build a membership site, self-host a CMS, or
  use a headless CMS with built-in newsletter support.
license: Apache-2.0
compatibility: 'Node.js 18+, Docker'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cms
  tags:
    - ghost
    - cms
    - blog
    - newsletter
    - membership
---

# Ghost

## Overview

Ghost is an open-source CMS for blogs, newsletters, and membership sites. It includes a rich editor, built-in email newsletters, member subscriptions (free and paid), SEO tools, and a headless Content API. Used by Mozilla, Apple, Cloudflare for their blogs.

## Instructions

### Step 1: Self-Hosted Deployment

```bash
# Docker (recommended)
docker run -d --name ghost \
  -p 2368:2368 \
  -v ghost_content:/var/lib/ghost/content \
  -e url=https://blog.example.com \
  ghost:latest

# Or with Docker Compose
```

```yaml
# docker-compose.yml — Ghost with MySQL
services:
  ghost:
    image: ghost:latest
    ports: ["2368:2368"]
    environment:
      url: https://blog.example.com
      database__client: mysql
      database__connection__host: mysql
      database__connection__database: ghost
      database__connection__user: ghost
      database__connection__password: ghostpass
    volumes: [ghost_content:/var/lib/ghost/content]
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: ghostpass
    volumes: [mysql_data:/var/lib/mysql]
volumes:
  ghost_content:
  mysql_data:
```

### Step 2: Content API (Headless Mode)

```typescript
// lib/ghost.ts — Fetch content from Ghost API for a custom frontend
const GHOST_URL = 'https://blog.example.com'
const GHOST_KEY = 'your-content-api-key'    // Settings → Integrations

export async function getPosts(limit = 10) {
  const res = await fetch(`${GHOST_URL}/ghost/api/content/posts/?key=${GHOST_KEY}&limit=${limit}&include=tags,authors`)
  const { posts } = await res.json()
  return posts
}

export async function getPost(slug: string) {
  const res = await fetch(`${GHOST_URL}/ghost/api/content/posts/slug/${slug}/?key=${GHOST_KEY}&include=tags,authors`)
  const { posts } = await res.json()
  return posts[0]
}
```

### Step 3: Membership and Newsletters

Ghost includes built-in membership with:
- Free and paid tiers
- Stripe integration for payments
- Newsletter sending (built-in email)
- Member analytics (opens, clicks)

Configure in Ghost Admin → Settings → Membership.

## Guidelines

- Ghost Pro (hosted) starts at $9/month. Self-hosting is free but needs a server with Node.js 18+ and MySQL.
- Use the Content API for headless mode (read-only). Admin API for programmatic content management.
- Ghost's built-in newsletter replaces Mailchimp/Substack for most use cases.
- SEO features (structured data, meta tags, sitemaps) are built in — no plugins needed.
