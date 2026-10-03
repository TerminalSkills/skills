---
name: webauthn
description: >-
  WebAuthn lets users sign in with passkeys (Face ID, Touch ID, Windows Hello,
  security keys) instead of passwords, using public-key credentials checked by
  your server. Use when adding passkey or biometric login, implementing FIDO2
  authentication, replacing password forms, or verifying credentials with the
  SimpleWebAuthn library for Node.js, py_webauthn for Python or WebAuthn4J for Java.
license: Apache-2.0
compatibility: "Node.js 20+ for @simplewebauthn/server 14, a browser with WebAuthn support, HTTPS (or localhost)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/MasterKale/SimpleWebAuthn
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

WebAuthn (Web Authentication) lets users authenticate with biometrics (Face ID, Touch ID, Windows Hello) or hardware keys (YubiKey) instead of passwords. Passkeys are WebAuthn credentials that can sync across devices through iCloud Keychain, Google Password Manager or a password manager such as 1Password.

- **Relying Party (RP)**: your server; it issues challenges and verifies responses.
- **Authenticator**: the device or key that holds the private key; the private key never leaves it.
- **Credential**: a public/private key pair; you store the credential id and public key.
- **Challenge**: random bytes from the server, used once, which stops replay.

This skill uses **SimpleWebAuthn 14** (`@simplewebauthn/server` 14.x and `@simplewebauthn/browser` 14.x, Node 20+). Differences from older tutorials: `excludeCredentials` and `allowCredentials` take `{ id, transports }` with no `type`; browser calls take `{ optionsJSON }`; verification takes a `credential` object (`id`, `publicKey`, `counter`, `transports`); `registrationInfo.credential` holds what you store.

## Instructions

### 1. Install and configure the relying party

```bash
npm install @simplewebauthn/server @simplewebauthn/browser
```

```ts
// config/webauthn.ts
export const RP_NAME = "Northwind Traders";
export const RP_ID = process.env.RP_ID ?? "localhost";            // registrable domain, no scheme or port
export const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000"; // exact origin(s) the browser will report
// Production: RP_ID=northwind-traders.dev, ORIGIN=https://app.northwind-traders.dev
```

`RP_ID` must equal the page's domain or a registrable parent of it. Credentials are bound to it for life: changing it orphans every passkey.

### 2. Registration

Server, step one: options. Store the challenge server-side (a session or Redis key with a TTL), never trust one sent back by the client.

```ts
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { RP_ID, RP_NAME, ORIGIN } from "../config/webauthn";

app.post("/auth/register/begin", async (req, res) => {
  const user = await requireSessionUser(req);          // the user is already signed in (or just signed up)
  const existing = await db.passkeys.findByUser(user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),         // stable, opaque id: not the email
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  await challenges.set(user.id, options.challenge, { ttlSeconds: 300 });
  res.json(options);
});
```

Server, step two: verify and store.

```ts
app.post("/auth/register/finish", async (req, res) => {
  const user = await requireSessionUser(req);
  const expectedChallenge = await challenges.take(user.id);   // read and delete
  if (!expectedChallenge) return res.status(400).json({ error: "Challenge expired" });

  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: req.body.credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,   // default is true; see Guidelines
    });
    if (!verified || !registrationInfo) return res.status(400).json({ error: "Verification failed" });

    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
    await db.passkeys.insert({
      id: credential.id,                 // base64url string
      userId: user.id,
      publicKey: credential.publicKey,   // Uint8Array: store as bytes
      counter: credential.counter,
      transports: credential.transports,
      deviceType: credentialDeviceType,  // "singleDevice" | "multiDevice"
      backedUp: credentialBackedUp,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
```

Browser:

```ts
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";

export async function registerPasskey() {
  if (!browserSupportsWebAuthn()) throw new Error("This browser does not support passkeys");
  const options = await (await fetch("/auth/register/begin", { method: "POST" })).json();

  let credential;
  try {
    credential = await startRegistration({ optionsJSON: options });
  } catch (err) {
    if ((err as Error).name === "InvalidStateError") throw new Error("This device already has a passkey for this account");
    throw err;
  }
  const res = await fetch("/auth/register/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}
```

### 3. Authentication

```ts
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";

app.post("/auth/login/begin", async (req, res) => {
  const user = await db.users.findByEmail(req.body.email);
  const passkeys = user ? await db.passkeys.findByUser(user.id) : [];
  // Return the same shape for unknown users if you want to avoid account enumeration.
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: "preferred",
  });
  await challenges.set(req.sessionID, options.challenge, { ttlSeconds: 300 });
  res.json(options);
});

app.post("/auth/login/finish", async (req, res) => {
  const expectedChallenge = await challenges.take(req.sessionID);
  const passkey = await db.passkeys.findById(req.body.assertion.id);
  if (!expectedChallenge || !passkey) return res.status(400).json({ error: "Unknown credential" });

  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: req.body.assertion,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: passkey.id,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
    if (!verified) return res.status(401).json({ error: "Authentication failed" });

    await db.passkeys.update(passkey.id, { counter: authenticationInfo.newCounter, lastUsedAt: new Date() });
    await startSession(req, passkey.userId);   // set your session cookie here
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
```

```ts
import { startAuthentication } from "@simplewebauthn/browser";

export async function loginWithPasskey(email: string) {
  const options = await (await fetch("/auth/login/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })).json();

  const assertion = await startAuthentication({ optionsJSON: options });  // NotAllowedError = cancelled or timed out
  const res = await fetch("/auth/login/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assertion }),
  });
  return res.json();
}
```

For username-less sign-in, call `generateAuthenticationOptions` without `allowCredentials`, register with `residentKey: "required"`, and find the user from `assertion.response.userHandle`. For the browser's passkey autofill, add `autocomplete="username webauthn"` to the input and call `startAuthentication({ optionsJSON, useBrowserAutofill: true })` on page load.

### 4. Storage

```sql
CREATE TABLE passkeys (
  id            TEXT PRIMARY KEY,                       -- credential id, base64url
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    BYTEA NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    TEXT[],                                 -- pass back in allow/excludeCredentials
  device_type   TEXT,                                   -- singleDevice | multiDevice
  backed_up     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);
```

Drivers return `BYTEA` as a Node `Buffer`; pass `new Uint8Array(row.public_key)` as `credential.publicKey`. Challenges belong in a store with a TTL (Redis, or a session), not a table that grows.

### Other languages

```bash
pip install webauthn      # PyPI name is "webauthn" (py_webauthn is the project name); the similarly named "py-webauthn" is a different, old package
```

```python
from webauthn import generate_registration_options, verify_registration_response, options_to_json

options = generate_registration_options(rp_id="northwind-traders.dev", rp_name="Northwind Traders", user_name="dana@northwind-traders.dev")
challenge = options.challenge                       # bytes: keep it server-side
payload = options_to_json(options)                  # send this to the browser

verified = verify_registration_response(
    credential=request_json,                        # dict or JSON string from the browser
    expected_challenge=challenge,
    expected_rp_id="northwind-traders.dev",
    expected_origin="https://app.northwind-traders.dev",
)
# store verified.credential_id, verified.credential_public_key, verified.sign_count
```

Authentication mirrors it with `generate_authentication_options` and `verify_authentication_response(..., credential_public_key=..., credential_current_sign_count=...)`. In Java use WebAuthn4J (`com.webauthn4j:webauthn4j-core`, 0.31.x at the time of writing).

## Examples

### "Add passkey login next to our password form"

Keep the password form, add a "Sign in with passkey" button that calls `loginWithPasskey(email)`, and a "Add a passkey" action in account settings that calls `registerPasskey()`. Result: signed-in users register a passkey (the browser shows Touch ID or Windows Hello); next time the button signs them in and `passkeys.counter` / `last_used_at` update. Offer it only when `browserSupportsWebAuthn()` is true.

### "Registration fails with 'User verification was required, but user could not be verified'"

The verify functions default to `requireUserVerification: true`, but `userVerification: "preferred"` lets authenticators skip the PIN or biometric. Either set `userVerification: "required"` in both option calls (stricter, recommended for passwordless login) or pass `requireUserVerification: false` to the verify calls (as above, for passkeys as a second factor). Keep the two settings consistent.

## Guidelines

- HTTPS is required except on `localhost`; the `ORIGIN` must match exactly (scheme, host, port). `SecurityError` in the browser means the RP ID does not match the page domain.
- Challenges are single use and short lived (about 5 minutes); bind them to the session, not to a user id the client sends.
- Synced passkeys usually report a counter of 0 forever. Only treat a counter that goes down (when non-zero) as a cloned authenticator; the library throws in that case.
- Store `transports` and send them back; it lets the browser choose the right prompt (internal, USB, NFC, hybrid).
- Let users register several passkeys and keep a recovery path (email link, recovery codes); a lost device with one passkey locks the account.
- Session tokens after login are your job: use an HttpOnly, Secure, SameSite cookie, not `localStorage`.
- Error names: `InvalidStateError` credential already registered, `NotAllowedError` user cancelled or timed out, `AbortError` aborted, `SecurityError` bad RP ID or origin.
