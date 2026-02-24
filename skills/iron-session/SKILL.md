---
name: iron-session
description: >-
  Manage encrypted sessions in Next.js with iron-session. Use for session
  auth, encrypted cookies, or stateless sessions without a database.
license: Apache-2.0
compatibility: 'Next.js 13+, Express'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: auth
  tags: [iron-session, sessions, nextjs, cookies, auth]
---

# iron-session

## Overview

iron-session stores session data in encrypted, signed cookies. No database needed. AES-256 encryption + HMAC-SHA256 signing. Works with Next.js App Router and Express.

## Instructions

### Step 1: Configuration

```typescript
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

interface SessionData { userId?: string; role?: string; isLoggedIn: boolean }

const options = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'myapp_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' as const, maxAge: 604800 },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options)
}
```

### Step 2: Login/Logout

```typescript
// POST /api/auth/login
const session = await getSession()
session.userId = user.id
session.role = user.role
session.isLoggedIn = true
await session.save()

// POST /api/auth/logout
const session = await getSession()
session.destroy()
```

### Step 3: Protected Pages

```typescript
export default async function DashboardPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')
  return <Dashboard userId={session.userId!} />
}
```

## Guidelines

- SESSION_SECRET: min 32 chars. Generate with `openssl rand -hex 32`.
- Cookie limit is 4KB — store IDs only, not large objects.
- Stateless = no revocation by default. Add version check for revocation.
- Always httpOnly + secure in production.
