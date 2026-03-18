---
name: cookie-consent
description: >-
  Implement GDPR/ePrivacy-compliant cookie consent management. Use when adding a cookie banner,
  managing marketing consent, achieving GDPR compliance for EU users, or integrating consent
  management with analytics platforms.
license: Apache-2.0
compatibility: "JavaScript/TypeScript. Works with React, Next.js, and vanilla JS."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: compliance
  tags: ["cookie-consent", "gdpr", "privacy", "eprivacy", "analytics", "marketing"]
  use-cases:
    - "Add a GDPR-compliant cookie banner to a Next.js app"
    - "Implement consent-gated Google Analytics loading"
    - "Detect and honor Global Privacy Control (GPC) signal"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Cookie Consent

## Overview

The EU ePrivacy Directive (Cookie Law) and GDPR require informed, freely given, granular, and withdrawable consent before placing non-essential cookies. The UK PECR applies post-Brexit. Fines under GDPR can reach 4% of global annual turnover.

**Strictly necessary cookies** (no consent required): session tokens, shopping cart, security tokens, load balancing.

**All others require consent**: analytics, advertising, personalization, functional enhancements.

## Cookie Categories

| Category | Examples | Consent Required |
|----------|----------|-----------------|
| **Strictly Necessary** | Auth session, CSRF token, cart | ❌ No |
| **Functional** | Language preference, UI theme | ✅ Yes (GDPR) |
| **Analytics** | Google Analytics, Mixpanel, Hotjar | ✅ Yes |
| **Marketing** | Facebook Pixel, Google Ads, ad targeting | ✅ Yes |

## Consent Requirements (GDPR Article 7)

1. **Granular**: Per-category consent (not all-or-nothing)
2. **Freely given**: "Accept all" ≠ better treatment; reject must be as easy as accept
3. **Informed**: Clear explanation of what each category does
4. **Withdrawable**: Users can change or revoke consent at any time
5. **Documented**: Store a consent record (who consented, when, to what, via which version)

## Custom Consent Banner (React/Next.js)

```tsx
// components/CookieConsent.tsx
import { useState, useEffect } from 'react';

interface ConsentPreferences {
  strictly_necessary: true;  // Always true — cannot be disabled
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

interface ConsentRecord {
  version: string;
  timestamp: string;
  preferences: ConsentPreferences;
  source: 'banner' | 'settings' | 'gpc';
}

const CONSENT_VERSION = '2024-01-01';
const CONSENT_COOKIE_NAME = 'consent_preferences';

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    strictly_necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check for GPC signal first
    if (navigator.globalPrivacyControl) {
      const gpcConsent: ConsentRecord = {
        version: CONSENT_VERSION,
        timestamp: new Date().toISOString(),
        preferences: { strictly_necessary: true, functional: false, analytics: false, marketing: false },
        source: 'gpc',
      };
      saveConsent(gpcConsent);
      return;
    }

    // Check if consent already given
    const saved = getStoredConsent();
    if (!saved || saved.version !== CONSENT_VERSION) {
      setShowBanner(true);
    }
  }, []);

  const acceptAll = () => {
    const allConsent: ConsentPreferences = {
      strictly_necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    const record: ConsentRecord = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      preferences: allConsent,
      source: 'banner',
    };
    saveConsent(record);
    applyConsent(allConsent);
    setShowBanner(false);
  };

  const rejectAll = () => {
    const minimalConsent: ConsentPreferences = {
      strictly_necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    const record: ConsentRecord = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      preferences: minimalConsent,
      source: 'banner',
    };
    saveConsent(record);
    applyConsent(minimalConsent);
    setShowBanner(false);
  };

  const saveCustom = () => {
    const record: ConsentRecord = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      preferences: preferences,
      source: 'banner',
    };
    saveConsent(record);
    applyConsent(preferences);
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold mb-2">Cookie Preferences</h2>
        <p className="text-sm text-gray-600 mb-4">
          We use cookies to improve your experience. You can choose which categories to allow.
          <a href="/privacy-policy" className="underline ml-1">Learn more</a>
        </p>

        {showDetails && (
          <div className="mb-4 space-y-3">
            {[
              { key: 'strictly_necessary', label: 'Strictly Necessary', desc: 'Required for the site to function. Cannot be disabled.', locked: true },
              { key: 'functional', label: 'Functional', desc: 'Remember your preferences (language, theme).' },
              { key: 'analytics', label: 'Analytics', desc: 'Help us understand how you use our site (Google Analytics, Mixpanel).' },
              { key: 'marketing', label: 'Marketing', desc: 'Show relevant ads and measure campaign effectiveness.' },
            ].map(({ key, label, desc, locked }) => (
              <div key={key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id={key}
                  checked={preferences[key as keyof ConsentPreferences] as boolean}
                  disabled={locked}
                  onChange={(e) => setPreferences(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="mt-1"
                />
                <label htmlFor={key} className="text-sm">
                  <strong>{label}</strong> {locked && <span className="text-gray-400">(Always on)</span>}
                  <p className="text-gray-500">{desc}</p>
                </label>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={rejectAll} className="px-4 py-2 border rounded text-sm">Reject All</button>
          <button onClick={() => setShowDetails(!showDetails)} className="px-4 py-2 border rounded text-sm">
            {showDetails ? 'Hide Details' : 'Customize'}
          </button>
          {showDetails && (
            <button onClick={saveCustom} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Save Preferences</button>
          )}
          <button onClick={acceptAll} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Accept All</button>
        </div>
      </div>
    </div>
  );
}
```

## Consent Storage and Retrieval

```typescript
// lib/consent.ts

const CONSENT_KEY = 'consent_v2';

export function saveConsent(record: ConsentRecord): void {
  // Store in localStorage for JS access
  localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  
  // Also set a cookie for server-side access
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${CONSENT_KEY}=${encodeURIComponent(JSON.stringify(record))}; expires=${expires.toUTCString()}; path=/; SameSite=Strict; Secure`;
  
  // Optionally send to your backend for audit trail
  fetch('/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
    keepalive: true,
  }).catch(() => {}); // Best effort
}

export function getStoredConsent(): ConsentRecord | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function hasConsent(category: keyof ConsentPreferences): boolean {
  const consent = getStoredConsent();
  return consent?.preferences[category] === true;
}
```

## Consent-Gated Analytics

```typescript
// lib/analytics.ts — Only load analytics after consent

export function applyConsent(preferences: ConsentPreferences): void {
  if (preferences.analytics) {
    loadGoogleAnalytics();
    loadMixpanel();
  } else {
    // Opt out / remove tracking
    window['ga-disable-G-XXXXXXXX'] = true;
    // Remove existing analytics cookies
    deleteCookie('_ga');
    deleteCookie('_gid');
    deleteCookie('_gat');
  }
  
  if (preferences.marketing) {
    loadFacebookPixel();
    loadGoogleAds();
  }
}

function loadGoogleAnalytics(): void {
  if (document.getElementById('ga-script')) return; // Already loaded
  
  const script = document.createElement('script');
  script.id = 'ga-script';
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX';
  document.head.appendChild(script);
  
  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) { window.dataLayer.push(args); }
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXX', { anonymize_ip: true });
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`;
}
```

## GPC (Global Privacy Control) Detection

```javascript
// middleware/gpc.js — Next.js middleware to detect GPC
import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();
  
  // GPC header: Sec-GPC: 1
  const gpc = request.headers.get('sec-gpc');
  if (gpc === '1') {
    // Signal to client that GPC was detected
    response.headers.set('X-GPC-Detected', '1');
    // Set a cookie to persist for this session
    response.cookies.set('gpc_optout', '1', { 
      httpOnly: true, 
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 365 // 1 year
    });
  }
  
  return response;
}
```

## Consent Record API (Backend)

```typescript
// pages/api/consent.ts — Store consent for audit trail
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { version, timestamp, preferences, source } = req.body;
  
  await db.consentRecords.create({
    user_id: req.session?.userId || null,  // null for anonymous
    session_id: req.session?.id,
    ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    user_agent: req.headers['user-agent'],
    consent_version: version,
    consented_at: timestamp,
    preferences: JSON.stringify(preferences),
    source,  // 'banner' | 'settings' | 'gpc'
  });
  
  res.status(204).end();
}
```

## CMP Platforms (Alternatives to Custom Build)

| Platform | Pricing | IAB TCF | GPC | Notes |
|----------|---------|---------|-----|-------|
| **Cookiebot** | From $9/mo | ✅ | ✅ | Auto-scan cookies, DSGVO certified |
| **OneTrust** | Enterprise | ✅ | ✅ | Full compliance suite |
| **Osano** | From $49/mo | ✅ | ✅ | SOC 2 certified, privacy-first |
| **Usercentrics** | From €60/mo | ✅ | ✅ | Popular in EU |
| **Termly** | Free tier | ❌ | ✅ | Simple, good for small sites |

**IAB TCF 2.2** (Transparency and Consent Framework) is required if you work with ad networks. Use a certified CMP.

## Compliance Checklist

- [ ] Cookie audit completed (all cookies inventoried by category)
- [ ] No non-essential cookies set before consent
- [ ] "Reject all" option as prominent as "Accept all"
- [ ] Granular per-category consent options available
- [ ] Consent withdrawal option in privacy settings page
- [ ] Consent stored with version, timestamp, and preferences
- [ ] GPC signal detected and honored automatically
- [ ] Privacy policy linked from banner
- [ ] Cookie policy lists all cookies with purpose and retention
- [ ] Third-party scripts blocked until consent granted
- [ ] Analytics opt-out cookies cleared on consent withdrawal
- [ ] Banner tested in EU with VPN (actually applies)
- [ ] Consent renewed when policy version changes
