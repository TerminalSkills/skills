---
title: "Set Up a Production Authentication System from Scratch"
slug: set-up-production-auth-system
description: "Implement secure authentication with multiple provider options, JWT handling, session management, and role-based access control."
skills:
  - auth-system-setup
  - clerk-auth
  - lucia-auth
  - jwt-handler
category: development
tags:
  - authentication
  - jwt
  - sessions
  - security
  - oauth
---

# Set Up a Production Authentication System from Scratch

## The Problem

Your new SaaS application needs authentication, but the options are overwhelming. Rolling your own means handling password hashing, session storage, CSRF protection, OAuth flows, email verification, and password reset -- each one a security minefield. Using a third-party service like Clerk simplifies things but adds cost per user and vendor lock-in. Writing the session layer yourself gives you control but requires understanding session management internals. Every approach has trade-offs, and picking wrong means either a security vulnerability or a painful migration later. You need to evaluate the options for your specific use case and implement the chosen one correctly.

## The Solution

Use the **auth-system-setup** skill to evaluate authentication approaches and design the data model, OAuth flow and RBAC, **clerk-auth** for a managed solution with minimal code, **lucia-auth** for the self-hosted alternative (the Lucia library is deprecated, so this means a small session module you own), and **jwt-handler** for token signing, verification and revocation in API-first architectures.

## Step-by-Step Walkthrough

### 1. Evaluate auth approaches for your use case

Start by comparing managed versus self-hosted authentication for your specific requirements.

> I'm building a B2B SaaS with 500 expected users in year one, growing to 10,000. I need email/password login, Google OAuth, organization-based access control, and API tokens for integrations. Compare Clerk, a self-written database session module (the replacement for the deprecated Lucia library), and custom JWT auth for this use case. Consider cost, control, migration difficulty, and time to implement.

The comparison reveals trade-offs. Clerk ships in hours and bills by monthly retained users (MRU): at the time of writing the free Hobby plan includes 50,000 MRU per app and Pro charges $0.02 per MRU above that, so check the pricing page for current figures. A self-written session module is free but you write the OAuth and organization logic yourself; the `lucia-auth` skill supplies the session code. Custom JWT is the most flexible but the most dangerous to implement incorrectly, and it needs a revocation table to be safe.

### 2. Implement the primary auth flow

For a B2B SaaS choosing Clerk for speed to market while keeping migration options open.

> Set up Clerk authentication in our Next.js app. Configure email/password and Google OAuth sign-in. Create organization-based access so users belong to a company workspace. Add `clerkMiddleware` so the session is attached to every request, and protect the data itself: call `await auth.protect()` in the /dashboard pages and route handlers. In a page it redirects signed-out users to the sign-in page (set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`); in a route handler a signed-out browser request gets a 404 and a Server Action gets a 401, so do not expect a redirect there. On Next.js 16 the middleware file is `proxy.ts`; on Next.js 15 it is `middleware.ts`.

```typescript
// proxy.ts (middleware.ts on Next.js 15)
import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();

// app/dashboard/page.tsx
import { auth } from "@clerk/nextjs/server";
export default async function Dashboard() {
  await auth.protect(); // signed out: redirect to sign-in
  return <h1>Dashboard</h1>;
}
```

Put the publishable and secret keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and keep that file out of git.

### 3. Add API token authentication for integrations

External integrations need long-lived API tokens, not session cookies.

> Our customers need API tokens to integrate with their CI/CD pipelines. Implement a JWT-based API token system alongside Clerk session auth, following the jwt-handler skill: sign with ES256 (private key from a secret store), pin the algorithm, issuer and audience when verifying. Tokens should be scoped to specific permissions (read:projects, write:deployments), have configurable expiration, and be revocable. Store token metadata in our database so we can audit usage and revoke compromised tokens.

The token system stores metadata alongside scoped permissions (the signing and verification below ran under Node.js with `jsonwebtoken` 9.0.3; `db` stands for your own data layer):

```typescript
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

// POST /api/tokens: create a new API token (caller already authenticated via Clerk)
export async function issueApiToken(user, organization, scopes: string[], days = 90) {
  const jti = crypto.randomUUID(); // unique token ID for revocation
  const token = jwt.sign({ org: organization.id, scopes }, process.env.JWT_PRIVATE_KEY!, {
    algorithm: "ES256", subject: user.id, jwtid: jti,
    issuer: "app", audience: "api", expiresIn: `${days}d`,
  });
  const { exp } = jwt.decode(token) as { exp: number };

  await db.apiTokens.create({ tokenId: jti, userId: user.id, orgId: organization.id, scopes,
    expiresAt: new Date(exp * 1000), lastUsedAt: null, revokedAt: null });
  return { token, expiresAt: new Date(exp * 1000) }; // show the token once; never log it
}

// Bearer-token check for API routes
export async function verifyApiToken(token: string, requiredScope: string) {
  const claims = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
    algorithms: ["ES256"], issuer: "app", audience: "api",
  }) as jwt.JwtPayload & { org: string; scopes: string[] };
  const row = await db.apiTokens.findById(claims.jti);
  if (!row || row.revokedAt) throw new Error("token_revoked"); // valid signature is not enough
  if (!claims.scopes.includes(requiredScope)) throw new Error("insufficient_scope");
  await db.apiTokens.touch(claims.jti); // lastUsedAt, for the audit trail
  return claims;
}
```

Browser requests are authenticated by Clerk (`await auth()`); API requests send `Authorization: Bearer <token>` and go through `verifyApiToken`. Revoked tokens are rejected even if the JWT signature is valid, because the check reads the revocation column. Keep the API routes out of any Clerk protection that would redirect Bearer requests to sign-in.

### 4. Set up role-based access control

Different users within an organization need different permission levels.

> Implement RBAC with three roles: owner (full access, billing), admin (manage members, all features), and member (use features, no admin). Clerk's built-in organization roles are `org:admin` and `org:member` only, so define the extra role and the permissions (for example `org:billing:manage`) in the Clerk dashboard under Organizations, Roles and permissions. The check should work in server components and API routes using `has({ permission })` from `await auth()`, and API-token requests should check the token's scopes instead.

```typescript
const { has } = await auth();
if (!has({ permission: "org:billing:manage" })) return new Response("Forbidden", { status: 403 });
```

Prefer permission checks over role checks, because they survive role renames. Role and permission checks need an active organization in the session.

## Real-World Example

In this example, a developer tools startup needed authentication for their deployment platform. They started with Clerk to ship a working login in one afternoon, then added scoped JWT tokens for the CLI that developers use to trigger deployments from their terminal. Token scoping meant a CI/CD token with `write:deployments` could not reach billing or team management. Later they wanted to own the session layer for one internal tool, so they used the `lucia-auth` session module (a few dozen lines over their existing database) rather than the deprecated Lucia package, and kept JWT for API tokens.

## Tips

- Start with a managed auth provider (Clerk, Auth0) unless you have a reason to own sessions. Compare the current free tier and per-user pricing against your expected user count before deciding.
- Do not build on the `lucia` npm package: it is deprecated. Write the session module from the `lucia-auth` skill or choose a maintained library.
- Always store API token metadata in your database, not just the JWT. You need the ability to list active tokens, audit usage, and revoke compromised tokens without waiting for JWT expiration.
- Scope API tokens as narrowly as possible. A token that can only `read:projects` limits the blast radius if it leaks in a CI log.
- Plan your migration path before committing to a provider. Store user IDs in your own database from day one so you can switch auth providers without losing the user-to-data mapping.

## Related Skills

- **auth-system-setup** -- compares approaches and designs the user, role and permission data model and OAuth flow with PKCE.
- **clerk-auth** -- the managed path: `clerkMiddleware`, `auth.protect()`, organizations and `has()` permission checks.
- **lucia-auth** -- the self-hosted path: a hand-written database session module, since the Lucia package is deprecated.
- **jwt-handler** -- ES256 signing, pinned verification and refresh/revocation rules for the API tokens.
