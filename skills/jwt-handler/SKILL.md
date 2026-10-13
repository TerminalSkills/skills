---
name: jwt-handler
description: >-
  When the user needs to generate, validate, refresh, or debug JSON Web Tokens.
  Use when the user mentions "JWT," "access token," "refresh token," "token rotation,"
  "token expiration," "token validation," "bearer token," or "decode JWT."
  Handles secure token lifecycle including signing, verification, refresh rotation,
  and revocation. For full auth system design, see auth-system-setup.
license: Apache-2.0
compatibility: "Any language with JWT library support"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["jwt", "tokens", "authentication", "security"]
---

# JWT Handler

## Overview

Implements secure JWT token lifecycle for web applications — generation, validation, refresh rotation, revocation, and debugging. Produces code that follows current security best practices including short-lived access tokens, one-time refresh rotation with family tracking, and proper key management.

## Instructions

### Token Generation

When creating JWT tokens:

1. **Access token**: Short-lived (15 min), contains user ID and roles, signed with RS256 or ES256
2. **Refresh token**: Longer-lived (7-30 days), opaque or JWT, stored hashed in database
3. **Always use asymmetric signing** (RS256/ES256) for production — allows verification without the private key
4. **Minimal payload**: user ID, roles, issued-at, expiration. No PII, no secrets.

```typescript
// Access token payload — keep it minimal
{
  sub: "user_abc123",
  roles: ["member"],
  iat: 1708185600,
  exp: 1708186500  // 15 minutes
}
```

### Refresh Token Rotation

Implement one-time rotation with reuse detection:

1. Each refresh token belongs to a "family" (first token in chain)
2. On refresh: invalidate old token, issue new access + refresh pair
3. If a revoked token is presented → revoke ALL tokens in that family (theft detected)
4. Store in database: token_hash, family_id, user_id, expires_at, revoked_at

### Token Validation Middleware

```
1. Extract token from Authorization header (Bearer scheme)
2. Verify signature with the public key, passing an explicit allowlist: jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'app', audience: 'api' })
3. Check expiration (exp claim) — done by jwt.verify; clockTolerance: 30 allows 30 s of drift
4. Check issuer and audience (passed in step 2)
5. Attach decoded payload to request context
6. Return 401 with a specific error, mapped from the library's error name:
   - TokenExpiredError → token_expired
   - JsonWebTokenError (malformed, bad signature, wrong issuer or audience) → token_invalid
   - NotBeforeError → token_invalid
   - no Authorization header → token_missing
```

### Key Management

- Generate RSA 2048+ or EC P-256 key pairs
- Store private key in environment variable or secrets manager
- Expose public key via /.well-known/jwks.json endpoint
- Support key rotation: include key ID (kid) in token header (`keyid` option in jsonwebtoken), and look up the public key by `kid` when verifying
- Env vars hold PEM text with line breaks; a `.env` file needs `\n` escapes that the loader must turn back into newlines

## Examples

### Example 1: Node.js Token Service

**Prompt**: "Create a JWT token service with refresh rotation for my Express app"

**Output**:
```typescript
// token.service.ts
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export class TokenService {
  generateAccessToken(user: User): string {
    return jwt.sign(
      { sub: user.id, roles: user.roles },
      process.env.JWT_PRIVATE_KEY, // PEM; keep the line breaks (see Key Management)
      { algorithm: 'RS256', expiresIn: '15m', issuer: 'app', audience: 'api', keyid: process.env.JWT_KEY_ID }
    );
  }

  async generateRefreshToken(userId: string, familyId?: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await db.refreshTokens.create({
      tokenHash: hash,
      userId,
      familyId: familyId || crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return token;
  }

  async rotateRefreshToken(oldToken: string) {
    const hash = crypto.createHash('sha256').update(oldToken).digest('hex');
    const stored = await db.refreshTokens.findByHash(hash);

    if (!stored || stored.revokedAt) {
      // Reuse detected — revoke entire family
      if (stored) await db.refreshTokens.revokeFamily(stored.familyId);
      throw new TokenReuseError();
    }

    await db.refreshTokens.revoke(stored.id);
    const newRefresh = await this.generateRefreshToken(stored.userId, stored.familyId);
    const user = await db.users.findById(stored.userId);
    const newAccess = this.generateAccessToken(user);
    return { accessToken: newAccess, refreshToken: newRefresh };
  }
}
```

### Example 2: Debug a JWT Token

**Prompt**: "My API returns token_expired for this JWT, can you decode it? eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2LTEwIn0.eyJzdWIiOiJ1c3JfN2YzYTljIiwicm9sZXMiOlsibWVtYmVyIl0sImlhdCI6MTc5MTgwMDAwMCwiZXhwIjoxNzkxODAwOTAwfQ.iQvA-PS2MWDxkpNyTq6bY7NynWud4HHjqUR2Npufl4m-PBZko8-mDia64a09TBJt51_HF7J3Pw3gwk8svIHc81Mqr2YfFU-_4vGYSC7OiMiF3qoJhvFuoe3jwBY3G_y92R6qQxyrBClfe3ec9BaCMwiGR9XTyo9Iwa-7Rse20G3abdyFFnRMdNLB-qwxsyT1tcX5CELmd5Tx184QAa-fD3uYzE7LEvvxzotxwg02eX83vdNpaF62MeAcZtuoC8z_gltwu-wHv1BSBNdwlThFTUX2ToZ09-LZUn_cUApVGa4BBTrOBX6OL2Ko_oGbb52_wmIjQ8T204mgu4OgmL6V-g"

**Output**:
```
Decoded JWT (signature not checked here; the public key is needed for that):
  Header:  { alg: "RS256", typ: "JWT", kid: "key-2026-10" }
  Payload: { sub: "usr_7f3a9c", roles: ["member"], iat: 1791800000, exp: 1791800900 }

Cause: exp is 2026-10-12T10:28:20Z, so the token expired before today.
The 15-minute lifetime (iat to exp) matches the access token rule; the client must refresh.
No "iss" or "aud" claims: add them so the API can pin both in jwt.verify.
The kid header lets the API pick the right public key after a key rotation.
```

## Guidelines

- **Never use HS256 with a weak secret** — use RS256/ES256 or HS256 with 256+ bit random key
- **Never store access tokens in localStorage** — use memory variables; refresh tokens in httpOnly cookies
- **Always hash refresh tokens** before database storage — SHA-256 is sufficient
- **Pin the algorithm** — always pass `algorithms` to `jwt.verify`. jsonwebtoken 9.x also rejects an HMAC token checked against a PEM key by default, but do not rely on that default: the explicit allowlist is required
- **Keep the "iat" claim** — jsonwebtoken adds it on sign; use `maxAge` in verify to cap token age for audit-sensitive routes
- **Set clock skew tolerance** with `clockTolerance: 30` (seconds) for verification across services
- **Node only for jsonwebtoken** — it uses Node's crypto module, so edge runtimes need a Web Crypto library such as jose
- **Return specific 401 errors**: "token_expired," "token_invalid," "token_missing" — helps client-side handling
