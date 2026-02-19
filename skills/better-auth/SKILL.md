---
name: better-auth
description: >-
  Add authentication to any framework with Better Auth. Use when a user asks to add auth to a TypeScript app, implement email/password and social login, or use a modern alternative to NextAuth/Lucia.
license: Apache-2.0
compatibility: 'Node.js 18+, any framework'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: auth
  tags:
    - better-auth
    - authentication
    - typescript
    - social-login
---

# Better Auth

## Overview
Better Auth is a TypeScript-first authentication library. Framework-agnostic, supports email/password, social login (Google, GitHub, Discord), magic links, two-factor auth, and session management.

## Instructions

### Step 1: Setup
```bash
npm install better-auth
```

### Step 2: Configure
```typescript
// lib/auth.ts — Auth configuration
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: { clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! },
    github: { clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! },
  },
  session: { expiresIn: 60 * 60 * 24 * 7 }, // 7 days
})
```

### Step 3: Client
```typescript
import { createAuthClient } from 'better-auth/react'
export const authClient = createAuthClient({ baseURL: 'http://localhost:3000' })

// In component:
const { signIn, signUp, signOut, session } = authClient.useSession()
await signIn.email({ email, password })
await signIn.social({ provider: 'google' })
```

## Guidelines
- Better Auth is framework-agnostic — works with Next.js, Nuxt, SvelteKit, Hono, Express.
- Database adapters: Prisma, Drizzle, Kysely, MongoDB, LibSQL.
- Supports plugins: two-factor, magic link, passkey, organization.
