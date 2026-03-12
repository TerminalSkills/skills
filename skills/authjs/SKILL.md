---
name: authjs
category: Backend Development
tags: [authentication, oauth, nextjs, session, providers, jwt]
version: 1.0.0
author: terminal-skills
---

# Auth.js (NextAuth) — Authentication for the Web

You are an expert in Auth.js (formerly NextAuth.js), the authentication library for web frameworks. You help developers add sign-in with 80+ OAuth providers (Google, GitHub, Apple, Discord), email/password, magic links, and WebAuthn to Next.js, SvelteKit, Express, and other frameworks — with session management, JWT/database sessions, role-based access, and middleware protection.

## Core Capabilities

### Next.js Setup

```typescript
// auth.ts — Auth.js configuration
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { verifyPassword } from "./lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({ clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! }),
    GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        });
        if (!user || !await verifyPassword(credentials.password as string, user.hashedPassword)) {
          return null;
        }
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub, role: token.role },
    }),
    jwt: ({ token, user }) => {
      if (user) token.role = (user as any).role;
      return token;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});

// app/api/auth/[...nextauth]/route.ts
export { handlers as GET, handlers as POST } from "@/auth";
```

### Protected Routes

```typescript
// middleware.ts — Protect routes
import { auth } from "./auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isOnAdmin = req.nextUrl.pathname.startsWith("/admin");

  if (isOnAdmin && req.auth?.user?.role !== "admin") {
    return Response.redirect(new URL("/unauthorized", req.nextUrl));
  }
  if (isOnDashboard && !isLoggedIn) {
    return Response.redirect(new URL("/auth/signin", req.nextUrl));
  }
});

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
```

### React Components

```tsx
import { auth, signIn, signOut } from "@/auth";

// Server component
async function UserNav() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form action={async () => { "use server"; await signIn("google"); }}>
        <button>Sign in with Google</button>
      </form>
    );
  }

  return (
    <div>
      <img src={session.user.image!} alt="" className="w-8 h-8 rounded-full" />
      <span>{session.user.name}</span>
      <form action={async () => { "use server"; await signOut(); }}>
        <button>Sign out</button>
      </form>
    </div>
  );
}

// Client component
"use client";
import { useSession } from "next-auth/react";

function ClientProfile() {
  const { data: session, status } = useSession();
  if (status === "loading") return <Spinner />;
  if (!session) return <p>Not signed in</p>;
  return <p>Welcome, {session.user.name}!</p>;
}
```

## Installation

```bash
npm install next-auth@beta                 # Auth.js v5 for Next.js
npm install @auth/drizzle-adapter          # Database adapter
```

## Best Practices

1. **80+ providers** — Google, GitHub, Apple, Discord, Slack, etc.; add by importing and configuring
2. **Database adapters** — Drizzle, Prisma, MongoDB, Supabase, Turso; stores users and sessions
3. **Middleware protection** — Auth check at the edge; fast, runs before page renders
4. **Callbacks** — Use `jwt` and `session` callbacks to add custom fields (role, plan, org)
5. **Server actions** — `signIn()` and `signOut()` work as Next.js server actions; no client-side SDK needed
6. **Edge compatible** — Runs on Vercel Edge, Cloudflare Workers; JWT sessions for stateless auth
7. **CSRF protection** — Built-in CSRF token validation; no additional setup needed
8. **Multi-framework** — Works with Next.js, SvelteKit, Express, Qwik; same config pattern
