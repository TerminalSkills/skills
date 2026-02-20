---
name: jose-jwt
description: >-
  Work with JWTs using jose. Use when implementing JWT auth, token signing/
  verification, refresh tokens, or stateless API auth.
license: Apache-2.0
compatibility: 'Node.js, Deno, Bun, Edge runtimes'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: auth
  tags: [jwt, jose, authentication, tokens, api-auth]
---

# jose (JWT)

## Overview

jose is the modern JWT library — works in Node.js, Deno, Bun, and edge runtimes. Successor to jsonwebtoken with proper TypeScript, Web Crypto API, and zero native deps.

## Instructions

### Step 1: Sign and Verify

```typescript
import { SignJWT, jwtVerify } from 'jose'
const secret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function signAccessToken(userId: string, role: string) {
  return new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('myapp')
    .sign(secret)
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret, { issuer: 'myapp' })
  return payload
}
```

### Step 2: Refresh Token Flow

```typescript
export async function signRefreshToken(userId: string) {
  return new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

// Rotate on use — revoke old, issue new
app.post('/auth/refresh', async (req, res) => {
  const payload = await verifyToken(req.body.refreshToken)
  if (payload.type !== 'refresh') throw new Error('Wrong token type')
  if (await redis.get(`revoked:${req.body.refreshToken}`)) return res.status(401).end()
  await redis.set(`revoked:${req.body.refreshToken}`, '1', 'EX', 604800)
  const accessToken = await signAccessToken(payload.sub, user.role)
  const refreshToken = await signRefreshToken(payload.sub)
  res.json({ accessToken, refreshToken })
})
```

## Guidelines

- jose works everywhere — no native dependencies, Web Crypto API.
- Access tokens: 15 min. Refresh tokens: 7 days, rotate on use.
- Always rotate refresh tokens — revoke old to prevent replay.
- Use HS256 for simple, RS256/ES256 for microservices (public key verification).
