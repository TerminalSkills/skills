---
name: umami
description: >-
  Track website analytics with Umami — privacy-focused, open-source Google
  Analytics alternative. Use when someone asks to "track website analytics",
  "Umami", "privacy-friendly analytics", "self-hosted analytics", "GDPR
  analytics", "replace Google Analytics", or "website traffic tracking without
  cookies". Covers setup, event tracking, custom properties, API, and
  self-hosting.
license: Apache-2.0
compatibility: "Any website. Self-hosted (Docker/Vercel) or Umami Cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["analytics", "umami", "privacy", "tracking", "open-source"]
---

# Umami

## Overview

Umami is a privacy-focused web analytics platform — tracks page views, visitors, and custom events without cookies or personal data collection. GDPR/CCPA compliant by default (no consent banner needed). Self-hostable on your own infrastructure, or use Umami Cloud. Clean dashboard, real-time stats, and an API for programmatic access. The #1 open-source Google Analytics alternative.

## When to Use

- Need website analytics without cookie consent banners
- GDPR/CCPA compliance is mandatory
- Don't trust Google with your analytics data
- Want to self-host analytics on your infrastructure
- Simple, clean analytics without the complexity of GA4
- API access to analytics data for dashboards/reporting

## Instructions

### Self-Host Setup

```bash
# Docker Compose
git clone https://github.com/umami-software/umami.git
cd umami
docker compose up -d

# Or one-click deploy to Vercel/Netlify/Railway
# See: https://umami.is/docs/install
```

### Add Tracking Script

```html
<!-- Add to your site's <head> -->
<script
  defer
  src="https://analytics.mysite.com/script.js"
  data-website-id="your-website-id"
></script>
```

```tsx
// Next.js — app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          defer
          src="https://analytics.mysite.com/script.js"
          data-website-id="your-website-id"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Custom Event Tracking

```typescript
// Track custom events
// Umami exposes a global `umami` object

// Track button clicks
document.getElementById("signup-btn")?.addEventListener("click", () => {
  umami.track("signup-click", { plan: "pro", source: "header" });
});

// Track form submissions
function handleSubmit(formData: FormData) {
  umami.track("form-submit", {
    form: "contact",
    subject: formData.get("subject"),
  });
}

// Track with React
function PricingCard({ plan }: { plan: string }) {
  return (
    <button
      onClick={() => umami.track("pricing-click", { plan })}
      data-umami-event="pricing-click"
      data-umami-event-plan={plan}
    >
      Choose {plan}
    </button>
  );
}
```

### API Access

```typescript
// api/analytics.ts — Fetch analytics data programmatically
const UMAMI_URL = "https://analytics.mysite.com";
const UMAMI_TOKEN = process.env.UMAMI_API_TOKEN;

async function getPageViews(websiteId: string, days = 30) {
  const endDate = Date.now();
  const startDate = endDate - days * 24 * 60 * 60 * 1000;

  const res = await fetch(
    `${UMAMI_URL}/api/websites/${websiteId}/pageviews?startAt=${startDate}&endAt=${endDate}&unit=day`,
    { headers: { Authorization: `Bearer ${UMAMI_TOKEN}` } }
  );
  return res.json();
}

async function getTopPages(websiteId: string) {
  const endDate = Date.now();
  const startDate = endDate - 7 * 24 * 60 * 60 * 1000;

  const res = await fetch(
    `${UMAMI_URL}/api/websites/${websiteId}/metrics?startAt=${startDate}&endAt=${endDate}&type=url`,
    { headers: { Authorization: `Bearer ${UMAMI_TOKEN}` } }
  );
  return res.json();  // [{ x: "/pricing", y: 1234 }, ...]
}
```

## Examples

### Example 1: Add privacy-friendly analytics to a SaaS

**User prompt:** "Add analytics to our SaaS without cookies or consent banners."

The agent will deploy Umami, add the tracking script, set up custom events for key actions (signup, upgrade, feature use), and create an API integration for internal dashboards.

### Example 2: Build a custom analytics dashboard

**User prompt:** "Pull our Umami data into a custom dashboard for the marketing team."

The agent will use the Umami API to fetch page views, top pages, referrers, and events, then display them in a React dashboard.

## Guidelines

- **No cookies = no consent banner** — GDPR compliant by default
- **`data-umami-event` attribute** — track clicks without JavaScript
- **`umami.track(name, data)` for custom events** — flexible event tracking
- **Self-host for full control** — Docker, Vercel, Railway, or any Node.js host
- **API for programmatic access** — build custom dashboards and reports
- **Multi-site support** — one Umami instance tracks multiple websites
- **Real-time dashboard** — see active visitors now
- **UTM tracking** — campaign attribution works automatically
- **Lightweight script** — <2KB, doesn't slow down your site
- **PostgreSQL or MySQL** — your choice for the backend database
