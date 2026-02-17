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
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["gdpr", "privacy", "compliance", "data-protection"]
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

**Data Deletion (Right to Erasure):**
- Do NOT immediately delete. Use a 30-day cooling-off queue.
- Send confirmation email with a cancel link.
- After 30 days, either anonymize (replace PII with hashed/null values) or hard-delete.
- Cascade to: logs (redact), sessions (delete), third-party (trigger deletion APIs where available).
- Keep anonymized records for aggregate analytics if needed.

**Consent History:**
- Return all consent records for the user, ordered by date.
- Include version numbers to show what the user agreed to and when.

### Retention Policies

1. Define retention periods per data type based on purpose:
   - Session data: 90 days
   - IP addresses: 30 days (anonymize by zeroing last octet)
   - Soft-deleted accounts: 30 days then hard delete
   - Audit logs: 1 year (legal requirement)
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
async function handleDeletionRequest(userId) {
  // 1. Create deletion request record
  await db.deletionRequest.create({
    data: { userId, status: 'pending', expiresAt: addDays(new Date(), 30) }
  });

  // 2. Send confirmation email with cancel link
  await emailService.send(userId, 'deletion-confirmation', {
    cancelUrl: `${BASE_URL}/api/privacy/cancel-deletion?token=${token}`
  });

  // 3. After 30 days (triggered by cron job):
  // await db.user.update({ where: { id: userId }, data: {
  //   email: `deleted-${hash}@anonymized.local`,
  //   name: 'Deleted User', phone: null
  // }});
  // await db.session.deleteMany({ where: { userId } });
  // await analyticsService.deleteUser(userId);
}
```

## Guidelines

- **GDPR compliance is not just technical.** Always recommend the client consult a legal professional for their specific jurisdiction.
- **Default to opt-out.** In the EU, analytics and marketing require explicit opt-in. Never pre-check consent boxes.
- **Anonymize over delete when possible.** Anonymized data is no longer personal data and can be kept for analytics.
- **Log every DSR.** Regulators may ask for proof that requests were handled within the 30-day deadline.
- **Test deletion cascades thoroughly.** Missing a single table or third-party integration means non-compliance.
