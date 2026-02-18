---
title: "Migrate from Client-Side Rendering to SSR/SSG for SEO and Performance"
slug: migrate-csr-to-ssr-ssg
description: "Transform a client-side React app into a high-performance, SEO-optimized site using Server-Side Rendering and Static Site Generation to improve Core Web Vitals and search rankings."
skills: [ssr-migration, frontend-design, docker-helper]
category: development
tags: [ssr, ssg, seo, performance, react, nextjs, web-vitals, migration]
---

# Migrate from Client-Side Rendering to SSR/SSG for SEO and Performance

## The Problem

Elena, front-end lead at a 55-person B2B SaaS company, watches their marketing site's Google Search Console rankings plummet month after month. Their React SPA loads with a blank white screen for 4.2 seconds while JavaScript bundles download and parse. Google's PageSpeed Insights shows a Performance score of 31/100, with First Contentful Paint at 4.8 seconds and Largest Contentful Paint at 7.1 seconds — both failing Core Web Vitals thresholds.

The SEO damage is brutal: their main product pages rank on page 3-4 of Google search results despite having superior content to competitors. Organic traffic dropped 67% over 18 months as Google's algorithm increasingly penalizes slow sites. Their $120K/year SEO consultant's report is damning: "Site architecture prevents proper crawling and indexing. JavaScript-dependent content invisible to search bots. Recommend complete technical overhaul."

The business impact is measurable: conversion rates on marketing pages dropped from 8.2% to 3.1% as bounce rates hit 73% (users leave before content loads). Mobile performance is even worse — 11.3 seconds to interactive on 3G networks, where 67% of their traffic originates. The sales team reports that prospects frequently mention "your website feels slow" during demos. Recent analysis shows each 1-second improvement in load time correlates with 12% higher conversion rates in their industry.

## The Solution

Migrate from client-side rendering to a hybrid SSR/SSG architecture using **ssr-migration** for React-to-Next.js conversion, **frontend-design** for performance optimization, and **docker-helper** for deployment infrastructure. The approach: analyze current performance bottlenecks, implement SSG for static content and SSR for dynamic pages, optimize Core Web Vitals, and measure SEO improvements.

```bash
npx terminal-skills install ssr-migration frontend-design docker-helper
```

## Step-by-Step Walkthrough

### 1. Analyze current performance and identify migration strategy

```text
Audit our React SPA's performance and SEO issues. The app has 47 pages: 12 marketing pages (static content), 18 product feature pages (semi-static), 8 blog pages (static), 6 customer case studies (static), and 3 dynamic pricing/demo request pages. Analyze Core Web Vitals, SEO crawlability, and determine the best SSR/SSG strategy for each page type.
```

```text
🔍 PERFORMANCE & SEO AUDIT RESULTS...

CURRENT PERFORMANCE METRICS (PageSpeed Insights):
Mobile Performance Score: 31/100 (Poor)
├── First Contentful Paint: 4.8s (target: <1.8s)
├── Largest Contentful Paint: 7.1s (target: <2.5s) ❌ Fails Core Web Vitals
├── First Input Delay: 340ms (target: <100ms) ❌ Fails Core Web Vitals  
├── Cumulative Layout Shift: 0.23 (target: <0.1) ❌ Fails Core Web Vitals
└── Time to Interactive: 11.3s on slow 3G

Desktop Performance Score: 43/100 (Poor)
├── First Contentful Paint: 2.1s
├── Largest Contentful Paint: 3.4s ❌ Still fails
└── JavaScript bundle size: 847KB (target: <200KB)

SEO CRAWLABILITY ANALYSIS:
├── Google Search Console: 23% of pages successfully indexed
├── Meta descriptions: Missing on 89% of pages (generated client-side)
├── Open Graph tags: Not present (prevents social media sharing)
├── Schema markup: None (missing rich snippets opportunity)
├── Internal linking: Poor (SPA routing confuses crawlers)
└── Page load abandonment: 73% bounce rate (industry avg: 38%)

BUSINESS IMPACT METRICS:
├── Organic search traffic: Down 67% over 18 months
├── Conversion rate: 8.2% → 3.1% (marketing pages)
├── Average session duration: Down 34% (users leave during loading)
├── Mobile traffic: 67% of visitors, worst performance segment
└── Competitor gap: Rivals load 5.2x faster, rank 2 pages higher

MIGRATION STRATEGY RECOMMENDATIONS:
Static pages (SSG): 38 pages
├── Marketing pages (12): Full static generation, rebuild on content changes
├── Product features (18): ISR with 24-hour revalidation  
├── Blog posts (8): SSG with build-time generation
└── Case studies (6): SSG with automatic image optimization

Dynamic pages (SSR): 9 pages  
├── Pricing calculator (3): SSR with edge caching
├── Demo request forms (3): SSR with form validation
└── User dashboard (3): SSR with authentication

PROJECTED IMPROVEMENTS:
├── Performance Score: 31/100 → 95+/100
├── First Contentful Paint: 4.8s → 0.9s (81% faster)
├── Core Web Vitals: All metrics pass threshold
├── SEO indexing: 23% → 95%+ pages indexed
└── Conversion rate: 3.1% → projected 7.8% (based on performance studies)
```

### 2. Migrate to Next.js with SSG for static content

```text
Convert our React SPA to Next.js with static site generation for all marketing, product, and blog pages. Optimize images, implement proper meta tags and schema markup, and ensure all static content pre-renders at build time. Include automatic sitemap generation and proper URL structure for SEO.
```

```text
🚀 NEXT.JS SSG MIGRATION IN PROGRESS...

Project structure transformation:
src/
├── pages/
│   ├── index.tsx (SSG: Homepage with hero, features, testimonials)
│   ├── products/[slug].tsx (SSG: 18 product pages with ISR)
│   ├── blog/[slug].tsx (SSG: Blog with automatic sitemap)
│   ├── case-studies/[slug].tsx (SSG: Customer stories)
│   └── pricing.tsx (SSR: Dynamic calculator)
├── components/ (Shared components, optimized for SSR)
├── lib/ (Data fetching, CMS integration)
└── public/ (Optimized static assets)

STATIC SITE GENERATION IMPLEMENTATION:
Marketing pages (getStaticProps):
- Pre-render at build time with CMS data
- Automatic image optimization (WebP/AVIF generation)
- Critical CSS inlining for above-the-fold content
- JSON-LD schema markup for rich snippets

Product pages (getStaticProps + ISR):
- Incremental Static Regeneration every 24 hours
- Automatic revalidation on content changes (webhook trigger)
- On-demand revalidation for urgent updates

Blog system (getStaticPaths):  
- Generate all blog posts at build time
- Automatic sitemap.xml generation
- RSS feed generation for content marketing
- Related posts using content similarity

SEO OPTIMIZATION FEATURES:
✅ Dynamic meta tags: Title, description, keywords per page
✅ Open Graph tags: Proper social media sharing cards
✅ Twitter Card optimization: Summary with large image
✅ Canonical URLs: Prevent duplicate content issues  
✅ Structured data: Organization, Product, Article schemas
✅ XML sitemap: Auto-generated, includes lastmod dates

IMAGE OPTIMIZATION:
- Next.js Image component: Automatic WebP/AVIF conversion
- Responsive images: Multiple sizes for different viewport
- Lazy loading: Images load as user scrolls  
- Placeholder blur: Smooth loading experience
- CDN integration: CloudFront for global image delivery

PERFORMANCE OPTIMIZATIONS:
✅ Code splitting: Automatic per-page JavaScript bundles
✅ Tree shaking: Remove unused code (847KB → 156KB bundle)
✅ Prefetching: Intelligent link prefetching on hover
✅ Critical CSS: Inline above-the-fold styles
✅ Font optimization: Preload Google Fonts with font-display: swap
```

### 3. Implement SSR for dynamic pages and optimize Core Web Vitals

```text
Set up server-side rendering for dynamic pages like pricing calculator and demo forms. Implement advanced performance optimizations to pass all Core Web Vitals metrics: optimize LCP, reduce CLS, minimize FID. Include edge caching and progressive enhancement.
```

```text
⚡ SSR IMPLEMENTATION & CORE WEB VITALS OPTIMIZATION...

Server-Side Rendering setup:
Dynamic pages (getServerSideProps):
├── Pricing calculator: Real-time plan data, cached for 5 minutes
├── Demo request forms: Form validation, A/B testing variants  
├── User dashboard: Authentication, personalized content
└── Search results: Query-based content, filtered by user permissions

CORE WEB VITALS OPTIMIZATION:

Largest Contentful Paint (LCP): 7.1s → 1.2s
├── Hero image optimization: 2.1MB → 387KB (WebP + lazy loading)
├── Critical CSS inlining: Above-the-fold styles in <head>
├── Font preloading: Google Fonts loaded before layout
├── Server-side rendering: HTML content visible immediately
└── Resource hints: dns-prefetch, preconnect for external resources

First Input Delay (FID): 340ms → 45ms  
├── JavaScript bundle reduction: 847KB → 156KB total
├── Code splitting: Load only necessary code per page
├── Third-party script optimization: Defer non-critical scripts
├── Web Worker usage: Heavy calculations moved off main thread
└── Event listener optimization: Passive listeners where possible

Cumulative Layout Shift (CLS): 0.23 → 0.02
├── Image dimensions: Explicit width/height prevents layout jumps
├── Font loading strategy: font-display: swap prevents FOIT
├── Ad container reserving: Fixed spaces for dynamic content
├── CSS Grid/Flexbox: Stable layouts that don't shift
└── Animation optimization: Transform/opacity only (no layout triggers)

EDGE CACHING STRATEGY:
- Vercel Edge Network: Global CDN with 30+ regions
- Static pages: Cached indefinitely with revalidation
- Dynamic pages: 5-minute edge caching with stale-while-revalidate
- API routes: Intelligent caching based on data freshness
- Image optimization: Cached WebP/AVIF versions at edge

PROGRESSIVE ENHANCEMENT:
✅ Works without JavaScript: Core content accessible
✅ JavaScript hydration: Progressive enhancement after page load
✅ Offline support: Service worker for critical pages
✅ Loading states: Skeleton screens and progress indicators
✅ Error boundaries: Graceful fallbacks for component failures

PERFORMANCE MONITORING:
- Real User Monitoring: Core Web Vitals for actual users
- Performance budget: Alerts for bundle size increases
- Lighthouse CI: Automated performance regression testing
- Search Console: Core Web Vitals field data tracking
```

### 4. Deploy with Docker and measure SEO improvements

```text
Set up production deployment with Docker containers, implement proper caching headers, and measure SEO performance improvements. Include A/B testing setup to measure conversion rate improvements and track search ranking changes over time.
```

```text
🐳 PRODUCTION DEPLOYMENT & SEO MEASUREMENT...

Docker deployment setup (docker-compose.production.yml):
services:
  nextjs-app:
    image: node:18-alpine
    build: 
      context: .
      dockerfile: Dockerfile.production
    environment:
      - NODE_ENV=production
      - NEXT_TELEMETRY_DISABLED=1
    ports: ["3000:3000"]
    
  nginx-proxy:
    image: nginx:alpine
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf"]
    ports: ["80:80", "443:443"]
    # SSL termination, gzip compression, caching headers

  redis-cache:
    image: redis:7-alpine
    # ISR cache storage and session management

PRODUCTION OPTIMIZATIONS:
HTTP caching headers:
├── Static assets: Cache-Control: public, max-age=31536000, immutable
├── HTML pages: Cache-Control: public, max-age=0, s-maxage=86400
├── API routes: Varies by endpoint, typically max-age=300
└── Images: Cache-Control: public, max-age=31536000 with versioning

CDN configuration:
├── CloudFront distribution with 25+ global edge locations
├── Gzip/Brotli compression: 73% average file size reduction
├── HTTP/2 support: Multiplexed requests, server push
└── SSL/TLS optimization: TLS 1.3, OCSP stapling

SEO PERFORMANCE TRACKING:

BEFORE → AFTER METRICS (90 days post-migration):

Core Web Vitals improvements:
├── Largest Contentful Paint: 7.1s → 1.2s (83% faster) ✅
├── First Input Delay: 340ms → 45ms (87% faster) ✅
├── Cumulative Layout Shift: 0.23 → 0.02 (91% better) ✅
├── Performance Score: 31/100 → 96/100 (209% improvement)
└── Core Web Vitals assessment: FAIL → PASS (all metrics)

SEO ranking improvements:
├── Pages indexed: 23% → 91% (297% increase)
├── Average search position: Page 3.4 → Page 1.8 (94% improvement)  
├── Organic click-through rate: 2.1% → 6.8% (224% increase)
├── Featured snippets: 0 → 7 (new rich results from schema markup)
└── Page experience score: 34/100 → 89/100 (162% improvement)

Business impact metrics:
├── Organic search traffic: +156% (recovering from 67% loss)
├── Bounce rate: 73% → 34% (53% improvement)
├── Conversion rate: 3.1% → 7.9% (155% improvement)
├── Average session duration: +89% (users stay to explore)
├── Mobile conversion rate: 1.8% → 6.2% (244% improvement)
└── Revenue from organic: +$47,000/month attributable to SEO improvements

A/B TESTING RESULTS (30-day test):
Control (old CSR): 3.1% conversion
Treatment (new SSR/SSG): 7.9% conversion  
Statistical significance: 99.7% confidence
Estimated annual revenue impact: +$340,000

COMPETITIVE ANALYSIS:
- Site speed vs Competitor A: Now 23% faster (was 67% slower)
- Search rankings: Overtook 2 main competitors for primary keywords
- Lighthouse score: Industry-leading 96/100 (competitor average: 67/100)
- Core Web Vitals: Only site in space passing all three metrics
```

## Real-World Example

A B2B marketing automation platform was losing potential customers before they could even see the product. Their React SPA marketing site took 8.3 seconds to show content on mobile, causing a 78% bounce rate and devastating their inbound lead generation. Despite spending $85K annually on content marketing and SEO, organic traffic was declining 12% quarter-over-quarter as Google increasingly penalized their slow loading times.

The crisis point: their biggest competitor launched a faster website and jumped 2 positions higher in search rankings for their primary keywords, stealing an estimated $180K in annual contract value. The CEO mandated a complete site overhaul after seeing PageSpeed Insights score their homepage 28/100.

**Migration timeline using ssr-migration and frontend-design skills:**

**Weeks 1-2: Analysis and planning**
- Performance audit revealed 847KB JavaScript bundle, 4.8s FCP
- SEO analysis showed only 31% of pages properly indexed by Google
- Identified 38 pages suitable for SSG, 9 requiring SSR

**Weeks 3-4: Next.js migration**  
- Converted React components to Next.js pages with getStaticProps
- Implemented automatic image optimization and responsive images
- Added proper meta tags and schema markup to all pages

**Weeks 5-6: Performance optimization**
- Optimized Core Web Vitals: All three metrics now pass
- Reduced JavaScript bundle size by 82% through code splitting
- Implemented ISR for content that changes infrequently

**Results after 120 days:**
- **PageSpeed Insights score**: 28/100 → 94/100 (236% improvement)
- **Core Web Vitals**: All metrics pass (was failing all three)
- **Organic search traffic**: +203% increase over pre-migration baseline
- **Search ranking**: Average position 3.7 → 1.4 for target keywords
- **Bounce rate**: 78% → 29% (62% improvement)
- **Mobile conversion rate**: 1.9% → 8.3% (337% improvement)
- **Lead generation**: +$67K monthly recurring revenue from organic traffic

**Unexpected benefits:**
- **Sales team feedback**: Prospects frequently compliment site speed during demos
- **Competitive advantage**: Fastest site in their industry vertical
- **Developer experience**: 67% faster local development builds
- **Operational costs**: 45% reduction in hosting costs due to static generation
- **Customer trust**: Significantly improved brand perception due to professional site performance

The migration not only recovered the lost SEO ground but established them as the performance leader in their space. Six months later, they acquired two smaller competitors who cited the superior web experience as a factor in choosing their platform for acquisition.
