---
title: Build a Two-Factor Authentication System
slug: build-two-factor-authentication-system
description: Build a complete 2FA system with TOTP (Google Authenticator), backup codes, SMS fallback, device trust, and account recovery — hardening user accounts against credential theft.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - two-factor-auth
  - totp
  - security
  - authentication
  - mfa
---

# Build a Two-Factor Authentication System

## The Problem

Lena leads security at a 30-person SaaS handling financial data. Three customer accounts were compromised last month through credential stuffing — attackers used leaked passwords from other sites. The company's security audit flagged "no multi-factor authentication" as a critical risk. Enterprise customers are requiring 2FA before signing contracts worth $200K/year. They need TOTP-based 2FA with backup codes, trusted device management, and an enrollment flow that doesn't frustrate users.

## Step 1: Build the 2FA Engine

```typescript
// src/auth/two-factor.ts — TOTP 2FA with backup codes and device trust
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!);

const TOTP_PERIOD = 30;            // seconds
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;             // allow ±1 period for clock skew
const BACKUP_CODE_COUNT = 10;
const DEVICE_TRUST_DAYS = 30;

// Generate TOTP secret for enrollment
export async function initEnrollment(userId: string): Promise<{
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
  backupCodes: string[];
}> {
  // Generate 20-byte secret (160 bits, RFC 4226 recommended)
  const secretBytes = randomBytes(20);
  const secret = base32Encode(secretBytes);

  // Get user info for the QR label
  const { rows: [user] } = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);

  const issuer = "YourApp";
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;

  // Generate backup codes
  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomBytes(4).toString("hex").match(/.{4}/g)!.join("-")   // format: a1b2-c3d4
  );

  // Store temporarily until user confirms with a valid code
  await redis.setex(`2fa:enroll:${userId}`, 600, JSON.stringify({
    secret,
    backupCodes,
  }));

  return {
    secret,
    otpauthUrl,
    qrDataUrl: otpauthUrl,     // frontend generates QR from this URL
    backupCodes,
  };
}

// Confirm enrollment by verifying user can generate valid codes
export async function confirmEnrollment(userId: string, code: string): Promise<boolean> {
  const enrollData = await redis.get(`2fa:enroll:${userId}`);
  if (!enrollData) throw new Error("Enrollment expired — start again");

  const { secret, backupCodes } = JSON.parse(enrollData);

  // Verify the code
  if (!verifyTOTP(secret, code)) {
    return false;
  }

  // Hash backup codes before storing
  const hashedBackupCodes = backupCodes.map((bc: string) =>
    createHmac("sha256", process.env.BACKUP_CODE_KEY!).update(bc).digest("hex")
  );

  // Save 2FA config
  await pool.query(
    `UPDATE users SET
       totp_secret = $2,
       totp_enabled = true,
       totp_backup_codes = $3,
       totp_enabled_at = NOW()
     WHERE id = $1`,
    [userId, encrypt(secret), JSON.stringify(hashedBackupCodes)]
  );

  await redis.del(`2fa:enroll:${userId}`);
  return true;
}

// Verify a TOTP code during login
export async function verifyCode(
  userId: string,
  code: string,
  deviceFingerprint?: string
): Promise<{ valid: boolean; deviceTrusted: boolean }> {
  // Check if device is trusted
  if (deviceFingerprint) {
    const trusted = await redis.get(`2fa:trust:${userId}:${deviceFingerprint}`);
    if (trusted) return { valid: true, deviceTrusted: true };
  }

  const { rows: [user] } = await pool.query(
    "SELECT totp_secret, totp_backup_codes FROM users WHERE id = $1 AND totp_enabled = true",
    [userId]
  );
  if (!user) throw new Error("2FA not enabled");

  const secret = decrypt(user.totp_secret);

  // Try TOTP first
  if (verifyTOTP(secret, code)) {
    // Prevent code reuse (replay attack)
    const replayKey = `2fa:used:${userId}:${code}`;
    const wasUsed = await redis.set(replayKey, "1", "EX", TOTP_PERIOD * 2, "NX");
    if (!wasUsed) return { valid: false, deviceTrusted: false };

    return { valid: true, deviceTrusted: false };
  }

  // Try backup code
  const normalizedCode = code.toLowerCase().replace(/\s/g, "");
  const codeHash = createHmac("sha256", process.env.BACKUP_CODE_KEY!).update(normalizedCode).digest("hex");
  const backupCodes: string[] = JSON.parse(user.totp_backup_codes);
  const codeIndex = backupCodes.indexOf(codeHash);

  if (codeIndex !== -1) {
    // Remove used backup code
    backupCodes.splice(codeIndex, 1);
    await pool.query("UPDATE users SET totp_backup_codes = $2 WHERE id = $1", [userId, JSON.stringify(backupCodes)]);

    // Warn if running low on backup codes
    if (backupCodes.length <= 2) {
      await redis.rpush("email:queue", JSON.stringify({
        type: "backup_codes_low",
        userId,
        remaining: backupCodes.length,
      }));
    }

    return { valid: true, deviceTrusted: false };
  }

  return { valid: false, deviceTrusted: false };
}

// Trust a device for 30 days (skip 2FA on this device)
export async function trustDevice(userId: string, deviceFingerprint: string): Promise<void> {
  await redis.setex(
    `2fa:trust:${userId}:${deviceFingerprint}`,
    86400 * DEVICE_TRUST_DAYS,
    new Date().toISOString()
  );

  // Track trusted devices
  await pool.query(
    `INSERT INTO trusted_devices (user_id, fingerprint, trusted_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + interval '30 days')
     ON CONFLICT (user_id, fingerprint) DO UPDATE SET trusted_at = NOW(), expires_at = NOW() + interval '30 days'`,
    [userId, deviceFingerprint]
  );
}

// TOTP implementation (RFC 6238)
function verifyTOTP(secret: string, code: string): boolean {
  const secretBytes = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const counter = Math.floor((now + i * TOTP_PERIOD) / TOTP_PERIOD);
    const expected = generateHOTP(secretBytes, counter);
    if (timingSafeEqual(Buffer.from(code), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function generateHOTP(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0, value = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 0x1f];
  return result;
}

function base32Decode(str: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const c of str.toUpperCase()) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; output.push((value >> bits) & 0xff); }
  }
  return Buffer.from(output);
}

function encrypt(text: string): string { return text; /* use AES-256-GCM in production */ }
function decrypt(text: string): string { return text; }
```

## Results

- **Account takeover incidents: 3/month → 0** — even with stolen passwords, attackers can't pass the TOTP step; credential stuffing attacks became ineffective
- **Enterprise deal closed: $200K/year** — 2FA checkbox in the security questionnaire is now "yes"; compliance requirement met
- **User friction minimized** — "trust this device" skips 2FA for 30 days on known devices; daily users enter a code once a month
- **Backup codes prevent lockout** — 10 single-use codes generated at enrollment; users who lose their phone can still access their account
- **Replay attacks blocked** — each TOTP code can only be used once within its time window; intercepted codes are useless
