---
name: chatwoot
description: >-
  Self-host customer support with Chatwoot. Use when a user asks to set up
  open-source customer support, add live chat without SaaS costs, build a
  multi-channel inbox, or deploy a free Intercom alternative.
license: Apache-2.0
compatibility: 'Docker, Ruby on Rails, any website'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
    - chatwoot
    - chat
    - support
    - open-source
    - self-hosted
---

# Chatwoot

## Overview

Chatwoot is an open-source customer support platform. Self-hosted Intercom alternative with live chat, shared inbox, multi-channel support (website, email, WhatsApp, Telegram, Twitter), and chatbots. Free when self-hosted.

## Instructions

### Step 1: Docker Deployment

```yaml
# docker-compose.yml — Self-hosted Chatwoot
services:
  chatwoot:
    image: chatwoot/chatwoot:latest
    depends_on: [postgres, redis]
    ports: ["3000:3000"]
    environment:
      RAILS_ENV: production
      SECRET_KEY_BASE: your-secret-key-base
      FRONTEND_URL: https://chat.example.com
      POSTGRES_HOST: postgres
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: chatwoot
      REDIS_URL: redis://redis:6379
      MAILER_SENDER_EMAIL: support@example.com
      SMTP_ADDRESS: smtp.gmail.com
      SMTP_PORT: 587
      SMTP_USERNAME: support@example.com
      SMTP_PASSWORD: app-password
    command: bundle exec rails s -p 3000 -b 0.0.0.0

  sidekiq:
    image: chatwoot/chatwoot:latest
    depends_on: [postgres, redis]
    environment: *chatwoot-env
    command: bundle exec sidekiq

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: chatwoot
      POSTGRES_USER: chatwoot
      POSTGRES_PASSWORD: chatwoot
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

### Step 2: Add Chat Widget

```html
<!-- Add to your website -->
<script>
  (function(d,t) {
    var BASE_URL="https://chat.example.com";
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src=BASE_URL+"/packs/js/sdk.js";
    g.defer = true;
    g.async = true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){
      window.chatwootSDK.run({
        websiteToken: 'YOUR_WEBSITE_TOKEN',
        baseUrl: BASE_URL
      })
    }
  })(document,"script");
</script>
```

### Step 3: API Integration

```typescript
// lib/chatwoot.ts — Create contacts and conversations via API
const CHATWOOT_URL = 'https://chat.example.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN!

// Create contact when user signs up
await fetch(`${CHATWOOT_URL}/api/v1/accounts/1/contacts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    api_access_token: CHATWOOT_TOKEN,
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    custom_attributes: { plan: 'pro', mrr: 49 },
  }),
})
```

## Guidelines

- Self-hosted: completely free, unlimited agents and conversations.
- Cloud: starts at $19/agent/month.
- Supports WhatsApp Business, Telegram, Twitter, email, and website channels in one inbox.
- Use webhooks to sync conversations with your CRM or ticketing system.
