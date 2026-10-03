---
name: iron-session
description: >-
  Stores login sessions in encrypted, signed cookies with iron-session, so a Next.js or Node.js app needs no session database. Use when a user asks for cookie-based session auth, stateless sessions, a login and logout flow with the App Router, protecting pages with a session, rotating the session password, or upgrading iron-session from v8 to v9.
license: Apache-2.0
compatibility: 'iron-session 9.x needs Node.js 22.13 or newer (ESM-only). Works with Next.js App Router and API routes, Express, Hono, Bun, Deno and Cloudflare Workers.'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: [iron-session, sessions, nextjs, cookies, auth]
  repository: https://github.com/vvo/iron-session
---

# iron-session

## Overview

iron-session keeps the session data inside an encrypted and signed cookie. The server decrypts it on each request, so no database, Redis or network call is involved. The same idea as Rails cookie sessions.

Version 9 (current: 9.0.1) needs Node.js 22.13+ and is ESM-only; `require()` still works on Node 22.13+. On older Node, install `iron-session@8`. v9 reads v8 cookies and v8 reads v9 cookies, so a deploy can be rolled back without signing users out.

Two changes when upgrading from v8:

- Store timestamps as numbers (`Date.now()`), not `Date` objects. v9 throws on a `Date` and names the field.
- Session reads are typed `Partial<T>`: a first visit, an expired cookie or a destroyed session is an empty object. Write `session.user?.id`, not `session.user.id`.

## Instructions

### Step 1: Install and configure

```bash
npm install iron-session
openssl rand -base64 32     # value for SESSION_PASSWORD (at least 32 characters)
```

```typescript
// lib/session.ts
import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: string
  role?: 'admin' | 'member'
  loggedInAt?: number          // timestamp, not a Date
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD!,
  cookieName: 'shopfront_session',
  ttl: 60 * 60 * 24 * 7,       // seal lifetime in seconds (default is 14 days)
  cookieOptions: { secure: process.env.NODE_ENV === 'production' },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
```

`password` and `cookieName` are the only required options. The defaults for `cookieOptions` are already `httpOnly: true`, `sameSite: 'lax'`, `path: '/'` and `secure: true`; the cookie `maxAge` follows `ttl` (minus 60 seconds), so you rarely set it yourself.

### Step 2: Log in and out

```typescript
// app/actions/auth.ts
'use server'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export async function login(formData: FormData) {
  const user = await verifyCredentials(
    String(formData.get('email')),
    String(formData.get('password')),
  )
  if (!user) return { error: 'Wrong email or password' }

  const session = await getSession()
  session.userId = user.id
  session.role = user.role
  session.loggedInAt = Date.now()
  await session.save()          // must be awaited before the response is sent
  redirect('/dashboard')
}

export async function logout() {
  const session = await getSession()
  session.destroy()             // synchronous; removes the cookie
  redirect('/login')
}
```

`destroy()` is terminal: a `save()` after it is ignored, and writing fields back and then saving throws.

### Step 3: Protect data where it is read

```tsx
// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  const orders = await db.order.findMany({ where: { userId: session.userId } })
  return <OrderList orders={orders} />
}
```

Check the session in each Server Component, Server Action or Route Handler that touches protected data. A layout does not protect the pages under it, and neither does a redirect in `proxy.ts`.

### Other runtimes

```typescript
// Express / Node http / Next.js API routes
const session = await getIronSession<SessionData>(req, res, sessionOptions)

// Hono, Bun, Deno, Workers: any web-standard Request/Response
import { getIronSession, webCookies } from 'iron-session'
const session = await getIronSession<SessionData>(webCookies(request, response), sessionOptions)

// Next.js proxy.ts (middleware.ts before Next 16): needs the adapter or the cookie is not saved
import { getIronSession, nextProxyCookies } from 'iron-session'
const response = NextResponse.next()
const session = await getIronSession<SessionData>(nextProxyCookies(request, response), sessionOptions)
```

### Rotating the password and logging problems

```typescript
password: { 2: process.env.SESSION_PASSWORD_NEW!, 1: process.env.SESSION_PASSWORD_OLD! },
onUnsealError: (reason, error) => {
  if (reason !== 'expired') console.warn('session cookie rejected', reason, error)
},
```

New cookies use the highest-numbered key; old cookies still open with the old one. `reason` is `"expired"`, `"invalid"` or `"unknown-password"`. A burst of `unknown-password` usually means a rotation went wrong.

## Examples

### Example 1: Add login to a Next.js 16 app

**User prompt:** "Add email and password login to my App Router app and keep the user logged in for a week, with no database for sessions."

Install `iron-session`, put `SESSION_PASSWORD` (from `openssl rand -base64 32`) in `.env.local`, create `lib/session.ts` as in Step 1 with `ttl: 604800`, and write `login`/`logout` Server Actions as in Step 2. Result: after login the browser holds one `shopfront_session` cookie (HttpOnly, SameSite=Lax, about 7 days); `/dashboard` reads `session.userId` on the server and redirects to `/login` when it is missing.

### Example 2: Upgrade from v8 and see why users get logged out

**User prompt:** "I moved to iron-session 9 and TypeScript now complains about session.user.id. Also some users get signed out after we changed the secret."

Change reads to `session.user?.id`, replace `new Date()` with `Date.now()`, and run on Node 22.13+. For the secret, move to the object form `{ 2: newSecret, 1: oldSecret }` so old cookies still open, and add `onUnsealError` to log `unknown-password` events. Result: type errors disappear and existing sessions survive the rotation.

## Guidelines

- The password must be at least 32 characters and live in an environment variable, never in the repository.
- Cookies over 4096 bytes make `save()` throw. Keep about 3 KB at most: store an id and look the rest up in your database. `chunk: true` splits across at most 4 cookies, but every cookie is sent with every request, so prefer the id approach.
- Stateless means no instant revocation. Check an `isBlocked` flag or a session version in the database on sensitive requests; deleting the cookie in the browser is all `destroy()` does.
- `ttl: 0` makes the seal never expire and never revocable; do not use it for authentication.
- An unreadable cookie (tampered, expired, old password) silently becomes an empty session, not an error. Log with `onUnsealError`.
- There is no built-in validation of the session shape. After you change `SessionData`, old cookies still decrypt into the old shape: validate in your `getSession()` wrapper and call `destroy()` if it does not match.
- With Next.js `cacheComponents`, read the session inside a `<Suspense>` boundary and never inside `use cache`.
- `sealData` and `unsealData` seal any value with a TTL, which suits magic links.
- Use it with an HTTPS site in production. Add CSRF protection for state-changing routes that are not Server Actions.
