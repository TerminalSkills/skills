---
name: authjs
description: >-
  Auth.js (formerly NextAuth.js) is an open-source authentication library that
  adds OAuth sign-in, magic links, credentials and WebAuthn to Next.js,
  SvelteKit, Express and other frameworks. Use when a user asks to add login
  with Google or GitHub, set up NextAuth v5, protect routes with middleware or
  proxy, add roles to the session, or connect a database adapter such as
  Drizzle or Prisma. Notes that the project is in maintenance mode under Better
  Auth.
license: Apache-2.0
compatibility: "Node.js 18+; Next.js 14-16 (next-auth@beta, v5); AUTH_SECRET required"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/nextauthjs/next-auth
  tags:
    - authentication
    - oauth
    - nextjs
    - session
    - jwt
---

# Auth.js (NextAuth) — Authentication for the Web

## Overview

Auth.js is the successor to NextAuth.js. For Next.js you install `next-auth@beta` (the v5 line; `latest` on npm is still v4.24). Config lives in one root `auth.ts` that exports `handlers`, `auth`, `signIn` and `signOut`; `auth()` replaces `getServerSession`, `getToken` and `withAuth` everywhere (server components, route handlers, proxy). Environment variables use the `AUTH_` prefix and provider credentials named `AUTH_<PROVIDER>_ID` / `AUTH_<PROVIDER>_SECRET` are picked up automatically.

Status to know before choosing it: since September 2025 the project is maintained by the Better Auth team, in maintenance mode (security fixes, no new features), and Better Auth recommends itself for new projects. Existing Auth.js apps keep working; for a greenfield app, mention Better Auth as the alternative and let the user decide.

## Instructions

1. Install and create the secret:

```bash
npm install next-auth@beta
npx auth secret          # writes AUTH_SECRET to .env.local
```

2. Create `auth.ts` at the project root:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],   // reads AUTH_GOOGLE_ID/SECRET and AUTH_GITHUB_ID/SECRET
  pages: { signIn: "/login" },
});
```

3. Add the route handler `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

4. Register each provider's callback URL as `https://your-domain/api/auth/callback/<provider>` (for local development `http://localhost:3000/api/auth/callback/github`). Behind a proxy or on a non-Vercel host set `AUTH_URL` or `AUTH_TRUST_HOST=true`.

5. Protect routes. On Next.js 16 the file is `proxy.ts`; on earlier versions it is `middleware.ts` with `export { auth as middleware }`:

```typescript
// proxy.ts
export { auth as proxy } from "@/auth";
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
```

   For per-route logic pass a function and use the `authorized` callback (below). Do not rely on proxy alone: also call `auth()` inside pages, route handlers and server actions that return private data.

6. Read the session: `const session = await auth()` on the server; `useSession()` from `next-auth/react` in client components (wrap them in `<SessionProvider>`). Sign in and out with server actions: `await signIn("github")`, `await signOut()`.

7. Add a database adapter when you need stored users, accounts, verification tokens or magic links. Adapters are scoped packages (`@auth/drizzle-adapter`, `@auth/prisma-adapter`, ...); pass `adapter: DrizzleAdapter(db)`. With an adapter the default session strategy becomes `database`; the Credentials provider only works with `session: { strategy: "jwt" }`.

8. Roles and custom fields: copy them into the token in `jwt`, then into the session in `session`, and extend the types.

```typescript
callbacks: {
  jwt({ token, user }) {
    if (user) token.role = user.role;          // user exists only at sign-in
    return token;
  },
  session({ session, token }) {
    session.user.id = token.sub!;
    session.user.role = token.role as string;
    return session;
  },
  authorized({ auth, request }) {              // used by the proxy/middleware wrapper
    if (request.nextUrl.pathname.startsWith("/admin")) return auth?.user?.role === "admin";
    return true;
  },
},
```

```typescript
// types/next-auth.d.ts
import "next-auth";
declare module "next-auth" {
  interface User { role?: string }
  interface Session { user: { id: string; role?: string } & DefaultSession["user"] }
}
declare module "next-auth/jwt" { interface JWT { role?: string } }
```

   A role stored in the JWT changes only when the user signs in again.

9. Edge runtimes cannot open database TCP connections. If the proxy runs on the edge, split the config: `auth.config.ts` holds providers and callbacks without the adapter, `auth.ts` spreads it and adds the adapter and `session: { strategy: "jwt" }`, and `proxy.ts` builds `NextAuth(authConfig).auth`. The edge instance can check the session cookie but cannot read the database.

## Examples

### Example 1: Add GitHub login to a Next.js 15 app

**User request:** "Add Sign in with GitHub to my Next.js app and show the user's avatar in the header."

Run `npm install next-auth@beta && npx auth secret`, create a GitHub OAuth app with callback `http://localhost:3000/api/auth/callback/github`, put `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` in `.env.local`, then add `auth.ts` and the route handler from the steps above. In the header:

```tsx
import { auth, signIn, signOut } from "@/auth";

export default async function UserNav() {
  const session = await auth();
  if (!session?.user) {
    return <form action={async () => { "use server"; await signIn("github"); }}><button>Sign in with GitHub</button></form>;
  }
  return (
    <form action={async () => { "use server"; await signOut(); }}>
      <img src={session.user.image ?? ""} alt="" width={32} height={32} />
      <span>{session.user.name}</span>
      <button>Sign out</button>
    </form>
  );
}
```

Result: the button redirects to GitHub, returns to `/`, and the header shows the avatar and name; a JWT session cookie named `authjs.session-token` is set.

### Example 2: Admin-only area with email and password

**User request:** "Only users with role admin may open /admin. Users are in Postgres through Drizzle and sign in with email and password."

Use the Credentials provider with a JWT session, validate input with Zod, and verify the password hash in `authorize`:

```typescript
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";

Credentials({
  credentials: { email: {}, password: {} },
  authorize: async (raw) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(raw);
    if (!parsed.success) return null;
    const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },
})
```

Add `session: { strategy: "jwt" }` and the `jwt`, `session` and `authorized` callbacks from step 8. A visitor without the role is redirected to the sign-in page; a wrong password returns to it with `?error=CredentialsSignin`.

## Guidelines

- Auth.js documents Credentials as the weakest option: it stores nothing for you, offers no rate limiting or password reset, and plaintext handling is your code. Prefer OAuth, magic links or passkeys, and add rate limiting yourself if you use it.
- `AUTH_SECRET` must be set in every environment and be different per environment; rotating it signs everyone out.
- v4 to v5 renames: `NEXTAUTH_*` becomes `AUTH_*`, `NextAuthOptions` becomes `NextAuthConfig`, `@next-auth/*-adapter` becomes `@auth/*-adapter`, and cookies are prefixed `authjs.` instead of `next-auth.`. Users are signed out after the upgrade.
- v5 is still published under the `beta` tag; pin the exact version in `package.json`.
- Link accounts carefully: automatic linking of OAuth accounts by email is off by default because it can allow account takeover with unverified provider emails; only enable `allowDangerousEmailAccountLinking` for providers that verify emails.
- Do not trust `session.user.role` on the client for authorization; check it again on the server.
- Never log tokens or put secrets in `NEXT_PUBLIC_` variables.
- For a new project, consider Better Auth instead; authjs.dev links a migration guide.
