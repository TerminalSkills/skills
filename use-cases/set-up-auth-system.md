---
title: "Set Up Authentication and Authorization for a Web Application"
slug: set-up-auth-system
description: "Implement a complete auth system with OAuth login, JWT tokens, and role-based access control from scratch."
skills: [auth-system-setup, jwt-handler, security-audit]
category: development
tags: [authentication, authorization, oauth, jwt, rbac]
---

# Set Up Authentication and Authorization for a Web Application

## The Problem

Adding auth to an existing application is one of the most error-prone tasks in backend development. You need OAuth integration with providers like Google or GitHub, secure JWT token management with refresh rotation, and granular role-based access control — all wired together correctly. A single mistake means leaked tokens, privilege escalation, or locked-out users. Most teams spend 2-3 weeks getting this right, and still ship vulnerabilities.

## The Solution

Use the **auth-system-setup** skill to scaffold the full auth architecture, **jwt-handler** to implement secure token generation and validation, and **security-audit** to verify the implementation against OWASP guidelines. The agent generates production-ready code, not boilerplate.

```bash
npx terminal-skills install auth-system-setup jwt-handler security-audit
```

## Step-by-Step Walkthrough

### 1. Define the auth requirements

```text
I'm building a project management app with a Node.js/Express backend and PostgreSQL.
I need: Google OAuth login, JWT access/refresh tokens, and three roles — admin, manager, member.
Admins manage users, managers manage projects, members view and update tasks assigned to them.
Set up the full auth system.
```

### 2. The agent scaffolds the OAuth flow

The agent generates the Google OAuth integration with PKCE, callback handling, and user provisioning:

```text
Created auth/providers/google.ts — OAuth 2.0 with PKCE flow
Created auth/middleware/authenticate.ts — JWT verification middleware
Created auth/middleware/authorize.ts — Role-based access guard
Created migrations/001_create_users_and_roles.sql — User, role, and permission tables
Created auth/services/token.service.ts — Access/refresh token pair generation

OAuth flow: /auth/google → Google consent → /auth/google/callback → JWT issued
Access token TTL: 15 minutes | Refresh token TTL: 7 days with rotation
```

### 3. Configure role-based access control

```text
Add RBAC with these permissions:
- admin: users.read, users.write, users.delete, projects.*, tasks.*
- manager: projects.create, projects.update, tasks.*, members.read
- member: tasks.read, tasks.update (own only), projects.read
Include row-level filtering so members only see their assigned tasks.
```

The agent creates the permission matrix and row-level security policies:

```text
Created auth/rbac/permissions.ts — Permission definitions and role mapping
Created auth/rbac/policies.ts — Row-level security filters
Updated auth/middleware/authorize.ts — Now checks granular permissions
Created tests/auth/rbac.test.ts — 14 test cases covering role boundaries

Example usage in routes:
  router.delete('/users/:id', authorize('users.delete'), UserController.remove)
  router.get('/tasks', authorize('tasks.read'), filterByRole, TaskController.list)
```

### 4. Harden the token lifecycle

```text
Review the JWT implementation for security issues. I want refresh token rotation
with reuse detection, proper token revocation on logout, and secure cookie settings.
```

The agent audits and hardens the token flow:

```text
Security review of token.service.ts:

Fixed: Refresh tokens now use one-time rotation — each refresh invalidates the old token
Fixed: Added token family tracking — if a revoked refresh token is reused, all tokens
       in the family are invalidated (detects token theft)
Fixed: Access tokens stored in memory only, refresh tokens in httpOnly secure cookies
       with SameSite=Strict
Added: Logout endpoint revokes all active refresh tokens for the user
Added: Rate limiting on /auth/refresh — max 10 requests per minute per user

Updated files: token.service.ts, auth.routes.ts, auth.controller.ts
Created: tests/auth/token-rotation.test.ts — 8 test cases including reuse detection
```

### 5. Run a security audit on the full auth flow

```text
Run a security audit on the auth implementation. Check against OWASP top 10
and common auth vulnerabilities.
```

```text
Security Audit Results — Auth System

✅ PASS: OAuth state parameter prevents CSRF on login flow
✅ PASS: PKCE used for OAuth — no authorization code interception
✅ PASS: Refresh token rotation with reuse detection
✅ PASS: Passwords not stored (OAuth-only flow)
✅ PASS: Role checks happen at middleware level, not in business logic
⚠️  WARN: Add rate limiting to /auth/google/callback (brute-force protection)
⚠️  WARN: Consider adding session fingerprinting (IP + User-Agent binding)

Overall: 5 passed, 2 warnings, 0 critical issues
Recommendations applied to auth.routes.ts
```

## Real-World Example

A solo developer is building a SaaS project management tool. She has the Express API and React frontend working, but auth is just a hardcoded user ID in the request headers. She needs to ship a beta to 20 pilot users next week.

1. She prompts the agent with her stack details and role requirements
2. The agent generates the full OAuth + JWT + RBAC system in 12 files
3. She reviews the migration SQL, runs it against her staging database
4. The agent adds integration tests covering login, token refresh, role boundaries, and edge cases
5. A security audit catches two minor issues that get patched immediately
6. She ships auth in one afternoon instead of the two weeks she had budgeted
