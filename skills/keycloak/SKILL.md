---
name: keycloak
description: >-
  Keycloak is an open-source identity and access management server that gives
  applications single sign-on with OAuth 2.0, OpenID Connect and SAML 2.0. Use
  when a user asks to set up or self-host Keycloak, add SSO or social login,
  create a realm or client, connect LDAP or Active Directory, require MFA,
  log in to a Next.js app with Keycloak, or manage users with kcadm or the
  Admin REST API.
license: Apache-2.0
compatibility: 'Keycloak 26.x; Docker or Podman for the container image, PostgreSQL or another supported database in production'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - identity
    - authentication
    - sso
    - oidc
    - self-hosted
  repository: https://github.com/keycloak/keycloak
---

# Keycloak — Open-Source Identity and Access Management

## Overview

Keycloak is an open-source identity and access management server, a CNCF incubating project that started at Red Hat. It handles single sign-on (SSO), OAuth 2.0, OpenID Connect, SAML 2.0, user federation (LDAP/Active Directory), social login, multi-factor authentication and fine-grained authorization, so applications delegate login to it instead of storing passwords. This skill targets Keycloak 26 (current: 26.8.0). Two things changed from the releases most tutorials describe: the first admin is created with `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` (`KEYCLOAK_ADMIN*` is deprecated), and the hostname option takes a full URL.

## Instructions

### Setup

```yaml
# docker-compose.yml — Keycloak with PostgreSQL behind a TLS-terminating reverse proxy
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.8.0
    command: start
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KC_BOOTSTRAP_ADMIN_USERNAME: bootstrap-admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
      KC_HOSTNAME: https://auth.ledgerline.dev      # public URL, scheme included
      KC_HTTP_ENABLED: "true"                       # the proxy terminates TLS and talks HTTP to :8080
      KC_PROXY_HEADERS: xforwarded                  # the proxy must set and overwrite X-Forwarded-*
      KC_HEALTH_ENABLED: "true"                     # /health/ready on the management port 9000
    ports:
      - "127.0.0.1:8080:8080"
    depends_on:
      - postgres

  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${KC_DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

`start` is production mode: it refuses to run without a hostname and, unless `KC_HTTP_ENABLED` is set, without a TLS certificate (`KC_HTTPS_CERTIFICATE_FILE` / `KC_HTTPS_CERTIFICATE_KEY_FILE`). `start-dev` relaxes all of that and is for local use only. The bootstrap admin is temporary: sign in, create a permanent admin user in the `master` realm, then delete the bootstrap one.

### Realm Configuration

```markdown
## Key Concepts

### Realm
- Isolated namespace for users, clients, roles
- Each realm has its own login page, user database, settings
- `master` is only for administering Keycloak; create a separate realm for applications

### Clients
- Applications that authenticate via Keycloak
- Types: public (SPA or mobile app, "Client authentication" off, PKCE) and
  confidential (backend, "Client authentication" on, has a secret)
- Configure redirect URIs, web origins (CORS), token lifetimes

### Roles
- Realm roles: global across all clients (admin, user, moderator)
- Client roles: scoped to a specific application (api:read, api:write)
- Composite roles: combine multiple roles into one

### Identity Providers
- Social: Google, GitHub, Facebook, LinkedIn, Microsoft
- Enterprise: SAML or OIDC (Okta, Microsoft Entra ID); LDAP and Active Directory
  are configured under User federation, not as identity providers
- Custom: any OIDC/SAML 2.0 provider

### Authentication Flows
- Username/password + OTP (TOTP/HOTP)
- WebAuthn (passkeys, security keys)
- Custom flows (conditional OTP, required actions)
```

Everything in the Admin Console can be scripted with `kcadm.sh`, shipped in the server's `bin` directory (`/opt/keycloak/bin` in the image):

```bash
kcadm.sh config credentials --server http://localhost:8080 --realm master --user bootstrap-admin
# prompts for the password, or reads it from KC_CLI_PASSWORD
kcadm.sh create realms -s realm=ledgerline -s enabled=true
kcadm.sh create roles -r ledgerline -s name=editor
kcadm.sh create users -r ledgerline -s username=maria.ortiz -s email=maria.ortiz@ledgerline.dev -s enabled=true
kcadm.sh add-roles -r ledgerline --uusername maria.ortiz --rolename editor
```

### Client Integration (Next.js)

Create a confidential OpenID Connect client with the redirect URI `https://app.ledgerline.dev/api/auth/callback/keycloak`, then:

```typescript
// src/auth.ts — Keycloak OIDC integration with Auth.js v5 (npm install next-auth@beta; `latest` is still v4)
import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

declare module "next-auth" { interface Session { accessToken?: string } }

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      // The issuer includes the realm: https://auth.ledgerline.dev/realms/ledgerline
      issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
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

With those three variable names the provider also works as a bare `providers: [Keycloak]`. Any other OIDC library needs only the discovery document at `<issuer>/.well-known/openid-configuration`.

### Admin API

```typescript
// Keycloak Admin REST API — manage users programmatically
const KEYCLOAK_URL = process.env.KEYCLOAK_URL;   // https://auth.ledgerline.dev
const REALM = process.env.KEYCLOAK_REALM;        // ledgerline

// A confidential client in the same realm with "Service account roles" enabled and the
// realm-management client roles manage-users and view-realm (reading a role needs the latter).
// (admin-cli is a public client: it has no secret and cannot use the client_credentials grant.)
async function getAdminToken(): Promise<string> {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET!,
      }),
    },
  );
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token;
}

async function createUser(userData: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const token = await getAdminToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...userData, enabled: true }),
  });
  if (res.status !== 201) throw new Error(`Create user failed: ${res.status}`); // 409 = already exists
  const userId = res.headers.get("Location")!.split("/").pop()!;

  // No password is set by the admin: the user gets an email with a link to choose one
  // (needs SMTP settings under Realm settings → Email)
  await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/execute-actions-email`, {
    method: "PUT",
    headers,
    body: JSON.stringify(["UPDATE_PASSWORD", "VERIFY_EMAIL"]),
  });
  return userId;
}

async function assignRole(userId: string, roleName: string) {
  const token = await getAdminToken();
  // Get role
  const rolesRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${roleName}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!rolesRes.ok) throw new Error(`Role lookup failed: ${rolesRes.status}`); // 403 = view-realm missing
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

### Installation

```bash
# Docker (development): dev mode, embedded database, HTTP on localhost only
docker run --name keycloak -p 127.0.0.1:8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$KC_ADMIN_PASSWORD" \
  quay.io/keycloak/keycloak:26.8.0 start-dev

# Production: a stock image is started with `start` (see the compose file above);
# `start --optimized` works only in an image where `kc.sh build` already ran

# Kubernetes: the Keycloak Operator, then a Keycloak custom resource
kubectl create namespace keycloak
kubectl apply -k 'github.com/keycloak/keycloak-k8s-resources/kubernetes?ref=26.8.0'

# Move a realm between environments (server stopped, same database options as the server)
/opt/keycloak/bin/kc.sh export --dir /opt/keycloak/data/export --realm ledgerline
/opt/keycloak/bin/kc.sh import --dir /opt/keycloak/data/export
```

## Examples

### Example 1: Local Keycloak with a realm and a client for a web app

User: "Run Keycloak locally and give me a client ID and secret for our Next.js app on localhost:3000."

```bash
docker run -d --name keycloak -p 127.0.0.1:8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$KC_ADMIN_PASSWORD" \
  quay.io/keycloak/keycloak:26.8.0 start-dev
until curl -sf -o /dev/null http://localhost:8080/realms/master; do sleep 2; done   # start-up takes 10-30 s

kc() { docker exec -e KC_CLI_PASSWORD="$KC_ADMIN_PASSWORD" keycloak /opt/keycloak/bin/kcadm.sh "$@"; }
kc config credentials --server http://localhost:8080 --realm master --user admin
kc create realms -s realm=ledgerline -s enabled=true
CID=$(kc create clients -r ledgerline -s clientId=ledgerline-web -s publicClient=false \
  -s 'redirectUris=["http://localhost:3000/api/auth/callback/keycloak"]' -i)
kc get clients/$CID/client-secret -r ledgerline
```

`-i` makes `create` print only the new client's internal ID, and the last command prints a JSON object whose `value` field is the client secret. Put the value into `.env.local` as `AUTH_KEYCLOAK_SECRET`, together with `AUTH_KEYCLOAK_ID=ledgerline-web` and `AUTH_KEYCLOAK_ISSUER=http://localhost:8080/realms/ledgerline`. `http://localhost:8080/realms/ledgerline/.well-known/openid-configuration` now returns the discovery document, and the Admin Console is at `http://localhost:8080/admin`.

### Example 2: Fix "redirect loops and http:// links" behind a reverse proxy

User: "Keycloak runs behind nginx on https://auth.ledgerline.dev, but the login page loads assets from http:// and the admin console spins forever."

Keycloak builds every URL from its hostname settings, so tell it its public address and that a proxy is in front:

```bash
/opt/keycloak/bin/kc.sh start --hostname https://auth.ledgerline.dev \
  --http-enabled true --proxy-headers xforwarded
```

and make nginx pass the original scheme and host (`proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). The `issuer` in `https://auth.ledgerline.dev/realms/ledgerline/.well-known/openid-configuration` then starts with `https://auth.ledgerline.dev`. To see what Keycloak derives from a request, start once with `--hostname-debug=true` and open `/realms/ledgerline/hostname-debug`.

## Guidelines

1. **Realm per environment** — Separate realms for dev/staging/production; export/import configs between them
2. **Confidential clients for backends** — Use client secret authentication; never expose secrets in frontend apps
3. **RBAC with roles** — Map business roles (admin, editor, viewer) to Keycloak realm/client roles
4. **Social login** — Enable Google/GitHub for developer tools, Google/Facebook for consumer apps (Apple has no built-in provider)
5. **Token lifetimes** — Keep access tokens short (minutes). A refresh token is bound to the user session: tune SSO Session Idle / SSO Session Max under Realm settings → Sessions instead of lengthening access tokens
6. **MFA for admins** — Require TOTP or WebAuthn for all admin and privileged accounts
7. **User federation** — Connect to existing LDAP/AD; Keycloak syncs users without migration
8. **Export realm config** — Export realm as JSON; store in Git for reproducible deployments. A `kc.sh export` contains users and credentials, so treat those files as secrets; the Admin Console's partial export leaves users out and masks secrets with `*`
9. **Never run `start-dev` in production** — it serves plain HTTP, uses an embedded file database and relaxes hostname checks
10. **Hide the admin surface** — Do not expose `/admin/`, `/realms/master/`, `/metrics` and `/health` to the internet; block them at the reverse proxy or put the console on a separate `--hostname-admin`
11. **Trust proxy headers only from your proxy** — with `--proxy-headers` set, a client that reaches Keycloak directly can forge `X-Forwarded-*`; the proxy must overwrite them and Keycloak must not be reachable around it
12. **Pin the image tag** — `quay.io/keycloak/keycloak:26.8.0`, not `latest`; read the upgrading guide before a major-version jump, as database migrations run on first start
