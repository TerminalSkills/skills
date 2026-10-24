---
title: Build Magic Link Authentication
slug: build-magic-link-authentication
description: Build a passwordless authentication system with magic links — generating secure tokens, rate-limited email delivery, one-click login, and revocable per-device sessions.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - authentication
  - passwordless
  - magic-link
  - security
  - login
---

# Build Magic Link Authentication

## The Problem

Yuki leads product at a 20-person SaaS. Password-related support tickets eat hours every week: "forgot password", "account locked", "password doesn't work." Many signup attempts are abandoned at the password creation step, and reused passwords leaked from other sites put their users at risk. A magic link replaces the password: the user enters an email address, gets a one-time link, clicks it and is signed in.

A magic link is only as safe as the code around it. The common failures are links that mail scanners use up before the human clicks, tokens that can be redeemed twice in a race, open redirects after login, and responses that reveal which emails have accounts.

## The Solution

A small Hono service: Zod validates input, Redis holds hashed one-time tokens and rate-limit counters for ten minutes, and Postgres holds users and revocable sessions. Checked against `hono` 4, `zod` 4, `ioredis` 6 and `pg` 8; Redis 7 or later is required (`GETDEL`, `EXPIRE ... NX`), and the flow was run end to end against Redis 8 and Postgres 16.

Design choices that matter:

- **Single use, atomic.** The token is consumed with `GETDEL`, so two requests cannot both succeed.
- **The emailed link only shows a button.** Mail scanners and link previewers fetch URLs with GET; the token is consumed by the POST that the button sends.
- **Hashed at rest.** Redis stores SHA-256 of the token, so a Redis dump does not contain usable links.
- **Same answer for every address.** Rate-limited, unknown and valid emails all get the same response.
- **Opaque session cookie, not a JWT.** The session row can be revoked at any time, which is what a "manage devices" page needs. The cookie is `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- **Newest link wins.** Requesting a new link invalidates the previous one.

```bash
mkdir magic-link && cd magic-link && npm init -y && npm pkg set type=module
npm i ioredis pg hono @hono/node-server zod
npm i -D typescript tsx @types/node @types/pg
```

Set `DATABASE_URL`, `REDIS_URL` and `APP_URL` (the public origin used in the emailed link) in the environment.

## Step-by-Step Walkthrough

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,            -- stored lower-cased
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      TEXT NOT NULL UNIQUE,        -- sha256 of the cookie value
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent      TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id) WHERE revoked_at IS NULL;
```

### 2. Token, session and rate-limit logic

`sendMail` is the one piece you supply: call your email provider's SDK with the link. Keep the message short and include the request time so a user can spot a link they did not ask for.

```typescript
// src/magic-link.ts
import { randomBytes, createHash } from "node:crypto";
import { Redis } from "ioredis";
import pg from "pg";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const LINK_TTL_SEC = 10 * 60;
const SESSION_DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Plug in your email provider's SDK here (Postmark, SES, Resend, ...).
export type SendMail = (to: string, link: string) => Promise<void>;

// Counter that starts its window on the first hit; returns false once over the limit.
async function allow(key: string, limit: number, windowSec: number) {
  const [[, count]] = (await redis.multi().incr(key).expire(key, windowSec, "NX").exec())!;
  return (count as number) <= limit;
}

// Only same-site relative paths: "//evil.com" and "https://..." would be open redirects.
export const safePath = (p?: string) => (p && /^\/(?![/\\])/.test(p) ? p : "/");

export async function requestMagicLink(email: string, ip: string, redirectTo: string | undefined, sendMail: SendMail) {
  email = email.trim().toLowerCase();
  const ok = (await allow(`magic:rate:email:${email}`, 5, 3600)) && (await allow(`magic:rate:ip:${ip}`, 20, 3600));
  if (!ok) return; // the caller answers identically either way, so nobody can probe which emails exist

  const token = randomBytes(32).toString("base64url");     // 256 bits, URL-safe
  const key = `magic:token:${sha256(token)}`;               // only the hash is stored
  const latest = `magic:latest:${email}`;
  const previous = await redis.set(latest, key, "EX", LINK_TTL_SEC, "GET"); // newest link wins
  if (previous) await redis.del(previous);
  await redis.set(key, JSON.stringify({ email, redirectTo: safePath(redirectTo) }), "EX", LINK_TTL_SEC);

  await sendMail(email, `${process.env.APP_URL}/auth/verify?token=${token}`);
}

// Consume the token atomically: GETDEL means two clicks (or a scanner and a human) cannot both win.
export async function verifyMagicLink(token: string, ip: string, userAgent: string) {
  const raw = await redis.getdel(`magic:token:${sha256(token)}`);
  if (!raw) return null;
  const { email, redirectTo } = JSON.parse(raw) as { email: string; redirectTo: string };

  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`, [email]);

  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, user_agent, ip_address, expires_at) VALUES ($1,$2,$3,$4,$5)`,
    [sha256(sessionToken), user.id, userAgent.slice(0, 300), ip, expiresAt]);
  return { sessionToken, expiresAt, redirectTo };
}

export async function sessionFromToken(token: string) {
  const { rows: [s] } = await pool.query(
    `UPDATE sessions SET last_active_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id, user_id`, [sha256(token)]);
  return s as { id: string; user_id: string } | undefined;
}

export async function listSessions(userId: string) {
  const { rows } = await pool.query(
    `SELECT id, user_agent, ip_address, created_at, last_active_at FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_active_at DESC`, [userId]);
  return rows;
}

// exceptId keeps the current device signed in ("sign out everywhere else")
export async function revokeSessions(userId: string, opts: { id?: string; exceptId?: string }) {
  const { rowCount } = await pool.query(
    `UPDATE sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL
       AND ($2::uuid IS NULL OR id = $2) AND ($3::uuid IS NULL OR id <> $3)`,
    [userId, opts.id ?? null, opts.exceptId ?? null]);
  return rowCount ?? 0;
}
```

### 3. HTTP routes

`clientIp` reads `X-Forwarded-For`, which a client can forge. Use it only behind a proxy you control that overwrites the header, otherwise the per-IP limit is meaningless.

```typescript
// src/app.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import * as auth from "./magic-link";

const app = new Hono<{ Variables: { session: { id: string; user_id: string } } }>();
const COOKIE = "sid";
const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
const secure = process.env.NODE_ENV === "production";
const clientIp = (c: any) => c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"; // trust only behind your proxy

const sendMail: auth.SendMail = async (to, link) => { console.log(`mail to ${to}: ${link}`); }; // replace

app.post("/auth/request", async (c) => {
  const body = z.object({ email: z.email(), redirectTo: z.string().max(200).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Enter a valid email address." }, 400);
  await auth.requestMagicLink(body.data.email, clientIp(c), body.data.redirectTo, sendMail);
  return c.json({ message: "If that address can sign in, a link is on its way." });
});

// GET only shows a button. Mail scanners and link previewers fetch GET URLs, and must not burn the one-time token.
app.get("/auth/verify", (c) => {
  const token = TokenSchema.safeParse(c.req.query("token"));
  if (!token.success) return c.text("Invalid link.", 400);
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  return c.html(`<form method="post" action="/auth/verify"><input type="hidden" name="token" value="${token.data}"><button>Sign in</button></form>`);
});

app.post("/auth/verify", async (c) => {
  const form = await c.req.parseBody();
  const token = TokenSchema.safeParse(form.token);
  const result = token.success && await auth.verifyMagicLink(token.data, clientIp(c), c.req.header("user-agent") ?? "");
  if (!result) return c.text("This link is invalid or expired. Request a new one.", 400);
  setCookie(c, COOKIE, result.sessionToken, { httpOnly: true, secure, sameSite: "Lax", path: "/", expires: result.expiresAt });
  return c.redirect(result.redirectTo, 303);
});

app.use("/me/*", async (c, next) => {
  const t = getCookie(c, COOKIE);
  const s = t && await auth.sessionFromToken(t);
  if (!s) return c.json({ error: "Not signed in" }, 401);
  c.set("session", s);
  await next();
});
app.get("/me/sessions", async (c) => {
  const s = c.get("session");
  return c.json((await auth.listSessions(s.user_id)).map((r) => ({ ...r, current: r.id === s.id })));
});
app.delete("/me/sessions/:id", async (c) => {
  const s = c.get("session");
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Bad id" }, 400);
  return c.json({ revoked: await auth.revokeSessions(s.user_id, { id: id.data }) });
});
app.post("/me/sessions/revoke-others", async (c) => {
  const s = c.get("session");
  return c.json({ revoked: await auth.revokeSessions(s.user_id, { exceptId: s.id }) });
});
app.post("/me/logout", async (c) => {
  const s = c.get("session");
  await auth.revokeSessions(s.user_id, { id: s.id });
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3000) });
```

Run `psql "$DATABASE_URL" -f schema.sql`, then `npx tsx src/app.ts`. The server binds to 127.0.0.1; put TLS and your proxy in front of it.

### 4. Check the behavior

Request a link, open the GET URL (it only renders the button), POST the token, then replay it:

```console
$ curl -s -XPOST 127.0.0.1:3000/auth/request -H 'content-type: application/json' -d '{"email":"Yuki@Example.com","redirectTo":"/dashboard"}'
{"message":"If that address can sign in, a link is on its way."}
$ curl -si -c jar.txt -XPOST 127.0.0.1:3000/auth/verify -d "token=$TOKEN" | grep -i '^location\|set-cookie'
location: /dashboard
set-cookie: sid=...; Path=/; HttpOnly; SameSite=Lax
$ curl -s -XPOST 127.0.0.1:3000/auth/verify -d "token=$TOKEN"
This link is invalid or expired. Request a new one.
```

In testing, a second request for the same address invalidated the first link, the sixth request within an hour sent no email but got the same response, `redirectTo: "//evil.com"` fell back to `/`, and "sign out everywhere else" revoked the other device while keeping the current one.

## Real-World Example

Yuki's team ships this behind their login page. A new customer enters an email, clicks the link on their phone, taps "Sign in" and lands on the dashboard; the account is created on first sign-in, which is fine for this product because the link proves control of the mailbox. Support sees a new kind of ticket instead of "forgot password": "the link says expired", which is almost always a ten-minute timeout or a newer link. The reply is to request a new one, and the team shows that hint on the error page.

Two follow-ups for production: add an email-delivery webhook so bounces are visible, and decide whether sensitive actions (changing the email address, billing) should ask for a fresh link before they proceed. Users who share a mailbox or whose mail is delayed beyond ten minutes need a longer window or a typed code instead; tune `LINK_TTL_SEC` to what the mail provider actually delivers.

## Related Skills

- [hono](../skills/hono/) — Routes, cookies and middleware
- [zod](../skills/zod/) — Input validation for emails, tokens and ids
- [redis](../skills/redis/) — One-time tokens, atomic counters and expiry
- [postgresql](../skills/postgresql/) — Users and revocable sessions
- [typescript](../skills/typescript/) — Types for the auth module
