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
  version: 1.1.0
  category: development
  tags:
    - better-auth
    - authentication
    - oauth
    - sessions
    - typescript
  repository: https://github.com/better-auth/better-auth
---

# Better Auth

## Overview

Better Auth is a framework-agnostic TypeScript authentication library. It handles email/password, OAuth (Google, GitHub, Discord, etc.), magic links, two-factor auth, sessions, and organization/team management. One library, any framework, any database.

## Instructions

### Step 1: Setup

```bash
npm install better-auth
```

Add two variables to `.env` (the secret must be at least 32 characters; generate one with `openssl rand -base64 32`):

```bash
BETTER_AUTH_SECRET=k3Jx9vQ2mLw8sT5nYd0aPzR7uHc4bGfE1oXiVtN6yMs=
BETTER_AUTH_URL=http://localhost:3000
```

Better Auth reads both automatically. To rotate the secret later, use `BETTER_AUTH_SECRETS` so existing data stays valid. The examples below were checked against version 1.7.

### Step 2: Server Configuration

```typescript
// lib/auth.ts — Better Auth server setup
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
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

  // nextCookies must be the last plugin; it lets server actions set cookies
  plugins: [nextCookies()],
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

### Step 5: Create the tables

```bash
npx auth@latest generate   # writes the Prisma/Drizzle schema or SQL for the auth tables
npx auth@latest migrate    # applies it directly (built-in Kysely adapter only)
```

With Prisma or Drizzle, run your ORM's own migration after `generate`.

### Step 6: Protect Routes

Check the session on the server, in every page or route that needs it:

```typescript
// app/dashboard/page.tsx — Next.js server component
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  return <h1>Welcome, {session.user.name}</h1>
}
```

A proxy (Next.js 16, `proxy.ts`) or middleware (`middleware.ts` before 16) can only do a fast redirect: `getSessionCookie(request)` from `better-auth/cookies` checks that a cookie exists, not that it is valid. Treat it as a convenience and keep the real check in the page or route. If you customised the cookie name or prefix in `auth.ts`, pass the same values to `getSessionCookie`.

## Examples

### Example 1: "Add email login and GitHub sign-in to my Next.js app"

Follow Steps 1-6 with `emailAndPassword.enabled: true` and the `github` social provider. In the GitHub OAuth app, set the callback URL to `http://localhost:3000/api/auth/callback/github`. Result: `signIn.email(...)` and `signIn.social({ provider: 'github' })` work from the client, and `/dashboard` redirects to `/login` without a session.

### Example 2: "Use Better Auth in my Hono API with Drizzle and Postgres"

```typescript
// src/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  trustedOrigins: ['https://app.shopmetrics.dev'],
})

// src/index.ts — mount the handler on /api/auth/*
import { Hono } from 'hono'
const app = new Hono()
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
```

Run `npx auth@latest generate`, apply the schema with `drizzle-kit`, then call `auth.api.getSession({ headers: c.req.raw.headers })` in a middleware to protect other routes. When the frontend is on another origin, list it in `trustedOrigins` and set `createAuthClient({ baseURL })` to the API address.

## Guidelines

- Better Auth works with any database via adapters (Prisma, Drizzle, MongoDB, memory) or a direct Kysely-compatible driver (better-sqlite3, pg Pool, mysql2).
- With an ORM adapter, import `betterAuth` from `better-auth/minimal` to shrink the bundle.
- Re-run `npx auth@latest generate` whenever you add a plugin that has its own tables (organization, two-factor, and so on).
- For multi-tenancy, use the organization plugin — handles teams, roles, and invites.
- Alternative to NextAuth/Auth.js — Better Auth is framework-agnostic and more composable.
