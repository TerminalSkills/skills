---
name: next-auth
description: >-
  Add authentication to Next.js with NextAuth.js (Auth.js). Use when a user
  asks to add login to Next.js, implement OAuth, set up session management,
  protect routes, or integrate social login providers.
license: Apache-2.0
compatibility: 'Next.js 13+, SvelteKit, Express'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - nextauth
    - auth
    - oauth
    - nextjs
    - sessions
---

# NextAuth.js (Auth.js)

## Overview

NextAuth.js (rebranded as Auth.js) is the standard authentication solution for Next.js. It supports 80+ OAuth providers (Google, GitHub, Discord, etc.), email/magic link login, credentials-based auth, and database sessions. Works with App Router and Server Components.

## Instructions

### Step 1: Setup

```bash
npm install next-auth @auth/prisma-adapter
```

### Step 2: Configuration

```typescript
// auth.ts — NextAuth configuration
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './lib/db'
import bcrypt from 'bcryptjs'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user?.hashedPassword) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.hashedPassword
        )
        if (!valid) return null

        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],

  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      session.user.role = user.role
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },
})
```

### Step 3: API Route

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

### Step 4: Protect Routes

```typescript
// middleware.ts — Protect routes with middleware
import { auth } from './auth'

export default auth((req) => {
  const isLoggedIn = !!req.auth

  if (req.nextUrl.pathname.startsWith('/dashboard') && !isLoggedIn) {
    return Response.redirect(new URL('/login', req.url))
  }
})

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
}
```

```tsx
// app/dashboard/page.tsx — Server component with auth
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <h1>Welcome, {session.user.name}</h1>
}
```

### Step 5: Client Components

```tsx
// components/UserMenu.tsx — Client-side auth
'use client'
import { useSession, signIn, signOut } from 'next-auth/react'

export function UserMenu() {
  const { data: session, status } = useSession()

  if (status === 'loading') return <Skeleton />

  if (!session) {
    return (
      <div>
        <button onClick={() => signIn('google')}>Sign in with Google</button>
        <button onClick={() => signIn('github')}>Sign in with GitHub</button>
      </div>
    )
  }

  return (
    <div>
      <img src={session.user.image} alt={session.user.name} />
      <span>{session.user.name}</span>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}
```

## Guidelines

- Use database sessions (PrismaAdapter) for production — JWT sessions can't be revoked.
- Credentials provider requires manual password hashing — use bcrypt with salt rounds ≥ 10.
- Protect API routes with `auth()` in Route Handlers, pages with `auth()` in Server Components.
- For role-based access, extend the session callback to include user role.
- NextAuth v5 (Auth.js) is the latest — use `next-auth@beta` for App Router support.
