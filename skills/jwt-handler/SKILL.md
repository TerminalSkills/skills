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
  version: "1.0.0"
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
2. Verify signature using public key
3. Check expiration (exp claim)
4. Check issuer and audience if configured
5. Attach decoded payload to request context
6. Return 401 with specific error: expired, invalid, missing
```

### Key Management

- Generate RSA 2048+ or EC P-256 key pairs
- Store private key in environment variable or secrets manager
- Expose public key via /.well-known/jwks.json endpoint
- Support key rotation: include key ID (kid) in token header

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
      process.env.JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '15m', issuer: 'app' }
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

**Prompt**: "This JWT isn't working, can you decode it? eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImV4cCI6MTcwODE4NTYwMH0.abc..."

**Output**:
```
Decoded JWT:
  Header: { alg: "RS256" }
  Payload: { sub: "user_123", exp: 1708185600 }

Issue found: Token expired at 2024-02-17T12:00:00Z (3 hours ago).
The token has no "iat" claim — consider adding it for audit logging.
No "iss" or "aud" claims — recommend adding these for multi-service setups.
```

## Guidelines

- **Never use HS256 with a weak secret** — use RS256/ES256 or HS256 with 256+ bit random key
- **Never store access tokens in localStorage** — use memory variables; refresh tokens in httpOnly cookies
- **Always hash refresh tokens** before database storage — SHA-256 is sufficient
- **Include "iat" claim** for token age checks and audit logging
- **Set clock skew tolerance** to 30 seconds for verification across services
- **Return specific 401 errors**: "token_expired," "token_invalid," "token_missing" — helps client-side handling
