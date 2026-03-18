---
name: webauthn
description: >-
  Implement passwordless authentication with WebAuthn and Passkeys. Use when:
  adding passkey/biometric login, implementing FIDO2 authentication, replacing
  password-based login, building touch ID / face ID authentication flows in
  web apps. Covers browser API, server verification, and simplewebauthn library.
license: Apache-2.0
compatibility: "Requires Node.js 18+, modern browser with WebAuthn support"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["webauthn", "passkeys", "authentication", "passwordless", "fido2"]
  use-cases:
    - "Add passkey registration and login to an Express/Node.js app"
    - "Replace password forms with biometric authentication"
    - "Implement FIDO2 authentication with simplewebauthn"
    - "Add Touch ID / Face ID login to a web app"
    - "Build a passwordless authentication system from scratch"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# WebAuthn / Passkeys

## Overview

WebAuthn (Web Authentication) lets users authenticate with biometrics (Face ID, Touch ID, Windows Hello) or hardware keys (YubiKey) instead of passwords. Passkeys are WebAuthn credentials synced across devices via iCloud Keychain, Google Password Manager, or 1Password.

**Key concepts:**
- **Relying Party (RP)**: Your server — verifies credentials
- **Authenticator**: Device/platform (Touch ID, Face ID, YubiKey)
- **Credential**: Public/private key pair — private key never leaves device
- **Challenge**: Server-issued random bytes — prevents replay attacks

## Setup

### Install `@simplewebauthn`

```bash
npm install @simplewebauthn/server @simplewebauthn/browser
# Types
npm install -D @types/node
```

**SimpleWebAuthn** abstracts the low-level CBOR/COSE encoding and handles most edge cases.

### Configure Relying Party

```ts
// config/webauthn.ts
export const RP_NAME = "My App";
export const RP_ID = process.env.RP_ID || "localhost"; // domain, no protocol/port
export const ORIGIN = process.env.ORIGIN || "http://localhost:3000";
// RP_ID must match the domain of ORIGIN
// For production: RP_ID = "myapp.com", ORIGIN = "https://myapp.com"
```

---

## Registration Flow

### Overview

```
Client                          Server
  |                                |
  |-- POST /auth/register/begin -->|
  |                                | 1. Generate challenge
  |<-- { options } ---------------|
  |                                |
  | 2. navigator.credentials.create(options)
  |    (user taps Touch ID / Face ID)
  |                                |
  |-- POST /auth/register/finish ->|
  |   { credential }               | 3. Verify & store public key
  |<-- { ok: true } --------------|
```

### Server: generate registration options

```ts
// routes/auth.ts
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { RP_ID, RP_NAME, ORIGIN } from "../config/webauthn";

// In-memory store for demo; use DB in production
const challenges = new Map<string, string>(); // userId → challenge
const credentials = new Map<string, any[]>(); // userId → credentials[]

app.post("/auth/register/begin", async (req, res) => {
  const { userId, username } = req.body;

  // Fetch existing credentials for the user (to exclude re-registration)
  const userCredentials = credentials.get(userId) || [];

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: username,
    userDisplayName: username,
    // Prevent registering the same authenticator twice
    excludeCredentials: userCredentials.map((cred) => ({
      id: cred.id,
      type: "public-key",
    })),
    authenticatorSelection: {
      // "platform" = built-in (Touch ID); "cross-platform" = security key
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Store challenge for verification
  challenges.set(userId, options.challenge);

  res.json(options);
});
```

### Server: verify registration

```ts
app.post("/auth/register/finish", async (req, res) => {
  const { userId, credential } = req.body;
  const expectedChallenge = challenges.get(userId);

  if (!expectedChallenge) {
    return res.status(400).json({ error: "No challenge found" });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "Verification failed" });
  }

  // Store the credential (save to DB in production)
  const { credential: cred } = verification.registrationInfo;
  const userCreds = credentials.get(userId) || [];
  userCreds.push({
    id: cred.id,
    publicKey: cred.publicKey,
    counter: cred.counter,
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
  });
  credentials.set(userId, userCreds);
  challenges.delete(userId);

  res.json({ ok: true });
});
```

### Client: register passkey

```ts
// client/auth.ts
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

export async function registerPasskey(userId: string, username: string) {
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn not supported in this browser");
  }

  // 1. Get options from server
  const optionsRes = await fetch("/auth/register/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, username }),
  });
  const options = await optionsRes.json();

  // 2. Prompt user (opens Touch ID / Face ID)
  let credential;
  try {
    credential = await startRegistration({ optionsJSON: options });
  } catch (err: any) {
    if (err.name === "InvalidStateError") {
      throw new Error("This authenticator is already registered");
    }
    throw err;
  }

  // 3. Verify with server
  const verifyRes = await fetch("/auth/register/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, credential }),
  });
  const result = await verifyRes.json();

  if (!result.ok) throw new Error(result.error);
  return result;
}
```

---

## Authentication Flow

### Overview

```
Client                          Server
  |                                |
  |-- POST /auth/login/begin ----->|
  |                                | 1. Generate challenge
  |<-- { options } ---------------|
  |                                |
  | 2. navigator.credentials.get(options)
  |    (user taps Touch ID)
  |                                |
  |-- POST /auth/login/finish ---->|
  |   { assertion }                | 3. Verify signature + counter
  |<-- { token } -----------------|
```

### Server: generate authentication options

```ts
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

app.post("/auth/login/begin", async (req, res) => {
  const { userId } = req.body;
  const userCredentials = credentials.get(userId) || [];

  if (userCredentials.length === 0) {
    return res.status(400).json({ error: "No passkeys registered" });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: userCredentials.map((cred) => ({
      id: cred.id,
      type: "public-key",
    })),
    userVerification: "preferred",
  });

  challenges.set(userId, options.challenge);
  res.json(options);
});
```

### Server: verify authentication

```ts
app.post("/auth/login/finish", async (req, res) => {
  const { userId, assertion } = req.body;
  const expectedChallenge = challenges.get(userId);
  const userCredentials = credentials.get(userId) || [];

  const credential = userCredentials.find((c) => c.id === assertion.id);
  if (!credential) {
    return res.status(400).json({ error: "Credential not found" });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: expectedChallenge!,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!verification.verified) {
    return res.status(401).json({ error: "Authentication failed" });
  }

  // Update counter (replay attack protection)
  credential.counter = verification.authenticationInfo.newCounter;
  challenges.delete(userId);

  // Issue session/JWT here
  const token = issueJWT(userId);
  res.json({ ok: true, token });
});
```

### Client: authenticate with passkey

```ts
import { startAuthentication } from "@simplewebauthn/browser";

export async function loginWithPasskey(userId: string) {
  // 1. Get challenge from server
  const optionsRes = await fetch("/auth/login/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const options = await optionsRes.json();

  // 2. Prompt user biometric
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (err: any) {
    if (err.name === "NotAllowedError") {
      throw new Error("Authentication cancelled or timed out");
    }
    throw err;
  }

  // 3. Verify with server
  const verifyRes = await fetch("/auth/login/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, assertion }),
  });
  return verifyRes.json();
}
```

---

## Database Schema (Production)

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passkeys / credentials
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,              -- credential id (base64url)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,        -- stored as bytes
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,                 -- 'platform' | 'cross-platform'
  backed_up BOOLEAN DEFAULT FALSE,  -- synced passkey?
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Challenges (short-lived, use Redis TTL in production)
CREATE TABLE challenges (
  user_id UUID PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);
```

---

## UI Pattern: Passkey Button

```tsx
// components/PasskeyButton.tsx
import { registerPasskey, loginWithPasskey } from "@/lib/auth";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

export function PasskeyButton({ userId, username, mode }: {
  userId: string;
  username: string;
  mode: "register" | "login";
}) {
  if (!browserSupportsWebAuthn()) return null;

  const handleClick = async () => {
    try {
      if (mode === "register") {
        await registerPasskey(userId, username);
        alert("Passkey registered!");
      } else {
        const { token } = await loginWithPasskey(userId);
        localStorage.setItem("token", token);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg border px-4 py-2"
    >
      🔑 {mode === "register" ? "Register Passkey" : "Sign in with Passkey"}
    </button>
  );
}
```

---

## Other Languages

### Python (`py_webauthn`)

```bash
pip install py_webauthn
```

```python
import webauthn

# Registration
options = webauthn.generate_registration_options(
    rp_id="myapp.com",
    rp_name="My App",
    user_name="alice@example.com",
)
# Verification
verification = webauthn.verify_registration_response(
    credential=response,
    expected_challenge=challenge,
    expected_rp_id="myapp.com",
    expected_origin="https://myapp.com",
)
```

### Java (`webauthn4j`)

```xml
<dependency>
  <groupId>com.webauthn4j</groupId>
  <artifactId>webauthn4j-core</artifactId>
  <version>0.22.0</version>
</dependency>
```

---

## Security Checklist

- [ ] **HTTPS required** — WebAuthn only works on secure origins (or localhost)
- [ ] **RP_ID matches domain** — must equal the effective domain, not a subdomain or port
- [ ] **Store counter** — increment on each auth; reject if counter doesn't increase (replay protection)
- [ ] **Short-lived challenges** — expire after 5 minutes; delete after use
- [ ] **User verification** — use `"preferred"` or `"required"` (not `"discouraged"`)
- [ ] **Exclude existing credentials** — pass `excludeCredentials` during registration
- [ ] **Backup public key** — you can't recover a passkey credential if DB is lost

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `InvalidStateError` | Credential already registered | Pass `excludeCredentials` in options |
| `NotAllowedError` | User cancelled or no matching credential | Show friendly error message |
| `SecurityError` | RP_ID doesn't match origin | Set RP_ID to effective domain |
| `AbortError` | Operation timed out | Implement retry UI |
| Counter mismatch | Possible cloned authenticator | Log and investigate; block if needed |
