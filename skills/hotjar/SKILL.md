---
name: hotjar
category: analytics
version: 1.0.0
description: >-
  User behavior analytics with Hotjar — heatmaps, session recordings, feedback
  widgets, and surveys. Covers script installation, JavaScript API for custom
  events and user attributes, survey API, integration with analytics platforms
  like Google Analytics and Mixpanel, and privacy controls. Use when tasks
  involve understanding how users interact with a page visually, debugging UX
  issues with session recordings, or collecting user feedback with surveys.
author: terminal-skills
tags: [hotjar, heatmaps, session-recording, user-feedback, surveys, ux]
license: Apache-2.0
compatibility:
  - platform: linux
  - platform: macos
  - platform: windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: analytics
  tags: [hotjar, heatmaps, session-recording, user-feedback, surveys]
---

# Hotjar

Heatmaps, session recordings, and user feedback. See how users actually interact with your site and collect qualitative insights.

## Script Installation

```html
<!-- index.html — Add the Hotjar tracking script to your site.
     Place in <head> for heatmaps and recordings to capture from first paint. -->
<head>
  <script>
    (function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:YOUR_SITE_ID,hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
        a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
  </script>
</head>
```

## Next.js Integration

```typescript
// components/hotjar.tsx — Add Hotjar to a Next.js App Router app.
// Uses next/script for optimal loading without blocking rendering.
'use client'
import Script from 'next/script'

export function HotjarScript({ siteId }: { siteId: number }) {
  return (
    <Script
      id="hotjar"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function(h,o,t,j,a,r){
            h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
            h._hjSettings={hjid:${siteId},hjsv:6};
            a=o.getElementsByTagName('head')[0];
            r=o.createElement('script');r.async=1;
            r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
            a.appendChild(r);
          })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
        `,
      }}
    />
  )
}
```

```typescript
// app/layout.tsx — Include Hotjar in the root layout.
// Only loads in production to avoid polluting dev data.
import { HotjarScript } from '@/components/hotjar'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'production' && (
          <HotjarScript siteId={Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID)} />
        )}
      </body>
    </html>
  )
}
```

## JavaScript API — Events and User Attributes

```typescript
// lib/hotjar.ts — Hotjar JavaScript API helpers.
// Identify users, trigger events, and control recordings.
declare global {
  interface Window {
    hj: (...args: any[]) => void
  }
}

export function identifyHotjarUser(userId: string, attributes: Record<string, string | number | boolean>) {
  /**
   * Identify a user for filtering session recordings.
   * Attributes appear in the Hotjar dashboard for segmentation.
   * Max 100 attributes per user.
   */
  window.hj('identify', userId, attributes)
}

export function triggerHotjarEvent(eventName: string) {
  /**
   * Trigger a custom event. Use to:
   * - Start a recording on a specific user action
   * - Show a survey when a condition is met
   * - Tag recordings for filtering
   */
  window.hj('event', eventName)
}

export function tagRecording(...tags: string[]) {
  /**
   * Add tags to the current session recording.
   * Useful for filtering recordings by feature, experiment, or error state.
   */
  window.hj('tagRecording', tags)
}

export function triggerSurvey(surveyId: number) {
  /**
   * Manually trigger a Hotjar survey (bypasses page targeting rules).
   * Survey must be set to "API" trigger mode in the Hotjar dashboard.
   */
  window.hj('trigger', `survey_${surveyId}`)
}

export function setStateChange(url: string) {
  /**
   * Notify Hotjar of a virtual page change in an SPA.
   * Required for accurate heatmaps on client-side routed pages.
   */
  window.hj('stateChange', url)
}
```

## SPA Route Change Tracking

```typescript
// hooks/use-hotjar-spa.ts — Track route changes in React SPAs for Hotjar.
// Ensures heatmaps and recordings capture navigation in client-side routing.
'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function useHotjarSPA() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window.hj === 'function') {
      window.hj('stateChange', pathname)
    }
  }, [pathname])
}
```

## Privacy Controls

```typescript
// lib/hotjar-privacy.ts — Configure Hotjar privacy and suppression.
// Control what gets captured in recordings and heatmaps.

/**
 * CSS classes for element-level control:
 *
 * data-hj-suppress     — Mask element text in recordings (shows asterisks)
 * data-hj-allow        — Explicitly allow capturing (overrides global suppress)
 * data-hj-masked       — Mask input field values
 *
 * HTML example:
 * <input type="email" data-hj-suppress />
 * <div data-hj-suppress>Sensitive content here</div>
 * <span data-hj-allow>Public content</span>
 */

export function configureSuppression() {
  // Suppress all input fields by default (opt-in to capture)
  // Set in Hotjar dashboard: Settings → Data Collection → Input masking
  // Or use CSS selectors to target specific elements

  // Programmatically suppress dynamic content
  const sensitiveElements = document.querySelectorAll('[data-sensitive]')
  sensitiveElements.forEach((el) => {
    el.setAttribute('data-hj-suppress', '')
  })
}
```

## Integration with Google Analytics

```typescript
// lib/hotjar-ga-integration.ts — Link Hotjar sessions with Google Analytics.
// Pass the GA client ID to Hotjar for cross-referencing sessions.
export function linkHotjarToGA() {
  // Wait for both GA and Hotjar to load
  const interval = setInterval(() => {
    if (typeof window.hj === 'function' && typeof window.gtag === 'function') {
      clearInterval(interval)

      // Get the GA client ID
      window.gtag('get', 'G-XXXXXXXXXX', 'client_id', (clientId: string) => {
        // Pass GA client ID as a Hotjar user attribute
        window.hj('identify', null, {
          ga_client_id: clientId,
        })
      })
    }
  }, 500)

  // Clean up after 10 seconds
  setTimeout(() => clearInterval(interval), 10000)
}
```

## Survey API

```typescript
// lib/hotjar-surveys.ts — Trigger Hotjar surveys based on user behavior.
// Combine with event tracking to show surveys at the right moment.

export function showNPSSurveyAfterPurchase() {
  /**
   * Trigger NPS survey after a successful purchase.
   * Survey configured in Hotjar dashboard with API trigger mode.
   */
  window.hj('trigger', 'post_purchase_nps')
}

export function showChurnSurvey() {
  /**
   * Show exit survey when user clicks cancel subscription.
   * Captures churn reason before they leave.
   */
  window.hj('trigger', 'churn_survey')
}

export function showFeatureFeedback(featureName: string) {
  /**
   * Collect feedback on a specific feature.
   * Tag the recording so you can watch sessions where feedback was given.
   */
  window.hj('tagRecording', [`feedback_${featureName}`])
  window.hj('trigger', 'feature_feedback')
}
```
