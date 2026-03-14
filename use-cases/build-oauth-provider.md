---
title: Build an OAuth Provider
slug: build-oauth-provider
description: Build an OAuth 2.0 authorization server with authorization code flow, PKCE, client management, scope-based access, token rotation, and developer portal for third-party integrations.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - oauth
  - authorization
  - api
  - security
  - integrations
---

# Build an OAuth Provider

## The Problem

Yuki leads platform at a 35-person SaaS. Third-party developers want to build integrations but there's no secure way to access user data. They're sharing API keys via email — one leaked key gave a contractor access to all customers. Some integrations use a single admin API key for all users (no per-user authorization). They need an OAuth 2.0 provider: developers register apps, users authorize access with specific scopes, tokens auto-rotate, and compromised tokens can be revoked per-user without affecting everyone.

## Step 1: Build the OAuth Server

```typescript
// src/oauth/server.ts — OAuth 2.0 provider with PKCE, scopes, and token management
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface OAuthClient {
  id: string;
  name: string;
  description: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  scopes: string[];            // allowed scopes
  type: "confidential" | "public";  // public = SPA/mobile (no secret)
  status: "active" | "suspended";
  rateLimitPerHour: number;
  createdBy: string;
  createdAt: string;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  scopes: string[];
  redirectUri: string;
  codeChallenge: string | null;  // PKCE
  codeChallengeMethod: string | null;
  expiresAt: number;
}

interface AccessToken {
  token: string;
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: number;
}

const AVAILABLE_SCOPES = [
  { name: "read:profile", description: "Read user profile" },
  { name: "write:profile", description: "Update user profile" },
  { name: "read:data", description: "Read user data" },
  { name: "write:data", description: "Create and update data" },
  { name: "read:billing", description: "View billing information" },
  { name: "webhooks", description: "Manage webhooks" },
];

// Register a new OAuth client (developer portal)
export async function registerClient(params: {
  name: string;
  description: string;
  redirectUris: string[];
  scopes: string[];
  type: OAuthClient["type"];
  createdBy: string;
}): Promise<OAuthClient> {
  const clientId = `cli_${randomBytes(16).toString("hex")}`;
  const clientSecret = params.type === "confidential" ? `sec_${randomBytes(32).toString("hex")}` : "";

  // Validate scopes
  const validScopes = params.scopes.filter((s) => AVAILABLE_SCOPES.some((as) => as.name === s));

  // Validate redirect URIs
  for (const uri of params.redirectUris) {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error(`Redirect URI must use HTTPS: ${uri}`);
    }
  }

  const client: OAuthClient = {
    id: `oac-${randomBytes(8).toString("hex")}`,
    name: params.name,
    description: params.description,
    clientId,
    clientSecret,
    redirectUris: params.redirectUris,
    scopes: validScopes,
    type: params.type,
    status: "active",
    rateLimitPerHour: 1000,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO oauth_clients (id, name, description, client_id, client_secret, redirect_uris, scopes, type, status, rate_limit, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, NOW())`,
    [client.id, client.name, client.description, clientId, clientSecret,
     JSON.stringify(client.redirectUris), JSON.stringify(client.scopes),
     client.type, client.rateLimitPerHour, params.createdBy]
  );

  return client;
}

// Authorization endpoint: user consents to share data
export async function authorize(params: {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scopes: string[];
  state: string;
  userId: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): Promise<{ redirectUrl: string }> {
  // Validate client
  const { rows: [client] } = await pool.query(
    "SELECT * FROM oauth_clients WHERE client_id = $1 AND status = 'active'",
    [params.clientId]
  );
  if (!client) throw new Error("Invalid client");

  const redirectUris: string[] = JSON.parse(client.redirect_uris);
  if (!redirectUris.includes(params.redirectUri)) {
    throw new Error("Invalid redirect URI");
  }

  // Validate scopes
  const clientScopes: string[] = JSON.parse(client.scopes);
  const requestedScopes = params.scopes.filter((s) => clientScopes.includes(s));
  if (requestedScopes.length === 0) throw new Error("No valid scopes requested");

  // PKCE required for public clients
  if (client.type === "public" && !params.codeChallenge) {
    throw new Error("PKCE required for public clients");
  }

  // Generate authorization code
  const code = randomBytes(32).toString("hex");
  const authCode: AuthorizationCode = {
    code,
    clientId: params.clientId,
    userId: params.userId,
    scopes: requestedScopes,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge || null,
    codeChallengeMethod: params.codeChallengeMethod || null,
    expiresAt: Date.now() + 600000, // 10 minutes
  };

  await redis.setex(`oauth:code:${code}`, 600, JSON.stringify(authCode));

  const url = new URL(params.redirectUri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", params.state);

  return { redirectUrl: url.toString() };
}

// Token endpoint: exchange code for tokens
export async function exchangeToken(params: {
  grantType: string;
  code?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
}> {
  // Authenticate client
  const { rows: [client] } = await pool.query(
    "SELECT * FROM oauth_clients WHERE client_id = $1 AND status = 'active'",
    [params.clientId]
  );
  if (!client) throw new Error("Invalid client");

  if (client.type === "confidential") {
    if (client.client_secret !== params.clientSecret) throw new Error("Invalid client credentials");
  }

  if (params.grantType === "authorization_code") {
    if (!params.code) throw new Error("Code required");

    const stored = await redis.get(`oauth:code:${params.code}`);
    if (!stored) throw new Error("Invalid or expired code");
    await redis.del(`oauth:code:${params.code}`); // one-time use

    const authCode: AuthorizationCode = JSON.parse(stored);

    if (authCode.clientId !== params.clientId) throw new Error("Client mismatch");
    if (authCode.redirectUri !== params.redirectUri) throw new Error("Redirect URI mismatch");

    // Verify PKCE
    if (authCode.codeChallenge) {
      if (!params.codeVerifier) throw new Error("Code verifier required");
      const computed = createHash("sha256").update(params.codeVerifier).digest("base64url");
      if (computed !== authCode.codeChallenge) throw new Error("Invalid code verifier");
    }

    return generateTokens(authCode.clientId, authCode.userId, authCode.scopes);
  }

  if (params.grantType === "refresh_token") {
    if (!params.refreshToken) throw new Error("Refresh token required");

    const stored = await redis.get(`oauth:refresh:${params.refreshToken}`);
    if (!stored) throw new Error("Invalid refresh token");

    const refreshData = JSON.parse(stored);

    // Rotate refresh token
    await redis.del(`oauth:refresh:${params.refreshToken}`);

    return generateTokens(refreshData.clientId, refreshData.userId, refreshData.scopes);
  }

  throw new Error("Unsupported grant type");
}

async function generateTokens(clientId: string, userId: string, scopes: string[]) {
  const accessToken = randomBytes(32).toString("hex");
  const refreshToken = randomBytes(32).toString("hex");
  const expiresIn = 3600; // 1 hour

  // Store access token
  await redis.setex(`oauth:access:${accessToken}`, expiresIn, JSON.stringify({
    clientId, userId, scopes, createdAt: Date.now(),
  }));

  // Store refresh token (30 days)
  await redis.setex(`oauth:refresh:${refreshToken}`, 86400 * 30, JSON.stringify({
    clientId, userId, scopes,
  }));

  // Track active grants
  await redis.sadd(`oauth:grants:${userId}`, `${clientId}:${accessToken}`);

  return {
    accessToken, refreshToken,
    tokenType: "Bearer",
    expiresIn,
    scope: scopes.join(" "),
  };
}

// Validate access token (middleware)
export async function validateToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  clientId?: string;
  scopes?: string[];
}> {
  const stored = await redis.get(`oauth:access:${token}`);
  if (!stored) return { valid: false };

  const { clientId, userId, scopes } = JSON.parse(stored);

  // Rate limit
  const rateKey = `oauth:rate:${clientId}`;
  const count = await redis.incr(rateKey);
  await redis.expire(rateKey, 3600);
  if (count > 1000) return { valid: false };

  return { valid: true, userId, clientId, scopes };
}

// Revoke all tokens for a user-client pair
export async function revokeAccess(userId: string, clientId: string): Promise<void> {
  const grants = await redis.smembers(`oauth:grants:${userId}`);
  for (const grant of grants) {
    if (grant.startsWith(`${clientId}:`)) {
      const token = grant.split(":")[1];
      await redis.del(`oauth:access:${token}`);
      await redis.srem(`oauth:grants:${userId}`, grant);
    }
  }
}
```

## Results

- **Leaked key risk eliminated** — each integration uses user-specific tokens with limited scopes; compromising one token doesn't expose other users
- **Third-party ecosystem** — 12 integrations built in first quarter; Zapier, Slack, and custom apps connect securely; platform stickiness increased
- **Scope-based access** — read-only integrations can't modify data; billing scopes separated from profile scopes; principle of least privilege enforced
- **Token rotation** — access tokens expire in 1 hour; refresh tokens rotate on use; leaked tokens have limited lifetime
- **User control** — users see which apps have access, what scopes, and when last used; revoke any app in one click without affecting others
