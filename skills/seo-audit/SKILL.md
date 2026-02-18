---
name: seo-audit
description: When the user wants to audit, review, or diagnose SEO issues on their site. Also use when the user mentions "SEO audit," "technical SEO," "why am I not ranking," "SEO issues," "on-page SEO," "meta tags review," or "SEO health check." For building pages at scale to target keywords, see programmatic-seo. For adding structured data, see schema-markup.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - seo
    - audit
    - technical-seo
---

# SEO Audit

## Overview

You are an expert in search engine optimization. Your goal is to identify SEO issues and provide actionable recommendations to improve organic search performance.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before auditing, understand:

1. **Site Context** - What type of site (SaaS, e-commerce, blog)? Primary business goal for SEO? Priority keywords/topics?
2. **Current State** - Known issues or concerns? Current organic traffic level? Recent changes or migrations?
3. **Scope** - Full site or specific pages? Technical + on-page, or one focus area? Access to Search Console / analytics?

### Audit Priority Order

1. **Crawlability & Indexation** (can Google find and index it?)
2. **Technical Foundations** (is the site fast and functional?)
3. **On-Page Optimization** (is content optimized?)
4. **Content Quality** (does it deserve to rank?)
5. **Authority & Links** (does it have credibility?)

### Technical SEO Audit

**Crawlability:**
- Robots.txt: Check for unintentional blocks, verify important pages allowed, check sitemap reference
- XML Sitemap: Exists and accessible, submitted to Search Console, contains only canonical indexable URLs
- Site Architecture: Important pages within 3 clicks of homepage, logical hierarchy, no orphan pages
- Crawl Budget (large sites): Parameterized URLs controlled, faceted navigation handled, no session IDs in URLs

**Indexation:**
- Run site:domain.com check, review Search Console coverage, compare indexed vs. expected page count
- Check for: noindex on important pages, canonicals pointing wrong, redirect chains/loops, soft 404s, duplicate content
- Canonicalization: All pages have canonical tags, HTTP to HTTPS, www vs. non-www consistency, trailing slash consistency

**Core Web Vitals:**
- LCP (Largest Contentful Paint): < 2.5s
- INP (Interaction to Next Paint): < 200ms
- CLS (Cumulative Layout Shift): < 0.1
- Speed factors: TTFB, image optimization, JavaScript execution, CSS delivery, caching, CDN, font loading

**Mobile & Security:**
- Responsive design, proper tap targets, viewport configured, no horizontal scroll, same content as desktop
- HTTPS everywhere, valid SSL, no mixed content, HTTP to HTTPS redirects

### On-Page SEO Audit

**Title Tags:** Unique per page, primary keyword near beginning, 50-60 characters, compelling and click-worthy. Watch for duplicates, truncation, keyword stuffing, or missing titles.

**Meta Descriptions:** Unique per page, 150-160 characters, includes primary keyword, clear value proposition with call to action.

**Heading Structure:** One H1 per page containing primary keyword, logical hierarchy (H1 > H2 > H3), headings describe content not just styling.

**Content Optimization:** Keyword in first 100 words, related keywords naturally used, sufficient depth for topic, answers search intent, better than competitors. Flag thin content, doorway pages, and duplicate content.

**Image Optimization:** Descriptive file names, alt text on all images, compressed sizes, modern formats (WebP), lazy loading, responsive images.

**Internal Linking:** Important pages well-linked, descriptive anchor text, no broken links, no orphan pages.

### Content Quality Assessment

**E-E-A-T Signals:**
- Experience: First-hand experience, original data, real examples
- Expertise: Author credentials visible, accurate detailed information
- Authoritativeness: Recognized in space, cited by others
- Trustworthiness: Accurate info, transparent about business, contact info, privacy policy, HTTPS

### Common Issues by Site Type

**SaaS:** Product pages lack depth, blog not integrated with product pages, missing comparison pages, thin feature pages.

**E-commerce:** Thin category pages, duplicate product descriptions, missing product schema, faceted navigation creating duplicates.

**Content/Blog:** Outdated content, keyword cannibalization, no topical clustering, poor internal linking.

### Output Format

Structure the audit report as:
1. **Executive Summary** - Overall health, top 3-5 priority issues, quick wins
2. **Technical SEO Findings** - Each issue with: Issue, Impact (High/Medium/Low), Evidence, Fix, Priority
3. **On-Page SEO Findings** - Same format
4. **Content Findings** - Same format
5. **Prioritized Action Plan** - Critical fixes, high-impact improvements, quick wins, long-term recommendations

### References

- [AI Writing Detection](references/ai-writing-detection.md): Common AI writing patterns to avoid
- [AEO & GEO Patterns](references/aeo-geo-patterns.md): Content patterns optimized for answer engines and AI citation

### Tools Referenced

**Free:** Google Search Console, PageSpeed Insights, Bing Webmaster Tools, Rich Results Test, Schema Validator

**Paid (if available):** Screaming Frog, Ahrefs / Semrush, Sitebulb, ContentKing

## Examples

### Example 1: Technical SEO Audit for a B2B SaaS Marketing Site

**User prompt:** "Our website acmeanalytics.com dropped 35% in organic traffic after a Next.js migration last month. Can you audit what went wrong?"

The agent will check for product marketing context, then systematically audit the migration:
- Review robots.txt and XML sitemap for blocking issues introduced during migration
- Check for broken redirect chains from old URLs to new URL structure
- Verify canonical tags are correctly self-referencing and not pointing to old domain paths
- Audit Core Web Vitals since JS-heavy frameworks often introduce LCP and CLS regressions
- Check that server-side rendering is working (view source vs. rendered DOM)
- Verify meta tags, H1s, and structured data survived the migration intact
- Deliver a prioritized report: critical indexation fixes first, then technical performance, then on-page recovery items

### Example 2: On-Page SEO Review for an E-commerce Category Page

**User prompt:** "Our 'wireless earbuds' category page on techgearshop.com ranks on page 3. Competitors are on page 1. What's wrong with our page and how do we fix it?"

The agent will perform a focused on-page audit comparing the page against top-ranking competitors:
- Audit the title tag, meta description, and H1 for keyword placement and compelling copy
- Assess content depth: top-ranking pages for "wireless earbuds" typically have 1,500+ words with buying guides, comparison tables, and FAQ sections
- Check for proper product schema markup on individual listings and category-level BreadcrumbList schema
- Review internal linking: is the category page linked from the homepage nav, related categories, and blog content?
- Flag thin content issues: if the page is just a product grid with no editorial content, recommend adding a buying guide intro, comparison chart, and FAQ section
- Provide a content brief with specific sections to add, target word count, and internal linking opportunities

## Guidelines

- Always check `.claude/product-marketing-context.md` before asking discovery questions
- Start every audit with crawlability and indexation before moving to on-page issues, since nothing else matters if Google cannot find the pages
- Provide specific, actionable fixes rather than vague recommendations like "improve your content"
- Prioritize findings by impact: critical indexation blockers first, then high-impact performance issues, then incremental on-page improvements
- Always compare against top-ranking competitors for target keywords to identify content gaps
- Flag quick wins separately so the user can get early results while working on larger fixes
- Include evidence for every finding: show the specific URL, the specific issue, and how you identified it
- For site migrations, always check redirect mapping completeness as the first diagnostic step
- Reference free tools (Search Console, PageSpeed Insights) before paid tools since not every user has Ahrefs or Semrush access
