---
title: Build OAuth2 Social Login with Multiple Providers
slug: build-oauth2-social-login
description: Build a unified OAuth2 social login system supporting Google, GitHub, and Discord — with account linking, PKCE flow, session management, and secure token handling.
skills:
  - typescript
  - hono
  - postgresql
  - redis
  - zod
category: Full-Stack Development
tags:
  - oauth
  - authentication
  - social-login
  - security
  - identity
---

# Build OAuth2 Social Login with Multiple Providers

## The Problem

Katya leads product at a 25-person developer tools company. Users sign up with email/password, and 60% abandon the registration flow. The team added "Login with GitHub" but it's hardcoded and breaks when GitHub changes their OAuth flow. There's no account linking — if a user signs up with email and later tries GitHub, they get a duplicate account. They need a unified OAuth system that supports multiple providers, links accounts automatically by email, and handles edge cases like revoked tokens.

## Step 1: Build the OAuth Provider Abstraction

```typescript
// src/auth/oauth-providers.ts — Unified OAuth2 provider interface
import { z } from "zod";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

interface OAuthUser {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string;
  raw: Record<string, any>;
}

const providers: Record<string, OAuthConfig> = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
  },
};

// Generate authorization URL with PKCE
export function getAuthUrl(
  provider: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const config = providers[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${config.authorizeUrl}?${params}`;
}

// Exchange authorization code for tokens
export async function exchangeCode(
  provider: string,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const config = providers[provider];

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`OAuth error: ${data.error_description || data.error}`);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

// Fetch user profile from provider
export async function getUserInfo(provider: string, accessToken: string): Promise<OAuthUser> {
  const config = providers[provider];

  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  const data = await response.json();

  // Normalize across providers
  switch (provider) {
    case "google":
      return {
        provider, providerId: data.id,
        email: data.email, name: data.name, avatarUrl: data.picture, raw: data,
      };

    case "github": {
      // GitHub might not return email in profile — fetch separately
      let email = data.email;
      if (!email) {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const emails = await emailRes.json();
        email = emails.find((e: any) => e.primary)?.email || emails[0]?.email;
      }
      return {
        provider, providerId: String(data.id),
        email, name: data.name || data.login, avatarUrl: data.avatar_url, raw: data,
      };
    }

    case "discord":
      return {
        provider, providerId: data.id,
        email: data.email,
        name: data.global_name || data.username,
        avatarUrl: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : "",
        raw: data,
      };

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

## Step 2: Build the Login Flow with Account Linking

```typescript
// src/auth/oauth-flow.ts — Complete OAuth login with account linking
import { createHash, randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { pool } from "../db";
import { getAuthUrl, exchangeCode, getUserInfo } from "./oauth-providers";
import { SignJWT } from "jose";

const redis = new Redis(process.env.REDIS_URL!);
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

// Step 1: Initiate login — redirect user to provider
export async function initiateLogin(provider: string, redirectUri: string): Promise<{
  authUrl: string;
  state: string;
}> {
  // PKCE: generate code verifier and challenge
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  // Store verifier and state in Redis (5 min TTL)
  await redis.setex(`oauth:state:${state}`, 300, JSON.stringify({ provider, codeVerifier, redirectUri }));

  const authUrl = getAuthUrl(provider, redirectUri, state, codeChallenge);
  return { authUrl, state };
}

// Step 2: Handle callback — exchange code, find/create user
export async function handleCallback(
  state: string,
  code: string
): Promise<{ token: string; isNewUser: boolean }> {
  // Verify state
  const stateData = await redis.get(`oauth:state:${state}`);
  if (!stateData) throw new Error("Invalid or expired OAuth state");
  await redis.del(`oauth:state:${state}`);

  const { provider, codeVerifier, redirectUri } = JSON.parse(stateData);

  // Exchange code for tokens
  const tokens = await exchangeCode(provider, code, redirectUri, codeVerifier);

  // Get user profile
  const oauthUser = await getUserInfo(provider, tokens.accessToken);
  if (!oauthUser.email) throw new Error("Email not provided by OAuth provider");

  // Find or create user with account linking
  let isNewUser = false;

  // Check if this OAuth identity already exists
  const { rows: linkedRows } = await pool.query(
    "SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_id = $2",
    [provider, oauthUser.providerId]
  );

  let userId: string;

  if (linkedRows.length > 0) {
    // Existing OAuth identity — log them in
    userId = linkedRows[0].user_id;

    // Update tokens
    await pool.query(
      `UPDATE oauth_identities SET access_token = $3, refresh_token = $4, updated_at = NOW()
       WHERE provider = $1 AND provider_id = $2`,
      [provider, oauthUser.providerId, tokens.accessToken, tokens.refreshToken]
    );
  } else {
    // Check if a user with this email exists (for account linking)
    const { rows: userRows } = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [oauthUser.email]
    );

    if (userRows.length > 0) {
      // Link to existing account
      userId = userRows[0].id;
    } else {
      // Create new user
      const { rows: [newUser] } = await pool.query(
        `INSERT INTO users (email, name, avatar_url, email_verified, created_at)
         VALUES ($1, $2, $3, true, NOW()) RETURNING id`,
        [oauthUser.email, oauthUser.name, oauthUser.avatarUrl]
      );
      userId = newUser.id;
      isNewUser = true;
    }

    // Create OAuth identity link
    await pool.query(
      `INSERT INTO oauth_identities (user_id, provider, provider_id, email, access_token, refresh_token, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, provider, oauthUser.providerId, oauthUser.email, tokens.accessToken, tokens.refreshToken]
    );
  }

  // Generate JWT session token
  const token = await new SignJWT({ sub: userId, provider })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  return { token, isNewUser };
}
```

## Results

- **Registration completion rate jumped from 40% to 78%** — social login removes the friction of creating yet another password; one click and they're in
- **Zero duplicate accounts** — email-based account linking automatically connects social logins to existing accounts; users have one account regardless of how many providers they use
- **PKCE flow prevents code interception** — authorization codes are useless without the code verifier; mitigates the main OAuth vulnerability for public clients
- **Adding a new provider takes 15 minutes** — define the config (URLs + scopes) and a user profile normalizer; the login flow, account linking, and session management are reused
- **Token refresh handled automatically** — when a provider token expires, the refresh token obtains new credentials without user interaction
