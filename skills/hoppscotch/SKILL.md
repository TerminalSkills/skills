---
name: hoppscotch
description: >-
  Test and debug APIs with Hoppscotch. Use when a user asks to test API
  endpoints, debug REST/GraphQL/WebSocket APIs, create API collections,
  or find a Postman alternative that's open-source.
license: Apache-2.0
compatibility: 'Web, Desktop, Self-hosted'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - hoppscotch
    - api-testing
    - postman
    - rest
    - graphql
---

# Hoppscotch

## Overview

Hoppscotch is an open-source API development platform — a lightweight, fast alternative to Postman. It supports REST, GraphQL, WebSocket, SSE, Socket.IO, and MQTT. Available as a web app (hoppscotch.io), desktop app, or self-hosted instance.

## Instructions

### Step 1: Self-Host with Docker

```yaml
# docker-compose.yml — Self-hosted Hoppscotch
services:
  hoppscotch:
    image: hoppscotch/hoppscotch:latest
    ports:
      - "3000:3000"     # main app
      - "3100:3100"     # admin dashboard
      - "3170:3170"     # backend API
    env_file: .env
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: hoppscotch
      POSTGRES_USER: hoppscotch
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Step 2: API Collections with CLI

```bash
# Install CLI
npm install -g @hoppscotch/cli

# Run collection from file
hopp test -e environment.json collection.json

# Run from Hoppscotch instance
hopp test --server https://hoppscotch.mycompany.com --token $TOKEN collection-id
```

### Step 3: Pre-request Scripts

```javascript
// Pre-request script — runs before each request
const token = pw.env.get("AUTH_TOKEN")
const expiry = pw.env.get("TOKEN_EXPIRY")

if (!token || Date.now() > Number(expiry)) {
  const res = await pw.api.post("https://api.example.com/auth/token", {
    body: JSON.stringify({
      client_id: pw.env.get("CLIENT_ID"),
      client_secret: pw.env.get("CLIENT_SECRET"),
    }),
  })
  const data = JSON.parse(res.body)
  pw.env.set("AUTH_TOKEN", data.access_token)
  pw.env.set("TOKEN_EXPIRY", String(Date.now() + data.expires_in * 1000))
}
```

## Guidelines

- Use collections to organize endpoints by feature or service.
- Environment variables keep secrets out of shared collections.
- Self-host for teams — everyone shares collections and environments.
- CLI enables API testing in CI/CD pipelines.
- Hoppscotch is faster than Postman for quick API testing — no account required on hoppscotch.io.
