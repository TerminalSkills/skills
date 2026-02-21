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

Your new SaaS application needs authentication, but the options are overwhelming. Rolling your own means handling password hashing, session storage, CSRF protection, OAuth flows, email verification, and password reset -- each one a security minefield. Using a third-party service like Clerk simplifies things but adds cost per user and vendor lock-in. Using a library like Lucia gives you control but requires understanding session management internals. Every approach has trade-offs, and picking wrong means either a security vulnerability or a painful migration later. You need to evaluate the options for your specific use case and implement the chosen one correctly.

## The Solution

Use the **auth-system-setup** skill to evaluate authentication approaches and configure the chosen strategy, **clerk-auth** for a managed solution with minimal code, **lucia-auth** for a self-hosted session-based approach with full control, and **jwt-handler** for stateless token management in API-first architectures.

## Step-by-Step Walkthrough

### 1. Evaluate auth approaches for your use case

Start by comparing managed versus self-hosted authentication for your specific requirements.

> I'm building a B2B SaaS with 500 expected users in year one, growing to 10,000. I need email/password login, Google OAuth, organization-based access control, and API tokens for integrations. Compare Clerk, Lucia, and custom JWT auth for this use case. Consider cost, control, migration difficulty, and time to implement.

The comparison reveals trade-offs: Clerk ships in hours but costs $0.02/MAU after the free tier. Lucia is free but requires writing the OAuth and organization logic yourself. Custom JWT is the most flexible but the most dangerous to implement incorrectly.

### 2. Implement the primary auth flow

For a B2B SaaS choosing Clerk for speed to market while keeping migration options open.

> Set up Clerk authentication in our Next.js app. Configure email/password and Google OAuth sign-in. Create organization-based access so users belong to a company workspace. Add middleware that protects all routes under /dashboard and redirects unauthenticated users to /sign-in.

### 3. Add API token authentication for integrations

External integrations need long-lived API tokens, not session cookies.

> Our customers need API tokens to integrate with their CI/CD pipelines. Implement a JWT-based API token system alongside Clerk session auth. Tokens should be scoped to specific permissions (read:projects, write:deployments), have configurable expiration, and be revocable. Store token metadata in our database so we can audit usage and revoke compromised tokens.

### 4. Set up role-based access control

Different users within an organization need different permission levels.

> Implement RBAC with three roles: owner (full access, billing), admin (manage members, all features), and member (use features, no admin). The permission check should work in both server components and API routes. Add a middleware that attaches the user's role and permissions to the request context.

## Real-World Example

A developer tools startup needed authentication for their deployment platform. They started with Clerk to ship a working login in one afternoon, then added custom JWT tokens for the CLI tool that developers use to trigger deployments from their terminal. The JWT handler skill set up token scoping so a CI/CD token with `write:deployments` permission cannot access billing or team management. Six months later, with 3,000 users and Clerk costs approaching $500/month, they evaluated migrating to Lucia for the session-based flows while keeping JWT for API tokens. The auth-system-setup skill generated a migration plan that moved users over a weekend with zero downtime.
