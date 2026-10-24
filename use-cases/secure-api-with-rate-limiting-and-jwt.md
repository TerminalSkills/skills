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

Marta is building a public-facing REST API for her team's SaaS product. Right now, anyone can hit any endpoint -- there's no authentication, no authorization, and no throttling. The API is fully functional, serving about 15 endpoints, but it's wide open. Before launch, she needs JWT-based auth with role-based permissions, and rate limiting so a single client can't hammer the API and degrade service for everyone else. She's seen what happens when an unprotected API meets the real world, and she'd rather not learn that lesson firsthand.

## The Solution

Use **auth-system-setup** to scaffold the authentication flow (registration, login, password hashing), **jwt-handler** to issue and verify tokens with role claims, and **rate-limiter** to add per-user and per-IP throttling. Together, these three skills produce a layered security setup that's ready for production.

## Step-by-Step Walkthrough

### Step 1: Scaffold the Authentication System

Registration, login, email verification -- the foundation everything else builds on.

```text
I have an Express.js API with about 15 endpoints. I need user registration
and login with bcrypt password hashing, email verification tokens, and
a clean middleware pattern I can apply to protected routes. Use PostgreSQL
for the user store.
```

Five files establish the auth foundation:

- **`auth/user.model.ts`** -- User table schema with `id`, `email`, `password_hash`, `role`, `email_verified`, and `created_at`
- **`auth/register.ts`** -- `POST /auth/register` validates email format and password strength (minimum 10 characters, mixed case, at least one number), hashes with bcrypt at 12 rounds, assigns `role='viewer'` by default, and sends a verification token (SHA-256, expires in 24 hours)
- **`auth/login.ts`** -- `POST /auth/login` verifies credentials and rejects unverified accounts with a clear error message. Returns a JWT on success.
- **`auth/verify-email.ts`** -- `GET /auth/verify?token=xxx` marks the account verified and invalidates the token
- **`migrations/001_create_users.sql`** -- Database migration for the user and verification tables

The middleware stub (`auth/middleware.ts`) is ready for JWT logic in the next step.

### Step 2: Configure JWT Token Issuance and Verification

Short-lived access tokens for API calls, long-lived refresh tokens for session continuity, and revocation support for security incidents.

```text
Set up JWT handling. I need access tokens (short-lived, 15 minutes) and
refresh tokens (7 days, stored in DB so I can revoke them). Include the
user's role in the access token claims. Roles are: viewer, editor, admin.
```

The token service (`auth/jwt.ts`) implements four operations. Access tokens use `jsonwebtoken` 9 with RS256, a `kid` in the header for key rotation, and a verify call that pins the algorithm, issuer and audience:

```typescript
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';

type Role = 'viewer' | 'editor' | 'admin';
const privateKey = process.env.JWT_PRIVATE_KEY!; // PEM, loaded from config/jwt-private.pem
const publicKey = process.env.JWT_PUBLIC_KEY!;

// 15-minute access token: { sub, role, iss, aud, iat, exp }
export const issueAccessToken = (user: { id: string; role: Role }) =>
  jwt.sign({ role: user.role }, privateKey, {
    algorithm: 'RS256', expiresIn: '15m', subject: user.id,
    issuer: 'app', audience: 'api', keyid: 'key-1',
  });

// Validates signature and expiry; throws TokenExpiredError / JsonWebTokenError
export const verifyAccessToken = (token: string) =>
  jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'app', audience: 'api' }) as jwt.JwtPayload & { role: Role };

// Opaque refresh token: random value to the client, only its SHA-256 hash in
// refresh_tokens (user_id, token_hash, family_id, expires_at = now + 7 days)
export const issueRefreshToken = () => {
  const token = randomBytes(64).toString('hex');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
};

// rotateRefreshToken(oldToken): mark the old row used, issue a new pair.
// A token that is already used or revoked means reuse -> revoke the whole family.
```

The refresh token rotation with reuse detection is the key security feature. If an attacker steals a refresh token and the legitimate user also tries to use it, the reuse triggers and all tokens in that family get revoked. Both parties have to re-authenticate, but the attacker is locked out.

The `requireAuth` middleware reads the Bearer token from the Authorization header, verifies it, and attaches the decoded user to `req.user`. The `requireRole('admin')` higher-order middleware checks `req.user.role` against the allowed roles.

Key pair files (`jwt-private.pem`, `jwt-public.pem`) go in `config/` and are added to `.gitignore` -- generated per environment, never committed. Browser clients should keep the refresh token in an `httpOnly`, `Secure` cookie rather than in `localStorage`.

### Step 3: Apply Role-Based Access Control to Endpoints

```text
Apply the auth middleware to my routes. Here's the access pattern:
  - GET /projects -- any authenticated user
  - POST /projects -- editor or admin
  - DELETE /projects/:id -- admin only
  - GET /analytics -- admin only
  - GET /public/status -- no auth required
```

The middleware chain makes permissions explicit and readable:

```typescript
// Any authenticated user can list projects
router.get('/projects', requireAuth, projectController.list);

// Only editors and admins can create
router.post('/projects', requireAuth, requireRole('editor', 'admin'), projectController.create);

// Only admins can delete
router.delete('/projects/:id', requireAuth, requireRole('admin'), projectController.delete);

// Analytics restricted to admins
router.get('/analytics', requireAuth, requireRole('admin'), analyticsController.get);

// Public endpoint -- no middleware
router.get('/public/status', statusController.get);
```

Error responses are clear and consistent: missing token returns `401 Authentication required`, expired token returns `401 Token expired`, insufficient role returns `403 Insufficient permissions`. Each response includes enough information for the client to handle it correctly without leaking internal details.

### Step 4: Implement Rate Limiting Per User and Per IP

```text
Add rate limiting. I want:
  - Global: 100 requests per minute per IP for unauthenticated routes
  - Authenticated: 300 requests per minute per user ID
  - Login endpoint: 5 attempts per 15 minutes per IP (brute force protection)
  - Admin endpoints: no rate limit
Use Redis as the backing store.
```

Three limiter configurations in `middleware/rate-limiter.ts`, all backed by Redis with a sliding window algorithm (smoother than fixed windows). Behind a load balancer or reverse proxy, configure Express `trust proxy` correctly first, or `req.ip` is the proxy's address and every client shares one bucket:

**Global limiter** -- keyed on `req.ip`, 100 requests per 60-second window. Applied to all public routes. Response headers include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (a widespread convention, not a standard; the IETF `RateLimit` header draft is the eventual replacement) so clients can self-throttle.

**Authenticated limiter** -- keyed on `req.user.id` (applied after `requireAuth`), 300 requests per 60-second window. Skips the limit entirely when `req.user.role === 'admin'` -- admins running data exports shouldn't hit artificial ceilings.

**Login limiter** -- keyed on `req.ip`, 5 attempts per 15-minute window. This is the brute-force protection. After 5 attempts in the window, the response is `429 Too many login attempts. Try again in N minutes.` with a `Retry-After` header.

Route application:

```typescript
app.use('/public', globalLimiter);
app.use('/auth/login', loginLimiter);
app.use('/projects', requireAuth, authenticatedLimiter);
app.use('/analytics', requireAuth, requireRole('admin'));  // no limiter
```

Redis key pattern: `rl:{type}:{key}` with TTL matching the window duration. If Redis goes down, the limiters fall back to an in-memory counter per process and log the failure loudly. They do not fail open: an attacker who can knock Redis over must not get unlimited login attempts. The per-process counters are looser than the shared ones, but the limit still applies.

### Step 5: Test the Full Security Stack

```text
Generate a test suite that verifies the auth flow end-to-end:
registration, login, token refresh, role enforcement, and rate
limiting. Use Jest and supertest.
```

The test suite (`tests/auth-security.test.ts`) covers 18 cases across four areas:

**Registration** (4 tests): Successful registration with valid credentials, duplicate email rejection, weak password rejection, and verification token generation.

**Login and JWT** (5 tests): Valid login returns both tokens, unverified email gets rejected, wrong password gets rejected, access token expires after 15 minutes (mocked clock), and refresh token rotation issues a new pair while invalidating the old one.

**Role-based access** (4 tests): Viewer can `GET /projects`, viewer cannot `POST /projects` (returns 403), editor can `POST /projects`, and only admin can `DELETE /projects/:id`.

**Rate limiting** (5 tests): Returns 429 after 100 unauthenticated requests, returns 429 after 5 login attempts in 15 minutes, authenticated user gets the 300 request per minute allowance, admin bypasses the authenticated rate limit, and rate limit headers are present in all responses.

All tests use `ioredis-mock` for speed and a separate PostgreSQL schema that resets between suites. Add one case that stops the Redis connection and checks the in-memory fallback still returns 429.

## Real-World Example

Dani runs a small analytics platform with three tiers of API consumers: a free plan, a paid plan, and enterprise. After a bot scraped his entire dataset through the unauthenticated endpoint -- downloading 18 months of data in a single afternoon -- he used this approach to lock things down.

Registration and JWT auth went in first, gating every data endpoint behind authentication. Then he extended the rate limiter tiers beyond the basic three: free-plan users get 60 requests per minute, paid users get 600, and enterprise gets 3,000 -- all read from the JWT claims, so upgrading a customer's plan takes effect on their next token refresh without any code changes.

The login brute-force protection caught two credential-stuffing attempts in the first week -- automated scripts cycling through leaked password databases. Both were blocked after 5 attempts. The whole security layer shipped in an afternoon, and Dani sleeps better knowing his API isn't a free buffet anymore.
