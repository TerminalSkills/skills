---
title: Add Authentication to a Next.js App with Clerk
slug: add-authentication-with-clerk
description: "Set up complete authentication for a Next.js SaaS app with Clerk — social logins, email/password, multi-tenant organizations, role-based access control, and webhook sync to your database."
skills: [clerk-auth]
category: development
tags: [clerk, authentication, nextjs, rbac, organizations, saas]
---

# Add Authentication to a Next.js App with Clerk

## The Problem

A Next.js SaaS application needs authentication before launching to beta users. The founder has been putting it off because the options are overwhelming: NextAuth requires writing adapters and managing sessions, Firebase Auth locks you into Google's ecosystem, and building from scratch means implementing password hashing, email verification, magic links, OAuth flows, session management, CSRF protection, and a user management dashboard — months of work before writing a single product feature.

The requirements are specific to a B2B SaaS: social login (Google, GitHub), email/password for enterprise users who can't use social login, multi-tenant organizations where a company signs up and invites team members, role-based access control (owner, admin, member) for team management, and a webhook to sync user data to the application's PostgreSQL database. The authentication system needs to work with Next.js App Router, protect both pages and API routes, and handle the server-component world where traditional client-side auth patterns don't work.

## The Solution

Use the **clerk-auth** skill to add production authentication in an afternoon. Clerk handles the entire auth infrastructure — hosted login pages, social providers, session management, organization/team support, RBAC, and a user management dashboard — through a React component library and Next.js middleware. The webhook sync ensures your database always reflects the latest user and organization state.

## Step-by-Step Walkthrough

### Step 1: Install and Configure

```text
Set up Clerk authentication for a Next.js 14 App Router project. I need Google 
and GitHub social login, email/password, and organization support for multi-tenant 
teams. Configure middleware to protect all routes except the landing page and docs.
```

```bash
npm install @clerk/nextjs
```

Add Clerk keys to `.env.local` (from dashboard.clerk.com):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

### Step 2: Add the Provider and Middleware

The Clerk provider wraps the app, and middleware protects routes at the edge — before any page code runs:

```typescript
// app/layout.tsx — Root layout with Clerk provider

import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

```typescript
// middleware.ts — Route protection at the edge

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Public routes — accessible without authentication
const isPublicRoute = createRouteMatcher([
  '/',                    // Landing page
  '/pricing',
  '/docs(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',    // Webhook endpoints must be public
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();  // Redirects to sign-in if not authenticated
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

### Step 3: Build Protected Pages

Clerk integrates with Next.js server components — no client-side auth checks or loading states:

```typescript
// app/dashboard/page.tsx — Protected dashboard page (server component)

import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const { userId, orgId, orgRole } = await auth();

  // This page is already protected by middleware, but you can add
  // additional checks — e.g., require an organization
  if (!orgId) {
    redirect('/onboarding');  // Send to org creation if no team yet
  }

  const user = await currentUser();

  return (
    <div>
      <h1>Welcome, {user?.firstName}</h1>
      <p>Organization: {orgId}</p>
      <p>Role: {orgRole}</p>

      {/* Role-based UI — only admins see the settings link */}
      {(orgRole === 'org:admin' || orgRole === 'org:owner') && (
        <a href="/settings">Team Settings</a>
      )}
    </div>
  );
}
```

```typescript
// app/settings/page.tsx — Admin-only settings page

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const { orgRole } = await auth();

  // Server-side role check — no way to bypass via client
  if (orgRole !== 'org:admin' && orgRole !== 'org:owner') {
    redirect('/dashboard');
  }

  return (
    <div>
      <h1>Team Settings</h1>
      {/* Settings form */}
    </div>
  );
}
```

### Step 4: Protect API Routes

```typescript
// app/api/projects/route.ts — Protected API route

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch projects for this organization
  const projects = await db.projects.findMany({
    where: { organizationId: orgId },
  });

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins and owners can create projects
  if (orgRole !== 'org:admin' && orgRole !== 'org:owner') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const project = await db.projects.create({
    data: {
      name: body.name,
      organizationId: orgId,
      createdBy: userId,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
```

### Step 5: Sync Users to Your Database

Clerk stores user data, but your app needs a local copy for queries, relations, and business logic. Webhooks keep the database in sync:

```typescript
// app/api/webhooks/clerk/route.ts — Sync Clerk events to database

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id')!;
  const svixTimestamp = headerPayload.get('svix-timestamp')!;
  const svixSignature = headerPayload.get('svix-signature')!;

  const body = await req.text();

  // Verify the webhook signature (critical — prevents fake events)
  const wh = new Webhook(WEBHOOK_SECRET);
  let event: WebhookEvent;
  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'user.created':
    case 'user.updated': {
      const { id, email_addresses, first_name, last_name, image_url } = event.data;
      const primaryEmail = email_addresses.find(e => e.id === event.data.primary_email_address_id);

      await db.users.upsert({
        where: { clerkId: id },
        create: {
          clerkId: id,
          email: primaryEmail?.email_address || '',
          name: [first_name, last_name].filter(Boolean).join(' '),
          avatarUrl: image_url,
        },
        update: {
          email: primaryEmail?.email_address || '',
          name: [first_name, last_name].filter(Boolean).join(' '),
          avatarUrl: image_url,
        },
      });
      break;
    }

    case 'user.deleted': {
      await db.users.delete({ where: { clerkId: event.data.id } });
      break;
    }

    case 'organization.created':
    case 'organization.updated': {
      const { id, name, slug, image_url } = event.data;
      await db.organizations.upsert({
        where: { clerkOrgId: id },
        create: { clerkOrgId: id, name, slug: slug || '', logoUrl: image_url },
        update: { name, slug: slug || '', logoUrl: image_url },
      });
      break;
    }

    case 'organizationMembership.created': {
      const { organization, public_user_data, role } = event.data;
      await db.memberships.create({
        data: {
          clerkOrgId: organization.id,
          clerkUserId: public_user_data.user_id,
          role: role,
        },
      });
      break;
    }

    case 'organizationMembership.deleted': {
      const { organization, public_user_data } = event.data;
      await db.memberships.deleteMany({
        where: {
          clerkOrgId: organization.id,
          clerkUserId: public_user_data.user_id,
        },
      });
      break;
    }
  }

  return new Response('OK', { status: 200 });
}
```

### Step 6: Add Organization Switching UI

Clerk provides pre-built components for organization management — team creation, member invitations, and role management:

```typescript
// app/onboarding/page.tsx — Create or join an organization after signup

import { OrganizationList } from '@clerk/nextjs';

export default function OnboardingPage() {
  return (
    <div style={{ maxWidth: 500, margin: '80px auto' }}>
      <h1>Set up your team</h1>
      <p>Create a new team or accept a pending invitation.</p>

      <OrganizationList
        hidePersonal={true}  // B2B apps don't need personal workspaces
        afterCreateOrganizationUrl="/dashboard"
        afterSelectOrganizationUrl="/dashboard"
      />
    </div>
  );
}
```

```typescript
// components/org-switcher.tsx — Organization switcher in the app header

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

export function AppHeader() {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', padding: '16px' }}>
      <OrganizationSwitcher
        hidePersonal={true}
        afterSelectOrganizationUrl="/dashboard"
      />
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
```

## Real-World Example

A solo founder adds authentication on a Saturday morning. Clerk setup takes 20 minutes: create project, add environment variables, wrap the app in `ClerkProvider`, add middleware. Social login (Google + GitHub) works immediately — no OAuth app configuration needed for development.

By noon, the organization system is working: the founder creates a test company, invites a friend with a link, and the friend lands in the dashboard with `member` role and correctly scoped data. The friend can't access the settings page — the server-side role check redirects them.

The webhook sync runs 15 minutes after setup. Every signup, org creation, and membership change automatically creates corresponding records in PostgreSQL. The app queries its own database for all business logic — Clerk is the auth layer, not the data store.

The first 30 beta users sign up over the following week. 22 use Google login, 5 use GitHub, 3 use email/password (all from enterprises with SSO restrictions). The founder never writes a single line of password hashing, session management, or OAuth callback handling.

## Related Skills

- [clerk-auth](../skills/clerk-auth/) -- Clerk API deep dive: custom flows, session tokens, JWT templates
- [auth-system-setup](../skills/auth-system-setup/) -- General auth patterns for non-Clerk implementations
