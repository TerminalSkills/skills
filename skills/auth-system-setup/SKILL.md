---
name: auth-system-setup
description: >-
  When the user wants to set up authentication and authorization for a web application.
  Use when the user mentions "auth," "login," "OAuth," "SSO," "single sign-on,"
  "role-based access," "RBAC," "permissions," "user roles," "access control,"
  "authentication," or "authorization." Covers OAuth 2.0 provider integration,
  session management, and role/permission architecture. For JWT-specific tasks,
  see jwt-handler. For security review, see security-audit.
license: Apache-2.0
compatibility: "Any backend framework (Node.js, Python, Go, etc.)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["authentication", "authorization", "oauth", "rbac", "security"]
---

# Auth System Setup

## Overview

Designs and implements complete authentication and authorization systems for web applications. Covers OAuth 2.0 provider integration (Google, GitHub, Microsoft), session and token management, role-based access control (RBAC), and permission architectures. Generates production-ready code, database migrations, and tests.

## Instructions

### 1. Gather Requirements

Before generating any code, determine:

- **Tech stack**: Backend framework, database, frontend framework
- **Auth method**: OAuth providers, email/password, magic links, or combination
- **Roles needed**: What roles exist? What can each role do?
- **Token strategy**: Stateless JWT, server-side sessions, or hybrid
- **Compliance**: GDPR, SOC 2, HIPAA — affects data storage and logging

### 2. Design the Auth Architecture

Create the auth flow diagram and data model:

- **User table**: id, email, name, avatar, provider, provider_id, created_at
- **Role table**: id, name, description
- **Permission table**: id, resource, action (read/write/delete)
- **Role-Permission mapping**: role_id, permission_id
- **User-Role mapping**: user_id, role_id
- **Refresh token table**: id, user_id, token_hash, family_id, expires_at, revoked_at

### 3. Implement OAuth Flow

For each OAuth provider:

1. Create provider configuration (client ID, secret, scopes, callback URL)
2. Implement the authorization redirect with state parameter and PKCE
3. Handle the callback: exchange code for tokens, extract user profile
4. Provision or update the user record
5. Issue application tokens (access + refresh)

Always use PKCE for public clients. Always validate the state parameter.

### 4. Implement RBAC

Generate the permission-checking middleware:

```
authorize(resource, action) → middleware function
  1. Extract user from request (via JWT or session)
  2. Load user roles and permissions (cache with TTL)
  3. Check if any role grants the required permission
  4. Return 403 with clear error if denied
```

For row-level security, add ownership filters:

```
filterByOwnership(resource) → middleware function
  1. If user role has wildcard access, skip filter
  2. Otherwise, add WHERE clause: resource.owner_id = user.id
  3. Apply to SELECT, UPDATE, DELETE queries
```

### 5. Generate Tests

Create tests for:

- OAuth flow: successful login, invalid state, expired code
- Token lifecycle: issue, refresh, rotate, revoke
- RBAC: each role accessing allowed and denied resources
- Edge cases: expired tokens, revoked refresh tokens, role changes mid-session

## Examples

### Example 1: Express + PostgreSQL + Google OAuth

**Prompt**: "Set up Google OAuth with JWT tokens for my Express app. I need admin and user roles."

**Output**:
- `auth/providers/google.ts` — OAuth 2.0 + PKCE flow
- `auth/middleware/authenticate.ts` — JWT verification
- `auth/middleware/authorize.ts` — Role checker
- `migrations/001_auth_tables.sql` — Users, roles, permissions, refresh_tokens
- `auth/services/token.service.ts` — JWT issuance with refresh rotation
- `auth/routes.ts` — /auth/google, /auth/callback, /auth/refresh, /auth/logout
- `tests/auth.test.ts` — 18 integration tests

### Example 2: Django + GitHub OAuth + Multi-tenant RBAC

**Prompt**: "Add GitHub login to my Django app. Each organization has its own roles: owner, editor, viewer."

**Output**:
- `accounts/providers/github.py` — OAuth integration via django-allauth
- `accounts/models.py` — Organization, Membership, Role models
- `accounts/permissions.py` — Per-organization permission backend
- `accounts/middleware.py` — Org context middleware (from subdomain or header)
- `accounts/decorators.py` — @require_org_role('editor') decorator
- `migrations/0001_multi_tenant_auth.py` — Schema migration
- `tests/test_permissions.py` — 22 test cases across org boundaries

## Guidelines

- **Never store plain-text passwords** — use bcrypt with cost factor 12+ or argon2id
- **Always use PKCE** for OAuth flows, even with confidential clients
- **Rotate refresh tokens** on every use — detect reuse to identify token theft
- **Set short access token TTL** — 15 minutes is the standard
- **Cache permissions** — reload on role change, not on every request
- **Log auth events** — login, logout, failed attempts, role changes (for audit trail)
- **Rate limit auth endpoints** — prevent brute force on login and token refresh
- **Use httpOnly, Secure, SameSite=Strict cookies** for refresh tokens in browsers
- **Never put sensitive data in JWT payload** — it's base64, not encrypted
