---
title: "Build Social Login with Multiple Providers"
description: "Add Google, GitHub, Apple, and Twitter/X login to your Next.js app with unified account linking, profile merging, and a custom sign-in page."
skills: [authjs, prisma]
difficulty: intermediate
time_estimate: "4 hours"
tags: [auth, oauth, social-login, nextjs, authjs, nextauth, prisma, google, github, apple]
---

# Build Social Login with Multiple Providers

## The Problem

Your sign-up form has a 40% drop-off rate. Users don't want to create another password. You need social login — but done right: same email across Google and GitHub should link to one account, not create duplicates.

**Goal:** Social login with 4 providers, automatic account linking by email, and a branded sign-in page.

---

## Who This Is For

**SaaS founder** adding social login to reduce signup friction. You want users to click "Continue with Google" and land inside your app in under 3 seconds.

---

## Step 1: Install Dependencies

```bash
pnpm add next-auth@beta @auth/prisma-adapter
pnpm add @prisma/client
pnpm add -D prisma
```

---

## Step 2: Prisma Schema

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Profile data merged from providers
  githubUsername  String?
  twitterHandle   String?
  bio             String?

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

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

```bash
pnpm prisma migrate dev --name init
```

---

## Step 3: Auth.js Configuration

```typescript
// auth.ts (project root)
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";
import Twitter from "next-auth/providers/twitter";
import { prisma } from "./lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // enable account linking
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    Apple({
      clientId: process.env.APPLE_ID!,
      clientSecret: process.env.APPLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    Twitter({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      // Twitter v2 doesn't always return email — handle gracefully
    }),
  ],

  session: {
    strategy: "database", // use DB sessions, not JWT
  },

  callbacks: {
    async session({ session, user }) {
      // Attach user id and extra profile data to session
      session.user.id = user.id;
      return session;
    },

    async signIn({ user, account, profile }) {
      // Merge provider-specific profile data into User record
      if (account?.provider === "github" && profile?.login) {
        await prisma.user.update({
          where: { id: user.id },
          data: { githubUsername: profile.login as string },
        });
      }

      if (account?.provider === "twitter" && profile?.data) {
        const twitterData = profile.data as { username: string };
        await prisma.user.update({
          where: { id: user.id },
          data: { twitterHandle: twitterData.username },
        });
      }

      return true;
    },
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});
```

---

## Step 4: Route Handler

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

---

## Step 5: Custom Sign-In Page

```tsx
// app/auth/signin/page.tsx
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const callbackUrl = searchParams.callbackUrl ?? "/dashboard";

  async function handleSignIn(provider: string) {
    "use server";
    try {
      await signIn(provider, { redirectTo: callbackUrl });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/auth/error?error=${error.type}`);
      }
      throw error;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to continue to your account
          </p>
        </div>

        {searchParams.error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {searchParams.error === "OAuthAccountNotLinked"
              ? "This email is already linked to another provider. Sign in with your original method."
              : "Something went wrong. Please try again."}
          </div>
        )}

        <div className="space-y-3">
          <form action={handleSignIn.bind(null, "google")}>
            <button className="flex w-full items-center justify-center gap-3 rounded-lg border py-2.5 text-sm font-medium hover:bg-gray-50">
              <GoogleIcon /> Continue with Google
            </button>
          </form>

          <form action={handleSignIn.bind(null, "github")}>
            <button className="flex w-full items-center justify-center gap-3 rounded-lg border py-2.5 text-sm font-medium hover:bg-gray-50">
              <GitHubIcon /> Continue with GitHub
            </button>
          </form>

          <form action={handleSignIn.bind(null, "apple")}>
            <button className="flex w-full items-center justify-center gap-3 rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-900">
              <AppleIcon /> Continue with Apple
            </button>
          </form>

          <form action={handleSignIn.bind(null, "twitter")}>
            <button className="flex w-full items-center justify-center gap-3 rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800">
              <TwitterIcon /> Continue with X
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 6: Protecting Routes

```typescript
// middleware.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isProtected = req.nextUrl.pathname.startsWith("/dashboard");

  if (isProtected && !isLoggedIn) {
    const redirectUrl = new URL("/auth/signin", req.nextUrl.origin);
    redirectUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

---

## Step 7: Environment Variables

```env
# .env.local
NEXTAUTH_SECRET=your-secret-32-chars-min
NEXTAUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

APPLE_ID=...
APPLE_SECRET=...

TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
```

---

## Account Linking Logic

When a user signs in with GitHub using the same email as their Google account:

1. Auth.js finds existing `User` by email
2. Creates a new `Account` record linked to the existing `User`
3. Both Google and GitHub tokens stored — user can log in via either
4. `signIn` callback merges GitHub username into profile

This requires `allowDangerousEmailAccountLinking: true` — safe when you trust providers verify emails (Google, GitHub, Apple do; Twitter doesn't always).

---

## Result

- ✅ 4 social providers with one config file
- ✅ Automatic account linking by email
- ✅ Provider-specific profile data merged into User
- ✅ Database sessions for security
- ✅ Branded sign-in page with Server Actions
- ✅ Protected routes via middleware

**Payoff:** Users sign up in one click, no password to forget, and your conversion rate goes up.
