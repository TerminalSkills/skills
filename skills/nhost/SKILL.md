---
name: nhost
category: Backend & Infrastructure
tags: [baas, graphql, hasura, postgres, auth, storage, serverless]
version: 1.0.0
author: terminal-skills
---

# Nhost — Open-Source Firebase Alternative with GraphQL

You are an expert in Nhost, the open-source backend platform built on PostgreSQL, Hasura GraphQL, and serverless functions. You help developers set up authentication, database, file storage, and real-time subscriptions with auto-generated GraphQL APIs and a developer-friendly SDK.

## Core Capabilities

### Project Setup

```bash
# Install Nhost CLI
npm install -g nhost

# Create a new project
nhost init my-app
cd my-app

# Start local development (Docker-based)
nhost up
# Dashboard: http://localhost:1337
# GraphQL: http://localhost:1337/v1/graphql
# Auth: http://localhost:1337/v1/auth
```

### Authentication

```typescript
// src/lib/nhost.ts — Nhost client configuration
import { NhostClient } from "@nhost/nhost-js";

export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN!,
  region: process.env.NEXT_PUBLIC_NHOST_REGION!,
});

// Sign up with email
async function signUp(email: string, password: string) {
  const { session, error } = await nhost.auth.signUp({
    email,
    password,
    options: {
      displayName: "New User",
      metadata: { plan: "free" },
    },
  });
  if (error) throw new Error(error.message);
  return session;
}

// Sign in with email
async function signIn(email: string, password: string) {
  const { session, error } = await nhost.auth.signIn({ email, password });
  if (error) throw new Error(error.message);
  return session;
}

// OAuth (Google, GitHub, etc.)
async function signInWithGoogle() {
  const { providerUrl } = await nhost.auth.signIn({
    provider: "google",
  });
  window.location.href = providerUrl!;
}

// Magic link (passwordless)
async function sendMagicLink(email: string) {
  await nhost.auth.signIn({ email });
}

// Auth state
nhost.auth.onAuthStateChanged((event, session) => {
  console.log(`Auth event: ${event}`, session?.user?.email);
});
```

### GraphQL API (Auto-Generated from PostgreSQL)

```typescript
// src/lib/graphql.ts — Query the auto-generated GraphQL API
import { gql } from "graphql-tag";

// Nhost auto-generates GraphQL from your PostgreSQL tables
// Create a table "posts" in the dashboard → instant GraphQL CRUD

// Query posts
const GET_POSTS = gql`
  query GetPosts($limit: Int!, $offset: Int!) {
    posts(
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
      where: { published: { _eq: true } }
    ) {
      id
      title
      content
      created_at
      author {
        displayName
        avatarUrl
      }
    }
    posts_aggregate(where: { published: { _eq: true } }) {
      aggregate {
        count
      }
    }
  }
`;

// Insert a post
const CREATE_POST = gql`
  mutation CreatePost($title: String!, $content: String!) {
    insert_posts_one(object: {
      title: $title
      content: $content
      published: false
    }) {
      id
      title
    }
  }
`;

// Real-time subscription
const SUBSCRIBE_POSTS = gql`
  subscription OnNewPosts {
    posts(
      order_by: { created_at: desc }
      limit: 10
      where: { published: { _eq: true } }
    ) {
      id
      title
      created_at
      author {
        displayName
      }
    }
  }
`;

// Execute queries
async function getPosts(page = 1, pageSize = 20) {
  const { data, error } = await nhost.graphql.request(GET_POSTS, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  if (error) throw error;
  return data;
}
```

### File Storage

```typescript
// Upload and manage files via Nhost Storage
async function uploadAvatar(file: File, userId: string): Promise<string> {
  const { fileMetadata, error } = await nhost.storage.upload({
    file,
    bucketId: "avatars",
    name: `${userId}/avatar.${file.name.split('.').pop()}`,
  });
  if (error) throw new Error(error.message);
  return nhost.storage.getPublicUrl({ fileId: fileMetadata!.id });
}

async function uploadDocument(file: File) {
  const { fileMetadata, error } = await nhost.storage.upload({
    file,
    bucketId: "documents",
  });
  if (error) throw new Error(error.message);

  // Get a presigned URL (for private files)
  const { presignedUrl } = await nhost.storage.getPresignedUrl({
    fileId: fileMetadata!.id,
  });
  return presignedUrl;
}
```

### Serverless Functions

```typescript
// nhost/functions/send-welcome-email.ts — Serverless function
import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, name } = req.body;

  await sendEmail({
    to: email,
    subject: `Welcome, ${name}!`,
    html: `<h1>Welcome to our platform, ${name}!</h1>`,
  });

  res.json({ success: true });
}

// Called at: https://your-app.nhost.run/v1/functions/send-welcome-email
```

### Hasura Permissions (Row-Level Security)

```yaml
# Configure in Hasura Console or via metadata
# nhost/metadata/databases/default/tables/public_posts.yaml
table:
  name: posts
  schema: public
select_permissions:
  - role: user
    permission:
      columns: [id, title, content, created_at, published, author_id]
      filter:
        _or:
          - published: { _eq: true }
          - author_id: { _eq: X-Hasura-User-Id }
insert_permissions:
  - role: user
    permission:
      columns: [title, content, published]
      set:
        author_id: X-Hasura-User-Id
update_permissions:
  - role: user
    permission:
      columns: [title, content, published]
      filter:
        author_id: { _eq: X-Hasura-User-Id }
```

## Installation

```bash
# Client SDK
npm install @nhost/nhost-js

# React integration
npm install @nhost/react @nhost/react-apollo

# CLI
npm install -g nhost
```

## Best Practices

1. **PostgreSQL = your database** — Nhost uses real PostgreSQL; use migrations, write raw SQL when needed, use Hasura for the GraphQL layer
2. **Permissions via Hasura** — Define row-level security in Hasura; every table needs permissions before it's accessible via GraphQL
3. **Real-time with subscriptions** — Use GraphQL subscriptions for live data; Nhost/Hasura handles WebSocket connections automatically
4. **Local development first** — `nhost up` runs everything locally with Docker; match production exactly in development
5. **Migrations for schema changes** — Use Hasura migrations (auto-generated) to version database changes; apply in CI/CD
6. **Storage buckets for organization** — Create separate buckets for avatars, documents, public assets; set permissions per bucket
7. **Serverless for custom logic** — Use Nhost Functions for webhooks, email sending, and business logic that doesn't fit in Hasura
8. **Self-host for control** — Nhost is open-source; self-host with Docker Compose for full infrastructure control
