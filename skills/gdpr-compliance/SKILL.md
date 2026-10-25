---
name: gdpr-compliance
description: >-
  Automate GDPR and privacy compliance for web applications. Use when someone
  asks to "make the app GDPR compliant", "add cookie consent", "handle data
  deletion requests", "audit PII", "data subject access request", or "privacy
  policy generator". Covers PII auditing, consent management, data subject
  request endpoints, retention policies, and privacy policy generation.
license: Apache-2.0
compatibility: "Any web stack. Examples use Node.js/Prisma but patterns apply to any framework."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "gdpr, privacy, compliance, data-protection"
---

# GDPR Compliance

## Overview

This skill helps AI agents implement GDPR compliance across web applications. It covers the full lifecycle: auditing where personal data lives, building consent management, handling data subject requests (access, deletion, portability), enforcing retention policies, and generating documentation.

## Instructions

### PII Audit

1. Scan database schemas (Prisma, SQL migrations, Sequelize models, TypeORM entities) for PII fields. Flag these patterns:
   - Direct identifiers: `email`, `name`, `full_name`, `phone`, `address`, `ssn`
   - Indirect identifiers: `ip_address`, `device_id`, `geo_*`, `lat`, `lng`, `user_agent`
   - Sensitive data: `date_of_birth`, `gender`, `health_*`, `ethnicity`
2. Scan application code for PII in logs: search for `console.log`, `logger.*`, `winston.*` calls that include user objects or request IPs.
3. Scan third-party integrations: check for API calls that send user data (analytics, email providers, payment processors, CRMs).
4. Output a **Data Flow Inventory** as a markdown table:
   | Data Type | Storage Location | Shared With | Legal Basis | Retention Period |

### Consent Management

1. Define consent categories:
   - `strictly_necessary` — always active, no consent needed
   - `functional` — preferences, language, UI settings
   - `analytics` — usage tracking, performance monitoring
   - `marketing` — ad targeting, remarketing pixels
2. Build a consent banner component that:
   - Blocks all non-necessary scripts until consent is granted
   - Provides granular opt-in/opt-out per category
   - Stores consent in a database table (not just cookies)
3. Consent record schema:
   ```
   consent_records: id, user_id, version, strictly_necessary (always true),
   functional (bool), analytics (bool), marketing (bool),
   ip_address_hash, created_at
   ```
4. On consent change, fire a `consent_updated` event that other services can listen to for enabling/disabling tracking.

### Data Subject Requests (DSR)

Implement three endpoints:

**Data Export (Right of Access / Portability):**
- Collect all data for the user across all tables where their ID appears.
- Include related records (orders, comments, sessions).
- Return as JSON with a clear structure. Optionally offer CSV.
- Redact any third-party secrets or internal IDs that are not user data.

**Data Deletion (Right to Erasure, Article 17):**
- Do NOT immediately delete. Use a cooling-off queue (30 days is a product choice, not a legal requirement).
- Send confirmation email with a cancel link.
- The controller must act on a request "without undue delay and in any event within one month of receipt" (Article 12(3)), extendable by two months only with notice. A 30-day cooling-off uses most of that month, so schedule the erasure to finish inside it, or document the extension.
- After the cooling-off, either erase or irreversibly anonymize. Replacing an email with a hash does NOT anonymize it: pseudonymised data remains personal data (Recital 26). Overwrite PII with random tombstone values or null.
- Cascade to: logs (redact), sessions (delete), third-party (trigger deletion APIs where available).
- Keep data only where Article 17(3) applies, such as a legal obligation or defence of legal claims; anonymized aggregates may be kept for analytics.

**Consent History:**
- Return all consent records for the user, ordered by date.
- Include version numbers to show what the user agreed to and when.

### Retention Policies

1. Define retention periods per data type based on purpose:
   - Session data: 90 days
   - IP addresses: 30 days (anonymize by zeroing last octet)
   - Soft-deleted accounts: 30 days then hard delete
   - Audit logs: 1 year (a design choice; keep longer only where a legal obligation or legal claim requires it, Article 17(3)(b) and (e))
   - Marketing data: until consent withdrawn
2. Build a scheduled job that runs daily and enforces these policies.
3. Always implement dry-run mode first: log what would be affected without deleting.

### Privacy Policy Generation

1. Use the Data Flow Inventory to auto-generate a privacy policy that lists:
   - What data is collected
   - Why (legal basis for each type)
   - How long it is kept
   - Who it is shared with
   - User rights and how to exercise them
2. Use plain language — avoid legal jargon where possible.
3. Include placeholder sections for: company name, DPO contact, supervisory authority.

## Examples

### Example 1 — PII detection in Prisma schema

**Input:** "Audit this Prisma schema for PII."
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  phone     String?
  createdAt DateTime @default(now())
  orders    Order[]
}
```

**Output:**
```
PII fields found in model User:
- email (direct identifier) — requires legal basis, retention policy
- name (direct identifier) — requires legal basis
- phone (direct identifier) — requires legal basis, consider encryption at rest

Recommendations:
1. Add a `deletedAt` field for soft-delete support
2. Add a `consentVersion` field to track which privacy policy version the user agreed to
3. Consider encrypting `phone` at rest using application-level encryption
```

### Example 2 — Data deletion cascade

**Input:** "Build a deletion handler for a user account."

**Output:**
```js
import crypto from 'node:crypto';

const COOLING_OFF_MS = 30 * 24 * 60 * 60 * 1000;

async function handleDeletionRequest(userId) {
  // 1. Store only a hash of the cancel token; the raw token goes in the email
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.deletionRequest.create({
    data: { userId, tokenHash, status: 'pending', expiresAt: new Date(Date.now() + COOLING_OFF_MS) }
  });

  // 2. Send confirmation email with cancel link
  await emailService.send(userId, 'deletion-confirmation', {
    cancelUrl: `${process.env.APP_BASE_URL}/privacy/cancel-deletion?token=${token}`
  });
}

// 3. Run daily from a cron job for requests past expiresAt and still pending
async function executeDueDeletions() {
  const due = await db.deletionRequest.findMany({
    where: { status: 'pending', expiresAt: { lte: new Date() } }
  });
  for (const req of due) {
    await db.user.update({ where: { id: req.userId }, data: {
      email: `erased+${crypto.randomUUID()}@invalid.example`, // random tombstone, not a hash
      name: 'Deleted User', phone: null
    }});
    await db.session.deleteMany({ where: { userId: req.userId } });
    await analyticsService.deleteUser(req.userId);
    await db.deletionRequest.update({ where: { id: req.id }, data: { status: 'completed' } });
  }
}
```

Keep the `deletionRequest` rows (status, timestamps, no PII) as the DSR log. Only raw tokens belong in the email; the database stores the hash.

## Guidelines

- **GDPR compliance is not just technical.** Always recommend the client consult a legal professional for their specific jurisdiction.
- **Default to opt-out.** In the EU, analytics and marketing require explicit opt-in. Never pre-check consent boxes.
- **Anonymize over delete when possible.** Anonymized data is no longer personal data and can be kept for analytics.
- **Log every DSR.** Regulators may ask for proof that requests were handled within one month of receipt (Article 12(3)), and any extension notified within that first month.
- **Test deletion cascades thoroughly.** Missing a single table or third-party integration means non-compliance.
