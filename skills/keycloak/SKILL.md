---
name: keycloak
description: >-
   You are an expert in Keycloak, the open-source identity and access
  management solution by Red Hat. You help teams implement single sign-on
  (SSO), OAuth 2.0, OpenID Connect, SAML 2.0, user federation (LDAP/Active
  Directory), social login, multi-factor authentication, and fine-grained
  authorization — providing enterprise-grade identity management that can be
  self-hosted and customized.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Security & Auth
  tags:
    - identity
    - authentication
    - sso
    - oauth2
    - oidc
    - saml
    - self-hosted
    - open-source
---

# Keycloak — Open-Source Identity and Access Management

You are an expert in Keycloak, the open-source identity and access management solution by Red Hat. You help teams implement single sign-on (SSO), OAuth 2.0, OpenID Connect, SAML 2.0, user federation (LDAP/Active Directory), social login, multi-factor authentication, and fine-grained authorization — providing enterprise-grade identity management that can be self-hosted and customized.

## Core Capabilities

### Setup

```yaml
# docker-compose.yml — Keycloak with PostgreSQL
version: "3.8"
services:
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
      KC_HOSTNAME: auth.example.com
      KC_PROXY_HEADERS: xforwarded
    ports:
      - "8080:8080"
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${KC_DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

### Client Integration (Next.js)

```typescript
// src/lib/auth.ts — Keycloak OIDC integration
import NextAuth from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});
```

### Admin API

```typescript
// Keycloak Admin REST API — manage users programmatically
const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;

async function getAdminToken(): Promise<string> {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "admin-cli",
        client_secret: process.env.KEYCLOAK_ADMIN_SECRET!,
      }),
    },
  );
  const { access_token } = await res.json();
  return access_token;
}

async function createUser(userData: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}) {
  const token = await getAdminToken();
  await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...userData,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: "temp123", temporary: true }],
    }),
  });
}

async function assignRole(userId: string, roleName: string) {
  const token = await getAdminToken();
  // Get role
  const rolesRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${roleName}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const role = await rolesRes.json();

  // Assign to user
  await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([role]),
    },
  );
}
```

### Realm Configuration

```markdown
## Key Concepts

### Realm
- Isolated namespace for users, clients, roles
- Each realm has its own login page, user database, settings
- Example: "production" realm, "staging" realm

### Clients
- Applications that authenticate via Keycloak
- Types: public (SPA), confidential (backend), bearer-only (API)
- Configure redirect URIs, CORS, token lifetimes

### Roles
- Realm roles: global across all clients (admin, user, moderator)
- Client roles: scoped to a specific application (api:read, api:write)
- Composite roles: combine multiple roles into one

### Identity Providers
- Social: Google, GitHub, Facebook, Apple, Microsoft
- Enterprise: SAML (Okta, Azure AD), LDAP, Active Directory
- Custom: any OIDC/SAML 2.0 provider

### Authentication Flows
- Username/password + OTP (TOTP/HOTP)
- WebAuthn (passkeys, security keys)
- Custom flows (conditional OTP, required actions)
```

## Installation

```bash
# Docker (development)
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:24.0 start-dev

# Production
docker run -e KC_DB=postgres -e KC_HOSTNAME=auth.example.com \
  quay.io/keycloak/keycloak:24.0 start --optimized

# Kubernetes (Helm)
helm install keycloak bitnami/keycloak
```

## Best Practices

1. **Realm per environment** — Separate realms for dev/staging/production; export/import configs between them
2. **Confidential clients for backends** — Use client secret authentication; never expose secrets in frontend apps
3. **RBAC with roles** — Map business roles (admin, editor, viewer) to Keycloak realm/client roles
4. **Social login** — Enable Google/GitHub for developer tools, Google/Apple for consumer apps
5. **Token lifetimes** — Access tokens: 5 minutes; refresh tokens: 30 days; balance security vs UX
6. **MFA for admins** — Require TOTP or WebAuthn for all admin and privileged accounts
7. **User federation** — Connect to existing LDAP/AD; Keycloak syncs users without migration
8. **Export realm config** — Export realm as JSON; store in Git for reproducible deployments
