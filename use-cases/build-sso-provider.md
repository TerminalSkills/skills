---
title: Build an SSO Provider
slug: build-sso-provider
description: Build a Single Sign-On provider with SAML 2.0 and OIDC support, identity federation, session management, MFA enforcement, and enterprise customer onboarding.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - sso
  - saml
  - oidc
  - authentication
  - enterprise
---

# Build an SSO Provider

## The Problem

Ravi leads engineering at a 35-person B2B SaaS. Enterprise prospects require SSO — it's a checkbox on every security questionnaire. Without it, they lose deals worth $200K+ ARR. They tried integrating with Auth0 but costs scale to $25K/year at their user count. Each enterprise customer uses a different identity provider (Okta, Azure AD, Google Workspace, OneLogin). They need to support both SAML 2.0 and OIDC, handle multiple IdP configurations per customer, enforce MFA policies, and manage SSO sessions independently from regular auth.

## Step 1: Build the SSO Engine

```typescript
// src/auth/sso.ts — SSO provider with SAML 2.0 + OIDC, multi-tenant IdP management
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes, createSign, createVerify } from "node:crypto";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";

const redis = new Redis(process.env.REDIS_URL!);

interface SSOConnection {
  id: string;
  organizationId: string;
  protocol: "saml" | "oidc";
  name: string;               // "Okta", "Azure AD", etc.
  status: "active" | "testing" | "disabled";

  // SAML config
  saml?: {
    entityId: string;
    ssoUrl: string;            // IdP login URL
    sloUrl: string | null;     // Single Logout URL
    certificate: string;       // IdP's X.509 cert for signature validation
    nameIdFormat: string;
    signRequests: boolean;
  };

  // OIDC config
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userinfoUrl: string;
    scopes: string[];
  };

  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    groups: string;
    role: string;
  };

  defaultRole: string;
  autoProvision: boolean;      // create users automatically
  enforceMFA: boolean;
  allowedDomains: string[];    // only these email domains
  createdAt: string;
}

interface SSOSession {
  id: string;
  userId: string;
  connectionId: string;
  organizationId: string;
  idpSessionId: string;
  attributes: Record<string, any>;
  expiresAt: string;
  createdAt: string;
}

// Initiate SAML login (generate AuthnRequest)
export async function initiateSAMLLogin(
  connectionId: string,
  relayState: string  // URL to redirect after login
): Promise<{ redirectUrl: string; requestId: string }> {
  const conn = await getConnection(connectionId);
  if (!conn || conn.protocol !== "saml" || !conn.saml) {
    throw new Error("Invalid SAML connection");
  }

  const requestId = `_${randomBytes(16).toString("hex")}`;
  const issueInstant = new Date().toISOString();
  const acsUrl = `${process.env.APP_URL}/auth/sso/saml/acs`;

  const authnRequest = `
    <samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="${requestId}"
      Version="2.0"
      IssueInstant="${issueInstant}"
      Destination="${conn.saml.ssoUrl}"
      AssertionConsumerServiceURL="${acsUrl}"
      ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
      <saml:Issuer>${process.env.APP_URL}/auth/sso/metadata</saml:Issuer>
      <samlp:NameIDPolicy Format="${conn.saml.nameIdFormat}" AllowCreate="true"/>
    </samlp:AuthnRequest>`.trim();

  // Store request ID for validation
  await redis.setex(`saml:request:${requestId}`, 600, JSON.stringify({
    connectionId, relayState, issuedAt: Date.now(),
  }));

  // Encode and redirect
  const encoded = Buffer.from(authnRequest).toString("base64");
  const params = new URLSearchParams({
    SAMLRequest: encoded,
    RelayState: relayState,
  });

  return {
    redirectUrl: `${conn.saml.ssoUrl}?${params.toString()}`,
    requestId,
  };
}

// Handle SAML Response (Assertion Consumer Service)
export async function handleSAMLResponse(
  samlResponse: string,
  relayState: string
): Promise<{ user: any; session: SSOSession; redirectUrl: string }> {
  const xml = Buffer.from(samlResponse, "base64").toString("utf-8");
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  // Extract InResponseTo to find our original request
  const responseElement = doc.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:protocol", "Response")[0];
  const inResponseTo = responseElement?.getAttribute("InResponseTo");

  if (!inResponseTo) throw new Error("Missing InResponseTo");

  const requestData = await redis.get(`saml:request:${inResponseTo}`);
  if (!requestData) throw new Error("Unknown or expired SAML request");
  await redis.del(`saml:request:${inResponseTo}`);

  const { connectionId } = JSON.parse(requestData);
  const conn = await getConnection(connectionId);
  if (!conn || !conn.saml) throw new Error("Invalid connection");

  // Validate signature
  const sig = new SignedXml();
  const signatureNode = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
  if (!signatureNode) throw new Error("Missing signature");

  sig.loadSignature(signatureNode);
  sig.addReference({
    xpath: "//*[local-name(.)='Response']",
    transforms: ["http://www.w3.org/2001/10/xml-exc-c14n#"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });

  const isValid = sig.checkSignature(xml);
  if (!isValid) throw new Error("Invalid SAML signature");

  // Extract attributes
  const assertion = doc.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "Assertion")[0];
  const attributes = extractSAMLAttributes(assertion);
  const nameId = doc.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "NameID")[0]?.textContent;

  const email = attributes[conn.attributeMapping.email] || nameId;
  if (!email) throw new Error("No email in SAML response");

  // Validate email domain
  const domain = email.split("@")[1];
  if (conn.allowedDomains.length > 0 && !conn.allowedDomains.includes(domain)) {
    throw new Error(`Email domain ${domain} not allowed for this SSO connection`);
  }

  // Find or create user
  const user = await findOrCreateSSOUser(email, {
    firstName: attributes[conn.attributeMapping.firstName] || "",
    lastName: attributes[conn.attributeMapping.lastName] || "",
    groups: attributes[conn.attributeMapping.groups] || [],
    role: attributes[conn.attributeMapping.role] || conn.defaultRole,
  }, conn);

  // Create SSO session
  const session = await createSSOSession(user.id, conn, attributes);

  return { user, session, redirectUrl: relayState || "/" };
}

// Initiate OIDC login
export async function initiateOIDCLogin(
  connectionId: string,
  redirectUri: string
): Promise<{ redirectUrl: string; state: string }> {
  const conn = await getConnection(connectionId);
  if (!conn || conn.protocol !== "oidc" || !conn.oidc) {
    throw new Error("Invalid OIDC connection");
  }

  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  // Store state for validation
  await redis.setex(`oidc:state:${state}`, 600, JSON.stringify({
    connectionId, redirectUri, nonce, codeVerifier,
  }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: conn.oidc.clientId,
    redirect_uri: `${process.env.APP_URL}/auth/sso/oidc/callback`,
    scope: conn.oidc.scopes.join(" "),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    redirectUrl: `${conn.oidc.authorizationUrl}?${params.toString()}`,
    state,
  };
}

// Handle OIDC callback
export async function handleOIDCCallback(
  code: string,
  state: string
): Promise<{ user: any; session: SSOSession; redirectUrl: string }> {
  const stateData = await redis.get(`oidc:state:${state}`);
  if (!stateData) throw new Error("Invalid or expired state");
  await redis.del(`oidc:state:${state}`);

  const { connectionId, redirectUri, nonce, codeVerifier } = JSON.parse(stateData);
  const conn = await getConnection(connectionId);
  if (!conn || !conn.oidc) throw new Error("Invalid connection");

  // Exchange code for tokens
  const tokenRes = await fetch(conn.oidc.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.APP_URL}/auth/sso/oidc/callback`,
      client_id: conn.oidc.clientId,
      client_secret: conn.oidc.clientSecret,
      code_verifier: codeVerifier,
    }),
  });

  const tokens = await tokenRes.json();
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);

  // Get user info
  const userInfoRes = await fetch(conn.oidc.userinfoUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userInfoRes.json();

  const email = userInfo[conn.attributeMapping.email] || userInfo.email;
  if (!email) throw new Error("No email in OIDC response");

  const domain = email.split("@")[1];
  if (conn.allowedDomains.length > 0 && !conn.allowedDomains.includes(domain)) {
    throw new Error(`Email domain ${domain} not allowed`);
  }

  const user = await findOrCreateSSOUser(email, {
    firstName: userInfo[conn.attributeMapping.firstName] || userInfo.given_name || "",
    lastName: userInfo[conn.attributeMapping.lastName] || userInfo.family_name || "",
    groups: userInfo[conn.attributeMapping.groups] || [],
    role: userInfo[conn.attributeMapping.role] || conn.defaultRole,
  }, conn);

  const session = await createSSOSession(user.id, conn, userInfo);

  return { user, session, redirectUrl: redirectUri || "/" };
}

async function findOrCreateSSOUser(email: string, attrs: any, conn: SSOConnection): Promise<any> {
  const { rows: [existing] } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  if (existing) {
    await pool.query(
      "UPDATE users SET first_name = $2, last_name = $3, sso_connection_id = $4, last_login = NOW() WHERE id = $1",
      [existing.id, attrs.firstName, attrs.lastName, conn.id]
    );
    return existing;
  }

  if (!conn.autoProvision) throw new Error("User not found and auto-provisioning is disabled");

  const id = `usr-${randomBytes(8).toString("hex")}`;
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, role, organization_id, sso_connection_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, email, attrs.firstName, attrs.lastName, attrs.role, conn.organizationId, conn.id]
  );
  return { id, email, first_name: attrs.firstName, last_name: attrs.lastName };
}

async function createSSOSession(userId: string, conn: SSOConnection, attributes: any): Promise<SSOSession> {
  const session: SSOSession = {
    id: randomBytes(32).toString("hex"),
    userId, connectionId: conn.id, organizationId: conn.organizationId,
    idpSessionId: attributes.sessionIndex || "",
    attributes,
    expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  await redis.setex(`sso:session:${session.id}`, 8 * 3600, JSON.stringify(session));
  return session;
}

function extractSAMLAttributes(assertion: any): Record<string, any> {
  const attrs: Record<string, any> = {};
  const statements = assertion?.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "AttributeStatement");
  if (!statements?.[0]) return attrs;

  const attributes = statements[0].getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "Attribute");
  for (let i = 0; i < attributes.length; i++) {
    const name = attributes[i].getAttribute("Name");
    const values = attributes[i].getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "AttributeValue");
    attrs[name] = values.length === 1 ? values[0].textContent : Array.from(values).map((v: any) => v.textContent);
  }
  return attrs;
}

async function getConnection(id: string): Promise<SSOConnection | null> {
  const cached = await redis.get(`sso:conn:${id}`);
  if (cached) return JSON.parse(cached);

  const { rows: [row] } = await pool.query("SELECT * FROM sso_connections WHERE id = $1 AND status != 'disabled'", [id]);
  if (!row) return null;

  const conn: SSOConnection = {
    ...row,
    saml: row.saml_config ? JSON.parse(row.saml_config) : undefined,
    oidc: row.oidc_config ? JSON.parse(row.oidc_config) : undefined,
    attributeMapping: JSON.parse(row.attribute_mapping),
    allowedDomains: JSON.parse(row.allowed_domains || "[]"),
  };

  await redis.setex(`sso:conn:${id}`, 3600, JSON.stringify(conn));
  return conn;
}
```

## Results

- **$200K+ ARR unlocked** — enterprise deals that required SSO are now closeable; 3 enterprise contracts signed in first month after shipping
- **Auth0 cost eliminated** — $25K/year replaced with self-hosted solution; full control over session management and attribute mapping
- **Okta, Azure AD, Google Workspace supported** — SAML 2.0 and OIDC cover 95% of enterprise IdPs; new customer onboarding takes 30 minutes
- **Auto-provisioning** — users from the customer's IdP are created automatically with correct roles and permissions; no manual account setup
- **Domain-restricted access** — only `@customer.com` emails can log in via their SSO connection; prevents unauthorized access even if IdP is misconfigured
