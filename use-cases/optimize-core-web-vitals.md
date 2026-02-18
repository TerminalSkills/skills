---
title: "Optimize Core Web Vitals with AI"
slug: optimize-core-web-vitals
description: "Diagnose and fix LCP, CLS, and INP issues to pass Google's Core Web Vitals thresholds and improve user experience."
skills: [web-vitals-analyzer, frontend-design, code-reviewer]
category: development
tags: [performance, web-vitals, lighthouse, frontend, seo]
---

# Optimize Core Web Vitals with AI

## The Problem

Google Search Console shows your site failing Core Web Vitals on 60% of pages. Lighthouse gives you a score of 34 and a wall of suggestions ranging from "reduce unused JavaScript" to "avoid enormous network payloads" — but no prioritization, no root cause analysis, and no idea which fix will actually move the needle. You try adding `loading="lazy"` everywhere, switch to WebP images, and the score barely moves because the real bottleneck was a render-blocking CSS file you never noticed. Frontend performance optimization requires understanding the interaction between resource loading, rendering pipeline, and JavaScript execution — and most developers don't have time to become browser internals experts.

## The Solution

Give your AI agent the page URL or source code and let it trace the critical rendering path. It identifies the exact LCP element, pinpoints layout shift sources, profiles main thread bottlenecks causing poor INP, and produces a prioritized fix list with estimated metric improvements for each change.

## Step-by-Step Walkthrough

### 1. Get the baseline diagnosis

```text
Analyze the Core Web Vitals for our product page. Here's the Lighthouse JSON report and the page source from src/pages/product/[id].tsx. Tell me exactly what's failing and why.
```

The agent parses the report and source:

```text
Core Web Vitals Baseline
=========================
LCP:  4.8s  (target: < 2.5s) ❌ Element: <img> hero product photo
CLS:  0.28  (target: < 0.1)  ❌ Sources: product image, review stars, dynamic pricing badge
INP:  340ms (target: < 200ms) ❌ Source: "Add to Cart" button triggers full cart re-render

Lighthouse Score: 34/100

12 issues found across 3 metrics. Top 5 by impact:
1. Hero image: 1.8MB JPEG, lazy-loaded, no preload, no dimensions set — affects LCP + CLS
2. 4 render-blocking CSS files (total 220KB) — affects LCP
3. Cart state update re-renders entire page (no memoization) — affects INP
4. Review stars component loads 47KB JS and shifts layout on hydration — affects CLS
5. Third-party chat widget blocks main thread for 280ms on load — affects INP + LCP
```

### 2. Fix LCP — the biggest impact first

```text
Show me exactly how to fix the hero image and render-blocking CSS. Give me the code changes.
```

```text
Fix 1: Hero Product Image (estimated LCP improvement: -2.8s)
=============================================================

Current (src/pages/product/[id].tsx:34):
  <img src={product.imageUrl} loading="lazy" alt={product.name} />

Replace with:
  <img
    src={product.imageUrl.replace('.jpg', '.webp')}
    alt={product.name}
    width={800}
    height={600}
    fetchpriority="high"
    decoding="async"
  />

Add to <head> in src/pages/_document.tsx:
  <link rel="preload" as="image" type="image/webp"
        href="/api/product-image?format=webp&w=800" />

Fix 2: Render-Blocking CSS (estimated LCP improvement: -0.9s)
===============================================================

Current: 4 <link rel="stylesheet"> tags in <head>

Action:
  1. Inline critical CSS (above-fold styles, ~8KB) directly in <style> tag
  2. Move non-critical CSS to async loading:

  <link rel="stylesheet" href="/styles/animations.css" media="print" onload="this.media='all'" />
  <link rel="stylesheet" href="/styles/below-fold.css" media="print" onload="this.media='all'" />

Combined expected LCP: 4.8s → ~1.6s
```

### 3. Fix CLS — stop the layout shifts

```text
Fix the 0.28 CLS score. Show me every element causing shifts and the exact CSS changes needed.
```

```text
CLS Fix Plan (0.28 → estimated 0.04)
======================================

Shift 1: Product image (contribution: 0.15)
  Already fixed above — width/height attributes prevent reflow.

Shift 2: Review stars component (contribution: 0.08)
  Problem: Stars render as skeleton (height: 20px) then expand to 32px on hydration.
  File: src/components/ReviewStars.tsx

  Fix: Set explicit min-height on container:
    <div style={{ minHeight: '32px' }} className="review-stars">
      <ReviewStars rating={product.rating} />
    </div>

Shift 3: Dynamic pricing badge (contribution: 0.05)
  Problem: "20% OFF" badge injects above the price after API response.
  File: src/components/PricingBadge.tsx

  Fix: Reserve space unconditionally:
    <div className="pricing-badge-slot" style={{ minHeight: '28px' }}>
      {discount && <PricingBadge discount={discount} />}
    </div>
```

### 4. Fix INP — make interactions feel instant

```text
The Add to Cart button has 340ms INP. Profile what's happening on click and show me how to fix it.
```

```text
INP Analysis: "Add to Cart" Click (340ms → estimated 80ms)
============================================================

Main thread trace:
  0-12ms:    Event handler fires, calls addToCart(productId)
  12-180ms:  Zustand store update triggers re-render of CartProvider
             which wraps the ENTIRE page — 847 components re-render
  180-290ms: Cart drawer animation runs synchronous layout calculation
  290-340ms: Analytics tracking (synchronous)

Fix 1: Scope cart re-renders (saves ~160ms)
  Move CartProvider to wrap only the cart drawer, not the full page.
  Use Zustand selectors to subscribe to specific slices:

  // Before (re-renders on ANY cart change):
  const cart = useCartStore();

  // After (re-renders only when item count changes):
  const itemCount = useCartStore((s) => s.items.length);

Fix 2: Defer analytics (saves ~50ms)
  requestIdleCallback(() => analytics.track('add_to_cart', { productId }));

Fix 3: Use CSS animation instead of JS layout calculation (saves ~60ms)
  Replace getBoundingClientRect() with CSS transform animation for drawer.
```

## Real-World Example

A frontend engineer at a 25-person e-commerce startup receives a Slack alert: Google Search Console flagged 340 product pages as having poor Core Web Vitals. Organic traffic has dropped 18% over the past quarter, and the team suspects the CWV penalty is partly to blame.

1. The engineer feeds the Lighthouse report for a representative product page to the agent
2. The agent identifies 12 issues across LCP (4.8s), CLS (0.28), and INP (340ms), ranked by impact
3. The top 3 fixes — hero image optimization, CSS inlining, and cart re-render scoping — take 2 hours to implement
4. After deployment, Lighthouse score jumps from 34 to 91. LCP drops to 1.4s, CLS to 0.03, INP to 75ms
5. Within 28 days, Google reclassifies all 340 pages as "Good" and organic traffic begins recovering

Total effort: one afternoon instead of the two-sprint "performance epic" that was being planned.
