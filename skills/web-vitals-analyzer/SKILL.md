---
name: web-vitals-analyzer
description: >-
  Analyze and optimize Core Web Vitals (LCP, CLS, INP) and frontend performance.
  Use when a user asks to improve page speed, fix layout shifts, reduce loading
  times, analyze Lighthouse reports, optimize bundle size, or improve Google
  PageSpeed scores. Covers image optimization, code splitting, font loading,
  render-blocking resources, and JavaScript execution costs.
license: Apache-2.0
compatibility: >-
  Works with any web frontend. Best results with React, Next.js, Vue, Svelte,
  and static sites.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - performance
    - web-vitals
    - lighthouse
    - frontend
    - lcp
---

# Web Vitals Analyzer

## Overview

Diagnoses Core Web Vitals failures and frontend performance issues by analyzing page structure, resource loading patterns, JavaScript bundle composition, and rendering behavior. Produces prioritized fixes with estimated metric improvements.

The three metrics are scored at the 75th percentile of real user visits. Google treats them as good when LCP is 2.5 s or less, CLS is 0.1 or less, and INP is 200 ms or less. INP replaced First Input Delay (FID) as a Core Web Vital in March 2024. Lighthouse runs a single lab load and cannot measure INP directly, so field data (Chrome UX Report, PageSpeed Insights "Discover what your real users experience") decides pass or fail.

## Instructions

When asked to optimize frontend performance or Core Web Vitals:

1. **Gather the current state** — ask for or analyze:
   - Field values from PageSpeed Insights or the Chrome UX Report for the URL, if the site has enough traffic. These are the numbers that count.
   - Lighthouse report (JSON or screenshot). A lab run from the CLI: `npx lighthouse https://terminalskills.io --only-categories=performance --output=json --output-path=./lighthouse.json` (Lighthouse 13.x needs a local Chrome)
   - The page URL or source code (HTML, CSS, JS entry points)
   - Framework used (React, Next.js, Vue, vanilla, etc.)
   - Current LCP, CLS, and INP values if available

2. **Analyze Largest Contentful Paint (LCP)** — target < 2.5s:
   - Identify the LCP element (usually hero image, heading, or above-fold content)
   - Check: Is the LCP image lazy-loaded? (it shouldn't be)
   - Check: Is there a `<link rel="preload">` for the LCP resource?
   - Check: Are render-blocking CSS/JS delaying first paint?
   - Check: Server response time (TTFB) — if > 800ms, it's a server issue
   - Check: Font loading strategy — is `font-display: swap` or `optional` used?
   - Check: Are critical CSS styles inlined or blocking?

3. **Analyze Cumulative Layout Shift (CLS)** — target < 0.1:
   - Identify elements causing layout shifts (images without dimensions, dynamic content, ads, web fonts)
   - Check: Do all `<img>` and `<video>` tags have explicit `width` and `height`?
   - Check: Is content injected above existing content after load?
   - Check: Are web fonts causing FOUT/FOIT shifts?
   - Check: Are dynamic ads or embeds reserving space with `aspect-ratio` or fixed containers?

4. **Analyze Interaction to Next Paint (INP)** — target < 200ms:
   - Identify heavy JavaScript on the main thread
   - Check: Are event handlers doing synchronous layout thrashing?
   - Check: Long tasks (> 50ms) blocking the main thread
   - Check: Is there unnecessary re-rendering (React: missing memoization, excessive state updates)?
   - Check: Are third-party scripts blocking interaction (analytics, chat widgets, A/B testing)?
   - Suggest: `scheduler.yield()` where available (Chromium only, so feature-detect it), `setTimeout` to move non-urgent work after the paint, web workers for heavy computation. `requestIdleCallback` is not available in Safari, so do not rely on it alone.

5. **Analyze bundle and resource loading:**
   - Identify total JS bundle size and largest chunks
   - Check for unused JavaScript (coverage analysis)
   - Suggest code splitting opportunities (route-based, component-based)
   - Check image formats (suggest WebP/AVIF for photos, SVG for icons)
   - Identify duplicate dependencies in the bundle

6. **Output format:**
   - Current scores vs targets for each metric
   - Prioritized list of fixes (highest impact first)
   - For each fix: what to change, where in the code, expected improvement
   - A "quick wins" section for changes that take < 15 minutes

## Examples

### Example 1: Poor LCP on a marketing site

**Input:**
```
Our landing page scores 38 on Lighthouse performance. LCP is 5.2s. Here's the page source.
```

**Output:**
```
Core Web Vitals Diagnosis
==========================
LCP: 5.2s (target: < 2.5s) ❌
CLS: 0.03 (target: < 0.1) ✓
INP: N/A (no interaction data)

Root Causes (ranked by impact):

1. CRITICAL: Hero image (2.4MB JPEG) is lazy-loaded
   File: src/components/Hero.tsx:12
   Fix: Remove loading="lazy" from the above-fold hero image.
        Add: <link rel="preload" as="image" href="/hero.jpg" fetchpriority="high">
        Convert to WebP: reduces 2.4MB → 340KB
   Expected LCP improvement: -2.1s

2. HIGH: 3 render-blocking CSS files (total 180KB uncompressed)
   Files: fonts.css (89KB), animations.css (52KB), above-fold.css (39KB)
   Fix: Inline critical CSS (above-fold.css) in <head>.
        Load fonts.css and animations.css with media="print" onload hack.
   Expected LCP improvement: -0.8s

3. MODERATE: Google Fonts loaded via @import in CSS (parser-blocking)
   Fix: Switch to <link rel="preconnect" href="https://fonts.gstatic.com">
        and <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"> in HTML <head>
   Expected LCP improvement: -0.3s

Quick wins (< 15 min each):
  • Add fetchpriority="high" to hero image tag
  • Add width/height to hero image (already good CLS, but defensive)
  • Enable text compression (gzip/brotli) on server — saves 60% on CSS
```

### Example 2: High INP on a React dashboard

**Input:**
```
Our dashboard app has INP of 890ms. Users complain clicks feel laggy. It's a React 18 app with Zustand state management.
```

**Output:**
```
INP Diagnosis: 890ms (target: < 200ms) ❌

Root Causes:

1. CRITICAL: Filter dropdown triggers full data grid re-render (45,000 rows)
   File: src/components/DataGrid.tsx
   The grid component re-renders on every filter change because the parent
   passes a new array reference each time.
   Fix: Memoize the filtered data with useMemo:
     const filteredData = useMemo(() => data.filter(filterFn), [data, filters]);
   Wrap DataGrid in React.memo().
   Expected INP improvement: -500ms

2. HIGH: Analytics script (third-party) runs 180ms synchronous task on click
   Source: analytics.min.js:1 — event listener on document.body
   Fix: Load analytics with async/defer. Move tracking off the click path:
     document.addEventListener('click', (e) => {
       setTimeout(() => trackClick(e), 0); // runs after the next paint
     });
   Expected INP improvement: -180ms

3. MODERATE: Date formatting in table cells using Intl.DateTimeFormat per-render
   Fix: Create formatter once outside component:
     const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
   Expected INP improvement: -80ms
```

## Guidelines

- Always identify the specific LCP element — never give generic advice without knowing what's slow.
- CLS fixes must include explicit code changes (dimensions, aspect-ratio values, container styles).
- For INP, focus on the main thread. Network latency doesn't directly affect INP.
- Recommend `fetchpriority="high"` only for the single most important above-fold resource.
- When suggesting image format changes, note that AVIF has better compression but slower decode — WebP is the safer default.
- Account for framework-specific patterns: in Next.js, give the LCP image `priority` on `next/image` (it disables lazy loading and adds a preload) rather than hand-writing a preload tag; Nuxt's `useAsyncData`; SvelteKit's load functions.
- Pick the metric before the fix: a slow LCP is usually TTFB, image weight, or render-blocking CSS; a slow INP is almost always main-thread JavaScript run inside an input handler.
- Don't recommend service workers for performance unless the use case specifically involves repeat visits.
