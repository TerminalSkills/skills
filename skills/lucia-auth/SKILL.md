---
name: lucia-auth
description: >-
  Lucia was a TypeScript library for database-backed session authentication.
  Its npm package was deprecated in March 2025 and the project now ships one
  reference file for writing the session code yourself. Use when a project
  imports `lucia` or `@lucia-auth/adapter-*`, when npm prints the lucia
  deprecation warning, or when someone asks to "add Lucia auth", "migrate off
  Lucia v3", "implement sessions like Lucia", or "replace Arctic". Covers the
  project's current status, a hand-written session module (create, validate,
  invalidate, cookies, CSRF), password hashing, and a replacement that keeps
  existing Lucia v3 sessions valid.
license: Apache-2.0
compatibility: "Node.js 22+ (Web Crypto and Fetch API globals), Bun or Deno; any SQL database. Examples use better-sqlite3 13 (needs Node.js 22+), @node-rs/argon2 2 and TypeScript 5.7+. The deprecated lucia 3.2.2 package is only needed while migrating."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - authentication
    - sessions
    - lucia
    - typescript
    - security
  repository: https://github.com/lucia-auth/lucia
---

# Lucia Auth — Session Authentication Without the Library

## Overview

Lucia was a small TypeScript library that stored sessions in your database and handed you a cookie. It is no longer a library you install. Status checked on 2026-10-01:

- `lucia` 3.2.2 (October 2024) is the last release. The package and every `@lucia-auth/adapter-*` package are marked deprecated on npm; the author deprecated them in March 2025 because the adapter model was too rigid and sessions are short enough to write by hand.
- The repository `lucia-auth/lucia` now contains a README and `code/auth_session.ts`, a single 0BSD-licensed file that replaces the package. The migration page that the npm warning links to (`lucia-auth.com/lucia-v3/migrate`) was removed in July 2026 and returns 404.
- On 2026-07-29 the same author deprecated `arctic` (OAuth clients) and the `@oslojs/*` packages (`@oslojs/crypto`, `@oslojs/jwt` and the rest) except `@oslojs/encoding`; the older `oslo` package was already deprecated.
- The v3 documentation is still readable at `v3.lucia-auth.com`. The author's current material is the Auth Book at `auth.pilcrowonpaper.com`.

So "use Lucia" today means: own a session module of about fifty lines. This skill gives that module and the path off Lucia v3. For a maintained library with OAuth providers, two-factor, passkeys or organizations, use the `better-auth` or `authjs` skill instead.

## Instructions

### Choose a path

| Situation | What to do |
|---|---|
| New project, "set up Lucia" | Do not install `lucia`. Write the session module below, or pick a maintained library. |
| App already on Lucia v3 | It keeps running but gets no fixes. Swap in the v3-compatible module (Example 2); no database change, nobody is signed out. |
| OAuth through `arctic` | Deprecated. Send the authorization and token requests directly; `arcticjs.dev` links one example file per step, and the `oauth2-oidc` skill covers the flow. |
| Imports from `oslo` or `@oslojs/*` | Only `@oslojs/encoding` is maintained. Use Web Crypto (`crypto.subtle`, `crypto.getRandomValues`) and `@node-rs/argon2`. |

### Session table

```sql
CREATE TABLE user (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
) STRICT;

CREATE TABLE auth_session (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  secret_hash BLOB NOT NULL,           -- SHA-256 of the token secret; BYTEA on PostgreSQL
  last_verified_at INTEGER NOT NULL,   -- unix seconds
  created_at INTEGER NOT NULL
) STRICT;
```

On PostgreSQL `user` is a reserved word; name the table `app_user` there.

### Session module

The token given to the browser is `id.secret`. The database stores only a hash of the secret, so a leaked table cannot be replayed as cookies, and the secret is compared in constant time.

```typescript
// auth/session.ts — what `new Lucia(adapter)` used to provide, in one file you own
import Database from "better-sqlite3";

const db = new Database(process.env.DATABASE_PATH ?? "app.db");
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 10; // expires after 10 days without activity
export interface AuthSession { id: string; userId: string; lastVerifiedAt: number; createdAt: number }

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function createSession(userId: string): Promise<{ session: AuthSession; token: string }> {
  const id = hex(crypto.getRandomValues(new Uint8Array(12)));
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const now = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO auth_session (id, user_id, secret_hash, last_verified_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, await sha256(secret), now, now);
  return { session: { id, userId, lastVerifiedAt: now, createdAt: now }, token: `${id}.${hex(secret)}` };
}

export async function validateSessionToken(token: string): Promise<AuthSession | null> {
  const [id, secretHex, ...extra] = token.split(".");
  if (!id || !secretHex || extra.length > 0 || !/^[0-9a-f]{64}$/.test(secretHex)) return null;
  const row = db.prepare("SELECT user_id, secret_hash, last_verified_at, created_at FROM auth_session WHERE id = ?").get(id) as
    | { user_id: string; secret_hash: Uint8Array; last_verified_at: number; created_at: number } | undefined;
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now - row.last_verified_at >= SESSION_TTL_SECONDS) {
    db.prepare("DELETE FROM auth_session WHERE id = ?").run(id);
    return null;
  }
  const secret = Uint8Array.from(secretHex.match(/../g)!, (pair) => parseInt(pair, 16));
  if (!constantTimeEqual(await sha256(secret), row.secret_hash)) return null;
  if (now - row.last_verified_at >= 60 * 60) { // sliding expiration, at most one write per hour
    db.prepare("UPDATE auth_session SET last_verified_at = ? WHERE id = ?").run(now, id);
    row.last_verified_at = now;
  }
  return { id, userId: row.user_id, lastVerifiedAt: row.last_verified_at, createdAt: row.created_at };
}

export const invalidateSession = (id: string) => db.prepare("DELETE FROM auth_session WHERE id = ?").run(id);
export const invalidateUserSessions = (userId: string) => db.prepare("DELETE FROM auth_session WHERE user_id = ?").run(userId);
```

Only the six `db.prepare` calls are database-specific; replace them with the same statements in `pg`, Drizzle, Prisma or Kysely. The upstream `auth_session.ts` encodes the secret with `Uint8Array.prototype.toBase64()`, which needs Node.js 25 or newer; the hex encoding above also runs on Node.js 22 and 24.

### Cookies and CSRF

Set the token in a cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, a `Max-Age` equal to the session lifetime, and `Secure` on HTTPS. After a successful validation, set the cookie again to push its expiry forward. Because the browser attaches the cookie automatically, reject cross-site state-changing requests:

```typescript
export function rejectCrossSite(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  return request.headers.get("Sec-Fetch-Site") === "same-origin" ? null : new Response(null, { status: 403 });
}
```

Never change state in a GET handler. SvelteKit and Astro ship an origin check already; Express, Hono, Fastify and Next.js route handlers need the function above (or an `Origin` header comparison when older browsers or sibling subdomains must be supported).

### Passwords

```bash
npm install @node-rs/argon2 better-sqlite3
```

```typescript
import { hash, verify } from "@node-rs/argon2";

const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 3, parallelism: 1 }); // Argon2id
const ok = await verify(passwordHash, password);
```

The result is a self-describing string (`$argon2id$v=19$m=19456,t=3,p=1$…`), so parameters can be raised later without a migration. Hashes written by Lucia v3 guides (`@node-rs/argon2` or `oslo/password` Argon2id) verify with the same call. Hashes from Lucia's own `Scrypt` class have the form `salt:key` in hex and need that algorithm kept until each user's next sign-in, when the password can be rehashed.

## Examples

### Example 1: Email and password sign-in without the library

**User request:** "Add email/password login with cookie sessions to my API. I was going to use Lucia."

```typescript
// auth/http.ts — Fetch API handlers; usable from Hono, Next.js route handlers, SvelteKit, Bun or Deno
// (the ".ts" import runs as-is on Node.js 24, Bun and Deno; drop the extension under a bundler)
import { verify } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { createSession, invalidateSession, validateSessionToken, SESSION_TTL_SECONDS } from "./session.ts";

const db = new Database(process.env.DATABASE_PATH ?? "app.db");
const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
const sessionCookie = (token: string, maxAge: number) =>
  `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;

export async function currentSession(request: Request) {
  const token = request.headers.get("Cookie")?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  return token ? validateSessionToken(token) : null;
}

export async function signIn(email: string, password: string): Promise<Response> {
  const user = db.prepare("SELECT id, password_hash FROM user WHERE email = ?").get(email.toLowerCase()) as
    | { id: string; password_hash: string } | undefined;
  if (!user || !(await verify(user.password_hash, password))) return new Response("Invalid email or password", { status: 401 });
  const { token } = await createSession(user.id);
  return new Response(null, { status: 303, headers: { Location: "/dashboard", "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS) } });
}

export async function signOut(request: Request): Promise<Response> {
  const session = await currentSession(request);
  if (session) invalidateSession(session.id);
  return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": sessionCookie("", 0) } });
}
```

**Result:** a correct password answers `303` with `Set-Cookie: session=7403eb1acb375558bbf071cf.d88e2695…; HttpOnly; SameSite=Lax; Path=/; Max-Age=864000`; a wrong one answers `401 Invalid email or password`. `currentSession(request)` then returns `{ id, userId, lastVerifiedAt, createdAt }`, and `null` after sign-out. A POST without `Sec-Fetch-Site: same-origin` gets `403` from `rejectCrossSite`.

### Example 2: Move an app off Lucia v3 without signing anyone out

**User request:** "npm says lucia@3.2.2 is deprecated. Remove it from our app, but our users must stay logged in."

Lucia v3 stores the cookie value as the primary key of its session table and the expiry in `expires_at`. This module reads and writes the same rows, so cookies issued by Lucia stay valid:

```typescript
// auth/v3-compat.ts — same table and cookie as Lucia v3
import Database from "better-sqlite3";

const db = new Database(process.env.DATABASE_PATH ?? "app.db");
const TTL_SECONDS = 60 * 60 * 24 * 30;            // Lucia v3 default: 30 days
export const SESSION_COOKIE = "auth_session";      // Lucia v3 default cookie name
export interface Session { id: string; userId: string; expiresAt: Date }

export function createSession(userId: string): Session {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  db.prepare("INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, Math.floor(expiresAt.getTime() / 1000));
  return { id, userId, expiresAt };
}

export function validateSession(sessionId: string): Session | null {
  const row = db.prepare("SELECT user_id, expires_at FROM session WHERE id = ?").get(sessionId) as
    | { user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  let expiresAt = new Date(row.expires_at * 1000);
  if (Date.now() >= expiresAt.getTime()) {
    db.prepare("DELETE FROM session WHERE id = ?").run(sessionId);
    return null;
  }
  if (Date.now() >= expiresAt.getTime() - (TTL_SECONDS * 1000) / 2) { // extend when under half the lifetime is left
    expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
    db.prepare("UPDATE session SET expires_at = ? WHERE id = ?").run(Math.floor(expiresAt.getTime() / 1000), sessionId);
  }
  return { id: sessionId, userId: row.user_id, expiresAt };
}

export const invalidateSession = (id: string) => db.prepare("DELETE FROM session WHERE id = ?").run(id);
export const invalidateUserSessions = (userId: string) => db.prepare("DELETE FROM session WHERE user_id = ?").run(userId);
```

Then replace the calls and uninstall:

| Lucia v3 | Replacement |
|---|---|
| `lucia.createSession(userId, {})` | `createSession(userId)` |
| `lucia.validateSession(id)` returning `{ user, session }` | `validateSession(id)`, then load the user by `session.userId` |
| `lucia.readSessionCookie(header)` | read the `auth_session` cookie with the framework's cookie API |
| `lucia.createSessionCookie(id)` / `createBlankSessionCookie()` | set or clear `auth_session` with the attributes listed above |
| `lucia.invalidateSession(id)` / `invalidateUserSessions(userId)` | same names |
| `generateIdFromEntropySize(10)` | `crypto.randomUUID()` or random bytes encoded as hex |

```bash
npm uninstall lucia @lucia-auth/adapter-sqlite oslo
```

**Result:** a session created by `lucia@3.2.2` (`auth_session=vfhgcsuouvqsagoc4r45ikdylcnfwcm2acxxjela`) validates through `validateSession` and returns `{ id, userId: "u_8f3k2", expiresAt }`; new sessions land in the same table. The SQLite adapters store `expires_at` as unix seconds; the PostgreSQL schema uses `TIMESTAMPTZ`, so pass `Date` objects there. Table names are whatever was given to the adapter (`session`, `user_session`).

## Guidelines

- Say plainly that Lucia is deprecated when a user asks for it; do not run `npm install lucia`, `arctic` or `oslo` in a new project.
- The v3-compatible module keeps the old design, where the stored id is the secret itself. Treat it as a bridge: move to the hashed-secret module when a forced sign-out is acceptable (deploy it, drop the old table).
- Always generate ids and secrets with `crypto.getRandomValues`; never `Math.random`.
- Validate the session on every request on the server. Do not cache the result in a client-readable cookie or `localStorage`.
- Call `invalidateUserSessions(userId)` after a password change or reset, and create a fresh session at sign-in rather than reusing one.
- The `Sec-Fetch-Site` check is for cookie-authenticated browser traffic. Non-browser clients do not send the header; authenticate them with a token in the `Authorization` header on separate routes.
- Rate-limit sign-in and sign-up: Argon2 is deliberately expensive, so unthrottled endpoints are both a guessing and a denial-of-service risk. Example 1 answers faster for an unknown email than for a wrong password; where that leak matters, run `verify` against a fixed dummy hash when no user is found.
- Expired rows are only removed when their token is presented again; schedule `DELETE FROM auth_session WHERE last_verified_at < ?` to clear the rest.
- Email verification, password reset, OAuth, passkeys and two-factor are not part of this module and never were part of the `lucia` package. Each is separate code (the Auth Book has a chapter per topic) or a reason to choose a full library.
- When not to hand-roll: a team without the time to review auth code, or a product that needs many identity providers, should use a maintained library or a hosted service.
