---
name: activepieces
description: >-
  Build workflow automations with Activepieces. Use when a user asks to
  self-host a Zapier alternative, automate workflows with a visual builder,
  create no-code integrations, or set up open-source business automation.
license: Apache-2.0
compatibility: 'Docker (self-hosted) or cloud'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: automation
  tags:
    - activepieces
    - automation
    - workflow
    - no-code
    - open-source
---

# Activepieces

## Overview

Activepieces is an open-source workflow automation platform — the newest Zapier/n8n alternative. Visual builder, 200+ integrations, code steps, branching, loops, and webhooks. Self-hosted for free with unlimited flows.

## Instructions

### Step 1: Self-Host

```yaml
# docker-compose.yml — Activepieces with PostgreSQL and Redis
services:
  activepieces:
    image: activepieces/activepieces:latest
    ports: ["8080:80"]
    environment:
      AP_ENGINE_EXECUTABLE_PATH: dist/packages/engine/main.js
      AP_POSTGRES_DATABASE: activepieces
      AP_POSTGRES_HOST: postgres
      AP_POSTGRES_PORT: "5432"
      AP_POSTGRES_USERNAME: activepieces
      AP_POSTGRES_PASSWORD: activepieces
      AP_REDIS_HOST: redis
      AP_ENCRYPTION_KEY: your-32-char-encryption-key-here
      AP_JWT_SECRET: your-jwt-secret-here
      AP_FRONTEND_URL: https://auto.example.com

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: activepieces
      POSTGRES_USER: activepieces
      POSTGRES_PASSWORD: activepieces
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

### Step 2: Code Step

```typescript
// Inside Activepieces Code step
export const code = async (inputs) => {
  const { data } = inputs
  return {
    processed: data.items.map(item => ({
      name: item.name.toUpperCase(),
      total: item.price * item.quantity,
    })),
    grandTotal: data.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  }
}
```

### Step 3: Custom Piece (Integration)

```typescript
// pieces/my-app/src/index.ts — Build custom integration
import { createPiece } from '@activepieces/pieces-framework'
import { newOrderTrigger } from './triggers/new-order'
import { createInvoiceAction } from './actions/create-invoice'

export const myApp = createPiece({
  displayName: 'My App',
  auth: PieceAuth.SecretText({ displayName: 'API Key' }),
  triggers: [newOrderTrigger],
  actions: [createInvoiceAction],
})
```

## Guidelines

- Self-hosted: completely free, unlimited flows and executions.
- Cloud: free tier with 1,000 tasks/month.
- Newer than n8n — cleaner UI, growing fast, but fewer integrations.
- TypeScript-first code steps and custom pieces.
