---
name: lucia-auth
description: >-
  You are an expert in Lucia, the lightweight authentication library for
  TypeScript. You help developers implement session-based authentication with
  email/password, OAuth (Google, GitHub, Discord), magic links, and two-factor
  authentication — providing a simple, database-agnostic auth layer that you
  understand and control, without the complexity of full auth platforms.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - authentication
    - sessions
    - oauth
    - typescript
    - auth
    - security
---

# Lucia Auth — Simple Authentication

You are an expert in Lucia, the lightweight authentication library for TypeScript. You help developers implement session-based authentication with email/password, OAuth (Google, GitHub, Discord), magic links, and two-factor authentication — providing a simple, database-agnostic auth layer that you understand and control, without the complexity of full auth platforms.

## Core Capabilities

### Session Management

```typescript
// lib/auth.ts
import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "./db";
import { users, sessions } from "./db/schema";

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,                        // Session cookie (cleared on browser close)
    attributes: { secure: process.env.NODE_ENV === "production" },
  },
  getUserAttributes: (attributes) => ({
    email: attributes.email,
    name: attributes.name,
    avatarUrl: attributes.avatar_url,
  }),
});

// Email/password signup
async function signup(email: string, password: string, name: string) {
  const hashedPassword = await new Argon2id().hash(password);
  const userId = generateIdFromEntropySize(10);

  await db.insert(users).values({
    id: userId,
    email,
    name,
    hashedPassword,
  });

  const session = await lucia.createSession(userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  return sessionCookie;                    // Set as response cookie
}

// Login
async function login(email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error("Invalid credentials");

  const valid = await new Argon2id().verify(user.hashedPassword, password);
  if (!valid) throw new Error("Invalid credentials");

  const session = await lucia.createSession(user.id, {});
  return lucia.createSessionCookie(session.id);
}

// Validate session (middleware)
async function validateRequest(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  const sessionId = lucia.readSessionCookie(cookieHeader ?? "");
  if (!sessionId) return { user: null, session: null };

  const result = await lucia.validateSession(sessionId);
  return result;                           // { user, session } or { user: null, session: null }
}

// Logout
async function logout(sessionId: string) {
  await lucia.invalidateSession(sessionId);
  return lucia.createBlankSessionCookie();
}
```

### OAuth (Google)

```typescript
import { Google } from "arctic";

const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  "https://myapp.com/auth/google/callback",
);

// Redirect to Google
app.get("/auth/google", async (c) => {
  const [url, codeVerifier, state] = await google.createAuthorizationURL();
  // Store codeVerifier and state in cookie
  return c.redirect(url.toString());
});

// Handle callback
app.get("/auth/google/callback", async (c) => {
  const { code, state } = c.req.query();
  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const googleUser = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.accessToken()}` },
  }).then(r => r.json());

  // Find or create user
  let user = await db.query.users.findFirst({ where: eq(users.email, googleUser.email) });
  if (!user) {
    const userId = generateIdFromEntropySize(10);
    [user] = await db.insert(users).values({
      id: userId, email: googleUser.email, name: googleUser.name, avatar_url: googleUser.picture,
    }).returning();
  }

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  return c.redirect("/dashboard", { headers: { "Set-Cookie": cookie.serialize() } });
});
```

## Installation

```bash
npm install lucia arctic                   # Lucia + OAuth helpers
npm install @lucia-auth/adapter-drizzle    # Or adapter-prisma, adapter-mongoose, etc.
npm install @node-rs/argon2                # Password hashing
```

## Best Practices

1. **Session-based** — Lucia uses server-side sessions + cookies; more secure than JWT for web apps
2. **Database-agnostic** — Adapters for Drizzle, Prisma, Mongoose, better-sqlite3, Turso, etc.
3. **Arctic for OAuth** — Use `arctic` library for OAuth providers; handles PKCE, state, tokens
4. **Argon2 for passwords** — Use `@node-rs/argon2` for hashing; industry standard, timing-safe
5. **Cookie security** — Set `secure: true` in production; `httpOnly` is automatic
6. **Session validation** — Call `validateSession()` on every request; auto-extends session expiry
7. **Invalidation** — `invalidateSession` for logout; `invalidateUserSessions` for security reset
8. **No magic** — Lucia is explicit; you write the signup/login/oauth flows; you understand every line
