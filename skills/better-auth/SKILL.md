---
name: better-auth
description: >-
  Add authentication to any framework with Better Auth. Use when a user asks
  to implement auth, set up login/signup, add OAuth providers, implement
  session management, or choose between auth libraries for TypeScript apps.
license: Apache-2.0
compatibility: 'Next.js, Nuxt, SvelteKit, Astro, Express, Hono'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - better-auth
    - authentication
    - oauth
    - sessions
    - typescript
---

# Better Auth

## Overview

Better Auth is a framework-agnostic TypeScript authentication library. It handles email/password, OAuth (Google, GitHub, Discord, etc.), magic links, two-factor auth, sessions, and organization/team management. One library, any framework, any database.

## Instructions

### Step 1: Setup

```bash
npm install better-auth
```

### Step 2: Server Configuration

```typescript
// lib/auth.ts — Better Auth server setup
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,        // 7 days
    updateAge: 60 * 60 * 24,              // refresh every 24h
  },

  // Plugins for additional features
  plugins: [],
})
```

### Step 3: API Route

```typescript
// app/api/auth/[...all]/route.ts — Next.js API handler
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

### Step 4: Client SDK

```typescript
// lib/auth-client.ts — Client-side auth
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
})

// React hooks
export const { useSession, signIn, signUp, signOut } = authClient
```

```tsx
// components/LoginForm.tsx — Login with email or OAuth
import { signIn } from '@/lib/auth-client'

export function LoginForm() {
  return (
    <div>
      <form onSubmit={async (e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        await signIn.email({
          email: form.get('email') as string,
          password: form.get('password') as string,
        })
      }}>
        <input name="email" type="email" required />
        <input name="password" type="password" required />
        <button type="submit">Sign In</button>
      </form>

      <button onClick={() => signIn.social({ provider: 'google' })}>
        Continue with Google
      </button>
      <button onClick={() => signIn.social({ provider: 'github' })}>
        Continue with GitHub
      </button>
    </div>
  )
}
```

### Step 5: Protect Routes

```typescript
// middleware.ts — Next.js route protection
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session
}

// In a server component or page
const session = await getSession()
if (!session) redirect('/login')
```

## Guidelines

- Better Auth works with any database via adapters (Prisma, Drizzle, Kysely, raw SQL).
- Run `npx better-auth generate` to create database migrations for auth tables.
- For multi-tenancy, use the organization plugin — handles teams, roles, and invites.
- Alternative to NextAuth/Auth.js — Better Auth is framework-agnostic and more composable.
