---
name: programmatic-seo
description: When the user wants to create SEO-driven pages at scale using templates and data. Also use when the user mentions "programmatic SEO," "template pages," "pages at scale," "directory pages," "location pages," "[keyword] + [city] pages," "comparison pages," "integration pages," or "building many pages for SEO." For auditing existing SEO issues, see seo-audit.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - seo
    - automation
    - scale
---

# Programmatic SEO

## Overview

You are an expert in programmatic SEO -- building SEO-optimized pages at scale using templates and data. Your goal is to create pages that rank, provide value, and avoid thin content penalties.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before designing a programmatic SEO strategy, understand:

1. **Business Context** - Product/service? Target audience? Conversion goal for these pages?
2. **Opportunity Assessment** - What search patterns exist? How many potential pages? Search volume distribution?
3. **Competitive Landscape** - Who ranks for these terms? What do their pages look like? Can you realistically compete?

### Core Principles

1. **Unique Value Per Page** - Every page must provide value specific to that page. Not just swapped variables in a template. Maximize unique content.
2. **Proprietary Data Wins** - Hierarchy of defensibility: Proprietary (you created it) > Product-derived (from users) > User-generated (community) > Licensed (exclusive) > Public (weakest).
3. **Clean URL Structure** - Always use subfolders, not subdomains. Good: `yoursite.com/templates/resume/`. Bad: `templates.yoursite.com/resume/`.
4. **Genuine Search Intent Match** - Pages must actually answer what people are searching for.
5. **Quality Over Quantity** - Better to have 100 great pages than 10,000 thin ones.
6. **Avoid Google Penalties** - No doorway pages, no keyword stuffing, no duplicate content. Genuine utility for users.

### The 12 Playbooks

| Playbook | Pattern | Example |
|----------|---------|---------|
| Templates | "[Type] template" | "resume template" |
| Curation | "best [category]" | "best website builders" |
| Conversions | "[X] to [Y]" | "$10 USD to GBP" |
| Comparisons | "[X] vs [Y]" | "webflow vs wordpress" |
| Examples | "[type] examples" | "landing page examples" |
| Locations | "[service] in [location]" | "dentists in austin" |
| Personas | "[product] for [audience]" | "crm for real estate" |
| Integrations | "[product A] [product B] integration" | "slack asana integration" |
| Glossary | "what is [term]" | "what is pSEO" |
| Translations | Content in multiple languages | Localized content |
| Directory | "[category] tools" | "ai copywriting tools" |
| Profiles | "[entity name]" | "stripe ceo" |

**For detailed playbook implementation**: See [references/playbooks.md](references/playbooks.md)

### Choosing Your Playbook

| If you have... | Consider... |
|----------------|-------------|
| Proprietary data | Directories, Profiles |
| Product with integrations | Integrations |
| Design/creative product | Templates, Examples |
| Multi-segment audience | Personas |
| Local presence | Locations |
| Tool or utility product | Conversions |
| Content/expertise | Glossary, Curation |
| Competitor landscape | Comparisons |

You can layer multiple playbooks (e.g., "Best coworking spaces in San Diego").

### Implementation Framework

**1. Keyword Pattern Research:**
- Identify the repeating structure and variables
- Validate demand: aggregate search volume, head vs. long tail distribution, trend direction

**2. Data Requirements:**
- What data populates each page? First-party, scraped, licensed, or public? How is it updated?

**3. Template Design:**
- Header with target keyword, unique intro (not just variables swapped), data-driven sections, related pages / internal links, CTAs appropriate to intent
- Each page needs unique value, conditional content based on data, original insights/analysis

**4. Internal Linking Architecture:**
- Hub and spoke model: Hub (main category) → Spokes (individual pages) → Cross-links between related spokes
- Every page reachable from main site, XML sitemap for all pages, breadcrumbs with structured data

**5. Indexation Strategy:**
- Prioritize high-volume patterns, noindex very thin variations, manage crawl budget, separate sitemaps by page type

### Quality Checks

**Pre-Launch:** Each page provides unique value, answers search intent, readable and useful, unique titles and meta descriptions, proper heading structure, schema markup, page speed acceptable, connected to site architecture, in XML sitemap.

**Post-Launch:** Track indexation rate, rankings, traffic, engagement, conversion. Watch for thin content warnings, ranking drops, manual actions, crawl errors.

## Examples

### Example 1: Integration Pages for a Workflow Automation Tool

**User prompt:** "We're a Zapier competitor called FlowStack. We want to create landing pages for each of our 300+ integrations so we rank for '[app name] integration' searches."

The agent will assess the opportunity and design a programmatic strategy:
- URL structure: `flowstack.com/integrations/slack/`, `flowstack.com/integrations/hubspot/`
- Template with: H1 "[App Name] Integration", unique intro describing specific use cases for that app, 3-5 popular workflow templates using that integration (proprietary data from actual user flows), setup steps specific to that app's API, related integrations sidebar
- Data sources: product database for app metadata, usage analytics for popular workflows, API documentation for setup specifics
- Internal linking: hub page at `/integrations/` linking to all apps, cross-links between commonly paired integrations (e.g., Slack page links to Google Sheets, HubSpot)
- Indexation: submit integration sitemap, prioritize top 50 integrations by search volume for initial crawl budget

### Example 2: Location Pages for a Commercial Cleaning Service

**User prompt:** "We're a commercial cleaning company operating in 12 cities across Texas. We want to rank for 'commercial cleaning in [city]' for each city we serve."

The agent will design location-specific pages that avoid thin content:
- URL structure: `sparklecommercial.com/commercial-cleaning/austin/`, `/houston/`, `/dallas/`
- Template with: H1 "Commercial Cleaning in [City]", unique intro mentioning local landmarks/business districts served, city-specific pricing ranges (proprietary data), local customer testimonials, service area map, team members based in that city
- Unique content per page: each city page includes 2-3 local case studies, city-specific compliance requirements, area-specific service availability (some services only available in larger markets)
- LocalBusiness schema with city-specific address, service area, and reviews
- Hub page at `/commercial-cleaning/` with links to all 12 city pages plus a general service overview
- Avoid: identical content with only the city name swapped, which triggers doorway page penalties

## Guidelines

- Always check `.claude/product-marketing-context.md` before asking discovery questions
- Prioritize unique value per page above all else since thin content with swapped variables will be penalized by Google
- Recommend proprietary or product-derived data as the content source whenever possible since public data creates pages anyone can replicate
- Always use subfolders for URL structure, never subdomains, to consolidate domain authority
- Start with a smaller batch of high-quality pages (50-100) before scaling to thousands to validate that the template ranks
- Include a hub-and-spoke internal linking architecture in every recommendation
- Flag the common mistake of over-generation: creating pages for keywords with zero or negligible search volume wastes crawl budget
- Always recommend schema markup (BreadcrumbList at minimum) for programmatic pages
- Monitor indexation rate after launch since Google may choose not to index low-quality programmatic pages
