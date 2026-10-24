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

Use the **clerk-auth** skill to add production authentication in an afternoon. Clerk handles the auth infrastructure (hosted sign-in and sign-up components, social providers, sessions, organizations, roles, and a user dashboard) through a React component library and Next.js middleware. A webhook keeps a copy of the user and organization data in your own database for the queries that need it.

## Step-by-Step Walkthrough

### Step 1: Install and Configure

```text
Set up Clerk authentication for a Next.js App Router project. I need Google
and GitHub social login, email/password, and organization support for
multi-tenant teams. Protect all routes except the landing page and docs.
```

`@clerk/nextjs` 7.x supports Next.js 15.2.8 or newer in the 15.x line (the patched releases in its `peerDependencies`) and 16, and React 18 or 19. Next.js 14 is no longer supported. Clerk's current quickstart sets a project up with its CLI, which also writes the keys to `.env.local`:

```bash
npx -y clerk@latest init
npx -y clerk@latest enable orgs     # turn on Organizations for the instance
npx -y clerk@latest doctor          # checks the setup
```

Or install by hand and copy the keys from the Clerk Dashboard (`.env.local`, never committed; the secret key must never reach client code):

```bash
npm install @clerk/nextjs
```

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<publishable key from the Dashboard>
CLERK_SECRET_KEY=<secret key from the Dashboard>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

Enable Google and GitHub under User & authentication, Social connections, and email plus password under Email. Development instances use Clerk's shared OAuth credentials, so social login works without creating your own OAuth apps; production instances need your own.

### Step 2: Add the Provider, Middleware and Sign-in Pages

`ClerkProvider` goes inside `<body>`. The middleware file is named `proxy.ts` on Next.js 16 and newer, and `middleware.ts` on Next.js 15; the contents are identical.

```typescript
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider afterSignOutUrl="/">{children}</ClerkProvider>
      </body>
    </html>
  );
}
```

```typescript
// proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/', '/pricing', '/docs(.*)', '/sign-in(.*)', '/sign-up(.*)',
  '/api/webhooks(.*)', // Clerk calls this without a session; the handler verifies the signature
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect(); // signed-out users are sent to sign-in
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

Mount Clerk's components at the two public routes. For `app/sign-in/[[...sign-in]]/page.tsx` the whole page is `import { SignIn } from '@clerk/nextjs'; export default function Page() { return <SignIn />; }`, and `sign-up` is the same with `SignUp`.

### Step 3: Build Protected Pages

`auth()` is async and `has()` checks a role or permission on the server. A new Clerk organization has two built-in roles, `org:admin` (the creator) and `org:member`; anything else, such as an owner role, you create in the Dashboard first. With `cacheComponents` enabled in `next.config`, wrap server components that call `auth()` or `currentUser()` in `<Suspense>`.

```typescript
// app/dashboard/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const { orgId, orgRole, has } = await auth();
  if (!orgId) redirect('/onboarding'); // no team yet

  const user = await currentUser();
  return (
    <div>
      <h1>Welcome, {user?.firstName}</h1>
      <p>Organization: {orgId} ({orgRole})</p>
      {has({ role: 'org:admin' }) && <a href="/settings">Team Settings</a>}
    </div>
  );
}
```

```typescript
// app/settings/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const { has } = await auth();
  if (!has({ role: 'org:admin' })) redirect('/dashboard'); // checked on the server
  return <h1>Team Settings</h1>;
}
```

### Step 4: Protect API Routes

```typescript
// app/api/projects/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Always scope by the orgId from the session, never one sent by the client
  return NextResponse.json(await db.projects.findMany({ where: { organizationId: orgId } }));
}

export async function POST(request: Request) {
  const { userId, orgId, has } = await auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!has({ role: 'org:admin' })) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const body = await request.json();
  const project = await db.projects.create({
    data: { name: String(body.name), organizationId: orgId, createdBy: userId },
  });
  return NextResponse.json(project, { status: 201 });
}
```

### Step 5: Sync Users to Your Database

Clerk stores the user data, but features such as showing teammates' names next to your own records need a local copy. Clerk's guidance is to sync only when you need it: if the data you need is in the session token, skip the table. Webhook deliveries are at-least-once and not ordered, so the handler uses upserts and `deleteMany`, which give the same result when an event is repeated or arrives late.

In the Dashboard, Webhooks, add an endpoint for `https://<your-domain>/api/webhooks` (locally, a tunnel such as ngrok) with the `user.*`, `organization.*` and `organizationMembership.*` events, and put its signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`. `db` below stands in for your own data layer.

```typescript
// app/api/webhooks/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req); // checks the Svix signature with CLERK_WEBHOOK_SIGNING_SECRET
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  // Deliveries are at-least-once and unordered, so every write must be idempotent
  switch (evt.type) {
    case 'user.created':
    case 'user.updated': {
      const u = evt.data;
      const email = u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ?? '';
      const fields = { email, name: [u.first_name, u.last_name].filter(Boolean).join(' '), avatarUrl: u.image_url };
      await db.users.upsert({ where: { clerkId: u.id }, create: { clerkId: u.id, ...fields }, update: fields });
      break;
    }
    case 'user.deleted':
      if (evt.data.id) await db.users.deleteMany({ where: { clerkId: evt.data.id } });
      break;
    case 'organization.created':
    case 'organization.updated': {
      const o = evt.data;
      const fields = { name: o.name, slug: o.slug ?? '', logoUrl: o.image_url };
      await db.organizations.upsert({ where: { clerkOrgId: o.id }, create: { clerkOrgId: o.id, ...fields }, update: fields });
      break;
    }
    case 'organizationMembership.created':
    case 'organizationMembership.updated': {
      const m = evt.data;
      const key = { clerkOrgId: m.organization.id, clerkUserId: m.public_user_data.user_id };
      await db.memberships.upsert({ where: { clerkOrgId_clerkUserId: key }, create: { ...key, role: m.role }, update: { role: m.role } });
      break;
    }
    case 'organizationMembership.deleted':
      await db.memberships.deleteMany({
        where: { clerkOrgId: evt.data.organization.id, clerkUserId: evt.data.public_user_data.user_id },
      });
      break;
  }
  return new Response('OK', { status: 200 });
}
```

### Step 6: Add Organization UI

Clerk ships components for creating a team, switching teams, and managing members and roles:

```typescript
// app/onboarding/page.tsx
import { OrganizationList } from '@clerk/nextjs';

export default function OnboardingPage() {
  return (
    <main style={{ maxWidth: 500, margin: '80px auto' }}>
      <h1>Set up your team</h1>
      <OrganizationList hidePersonal afterCreateOrganizationUrl="/dashboard" afterSelectOrganizationUrl="/dashboard" />
    </main>
  );
}
```

```typescript
// components/app-header.tsx
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

export function AppHeader() {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', padding: 16 }}>
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/dashboard" />
      <UserButton />
    </header>
  );
}
```

## Real-World Example

A solo founder adds authentication on a Saturday morning. Clerk setup takes about 20 minutes: run the init command, enable organizations, wrap the app in `ClerkProvider`, add the proxy file. Google and GitHub login work in development without any OAuth app configuration.

By noon the organization flow works: the founder creates a test company, invites a friend by email, and the friend lands in the dashboard with the `org:member` role and only that company's data. The friend cannot open the settings page, because the server-side role check redirects them.

Once the webhook is live, signups, organization changes and membership changes upsert matching rows in PostgreSQL. The app queries its own database for business logic, and Clerk stays the auth layer rather than the data store.

## Related Skills

- [clerk-auth](../skills/clerk-auth/) -- Clerk API deep dive: custom flows, session tokens, JWT templates
