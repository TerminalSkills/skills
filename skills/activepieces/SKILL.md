---
name: activepieces
description: >-
  Activepieces is an open-source workflow automation platform with a visual
  builder, 400+ integrations ("pieces"), code steps, branching, loops, and
  webhooks. Use when a user asks to self-host a Zapier or n8n alternative,
  automate workflows with a no-code builder, build a custom integration
  piece, or set up open-source business automation.
license: Apache-2.0
compatibility: "Docker and docker compose (self-hosted), or Activepieces Cloud"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags:
    - activepieces
    - automation
    - workflow
    - no-code
    - open-source
  repository: https://github.com/activepieces/activepieces
---

# Activepieces

## Overview

Activepieces is an open-source workflow automation platform built with TypeScript. It ships a visual flow builder, 400+ pre-built pieces (integrations), MCP server support, code steps, and conditional branching. It is self-hosted for free with no limit on flows or runs, or used as a managed cloud service.

## Instructions

### Self-host with Docker Compose

Generate the two secrets first, then start the stack:

```bash
export AP_ENCRYPTION_KEY=$(openssl rand -hex 16)   # 256-bit key, 32 hex chars
export AP_JWT_SECRET=$(openssl rand -hex 32)
```

```yaml
# docker-compose.yml
services:
  activepieces:
    image: ghcr.io/activepieces/activepieces:latest
    ports: ["8080:80"]
    environment:
      AP_ENGINE_EXECUTABLE_PATH: dist/packages/engine/main.js
      AP_API_URL: http://localhost:8080/api
      AP_FRONTEND_URL: http://localhost:8080
      AP_ENCRYPTION_KEY: ${AP_ENCRYPTION_KEY}
      AP_JWT_SECRET: ${AP_JWT_SECRET}
      AP_POSTGRES_DATABASE: activepieces
      AP_POSTGRES_HOST: postgres
      AP_POSTGRES_PORT: "5432"
      AP_POSTGRES_USERNAME: activepieces
      AP_POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      AP_REDIS_HOST: redis
      AP_REDIS_PORT: "6379"
      AP_EXECUTION_MODE: UNSANDBOXED
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: activepieces
      POSTGRES_USER: activepieces
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
docker compose up -d
```

`AP_ENCRYPTION_KEY` and `AP_JWT_SECRET` must stay the same for the life of the deployment: rotating the encryption key makes every stored connection undecryptable, and rotating the JWT secret signs everyone out.

### Build a flow with a code step

Code steps run Node.js inside the flow:

```typescript
// Inside an Activepieces Code step
export const code = async (inputs: { lineItems: { sku: string; price: number; qty: number }[] }) => {
  const total = inputs.lineItems.reduce((sum, item) => sum + item.price * item.qty, 0)
  return {
    total,
    overThreshold: total > 500,
  }
}
```

### Build a custom piece (integration)

```typescript
// src/index.ts
import { createPiece, PieceAuth } from '@activepieces/pieces-framework'
import { newInvoiceTrigger } from './triggers/new-invoice'
import { createCustomerAction } from './actions/create-customer'

export const billingAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Find this under Settings > API Keys in your billing dashboard',
})

export const billingPiece = createPiece({
  displayName: 'Billing Connector',
  logoUrl: 'https://cdn.example.invalid/billing-logo.png',
  auth: billingAuth,
  authors: ['terminal-skills'],
  triggers: [newInvoiceTrigger],
  actions: [createCustomerAction],
})
```

Scaffold a new piece with `npx activepieces pieces create` from inside a clone of the monorepo (the CLI adds the folder under `packages/pieces/community/`).

## Examples

### Example 1: Self-hosting for a small team

**Request:** "Stand up Activepieces for our team so we stop paying for Zapier."

Run the Docker Compose stack above, visit `http://localhost:8080`, and create the first (owner) account — Activepieces turns the first signup into the platform admin. Invite teammates from Settings > Team once the project exists.

### Example 2: Notify Slack when a large order comes in

**Request:** "When a Shopify order over $500 comes in, post it to our #orders Slack channel."

1. Trigger: Shopify piece, "New Order".
2. Code step: compute `total` and `overThreshold` as in the snippet above.
3. Branch: only continue when `overThreshold` is true.
4. Action: Slack piece, "Send Message to Channel", channel `#orders`, message built from the order fields.

Activepieces runs this on every new Shopify order and only posts when the condition matches.

## Guidelines

- `AP_EXECUTION_MODE: UNSANDBOXED` is fine for a trusted single-tenant self-host; do not expose an unsandboxed instance to untrusted users who can write code steps.
- Store `AP_ENCRYPTION_KEY`, `AP_JWT_SECRET`, and the Postgres password as secrets (Docker secrets, a `.env` file kept out of version control, or your platform's secret manager) — never commit them.
- The official image moved to `ghcr.io/activepieces/activepieces`; older guides pointing at `activepieces/activepieces` on Docker Hub may be stale.
- Activepieces Cloud has a free tier with a limited monthly task allowance; self-hosting removes that limit but means you run and patch Postgres, Redis, and the app yourself.
- For a production deployment behind a reverse proxy, set `AP_FRONTEND_URL` and `AP_API_URL` to the public HTTPS domain, not `localhost`, or OAuth connections and webhooks will break.
- Prefer the built-in pieces over a custom one; only build a custom piece when no existing piece covers the API you need.
