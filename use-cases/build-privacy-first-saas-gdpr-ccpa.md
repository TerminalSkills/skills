# Build a Privacy-First SaaS (GDPR + CCPA)

**Persona:** Founder launching a B2C SaaS that serves both EU and US users.

**Challenge:** Your app collects user data for analytics and personalization. You need to comply with GDPR (EU) and CCPA (California) simultaneously — without turning your app into a bureaucratic nightmare or spending $50K on consultants.

**Skills used:** `ccpa-compliance`, `cookie-consent`, `audit-logging`, `data-masking`

---

## Step 1: Data Inventory and Mapping

You can't protect what you don't know you have. Start with a data map.

```python
# scripts/generate_data_inventory.py
DATA_INVENTORY = {
    "users": {
        "description": "User accounts",
        "fields": {
            "email":      {"type": "contact",    "gdpr_basis": "contract",    "ccpa_category": "identifiers",     "sold": False},
            "name":       {"type": "identifier",  "gdpr_basis": "contract",    "ccpa_category": "identifiers",     "sold": False},
            "ip_address": {"type": "technical",   "gdpr_basis": "legitimate_interest", "ccpa_category": "identifiers", "sold": False},
            "location":   {"type": "location",    "gdpr_basis": "consent",     "ccpa_category": "geolocation",     "sold": False},
        },
        "retention_days": 365 * 3,   # 3 years
        "third_parties": ["Stripe (payment)", "SendGrid (email)", "AWS SES"],
        "transfers_outside_eu": True,  # Requires SCCs or adequacy decision
        "sccs_in_place": True,
    },
    "analytics_events": {
        "description": "User behavior events",
        "fields": {
            "user_id":    {"type": "pseudonym",   "gdpr_basis": "legitimate_interest", "ccpa_category": "internet_activity", "sold": False},
            "device_id":  {"type": "identifier",  "gdpr_basis": "consent",     "ccpa_category": "identifiers",     "sold": True},
            "page_url":   {"type": "behavioral",  "gdpr_basis": "consent",     "ccpa_category": "internet_activity", "sold": False},
        },
        "retention_days": 365,
        "third_parties": ["Mixpanel", "PostHog"],
        "transfers_outside_eu": True,
        "sccs_in_place": True,
    },
    "marketing_emails": {
        "description": "Email marketing",
        "fields": {
            "email":  {"type": "contact", "gdpr_basis": "consent", "ccpa_category": "identifiers", "sold": False},
            "tags":   {"type": "behavioral", "gdpr_basis": "consent", "ccpa_category": "commercial_info", "sold": False},
        },
        "retention_days": 730,  # 2 years from last engagement
        "third_parties": ["Resend", "Mailchimp"],
        "unsubscribe_mechanism": "one_click_list_unsubscribe",
    }
}

def check_gdpr_lawful_basis():
    """Verify every field has a documented lawful basis."""
    issues = []
    for table, config in DATA_INVENTORY.items():
        for field, meta in config["fields"].items():
            if not meta.get("gdpr_basis"):
                issues.append(f"{table}.{field}: Missing GDPR lawful basis")
    return issues
```

## Step 2: Privacy Policy and Consent Flows

Your privacy policy must be **specific** and **plain language** — no legalese walls.

```typescript
// Required disclosures (populate from DATA_INVENTORY)
const PRIVACY_DISCLOSURES = {
  last_updated: "2024-01-15",
  contact_email: "privacy@yourapp.com",
  dpo_email: "dpo@yourapp.com",  // Required if processing EU data at scale
  
  data_collected: [
    { category: "Account data", items: ["Email address", "Name"], basis: "Contract performance" },
    { category: "Usage data", items: ["Pages visited", "Features used"], basis: "Legitimate interest" },
    { category: "Analytics", items: ["Device ID", "IP address"], basis: "Consent" },
    { category: "Payment data", items: ["Billing address", "Last 4 digits"], basis: "Contract" },
  ],
  
  third_parties: [
    { name: "Stripe", purpose: "Payment processing", country: "US", safeguard: "SCCs + adequacy" },
    { name: "AWS", purpose: "Cloud infrastructure", country: "US", safeguard: "SCCs" },
    { name: "Mixpanel", purpose: "Analytics (only with consent)", country: "US", safeguard: "SCCs" },
  ],
  
  eu_user_rights: ["access", "rectification", "erasure", "portability", "restriction", "objection"],
  ca_user_rights: ["know", "delete", "opt_out_sale", "correct", "limit_sensitive"],
  rights_request_url: "https://yourapp.com/privacy/request",
};
```

## Step 3: Cookie Consent Implementation

Block all non-essential cookies until consent. GPC signal auto-honors opt-out.

```typescript
// app/layout.tsx — Next.js root layout
import { CookieConsentBanner } from '@/components/CookieConsent';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
```

```typescript
// lib/consent.ts
export const CONSENT_VERSION = '2024-01';

export function applyConsent(prefs: ConsentPreferences): void {
  // Analytics — only load if consented
  if (prefs.analytics) {
    // PostHog with IP anonymization
    posthog.init('phc_...', {
      api_host: 'https://app.posthog.com',
      ip: false,           // Don't capture IP
      person_profiles: 'identified_only',
    });
  } else {
    // Opt out if previously loaded
    posthog.opt_out_capturing();
  }
  
  // Marketing pixels — consent-gated
  if (prefs.marketing) {
    // Load Facebook Pixel
    import('@/lib/facebook-pixel').then(m => m.init());
  }
  
  // GPC: auto-apply opt-out for CA users
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl) {
    recordOptOut('gpc_signal');
  }
}
```

## Step 4: Data Subject Request (DSR) API

Handle both GDPR Subject Access Requests and CCPA Consumer Requests.

```typescript
// app/api/privacy/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendVerificationEmail } from '@/lib/email';
import { db } from '@/lib/db';

const DSRSchema = z.object({
  type: z.enum(['access', 'delete', 'correct', 'portability', 'opt_out']),
  email: z.string().email(),
  name: z.string().min(1),
  jurisdiction: z.enum(['gdpr', 'ccpa', 'other']),
  correction_details: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = DSRSchema.parse(body);
  
  // Create request record
  const request = await db.privacyRequests.create({
    data: {
      type: data.type,
      email: data.email,
      name: data.name,
      jurisdiction: data.jurisdiction,
      status: 'pending_verification',
      submittedAt: new Date(),
      // Deadline: 1 month (GDPR) or 45 days (CCPA), whichever first
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    }
  });
  
  await sendVerificationEmail(data.email, request.id);
  
  return NextResponse.json({
    requestId: request.id,
    message: 'Verification email sent. Complete within 7 days.',
    deadline: request.deadline,
  });
}
```

```typescript
// app/api/privacy/request/[id]/verify/route.ts
export async function POST(req: NextRequest, { params }) {
  const { token } = await req.json();
  const request = await db.privacyRequests.findFirst({
    where: { id: params.id, verificationToken: token }
  });
  
  if (!request) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  
  await db.privacyRequests.update({
    where: { id: params.id },
    data: { status: 'processing', verifiedAt: new Date() }
  });
  
  // Process async
  await processPrivacyRequest(request);
  
  return NextResponse.json({ status: 'processing', message: 'We will respond within the legal deadline.' });
}

async function processPrivacyRequest(request: PrivacyRequest) {
  const user = await db.users.findFirst({ where: { email: request.email } });
  if (!user) {
    await completeRequest(request.id, 'no_data_found');
    return;
  }
  
  switch (request.type) {
    case 'delete':
      await deleteUserData(user.id);
      break;
    case 'access':
    case 'portability':
      const data = await exportUserData(user.id);
      await sendDataExport(request.email, data);
      break;
    case 'opt_out':
      await optOutUser(user.id);
      break;
  }
  
  await completeRequest(request.id, 'completed');
}
```

## Step 5: Data Retention and Deletion Pipeline

```typescript
// jobs/data-retention.ts — Run daily
export async function runRetentionCleanup() {
  const cutoffs = {
    analytics_events: subtractDays(new Date(), 365),   // 1 year
    marketing_emails: subtractDays(new Date(), 730),   // 2 years
    inactive_users: subtractDays(new Date(), 365 * 3), // 3 years inactive
    audit_logs: subtractDays(new Date(), 365 * 6),     // 6 years (HIPAA)
    session_data: subtractDays(new Date(), 30),         // 30 days
  };
  
  // Delete old analytics (anonymize instead of delete where possible)
  await db.$executeRaw`
    DELETE FROM analytics_events 
    WHERE created_at < ${cutoffs.analytics_events}
  `;
  
  // Anonymize inactive users (keep aggregate stats)
  const inactiveUsers = await db.users.findMany({
    where: {
      lastActiveAt: { lt: cutoffs.inactive_users },
      deletedAt: null
    }
  });
  
  for (const user of inactiveUsers) {
    await anonymizeUser(user.id);  // Replace PII with anonymized placeholders
  }
  
  console.log(`Retention cleanup: deleted analytics before ${cutoffs.analytics_events}`);
}

async function deleteUserData(userId: string) {
  // GDPR Article 17 — Right to Erasure
  await Promise.all([
    db.users.update({ where: { id: userId }, data: {
      email: `deleted_${userId}@deleted.invalid`,
      name: '[Deleted]',
      deletedAt: new Date(),
    }}),
    db.analyticsEvents.deleteMany({ where: { userId } }),
    db.marketingSubscriptions.deleteMany({ where: { userId } }),
    // Cascade delete via FK constraints for other tables
  ]);
  
  // Notify third parties
  await Promise.all([
    posthog.deleteUser(userId),           // PostHog deletion API
    stripe.customers.del(user.stripeId),  // Only if no active subscriptions
  ]);
}
```

## Step 6: Audit Trail for Compliance Evidence

```typescript
// lib/compliance-audit.ts
export const complianceLogger = {
  async log(event: {
    type: 'dsr_submitted' | 'dsr_completed' | 'data_deleted' | 'consent_recorded' | 'opt_out';
    userId?: string;
    requestId?: string;
    details: Record<string, unknown>;
  }) {
    await db.complianceAuditLog.create({
      data: {
        id: crypto.randomUUID(),
        eventType: event.type,
        userId: event.userId,
        requestId: event.requestId,
        details: event.details,
        timestamp: new Date(),
        // Hash for tamper-evidence
        hash: await computeHash(event),
      }
    });
  }
};

// Use in DSR processing:
await complianceLogger.log({
  type: 'data_deleted',
  userId: user.id,
  requestId: request.id,
  details: {
    tablesAffected: ['users', 'analytics_events', 'marketing_subscriptions'],
    thirdPartiesNotified: ['posthog', 'mixpanel'],
    completedAt: new Date().toISOString(),
  }
});
```

## Privacy Settings Page

```typescript
// app/settings/privacy/page.tsx
export default function PrivacySettings() {
  return (
    <div>
      <h1>Privacy & Data Settings</h1>
      
      <section>
        <h2>Cookie Preferences</h2>
        <CookiePreferencesForm />  {/* Opens consent UI */}
      </section>
      
      <section>
        <h2>Your Data Rights</h2>
        <p>You can request a copy of your data, ask us to delete it, or opt out of data sharing.</p>
        <PrivacyRequestForm />
      </section>
      
      <section>
        <h2>Marketing Preferences</h2>
        <MarketingOptOut userId={user.id} />
      </section>
      
      <section>
        <h2>Download Your Data</h2>
        <button onClick={requestDataExport}>Export My Data (JSON)</button>
      </section>
    </div>
  );
}
```

## Result

After implementing these steps:
- ✅ Data inventory mapped — know exactly what you collect and why
- ✅ Privacy policy covers GDPR (lawful basis) and CCPA (categories, rights)
- ✅ Cookie consent banner: granular, rejects as easy as accept, GPC honored
- ✅ DSR API handles access, deletion, portability, and opt-out within deadlines
- ✅ Automated retention pipeline deletes data on schedule
- ✅ Compliance audit trail with tamper-evident logs

**Total effort:** ~2-3 weeks for a solo developer. Much cheaper than a breach or regulatory fine.

**Next step:** Add a DPA (Data Processing Agreement) template for B2B customers and get SCCs (Standard Contractual Clauses) in place with your US-based vendors for EU data transfers.
