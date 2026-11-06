---
title: Implement Authentication for a Next.js SaaS
slug: implement-auth-for-nextjs-saas
description: >-
  Add complete authentication to a Next.js SaaS — email/password login, Google
  OAuth, JWT access/refresh tokens for API routes, and encrypted sessions for
  server components.
skills:
  - passport-js
  - jwt-handler
  - iron-session
  - authjs
  - better-auth
category: development
tags:
  - authentication
  - nextjs
  - oauth
  - jwt
  - saas
---

# Implement Authentication for a Next.js SaaS

Kasper's team is building a B2B document-management SaaS. They need email/password signup, Google Workspace login (their customers are companies), role-based access (admin, editor, viewer), and API tokens for the mobile app. The app uses Next.js App Router with both server components (dashboard) and route handlers (REST API for the mobile app).

The **browser** gets an encrypted cookie session (`iron-session`); the **mobile app** gets short-lived JWT access tokens plus revocable refresh tokens (`jwt-handler` rules, implemented with `jose`). Step 6 shows libraries that can replace the hand-written Google code.

## Step 1: Database Schema

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255),              -- null for OAuth-only users
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',   -- admin, editor, viewer
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE oauth_accounts (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,           -- google
  provider_account_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,                 -- one family per login, shared by every rotation
  token_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 hex, never the plaintext token
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Step 2: Email/Password Login With an Encrypted Session

`iron-session` 9 needs Node.js 22.13 or newer. Generate the cookie password with `openssl rand -base64 32` and keep it in `SESSION_PASSWORD`.

```typescript
import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: string
  role?: 'admin' | 'editor' | 'viewer'
  loggedInAt?: number              // a number, not a Date (v9 rejects Date)
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD!,
  cookieName: 'docs_session',
  ttl: 60 * 60 * 24 * 7,           // 7 days
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
```

```typescript
// app/actions/auth.ts
'use server'
import bcrypt from 'bcrypt'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function login(formData: FormData) {
  const user = await db.users.findByEmail(String(formData.get('email')).toLowerCase())
  const ok = user?.passwordHash
    && await bcrypt.compare(String(formData.get('password')), user.passwordHash)
  if (!user || !ok) return { error: 'Wrong email or password' }   // same message for both cases

  const session = await getSession()
  Object.assign(session, { userId: user.id, role: user.role, loggedInAt: Date.now() })
  await session.save()             // must be awaited before the redirect
  redirect('/dashboard')
}
// logout: (await getSession()).destroy(); redirect('/login')
```

Check the session in every server component, server action and route handler that reads private data (`const session = await getSession(); if (!session.userId) redirect('/login')`). A layout does not protect the pages below it.

The cookie is stateless, so `destroy()` only clears the browser's copy. Re-read the user's role or a blocked flag from the database on sensitive actions.

## Step 3: Token Service for the Mobile API

Access tokens are ES256 JWTs verified with the public key and no database call. Refresh tokens are random, stored hashed, and rotated on every use within a family. This follows the `jwt-handler` rules: asymmetric keys, pinned algorithm, issuer and audience checked, reuse of a rotated token revokes the whole family.

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out jwt-private.pem
openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
# PEM text goes in JWT_PRIVATE_KEY / JWT_PUBLIC_KEY (secrets manager, not the repo)
```

```typescript
// lib/tokens.ts
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose'
import crypto from 'node:crypto'
import { db } from './db'

const pem = (v?: string) => (v ?? '').replace(/\\n/g, '\n')   // env files store PEM with \n escapes
const privateKey = () => importPKCS8(pem(process.env.JWT_PRIVATE_KEY), 'ES256')
const publicKey = () => importSPKI(pem(process.env.JWT_PUBLIC_KEY), 'ES256')
const ISSUER = 'docs-app'
const AUDIENCE = 'docs-api'
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export async function createTokenPair(user: { id: string; role: string }, familyId?: string) {
  const accessToken = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(await privateKey())

  const refreshToken = crypto.randomBytes(32).toString('hex')
  await db.refreshTokens.create({
    userId: user.id, familyId: familyId ?? crypto.randomUUID(),
    tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400000),
  })
  return { accessToken, refreshToken }
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, await publicKey(),
    { algorithms: ['ES256'], issuer: ISSUER, audience: AUDIENCE, clockTolerance: 30 })
  return { userId: payload.sub as string, role: payload.role as string }
}

export async function rotateRefreshToken(oldToken: string) {
  const stored = await db.refreshTokens.findByHash(sha256(oldToken))
  if (!stored || stored.expiresAt < new Date()) throw new Error('Invalid refresh token')

  // revokeIfActive is one atomic UPDATE ... SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL;
  // false means the token was already used, so assume theft and revoke the family
  if (stored.revokedAt || !await db.refreshTokens.revokeIfActive(stored.id)) {
    await db.refreshTokens.revokeFamily(stored.familyId)
    throw new Error('Invalid refresh token')
  }
  const user = await db.users.findById(stored.userId)
  return createTokenPair(user, stored.familyId)
}
```

The mobile app calls `POST /api/auth/token` with email and password (same bcrypt check as Step 2), keeps the refresh token in secure storage and the access token in memory.

## Step 4: Google OAuth

The flow checks a random `state` value against a cookie, so an attacker cannot make a victim's browser complete the attacker's login. It reads the user from Google's OpenID Connect userinfo endpoint (stable `sub` id, `email_verified` flag).

```typescript
// app/api/auth/google/route.ts — start the flow
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  })
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  res.cookies.set('oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/google', maxAge: 600 })
  return res
}
```

```typescript
// app/api/auth/google/callback/route.ts — finish the flow
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code'), state = searchParams.get('state')
  const expected = (await cookies()).get('oauth_state')?.value
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${process.env.APP_URL}/login?error=oauth`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({   // sent as application/x-www-form-urlencoded
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.APP_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return NextResponse.redirect(`${process.env.APP_URL}/login?error=oauth`)
  const { access_token, id_token } = await tokenRes.json()

  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  }).then(r => r.json())
  if (!info.email_verified) return NextResponse.redirect(`${process.env.APP_URL}/login?error=email`)
  // Find by Google id; otherwise link to the user with the same verified email. A local account whose
  // email was never verified may belong to someone who only typed this address, so drop its password.
  let user = await db.users.findByOAuth('google', info.sub)
  if (!user) {
    user = await db.users.findByEmail(info.email)
    if (user && !user.emailVerified) await db.users.update(user.id, { passwordHash: null, emailVerified: true })
    user ??= await db.users.create({ email: info.email, name: info.name, emailVerified: true })
    await db.oauthAccounts.create({ userId: user.id, provider: 'google', providerAccountId: info.sub })
  }
  const session = await getSession()
  Object.assign(session, { userId: user.id, role: user.role, loggedInAt: Date.now() })
  await session.save()
  const res = NextResponse.redirect(`${process.env.APP_URL}/dashboard`)
  res.cookies.delete('oauth_state')
  return res
}
```

For a tenant tied to a Workspace domain, also require the `hd` claim to equal the registered domain. Google's userinfo response does not carry it, so read it from the `id_token` with `decodeJwt` from `jose` (the token comes straight from Google's token endpoint over TLS); an address on that domain without `hd` is not a Workspace account.

## Step 5: API Auth Helper

```typescript
// lib/api-auth.ts — in a route handler: const auth = await withAuth(req); if (auth instanceof Response) return auth
export async function withAuth(req: Request) {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return Response.json({ error: 'token_missing' }, { status: 401 })
  try { return await verifyAccessToken(header.slice(7)) }
  catch { return Response.json({ error: 'token_invalid' }, { status: 401 }) }   // expired, bad signature, wrong iss/aud
}
```

## Step 6: Using a Library Instead of the Hand-Written Google Flow

Each of these replaces Step 4; pick one (the mobile token service stays either way).

**Auth.js** (`next-auth@beta`, the v5 line; in maintenance mode under the Better Auth team). Run `npx auth secret`, set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then:

```typescript
// auth.ts; app/api/auth/[...nextauth]/route.ts is: export const { GET, POST } = handlers
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
export const { handlers, auth, signIn, signOut } = NextAuth({ providers: [Google] })
```

**Better Auth** (`better-auth`, stores users and sessions in your database; mount with `toNextJsHandler(auth)` at `app/api/auth/[...all]/route.ts`):

```typescript
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),   // adapter imports: see the Better Auth docs
  emailAndPassword: { enabled: true },
  socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } },
  plugins: [nextCookies()],            // from 'better-auth/next-js'; keep last
})
```

**Passport.js** fits when the REST API for the mobile app lives in a separate Express service rather than in Next.js route handlers: `passport-local` for email/password and `passport-google-oauth20` for Google, with `express-session` behind both.

## Results

A person who signs up by email and later uses Google Workspace gets one account. Dashboard pages read the role from the encrypted cookie without a database round trip, and the mobile API verifies access tokens locally. When a refresh token is replayed after rotation, its whole family is revoked and the user signs in again. Rotate `SESSION_PASSWORD` with iron-session's `{ 2: new, 1: old }` password map so existing sessions survive.

## Related Skills

- **iron-session**: encrypted cookie sessions for the dashboard (Steps 2 and 4).
- **jwt-handler**: the access/refresh token rules the mobile token service follows (Step 3).
- **authjs**: replaces the hand-written Google flow in a Next.js app (Step 6).
- **better-auth**: database-backed email/password and Google login as an alternative (Step 6).
- **passport-js**: the Express-based option when the mobile API is its own service (Step 6).
