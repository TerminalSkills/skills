---
name: clerk-auth
description: >-
  Clerk is a hosted authentication and user-management service with drop-in UI
  components, social login, email/password, organizations, RBAC and webhooks.
  Use when adding sign-in to Next.js, React, or Express apps, protecting routes
  with clerkMiddleware, setting up multi-tenant organizations and roles, or
  syncing Clerk users to your own database.
license: Apache-2.0
compatibility: "Node.js 20.9+; @clerk/nextjs 7 (Core 3) needs Next.js 15.2.3+ (proxy.ts on Next.js 16, middleware.ts on 15); a Clerk account and application"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: development
  tags: ["clerk", "authentication", "nextjs", "react", "rbac"]
  repository: https://github.com/clerk/javascript
---

# Clerk Authentication

## Overview

Clerk provides hosted sign-in and sign-up, session management, user profiles, organizations (multi-tenancy) and role-based access control. Your app wraps itself in a provider, adds a middleware that attaches the session, checks it next to the data, and reads the session through `auth()` on the server or hooks on the client. Keys come from the Clerk dashboard (Configure, API keys). Use the `pk_test_`/`sk_test_` keys for development and the `pk_live_`/`sk_live_` pair only in production. Checked against `@clerk/nextjs` 7.9 and `@clerk/express` 2.1 (Clerk Core 3). Core 3 replaced `<SignedIn>`, `<SignedOut>` and `<Protect>` with `<Show>`, requires `ClerkProvider` inside `<body>`, and dropped Next.js 13 and 14.

## Instructions

### 1. Install and configure (Next.js App Router)

Clerk's own quickstart now starts from its CLI, which detects the framework, installs the SDK, writes dev keys to `.env.local` and creates the middleware file (no account needed to start; it provisions a claimable dev app): `npx -y clerk@latest init`, then `npx -y clerk@latest doctor` to check the setup. Manual setup:

```bash
npm install @clerk/nextjs
```

```env
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # publishable key from the Clerk dashboard (API keys)
CLERK_SECRET_KEY=                    # secret key from the same page; never commit it
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

```tsx
// app/layout.tsx
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider afterSignOutUrl="/">
          <header>
            <Show when="signed-out"><SignInButton /><SignUpButton /></Show>
            <Show when="signed-in"><UserButton /></Show>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
```

### 2. Add clerkMiddleware, then protect at the resource

On Next.js 16 the file is `proxy.ts`; on Next.js 15 it is `middleware.ts`. The code is identical. `clerkMiddleware()` only attaches the session to the request and protects nothing by default.

```typescript
// proxy.ts (middleware.ts on Next.js 15)
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
```

Clerk's docs now say middleware is not the best place to protect routes: put the check in the code that reads or changes the data (pages, layouts that prefetch data, route handlers, server actions). `createRouteMatcher()` with `auth.protect()` inside `clerkMiddleware` still works but is deprecated, so write new code with per-resource checks.

```typescript
// app/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';

export default async function Dashboard() {
  await auth.protect(); // signed out: redirect to sign-in
  return <h1>Dashboard</h1>;
}
```

`auth.protect()` on a page redirects signed-out users to sign-in. In a route handler it returns 404 for an unauthenticated request (401 inside a server action), and a signed-in user lacking the required role or permission gets 404. If you want control over the response, call `auth()` and check `isAuthenticated` yourself (next step).

### 3. Read the session on the server

```typescript
import { auth, currentUser } from '@clerk/nextjs/server';

export default async function Page() {
  const { isAuthenticated, userId, orgId, orgRole, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const user = await currentUser(); // full user object (counts as a Backend API request)
  return <p>Hello {user?.firstName}</p>;
}
```

`auth()` is async in current versions: always `await` it. In a route handler return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` when `userId` is null.

### 4. Client hooks and components

```tsx
'use client';
import { useAuth, useUser, useOrganization } from '@clerk/nextjs';

export function ProfileCard() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { organization, membership } = useOrganization();
  if (!isSignedIn) return <p>Not signed in</p>;
  return <p>{user?.fullName} / {organization?.name} / {membership?.role}</p>;
}
```

Pre-built components from `@clerk/nextjs`: `SignIn`, `SignUp`, `UserButton`, `UserProfile`, `OrganizationSwitcher`, `OrganizationList`, `OrganizationProfile`. Mount the sign-in page at a catch-all route:

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs';
export default function SignInPage() { return <SignIn />; }
```

Show or hide UI with `<Show when="signed-in">`, `<Show when="signed-out">` or `<Show when={{ permission: 'org:invoices:create' }} fallback={...}>`; it replaces `SignedIn`, `SignedOut` and `Protect`. It only hides content visually, so never rely on it for security. The sign-out redirect is not a `UserButton` prop any more; pass `afterSignOutUrl="/"` to `<ClerkProvider>`. The old `afterSignInUrl`/`afterSignUpUrl` props became `fallbackRedirectUrl` and `signUpFallbackRedirectUrl`.

### 5. Organizations and roles

Enable Organizations in the dashboard first. The default roles are `org:admin` and `org:member`; extra roles and permissions (for example `org:projects:manage`) are defined under Organizations, Roles and permissions. There is no built-in `org:owner` role, so do not assume one exists.

```typescript
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function createOrg(name: string) {
  const { userId } = await auth();
  const client = await clerkClient(); // async in current versions
  return client.organizations.createOrganization({ name, createdBy: userId! });
}

export async function inviteMember(organizationId: string, emailAddress: string) {
  const { userId } = await auth();
  const client = await clerkClient();
  return client.organizations.createOrganizationInvitation({
    organizationId,
    emailAddress,
    role: 'org:member',
    inviterUserId: userId!,
  });
}
```

Authorization checks with `has()`:

```typescript
const { has } = await auth();
if (!has({ role: 'org:admin' })) throw new Error('Forbidden');
if (!has({ permission: 'org:projects:manage' })) throw new Error('Forbidden');
```

Prefer permission checks: they survive role renames. On the server `has({ permission })` only evaluates custom permissions you defined in the dashboard (check the role for system permissions), and role or permission checks need an active organization; without one they return false.

### 6. Webhooks

Create an endpoint in the dashboard (Configure, Webhooks), subscribe to events, and copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`. The route must be reachable without a session (do not call `auth.protect()` there). `verifyWebhook` (from `@clerk/nextjs/webhooks`) reads that variable and validates the signature, so you no longer need to wire up `svix` yourself.

```typescript
// app/api/webhooks/clerk/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);
    switch (evt.type) {
      case 'user.created':
        await db.users.create({ data: {
          clerkId: evt.data.id,
          email: evt.data.email_addresses[0]?.email_address,
          name: `${evt.data.first_name ?? ''} ${evt.data.last_name ?? ''}`.trim(),
        }});
        break;
      case 'user.deleted':
        await db.users.deleteMany({ where: { clerkId: evt.data.id } });
        break;
      case 'organization.created':
        await db.orgs.create({ data: { clerkOrgId: evt.data.id, name: evt.data.name, slug: evt.data.slug } });
        break;
    }
    return new Response('OK', { status: 200 });
  } catch {
    return new Response('Invalid webhook', { status: 400 });
  }
}
```

Common events: `user.created`, `user.updated`, `user.deleted`, `organization.created`, `organization.updated`, `organizationMembership.created`, `organizationMembership.deleted`. Any non-2xx response makes Clerk retry; locally, expose the route with a tunnel.

### 7. JWT templates for external APIs

Create a template in the dashboard (Configure, JWT templates), for example `api-token` with claims `{ "userId": "{{user.id}}", "orgId": "{{org.id}}", "role": "{{org.role}}" }`.

```typescript
// client
const { getToken } = useAuth();
const token = await getToken({ template: 'api-token' });

// external service
import { verifyToken } from '@clerk/backend';

export async function verifyRequest(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Missing token');
  return verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
}
```

A JWT template token is not bound to a session (no `sid`). If you only need extra claims on the normal session token, use a customised session token instead.

### 8. Express

The old `@clerk/clerk-sdk-node` package has been superseded by `@clerk/express`, and `requireAuth()` is deprecated in favour of `clerkMiddleware()` plus `getAuth()`.

```bash
npm install @clerk/express
```

```typescript
import express from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';

const app = express();
app.use(clerkMiddleware());

app.get('/api/me', (req, res) => {
  const { isAuthenticated, userId, orgId } = getAuth(req);
  if (!isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ userId, orgId });
});
```

`@clerk/express` reads `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the environment (no `NEXT_PUBLIC_` prefix outside Next.js).

## Examples

### Example 1: "Make everything under /dashboard private in my Next.js 15 app"

Run `npx -y clerk@latest init` (or add the two keys to `.env.local` and wrap `app/layout.tsx` in `<ClerkProvider>` inside `<body>`), keep the `proxy.ts`/`middleware.ts` from step 2, and protect the layout that fetches dashboard data:

```typescript
// app/dashboard/layout.tsx
import { auth } from '@clerk/nextjs/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <section>{children}</section>;
}
```

Check again in each route handler and server action under `/dashboard`: a layout alone does not re-run on client-side navigation.

Result: visiting `/dashboard` signed out redirects to `/sign-in`; after signing in the user lands back on `/dashboard`, and `await auth()` in the page returns their `userId`.

### Example 2: "Only org admins can create projects, and mirror users into Postgres"

Server action:

```typescript
'use server';
import { auth } from '@clerk/nextjs/server';

export async function createProject(name: string) {
  const { userId, orgId, has } = await auth();
  if (!orgId || !has({ role: 'org:admin' })) throw new Error('Forbidden');
  return db.projects.create({ data: { name, orgId, createdBy: userId } });
}
```

Add the `/api/webhooks/clerk` route from step 6, set `CLERK_WEBHOOK_SIGNING_SECRET=whsec_...`, and subscribe to `user.created` and `user.deleted`. Result: a member calling `createProject` gets "Forbidden", an admin gets the new row, and every sign-up appears in your `users` table within seconds.

## Guidelines

- Middleware is a convenience layer, not the only barrier: check `auth()` again in server components, route handlers and server actions.
- Verify every webhook signature (`verifyWebhook`); an unverified endpoint lets anyone forge user events.
- Webhooks are eventually consistent and can arrive out of order or twice: make handlers idempotent (upsert by `clerkId`). Keep a local copy of users and orgs rather than calling Clerk's Backend API on every request (rate limited).
- Never commit `CLERK_SECRET_KEY` or the webhook signing secret; only the publishable key is public.
- If your app uses Next.js 16, rename `middleware.ts` to `proxy.ts`; otherwise `clerkMiddleware` never runs and `auth()` fails to find it. Clerk Core 3 does not support Next.js 13 or 14.
- `hidePersonal` on `<OrganizationSwitcher>` removes personal workspaces for team-only products.
- Not a fit if you need a fully self-hosted identity provider; look at Keycloak or Auth.js instead.
