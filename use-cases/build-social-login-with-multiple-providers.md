---
title: "Build Social Login with Multiple Providers"
description: "Add Google, GitHub, Apple, and X login to your Next.js app with email-based account linking, profile merging, and a custom sign-in page."
skills: [authjs, prisma]
difficulty: intermediate
time_estimate: "4 hours"
tags: [auth, oauth, social-login, nextjs, authjs, nextauth, prisma, google, github, apple]
---

# Build Social Login with Multiple Providers

## The Problem

Users abandon sign-up forms that ask for another password. You want social login done right: the same person signing in with Google and then GitHub ends up with one account, and nobody can take over an account by adding someone else's email address to a provider.

**Goal:** Social login with 4 providers, automatic account linking by verified email, and a branded sign-in page.

## The Solution

Use the **authjs** skill for the Auth.js (NextAuth v5) configuration and the **prisma** skill for the database adapter. The versions below were built and type-checked together: Next.js 16, `next-auth@5.0.0-beta.32`, `@auth/prisma-adapter` 2.11 and Prisma 7.10 with PostgreSQL.

Two things to know first. Auth.js is now part of Better Auth, which says it will keep addressing security patches and urgent issues and recommends Better Auth for new projects, and v5 is still published under the `beta` tag; for a greenfield project also look at Better Auth. And X does not return an email through Auth.js, so X accounts cannot be linked by email (see Account Linking).

## Step-by-Step Walkthrough

### Step 1: Install Dependencies

```bash
npm install next-auth@5.0.0-beta.32 @auth/prisma-adapter @prisma/client@7 @prisma/adapter-pg@7 pg
npm install -D prisma@7
npx auth secret   # writes AUTH_SECRET to .env.local
```

### Step 2: Prisma Schema

Prisma 7 takes the database URL in `prisma.config.ts` and needs a driver adapter at runtime. `email` is optional because X users have none, and there is no `VerificationToken` model because this setup has no magic-link provider.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  githubUsername String?
  xUsername      String?

  accounts Account[]
  sessions Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

```typescript
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient }; // survives dev hot reloads
export const prisma =
  g.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```

Then run `npx prisma migrate dev --name init` (needs `DATABASE_URL`).

### Step 3: Auth.js Configuration

Provider credentials are read from `AUTH_<PROVIDER>_ID` and `AUTH_<PROVIDER>_SECRET`, so none appear in code. Auth.js refuses to link accounts by email unless `allowDangerousEmailAccountLinking` is set, and that is only safe when the provider has verified the address. GitHub's profile does not say whether an email is verified, so the `signIn` callback checks it against the GitHub API, and Google and Apple profiles are checked for `email_verified`. The callback runs before Auth.js links or creates anything.

```typescript
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";
import Twitter from "next-auth/providers/twitter";
import { prisma } from "./lib/prisma";
// GitHub's profile hides whether the email is verified, so ask the API.
async function githubEmailIsVerified(accessToken: string | undefined, email: unknown) {
  if (!accessToken || typeof email !== "string") return false;
  const res = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return false;
  const emails: { email: string; verified: boolean }[] = await res.json();
  return emails.some((e) => e.email.toLowerCase() === email.toLowerCase() && e.verified);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [ // credentials come from AUTH_<PROVIDER>_ID / AUTH_<PROVIDER>_SECRET
    Google({ allowDangerousEmailAccountLinking: true }),
    GitHub({ allowDangerousEmailAccountLinking: true }),
    Apple({ allowDangerousEmailAccountLinking: true }),
    // X returns no email, so its accounts are never linked by email
    Twitter,
  ],
  session: { strategy: "database" },
  pages: { signIn: "/auth/signin" }, // OAuth errors are sent back here with ?error=
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      if (account?.provider === "apple") return String(profile?.email_verified) === "true";
      if (account?.provider === "github") return githubEmailIsVerified(account.access_token, profile?.email);
      return true;
    },
  },
  events: {
    // Runs after the user exists, so the update below always finds the row
    async signIn({ user, account, profile }) {
      if (!user.id) return;
      if (account?.provider === "github" && typeof profile?.login === "string") {
        await prisma.user.update({ where: { id: user.id }, data: { githubUsername: profile.login } });
      }
    },
  },
});
```

Expose the handlers:

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

### Step 4: Custom Sign-In Page

In Next.js 15 and 16, `searchParams` is a promise. The page accepts only relative `callbackUrl` values, so it cannot redirect users to another site.

```tsx
// app/auth/signin/page.tsx
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

const providers = [["google", "Google"], ["github", "GitHub"], ["apple", "Apple"], ["twitter", "X"]];

export default async function SignInPage({
  searchParams,
}: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";

  async function handleSignIn(provider: string) {
    "use server";
    try {
      await signIn(provider, { redirectTo });
    } catch (err) {
      if (err instanceof AuthError) redirect(`/auth/signin?error=${err.type}`);
      throw err; // the redirect to the provider is also thrown, so rethrow
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 p-8">
      <h1 className="text-2xl font-bold">Welcome back</h1>
      {error && (
        <p role="alert">
          {error === "OAuthAccountNotLinked"
            ? "This email is already used with another sign-in method. Use that one."
            : "Sign-in failed. Please try again."}
        </p>
      )}
      {providers.map(([id, name]) => (
        <form key={id} action={handleSignIn.bind(null, id)}>
          <button className="w-full rounded-lg border py-2.5">Continue with {name}</button>
        </form>
      ))}
    </main>
  );
}
```

### Step 5: Protecting Routes

Next.js 16 renamed `middleware.ts` to `proxy.ts`, and the proxy runs on the Node.js runtime, so the database session lookup works there. On Next.js 15 and older, middleware runs on the Edge runtime, where this Prisma adapter does not, so call `auth()` in a layout or page instead. Also call `auth()` in any server code that returns private data.

```typescript
// proxy.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith("/dashboard")) {
    const url = new URL("/auth/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = { matcher: ["/dashboard/:path*"] };
```

### Step 6: Provider Setup and Environment Variables

Register an OAuth app with each provider, using the callback URL `https://your-domain/api/auth/callback/<provider>` (`google`, `github`, `apple`, `twitter`; `http://localhost:3000/...` locally where allowed).

- **Google, GitHub, X:** create OAuth credentials in the Google Cloud console, GitHub Developer settings and the X developer portal (OAuth 2.0, web/confidential client).
- **Apple:** needs an Apple Developer account, a Services ID and a Sign in with Apple key (`.p8`). Apple only accepts HTTPS return URLs on a verified domain, so use a tunnel for local testing. The client secret is not a static string: it is a JWT signed with your key, and Apple rejects secrets that live longer than six months, so regenerate it on a schedule.

```javascript
// apple-secret.mjs (npm install jose)
import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";

// usage: node apple-secret.mjs AuthKey_ABC123DEFG.p8
const key = await importPKCS8(readFileSync(process.argv[2], "utf8"), "ES256");
const secret = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID })
  .setIssuer(process.env.APPLE_TEAM_ID).setIssuedAt()
  .setSubject(process.env.AUTH_APPLE_ID) // the Services ID, e.g. com.example.web
  .setAudience("https://appleid.apple.com")
  .setExpirationTime("180d") // Apple rejects secrets valid for more than six months
  .sign(key);
console.log(secret);
```

```env
AUTH_SECRET=<output of npx auth secret>
DATABASE_URL=postgresql://app:<password>@127.0.0.1:5432/app

AUTH_GOOGLE_ID=<client id>
AUTH_GOOGLE_SECRET=<client secret>
AUTH_GITHUB_ID=<client id>
AUTH_GITHUB_SECRET=<client secret>
AUTH_APPLE_ID=<Services ID, e.g. com.example.web>
AUTH_APPLE_SECRET=<JWT from apple-secret.mjs>
AUTH_TWITTER_ID=<client id>
AUTH_TWITTER_SECRET=<client secret>
```

## Account Linking

When a user signs in with GitHub using the same verified email as their existing Google account:

1. The `signIn` callback confirms GitHub verified the address.
2. Auth.js finds the existing `User` by email and adds a new `Account` row to it, so both providers now work.
3. The `signIn` event stores the GitHub username on the user.

If linking is not allowed, Auth.js returns the user with an `OAuthAccountNotLinked` error, which the sign-in page explains. Apple users who hide their email get a private relay address that will not match their other accounts, and X accounts have no email at all. Both stay separate unless the user is already signed in: calling `signIn("twitter")` with a session links the new provider account to that user.

## Real-World Example

A SaaS founder ships this on a Next.js app with Postgres. A teammate who joined with Google later clicks "Continue with GitHub" and is recognized as the same user, because both providers verified the same address. Someone who signs up with X gets a separate account until they link it while signed in, so the team adds a "Connect X" button to account settings.

## Related Skills

- [authjs](/skills/authjs) - Auth.js (NextAuth v5) providers, callbacks, sessions and proxy protection
- [prisma](/skills/prisma) - Prisma schema, client and driver adapters
