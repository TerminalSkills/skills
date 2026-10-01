---
name: analytics-tracking
description: >-
  Designs and implements website analytics tracking with Google Analytics 4 and
  Google Tag Manager: a written tracking plan, event and parameter names that
  pass GA4's rules, gtag.js or data-layer code, key events, consent mode, UTM
  conventions, and a verification pass. Use when someone says "set up GA4",
  "add conversion tracking", "track this form or button", "write a tracking
  plan", "GTM data layer", "UTM parameters", "why are my events missing or
  counted twice", or "audit our analytics setup".
license: Apache-2.0
compatibility: "A GA4 property with a web data stream and either the Google tag (gtag.js) or a Google Tag Manager web container. curl for the Measurement Protocol validation server. Web only; native mobile SDKs are out of scope."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["google-analytics", "ga4", "google-tag-manager", "event-tracking", "utm"]
---

# Analytics Tracking

## Overview

Tracking is finished when a named person can answer a business question from a report, not when a tag fires. This skill takes a site from "we have GA4 installed" to a short tracking plan, code that sends each event exactly once with valid names, the Admin settings that make the data usable, and proof that it works. Everything here follows Google's current documentation for GA4, the Google tag and Tag Manager; Universal Analytics concepts (categories, actions, labels, goals, `anonymize_ip`) do not apply.

## Instructions

### 1. Establish what exists

Ask: which decisions the data should inform, which actions count as success (lead, signup, purchase), which regions the visitors come from (consent), and who is allowed to publish the Tag Manager container. Then look in the code:

```bash
grep -rnE "gtag\(|dataLayer\.push|googletagmanager\.com|GTM-[A-Z0-9]{4,}|G-[A-Z0-9]{8,}|@next/third-parties" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=.next .
```

Choose one delivery path and keep to it. If a `GTM-` container is on the page, send events through the data layer and configure tags in Tag Manager; if only the Google tag is present, call `gtag()` directly. The same event sent through both paths is counted twice.

### 2. Pick events from the top of this list down

1. **Already collected.** With enhanced measurement on, GA4 records `page_view` (page loads and browser-history changes), `scroll` (once per page at 90% depth), `click` (outbound links only), `view_search_results`, `video_start` / `video_progress` / `video_complete` (embedded YouTube), `file_download`, `form_start` and `form_submit`. Do not re-implement these.
2. **Recommended events.** Use Google's exact names and parameters so built-in reports fill in: `sign_up` and `login` (`method`), `generate_lead` (`currency`, `value`, `lead_source`), `search` (`search_term`), `view_item`, `add_to_cart`, `begin_checkout`, `add_payment_info`, `purchase` (`transaction_id`, `currency`, `value`, `items`).
3. **Custom events**, only when nothing above fits. One name per action, with the variation in parameters: `cta_click` with `cta_location: "pricing_hero"`, not a separate event name per button.

Names must pass these limits; GA4 does not log what exceeds them, and nothing in the browser reports an error:

| Item | Rule |
|---|---|
| Event name | Starts with a letter; letters, digits and underscores only; case-sensitive; 40 characters |
| Parameters | 25 per event; name 40 characters; value 100 characters (`page_location` 1,000, `page_referrer` 420, `page_title` 300) |
| User properties | 25 per property; name 24 characters; value 36 characters |
| Reserved | Parameter names starting with `_`, `firebase_`, `ga_`, `google_` or `gtag.`. Do not reuse automatic names (`click`, `scroll`, `session_start`, `first_visit`, `user_engagement`, `form_submit`, `file_download`) for custom events |
| Per standard property | 30 key events, 50 event-scoped and 25 user-scoped custom dimensions, 50 custom metrics |

Money: `value` is a number, never a string, and always travels with `currency` (ISO 4217, `"USD"`). For `purchase`, `value` is the sum of price × quantity and excludes shipping and tax; `transaction_id` is required and is what keeps a repeated purchase from being counted again.

### 3. Write the tracking plan

Create `docs/tracking-plan.md` with one row per event: event name, the exact moment it fires (a server-confirmed success, not a button press), parameters with example values, whether it is a key event, and which path sends it. Example 1 shows the format. Every later step works from this file.

### 4. Implement

**Google tag with consent defaults.** The consent default must run before the tag loads; the order of these blocks is the point.

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-7KQ2M4XW9P"></script>
<script>
  gtag('js', new Date());
  gtag('config', 'G-7KQ2M4XW9P');
</script>
```

When the visitor answers the banner, the consent tool calls `gtag('consent', 'update', { analytics_storage: 'granted', ... })` with all four types, and repeats that on later pages from the stored choice. Add `region: ['ES', 'FR']` to a default to scope it; the most specific region wins. Which defaults to set is the site owner's legal decision, not a technical one. In Tag Manager, use a consent template from the Community Template Gallery (or the consent APIs in a custom template), never a Custom HTML tag.

**Events with gtag.js** go anywhere below the snippet: `gtag('event', 'generate_lead', { currency: 'USD', value: 180, lead_source: 'demo_form' })`.

**Events with Tag Manager.** The page pushes a message that carries an `event` key; a GA4 Event tag listens for it with a Custom Event trigger and reads the fields through Data Layer Variables. For ecommerce events, clear the previous object first:

```javascript
dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'purchase',
  ecommerce: {
    transaction_id: 'ST-20418',
    value: 43.50,
    tax: 3.48,
    shipping: 4.90,
    currency: 'USD',
    items: [
      { item_id: 'OOL-100', item_name: 'High Mountain Oolong 100 g', price: 14.50, quantity: 3 }
    ]
  }
});
```

**Single-page apps.** Enhanced measurement sends `page_view` on `pushState`, `popState` and `replaceState` when "Page changes based on browser history events" is ticked (Admin > Data collection and modification > Data streams > the stream > Enhanced measurement > Page views > advanced settings). With Tag Manager, send `page_view` from a GA4 Event tag on a History Change trigger and leave that option off, or every navigation counts twice. To send page views by hand, set `send_page_view: false` in `config` and turn the history option off as well.

**Signed-in users.** Pass an internal ID with `gtag('config', 'G-7KQ2M4XW9P', { user_id: 'u_48211' })`: an opaque ID, never an email address.

**Server-side events** (a webhook confirms payment, a CRM marks a lead qualified) go through the Measurement Protocol: `POST https://www.google-analytics.com/mp/collect?measurement_id=...&api_secret=...` with a JSON body holding `client_id` and up to 25 `events`. Read the browser's `client_id` and `session_id` with `gtag('get', 'G-7KQ2M4XW9P', 'client_id', callback)` and store them with the order. Include `session_id` and `engagement_time_msec` in `params`; without them the event does not count toward session and engagement metrics or show properly in Realtime. The secret is created under Admin > Data collection and modification > Data streams > the stream > Measurement Protocol API secrets and stays in a server environment variable. For EU collection use the host `region1.google-analytics.com`.

### 5. Configure GA4 Admin

- **Key events** (the name that replaced "conversions"): Admin > Data display > Events, star the event. `purchase` is one by default. Allow up to 24 hours for standard reports.
- **Custom definitions**: a custom parameter is invisible in reports until it is registered under Admin > Data display > Custom definitions as an event-scoped dimension; it appears 24–48 hours later. Register only what the plan needs.
- **Data retention**: Admin > Data Settings > Data Retention. Standard properties offer 2 or 14 months; choose 14. It affects explorations and funnels, not the standard aggregated reports.
- **Data redaction**: turn on email redaction and list query parameters to strip for the web stream if URLs can carry personal data.

### 6. Set the UTM convention

| Parameter | Use |
|---|---|
| `utm_source` | Who sent the visit: `newsletter`, `linkedin`, `partner-fieldnotes` |
| `utm_medium` | Channel type; GA4 maps it to a default channel (table below) |
| `utm_campaign` | The campaign, identical across every platform it runs on |
| `utm_id` | Campaign ID, needed when cost data is imported |
| `utm_content`, `utm_term` | Creative variant; paid keyword |

Always set source, medium and campaign together. Values are case-sensitive (`Email` and `email` become two rows), so use lowercase throughout. Keep UTMs off links between your own pages and never put personal data in them.

| `utm_medium` value | Default channel group |
|---|---|
| `email` | Email |
| `cpc`, `ppc`, or anything starting with `paid` | Paid Search, Paid Social, Paid Shopping, Paid Video or Paid Other, depending on the source |
| `social` | Organic Social |
| `affiliate` | Affiliates |
| `display`, `banner`, `cpm` | Display |
| `referral` | Referral |
| `sms` | SMS |

### 7. Verify before calling it done

1. Open Tag Assistant (tagassistant.google.com, or Preview in the Tag Manager workspace), connect to the site, and perform each action in the plan.
2. Watch Admin > Data display > DebugView. Each event must appear once, with every planned parameter, on desktop and on a phone. DebugView stays empty while analytics consent is denied, so grant it in the banner first.
3. To debug without Tag Assistant, add `debug_mode: true` to the event or `config`; remove the key afterwards, because setting it to `false` does not switch it off.
4. Check server-side payloads against the validation server (Example 3). The live endpoint returns 2xx even for malformed events.
5. A day later, confirm the events and key events in the standard reports and record the date in the plan.

## Examples

### Example 1: Lead tracking for a B2B site on Next.js

Prompt: "Kestrel Payroll's marketing site is Next.js. GA4 is installed with the Google tag. We need demo requests and signups as conversions, and we want to know which company sizes ask for demos."

The plan the agent writes to `docs/tracking-plan.md`:

```markdown
| Event | Fires when | Parameters (example) | Key event | Sent by |
|---|---|---|---|---|
| page_view | page load and route change | automatic | no | enhanced measurement |
| file_download | click on a PDF link | automatic | no | enhanced measurement |
| generate_lead | POST /api/demo returns 200 | currency "USD", value 180, lead_source "demo_form", company_size "51-200" | yes | gtag |
| sign_up | account row created | method "email" or "google" | yes | gtag |
| cta_click | click on a primary button | cta_location "pricing_hero", cta_text "Start free trial" | no | gtag |

Custom dimensions to register (event scope): company_size, cta_location, lead_source
Lead value: 180 USD = 6% demo-to-customer rate × 3,000 USD first-year revenue
Verified in DebugView: 2026-10-02
```

The code:

```tsx
// app/layout.tsx — loads the Google tag once for every route
import { GoogleAnalytics } from '@next/third-parties/google'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />
    </html>
  )
}

// app/demo/DemoForm.tsx — fire only after the server accepted the request
'use client'
import { sendGAEvent } from '@next/third-parties/google'

export async function submitDemo(form: { email: string; companySize: string }) {
  const res = await fetch('/api/demo', { method: 'POST', body: JSON.stringify(form) })
  if (!res.ok) return
  sendGAEvent('event', 'generate_lead', {
    currency: 'USD',
    value: 180,
    lead_source: 'demo_form',
    company_size: form.companySize, // the email address is never sent
  })
}
```

Then the Admin steps: star `generate_lead` and `sign_up` as key events, register the three custom dimensions, set retention to 14 months, confirm "Page changes based on browser history events" is ticked so App Router navigations count as page views.

### Example 2: A store that counts purchases twice

Prompt: "Saltmarsh Tea runs on a custom storefront with Tag Manager. GA4 shows about 30% more purchases than our order system."

The agent searches the code, finds the `purchase` push in the order-confirmation page with no `transaction_id`, and a second GA4 tag firing on the same page from a Page View trigger. Customers who reload the confirmation page, or reopen it from the order email, send the event again. The fix:

1. Push `purchase` once, with `transaction_id` set to the order number and the `ecommerce: null` reset before it (the code in step 4).
2. In Tag Manager keep one GA4 Event tag for `purchase` on a Custom Event trigger named `purchase`, map `transaction_id`, `value`, `currency` and `items` from Data Layer Variables, and delete the Page View tag.
3. Preview, place a test order, reload the confirmation page, and confirm in Tag Assistant that the tag fired once.
4. Compare GA4 purchases with the order system for the following week and note the remaining gap in the plan. After the fix GA4 should match the order system or sit below it, because ad blockers and declined consent only remove events.

### Example 3: Checking a server-side event before it ships

The validation server accepts the same request as the live endpoint, stores nothing, and explains what is wrong. It does not check the secret or the measurement ID.

```bash
curl -s -X POST "https://www.google-analytics.com/debug/mp/collect?measurement_id=G-7KQ2M4XW9P&api_secret=$GA_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"1837264019.1759312800","validation_behavior":"ENFORCE_RECOMMENDATIONS",
       "events":[{"name":"Demo Request","params":{"value":180}}]}'
```

```json
{
  "validationMessages": [ {
    "fieldPath": "events",
    "description": "Event at index: [0] has invalid name [Demo Request]. Only alphanumeric characters and underscores are allowed.",
    "validationCode": "NAME_INVALID"
  } ]
}
```

Renamed to `generate_lead` with `currency`, `value`, `session_id` and `engagement_time_msec`, the same request returns an empty `validationMessages` array. Only then does the agent switch the URL to `/mp/collect`.

## Guidelines

- No personal data in any event, parameter, user property, page URL, page title or UTM value: no emails, phone numbers or names. Look for forms that submit with GET and put the email in the query string.
- A parameter that is not registered as a custom dimension cannot be used in reports, and one registered late has no history. Register on the day the event ships.
- A parameter value over 100 characters exceeds the collection limit and is not stored as sent. Send IDs and short labels, not sentences.
- Do not spend key events on steps (page views, clicks). Thirty is the ceiling, and each one dilutes the "Key events" column.
- Fire on confirmed outcomes. A click on "Submit" also counts validation errors and double clicks; the server's success response does not.
- GA4 does not log IP addresses, so there is no IP-anonymisation switch to set. Old snippets containing `anonymize_ip` can be deleted.
- Keep debug traffic out of reports: use Tag Assistant for your own device instead of shipping `debug_mode` to everyone.
- Never put the Measurement Protocol secret in browser code. Anyone who has it can write events into the property.
- This skill does not decide what the consent banner must say or which defaults are lawful in a given country; that belongs to the site owner and their counsel.
- Not the right tool for product analytics inside an app (per-user funnels, retention cohorts) or for mobile SDK setup.
