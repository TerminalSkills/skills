---
name: oauth2-oidc
description: >-
  Assists with implementing OAuth 2.0 and OpenID Connect for secure authentication and
  authorization. Use when configuring authorization flows, validating tokens, implementing
  PKCE for public clients, setting up social login, or building secure token handling for
  SPAs, mobile apps, and APIs. Trigger words: oauth, oidc, openid connect, authorization
  code, pkce, jwt, access token, refresh token.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["oauth2", "oidc", "authentication", "authorization", "jwt"]
  repository: https://www.rfc-editor.org/rfc/rfc9700
---

# OAuth 2.0 / OpenID Connect

## Overview

OAuth 2.0 is the industry standard for API authorization, and OpenID Connect (OIDC) extends it for user authentication. Together they provide Authorization Code + PKCE for secure token exchange, JWT-based identity tokens, refresh token rotation, and integration with identity providers (Auth0, Okta, Keycloak, Google, Microsoft Entra ID) for social login and enterprise SSO.

## Instructions

Current baseline: RFC 9700 (OAuth 2.0 Security Best Current Practice, January 2025, BCP 240) updates RFC 6749; OAuth 2.1 is still an IETF draft (`draft-ietf-oauth-v2-1-16`), so cite RFC 9700 and RFC 7636 rather than "the OAuth 2.1 spec".

- When implementing authentication, use the Authorization Code flow with PKCE (`code_challenge_method=S256`, never `plain`). RFC 9700 makes PKCE mandatory for public clients (SPAs, mobile, CLI) and recommended for confidential clients. Do not use the Implicit flow (`response_type=token`; RFC 9700 says clients SHOULD NOT) or the Resource Owner Password flow (MUST NOT be used).
- Send a random `state` (or rely on PKCE) to bind the response to the request, and a `nonce` for OIDC; check both on return. Compare redirect URIs by exact string match, register each one, and use `https` (loopback or a claimed scheme for native apps, RFC 8252). Check the `iss` value in the authorization response (RFC 9207) when you talk to more than one authorization server.
- Treat the ID token as proof of login for the client only. Never send it to an API as a bearer credential, and never read user identity from an access token you do not own.
- When validating tokens on the API side, verify the JWT signature against the provider's JWKS (cached, refetched on an unknown `kid`), pin the accepted algorithms, and check `exp`, `iss` and `aud` (and `scope`). JWT access tokens follow RFC 9068 (header `typ: at+jwt`). If the provider issues opaque tokens, use introspection (RFC 7662) instead.
- When storing tokens in web apps, prefer a backend-for-frontend: the server keeps tokens and the browser holds only an `httpOnly`, `Secure`, `SameSite=Lax` session cookie. Avoid localStorage, which any XSS can read.
- When managing token lifecycle, use short-lived access tokens (5-15 minutes). Refresh tokens for public clients must be rotated (single-use, a new one with each refresh) or sender-constrained; reuse of an old one should revoke the whole family.
- When integrating a provider, read endpoints from `/.well-known/openid-configuration` (OIDC discovery) or RFC 8414 metadata instead of hardcoding them.
  Check what the provider supports before relying on it; Google's document, for example, has no `end_session_endpoint`:

  ```console
  $ curl -s https://accounts.google.com/.well-known/openid-configuration | jq '{issuer, jwks_uri, code_challenge_methods_supported}'
  {"issuer":"https://accounts.google.com","jwks_uri":"https://www.googleapis.com/oauth2/v3/certs","code_challenge_methods_supported":["plain","S256"]}
  ```
- When implementing logout, revoke the refresh token (RFC 7009), clear the local session, then redirect to the provider's `end_session_endpoint` with `id_token_hint` and a registered `post_logout_redirect_uri` (OIDC RP-Initiated Logout 1.0).

## Examples

### Example 1: Add social login to a Next.js app with PKCE

**User request:** "Implement Google and GitHub login for my Next.js app using OAuth 2.0"

**Actions:**
1. Register the app with Google (OIDC) and GitHub (plain OAuth 2.0, no ID token) and configure client IDs and redirect URIs
2. Implement the Authorization Code + PKCE flow with state validation (and nonce for OIDC)
3. Exchange the code for tokens; for Google validate the ID token claims (`iss`, `aud`, `exp`, `nonce`), for GitHub read the user from its API with the access token
4. Store the session in httpOnly cookies with refresh token rotation

**Output:** A Next.js app with secure social login via Google and GitHub, PKCE-protected token exchange, and httpOnly cookie sessions.

The authorization request (Node.js; both lengths verified at 43 characters):

```javascript
import { randomBytes, createHash } from 'node:crypto';

const verifier = randomBytes(32).toString('base64url');          // keep server-side, per login
const challenge = createHash('sha256').update(verifier).digest('base64url');
const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  response_type: 'code',
  client_id: process.env.GOOGLE_CLIENT_ID,
  redirect_uri: 'https://app.shopline.dev/auth/callback/google',
  scope: 'openid email profile',
  state: randomBytes(16).toString('base64url'),
  nonce: randomBytes(16).toString('base64url'),
  code_challenge: challenge,
  code_challenge_method: 'S256',
});
// redirect the browser to url; on the callback, check state, then POST code + code_verifier to the token endpoint
```

### Example 2: Secure a REST API with JWT validation

**User request:** "Add OAuth 2.0 token validation to my API endpoints"

**Actions:**
1. Fetch the provider's JWKS from the discovery endpoint
2. Create middleware that validates the access token signature, expiration, issuer, and audience
3. Extract user claims and custom scopes from the validated token
4. Return 401 for invalid tokens and 403 for insufficient scopes

**Output:** An API with JWT-based authorization that validates tokens against the provider's JWKS and enforces scope-based access control.

Verified with `jose` 6.2.13 (Node.js, ESM):

```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL('https://id.shopline.dev/.well-known/jwks.json'));

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return res.status(401).end();
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'https://id.shopline.dev/',
      audience: 'https://api.shopline.dev',
      algorithms: ['RS256'],
    });
    if (!String(payload.scope).split(' ').includes('orders:read')) return res.status(403).end();
    req.user = payload;
    next();
  } catch {
    res.status(401).end();   // bad signature, expired, wrong iss/aud
  }
}
```

A token minted for a different audience fails with `ERR_JWT_CLAIM_VALIDATION_FAILED`, so the API returns 401 rather than accepting it.

## Guidelines

- Use Authorization Code + PKCE (S256) for every client type; add `state` and `nonce`.
- Never accept a token you have not validated on the server: signature, `exp`, `iss`, `aud`, allowed algorithm. Do not accept `alg: none` or let the token header pick the algorithm.
- Keep tokens out of localStorage and URLs; use `httpOnly`, `Secure`, `SameSite=Lax` cookies or a backend-for-frontend.
- Rotate refresh tokens (single-use) and revoke on logout.
- Use discovery rather than hardcoded endpoints, and exact-match registered redirect URIs.
- Request the minimum scopes: `openid email` for login, not every scope available.
- Do not write your own authorization server unless you must; use a maintained one (Keycloak, Auth0, Okta, Entra ID) and a maintained client library.
- Implement full logout: revoke the refresh token, clear the session, redirect to the provider's logout endpoint.
