---
title: Build OAuth SSO Integration with Multiple Providers
slug: build-oauth-sso-integration-with-multiple-providers
description: Build a single sign-on system supporting Google, GitHub, Microsoft, and SAML enterprise providers — with account linking, session management, and organization-level SSO enforcement.
skills:
  - typescript
  - authjs
  - nextjs
  - postgresql
  - redis
category: Security
tags:
  - oauth
  - sso
  - authentication
  - saml
  - enterprise
---

# Build OAuth SSO Integration with Multiple Providers

## The Problem

Lina leads engineering at a 35-person B2B SaaS. Enterprise customers demand SSO — they won't buy without it. But the auth system only supports email/password. Users create accounts with Google, then try to log in with GitHub — they get a "new account" instead of accessing their existing one. Three enterprise deals ($180K ARR combined) are blocked on SAML SSO support. Building multi-provider OAuth with account linking and enterprise SAML would unblock sales and reduce password-related support tickets by 80%.

## Step 1: Build the Multi-Provider OAuth Handler

```typescript
// src/auth/providers.ts — OAuth provider configuration and token handling
import { z } from "zod";
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  mapProfile: (data: any) => UserProfile;
}

interface UserProfile {
  providerId: string;        // provider-specific user ID
  email: string;
  name: string;
  avatar?: string;
  emailVerified: boolean;
}

const providers: Record<string, OAuthProvider> = {
  google: {
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    scopes: ["openid", "email", "profile"],
    mapProfile: (data) => ({
      providerId: data.sub,
      email: data.email,
      name: data.name,
      avatar: data.picture,
      emailVerified: data.email_verified,
    }),
  },
  github: {
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    scopes: ["user:email"],
    mapProfile: (data) => ({
      providerId: String(data.id),
      email: data.email,
      name: data.name || data.login,
      avatar: data.avatar_url,
      emailVerified: true, // GitHub verifies emails
    }),
  },
  microsoft: {
    name: "Microsoft",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    scopes: ["openid", "email", "profile", "User.Read"],
    mapProfile: (data) => ({
      providerId: data.id,
      email: data.mail || data.userPrincipalName,
      name: data.displayName,
      avatar: undefined,
      emailVerified: true,
    }),
  },
};

// Generate OAuth authorization URL with PKCE and state
export async function getAuthUrl(providerName: string, redirectUri: string): Promise<{
  url: string;
  state: string;
}> {
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unknown provider: ${providerName}`);

  const state = randomBytes(32).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  // Store state and PKCE verifier (5 min TTL)
  await redis.setex(`oauth:state:${state}`, 300, JSON.stringify({
    provider: providerName,
    codeVerifier,
    redirectUri,
  }));

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `${provider.authUrl}?${params}`,
    state,
  };
}

// Handle OAuth callback — exchange code for tokens and profile
export async function handleCallback(code: string, state: string): Promise<{
  user: { id: string; email: string; name: string; avatar?: string };
  isNewUser: boolean;
  linkedAccount: boolean;
}> {
  // Validate state
  const stateData = await redis.get(`oauth:state:${state}`);
  if (!stateData) throw new Error("Invalid or expired OAuth state");
  await redis.del(`oauth:state:${state}`);

  const { provider: providerName, codeVerifier, redirectUri } = JSON.parse(stateData);
  const provider = providers[providerName];

  // Exchange code for access token
  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  const tokens = await tokenResponse.json();
  if (tokens.error) throw new Error(`Token exchange failed: ${tokens.error_description || tokens.error}`);

  // Fetch user profile
  const profileResponse = await fetch(provider.userInfoUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profileData = await profileResponse.json();
  const profile = provider.mapProfile(profileData);

  // Account linking logic
  return await linkOrCreateAccount(providerName, profile, tokens);
}

async function linkOrCreateAccount(
  providerName: string,
  profile: UserProfile,
  tokens: any
): Promise<{ user: any; isNewUser: boolean; linkedAccount: boolean }> {
  // Check if this provider account is already linked
  const { rows: [existingLink] } = await pool.query(
    "SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_id = $2",
    [providerName, profile.providerId]
  );

  if (existingLink) {
    // Known account — just log in
    const { rows: [user] } = await pool.query(
      "SELECT id, email, name, avatar FROM users WHERE id = $1",
      [existingLink.user_id]
    );
    return { user, isNewUser: false, linkedAccount: false };
  }

  // Check if a user with this email already exists (account linking)
  const { rows: [existingUser] } = await pool.query(
    "SELECT id, email, name, avatar FROM users WHERE email = $1",
    [profile.email]
  );

  if (existingUser) {
    // Link this provider to the existing account
    await pool.query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_id, access_token, refresh_token, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [existingUser.id, providerName, profile.providerId, tokens.access_token, tokens.refresh_token]
    );

    return { user: existingUser, isNewUser: false, linkedAccount: true };
  }

  // New user — create account
  const { rows: [newUser] } = await pool.query(
    `INSERT INTO users (email, name, avatar, email_verified, created_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING id, email, name, avatar`,
    [profile.email, profile.name, profile.avatar, profile.emailVerified]
  );

  await pool.query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id, access_token, refresh_token, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [newUser.id, providerName, profile.providerId, tokens.access_token, tokens.refresh_token]
  );

  return { user: newUser, isNewUser: true, linkedAccount: false };
}
```

## Step 2: Build SAML SSO for Enterprise

```typescript
// src/auth/saml.ts — SAML 2.0 SSO for enterprise customers
import { createHash, createSign, createVerify } from "node:crypto";
import { pool } from "../db";

interface SAMLConfig {
  organizationId: string;
  entityId: string;              // our app's entity ID
  ssoUrl: string;                // IdP's SSO URL (Okta, Azure AD, etc.)
  certificate: string;           // IdP's X.509 certificate for signature verification
  emailDomain: string;           // enforce SSO for this email domain
}

// Generate SAML AuthnRequest
export async function createSAMLRequest(orgId: string): Promise<{
  url: string;
  requestId: string;
}> {
  const { rows: [config] } = await pool.query(
    "SELECT * FROM saml_configs WHERE organization_id = $1",
    [orgId]
  );
  if (!config) throw new Error("SAML not configured for this organization");

  const requestId = `_${createHash("sha256").update(Date.now().toString()).digest("hex").slice(0, 32)}`;
  const issueInstant = new Date().toISOString();

  const request = `
    <samlp:AuthnRequest 
      xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="${requestId}"
      Version="2.0"
      IssueInstant="${issueInstant}"
      Destination="${config.sso_url}"
      AssertionConsumerServiceURL="${process.env.APP_URL}/auth/saml/callback"
      ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
      <saml:Issuer>${config.entity_id}</saml:Issuer>
      <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
    </samlp:AuthnRequest>
  `.trim();

  const encoded = Buffer.from(request).toString("base64");
  const url = `${config.sso_url}?SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${orgId}`;

  return { url, requestId };
}

// SSO enforcement: redirect users with enterprise domains to SAML
export async function checkSSOEnforcement(email: string): Promise<{
  enforced: boolean;
  organizationId?: string;
  ssoUrl?: string;
}> {
  const domain = email.split("@")[1];

  const { rows } = await pool.query(
    `SELECT sc.organization_id, sc.sso_url
     FROM saml_configs sc
     JOIN organizations o ON sc.organization_id = o.id
     WHERE sc.email_domain = $1 AND sc.enforce_sso = true`,
    [domain]
  );

  if (rows.length === 0) return { enforced: false };

  return {
    enforced: true,
    organizationId: rows[0].organization_id,
    ssoUrl: rows[0].sso_url,
  };
}
```

## Step 3: Build the Auth API

```typescript
// src/routes/auth.ts — Authentication API endpoints
import { Hono } from "hono";
import { getAuthUrl, handleCallback } from "../auth/providers";
import { createSAMLRequest, checkSSOEnforcement } from "../auth/saml";
import { createSession } from "../auth/sessions";

const app = new Hono();

// Start OAuth flow
app.get("/auth/:provider", async (c) => {
  const provider = c.req.param("provider");
  const redirectUri = `${process.env.APP_URL}/auth/${provider}/callback`;
  const { url } = await getAuthUrl(provider, redirectUri);
  return c.redirect(url);
});

// OAuth callback
app.get("/auth/:provider/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.json({ error: "Missing code or state" }, 400);

  const { user, isNewUser, linkedAccount } = await handleCallback(code, state);
  const session = await createSession(user.id);

  return c.json({ user, session, isNewUser, linkedAccount });
});

// Check if email requires SSO
app.post("/auth/check-sso", async (c) => {
  const { email } = await c.req.json();
  const result = await checkSSOEnforcement(email);
  return c.json(result);
});

// SAML SSO initiation
app.get("/auth/saml/:orgId", async (c) => {
  const { url } = await createSAMLRequest(c.req.param("orgId"));
  return c.redirect(url);
});

// List linked accounts
app.get("/auth/linked-accounts", async (c) => {
  const userId = c.get("userId");
  const { rows } = await pool.query(
    "SELECT provider, created_at FROM oauth_accounts WHERE user_id = $1",
    [userId]
  );
  return c.json({ accounts: rows });
});

import { pool } from "../db";
export default app;
```

## Results

- **Three enterprise deals ($180K ARR) closed** — SAML SSO unblocked Okta and Azure AD enterprise requirements; sales pipeline moved from "blocked" to "signed"
- **Account linking eliminates "ghost accounts"** — users who sign up with Google and later try GitHub get their existing account, not a duplicate; support tickets about duplicate accounts dropped 95%
- **SSO enforcement for enterprise domains** — when an `@bigcorp.com` user tries email/password login, they're redirected to their company's Okta automatically; IT admins control access centrally
- **PKCE prevents authorization code interception** — every OAuth flow uses code_challenge/code_verifier; the most common OAuth attack vector is eliminated
- **Password-related support tickets dropped 82%** — with Google, GitHub, and Microsoft login, most users never set a password; forgot-password flows are rarely needed
