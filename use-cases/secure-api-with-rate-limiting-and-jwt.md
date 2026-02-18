---
title: "Secure an API with Rate Limiting and JWT Authentication"
slug: secure-api-with-rate-limiting-and-jwt
description: "Build a production-ready API security layer with JWT-based authentication, role-based access control, and intelligent rate limiting to protect against abuse."
skills: [rate-limiter, jwt-handler, auth-system-setup]
category: development
tags: [api-security, jwt, rate-limiting, authentication, authorization]
---

# Secure an API with Rate Limiting and JWT Authentication

## The Problem

Marta is building a public-facing REST API for her team's SaaS product. Right now, anyone can hit any endpoint — there's no authentication, no authorization, and no throttling. Before launch, she needs JWT-based auth with role-based permissions, and rate limiting so a single client can't hammer the API and degrade service for everyone else.

## The Solution

Use **auth-system-setup** to scaffold the authentication flow (registration, login, password hashing), **jwt-handler** to issue and verify tokens with role claims, and **rate-limiter** to add per-user and per-IP throttling. Together, these three skills produce a layered security setup that's ready for production.

## Step-by-Step Walkthrough

### 1. Scaffold the authentication system

```text
I have an Express.js API with about 15 endpoints. I need user registration
and login with bcrypt password hashing, email verification tokens, and
a clean middleware pattern I can apply to protected routes. Use PostgreSQL
for the user store.
```

```text
Created auth/user.model.ts — User table schema (id, email, password_hash,
  role, email_verified, created_at)
Created auth/register.ts — POST /auth/register
  - Validates email format and password strength (min 10 chars, mixed case, number)
  - Hashes password with bcrypt (12 rounds)
  - Stores user with role='viewer' by default
  - Sends verification token (SHA-256, expires in 24h)
Created auth/login.ts — POST /auth/login
  - Verifies email + password
  - Rejects unverified accounts with clear error message
  - Returns JWT on success (details in next step)
Created auth/verify-email.ts — GET /auth/verify?token=xxx
  - Marks email_verified=true, invalidates token
Created auth/middleware.ts — requireAuth middleware stub (JWT logic next)

Database migration: migrations/001_create_users.sql
```

### 2. Configure JWT token issuance and verification

```text
Set up JWT handling. I need access tokens (short-lived, 15 minutes) and
refresh tokens (7 days, stored in DB so I can revoke them). Include the
user's role in the access token claims. Roles are: viewer, editor, admin.
```

```text
Created auth/jwt.ts — Token service:
  issueAccessToken(user):
    Payload: { sub: user.id, role: user.role, iat, exp }
    Expiry: 15 minutes
    Algorithm: RS256 with 2048-bit key pair
  issueRefreshToken(user):
    Generates opaque token (crypto.randomBytes, 64 hex chars)
    Stores hash in refresh_tokens table (user_id, token_hash, expires_at)
    Expiry: 7 days
  verifyAccessToken(token):
    Validates signature, checks exp, returns decoded payload
  rotateRefreshToken(oldToken):
    Invalidates old token, issues new access + refresh pair
    Detects reuse of revoked tokens → revokes entire family (security)

Updated auth/login.ts — Returns { accessToken, refreshToken }
Created auth/refresh.ts — POST /auth/refresh for token rotation
Created auth/middleware.ts — requireAuth reads Bearer token from header,
  calls verifyAccessToken, attaches user to req.user
Created auth/authorize.ts — requireRole('admin') higher-order middleware
  that checks req.user.role against allowed roles

Key pair stored in: config/jwt-private.pem, config/jwt-public.pem
  (Added to .gitignore — generate per environment)
```

### 3. Add role-based access control to endpoints

```text
Apply the auth middleware to my routes. Here's the access pattern:
  - GET /projects — any authenticated user
  - POST /projects — editor or admin
  - DELETE /projects/:id — admin only
  - GET /analytics — admin only
  - GET /public/status — no auth required
```

```text
Updated routes/projects.ts:
  GET  /projects       → requireAuth
  POST /projects       → requireAuth, requireRole('editor', 'admin')
  DELETE /projects/:id → requireAuth, requireRole('admin')

Updated routes/analytics.ts:
  GET /analytics → requireAuth, requireRole('admin')

routes/public.ts:
  GET /public/status → no middleware (open)

Middleware chain example:
  router.delete('/projects/:id',
    requireAuth,
    requireRole('admin'),
    projectController.delete
  )

If token is missing → 401 { error: 'Authentication required' }
If token is expired → 401 { error: 'Token expired' }
If role is insufficient → 403 { error: 'Insufficient permissions' }
```

### 4. Implement rate limiting per user and per IP

```text
Add rate limiting. I want:
  - Global: 100 requests per minute per IP for unauthenticated routes
  - Authenticated: 300 requests per minute per user ID
  - Login endpoint: 5 attempts per 15 minutes per IP (brute force protection)
  - Admin endpoints: no rate limit
Use Redis as the backing store.
```

```text
Created middleware/rate-limiter.ts — Three limiter configurations:

  globalLimiter:
    Key: req.ip
    Window: 60 seconds, max 100 requests
    Store: Redis (ioredis, connection from env REDIS_URL)
    Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

  authenticatedLimiter:
    Key: req.user.id (applied after requireAuth)
    Window: 60 seconds, max 300 requests
    Skips if req.user.role === 'admin'

  loginLimiter:
    Key: req.ip
    Window: 900 seconds (15 min), max 5 attempts
    On limit: 429 { error: 'Too many login attempts. Try again in N minutes.' }
    Includes Retry-After header

Applied to routes:
  app.use('/public', globalLimiter)
  app.use('/auth/login', loginLimiter)
  app.use('/projects', requireAuth, authenticatedLimiter)
  app.use('/analytics', requireAuth, requireRole('admin'))  // no limiter

Redis key pattern: rl:{type}:{key} with TTL matching the window
Sliding window algorithm — smoother than fixed windows
```

### 5. Test the full security stack

```text
Generate a test suite that verifies the auth flow end-to-end:
registration, login, token refresh, role enforcement, and rate
limiting. Use Jest and supertest.
```

```text
Created tests/auth-security.test.ts — 18 test cases:

  Registration (4 tests):
    ✓ Registers user with valid credentials
    ✓ Rejects duplicate email
    ✓ Rejects weak password
    ✓ Returns verification token

  Login + JWT (5 tests):
    ✓ Returns access + refresh tokens on valid login
    ✓ Rejects unverified email
    ✓ Rejects wrong password
    ✓ Access token expires after 15 minutes (mocked clock)
    ✓ Refresh token rotation issues new pair and invalidates old

  Role-based access (4 tests):
    ✓ Viewer can GET /projects
    ✓ Viewer cannot POST /projects → 403
    ✓ Editor can POST /projects
    ✓ Only admin can DELETE /projects/:id

  Rate limiting (5 tests):
    ✓ Returns 429 after 100 unauthenticated requests
    ✓ Returns 429 after 5 login attempts in 15 min
    ✓ Authenticated user gets 300 req/min allowance
    ✓ Admin bypasses authenticated rate limit
    ✓ Rate limit headers present in responses

All tests use an in-memory Redis mock (ioredis-mock) for speed.
Test database: separate PostgreSQL schema, reset between suites.
```

## Real-World Example

Dani runs a small analytics platform with three tiers of API consumers. After a bot scraped his entire dataset through the unauthenticated endpoint, he used this approach to lock things down in an afternoon. Registration and JWT auth went in first, then he added a stricter rate limit tier for free-plan users (60 req/min) versus paid users (600 req/min) by reading the plan from the JWT claims. Login brute-force protection caught two credential-stuffing attempts in the first week.
