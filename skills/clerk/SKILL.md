---
name: clerk
category: Authentication & Security
tags: [auth, authentication, nextjs, react, user-management, organizations, sso]
version: 1.0.0
author: terminal-skills
---

# Clerk — Drop-In Authentication for React & Next.js

You are an expert in Clerk, the authentication platform for React and Next.js applications. You help developers add signup, login, user profiles, organizations, multi-factor auth, and role-based access control with pre-built UI components and a backend API — replacing weeks of auth code with a few lines of configuration.

## Core Capabilities

### Next.js Setup

```typescript
// middleware.ts — Protect routes with Clerk middleware
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/api/webhooks(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();                  // Redirect to sign-in if not authenticated
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

```tsx
// src/app/layout.tsx — Wrap app with ClerkProvider
import { ClerkProvider, SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs";

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html>
        <body>
          <header>
            <SignedOut>
              <SignInButton mode="modal" />
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

### Server-Side Auth

```typescript
// src/app/api/protected/route.ts — API route with auth
import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // Full user object with email, name, metadata
  const user = await currentUser();

  // Check organization role
  if (orgRole !== "org:admin") {
    return new Response("Forbidden", { status: 403 });
  }

  return Response.json({
    userId,
    email: user?.emailAddresses[0]?.emailAddress,
    org: orgId,
  });
}

// Server component with auth
import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = await auth();
  const data = await getUserData(userId!);
  return <Dashboard data={data} />;
}
```

### Organizations (Multi-Tenant)

```tsx
// Organization switcher + role-based access
import { OrganizationSwitcher, Protect } from "@clerk/nextjs";

function AdminPanel() {
  return (
    <div>
      <OrganizationSwitcher hidePersonal />

      {/* Only visible to org admins */}
      <Protect role="org:admin">
        <TeamSettings />
        <BillingSettings />
      </Protect>

      {/* Visible to admins and members */}
      <Protect role="org:member">
        <ProjectList />
      </Protect>
    </div>
  );
}
```

### Webhooks for Backend Sync

```typescript
// src/app/api/webhooks/clerk/route.ts — Sync user data to your database
import { Webhook } from "svix";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const payload = await req.text();
  const headerPayload = await headers();

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  const evt = wh.verify(payload, {
    "svix-id": headerPayload.get("svix-id")!,
    "svix-timestamp": headerPayload.get("svix-timestamp")!,
    "svix-signature": headerPayload.get("svix-signature")!,
  }) as any;

  switch (evt.type) {
    case "user.created":
      await db.insert(users).values({
        id: evt.data.id,
        email: evt.data.email_addresses[0].email_address,
        name: `${evt.data.first_name} ${evt.data.last_name}`,
      });
      break;
    case "user.deleted":
      await db.delete(users).where(eq(users.id, evt.data.id));
      break;
  }

  return new Response("OK");
}
```

## Installation

```bash
npm install @clerk/nextjs
# Get API keys: https://dashboard.clerk.com
# Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env
```

## Best Practices

1. **Middleware for protection** — Use `clerkMiddleware` to protect routes at the edge; don't check auth in every page component
2. **Webhooks for DB sync** — Use Clerk webhooks to sync user data to your database; don't rely on client-side user object for server logic
3. **Organizations for B2B** — Use Clerk Organizations for multi-tenant SaaS; handles team invites, roles, and billing scopes
4. **User metadata** — Store app-specific data in Clerk's `publicMetadata` (client-readable) and `privateMetadata` (server-only)
5. **Custom sign-in pages** — Use Clerk's `<SignIn>` component on custom pages for full control over the auth flow appearance
6. **Protect component** — Use `<Protect>` for role-based UI rendering; cleaner than manual role checks in every component
7. **Custom claims in JWT** — Add organization roles and user metadata to the session JWT for edge-side authorization
8. **Backend API for admin** — Use Clerk's Backend API to manage users programmatically (create, update, delete, impersonate)
