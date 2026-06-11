---
title: "Get Your Site Cited by ChatGPT, Perplexity, and AI Search"
slug: get-your-site-cited-by-ai-search-engines
description: "Audit and optimize a website for Generative Engine Optimization so AI assistants discover, cite, and recommend it — fixing crawler access, citability, llms.txt, and entity signals."
skills: [generative-engine-optimization, schema-markup, seo-audit]
category: business
tags: [geo, ai-search, citability, llms-txt, seo]
---

# Get Your Site Cited by ChatGPT, Perplexity, and AI Search

## The Problem

Your customers have started asking ChatGPT and Perplexity for recommendations instead of Googling — and your competitors keep showing up in the answers while you don't.

A 12-person B2B SaaS company sells a project-management tool. Their traditional SEO is healthy: they rank on page one for several head terms and publish two well-researched guides a month. But when the founder types "best project management tool for agencies" into ChatGPT, Perplexity, and Google's AI Overview, three competitors are named and linked — and his company isn't mentioned once. Support has noticed prospects arriving with the line "I asked an AI and it suggested [competitor]." Nobody on the team can explain *why* the AI ignores them, because the usual SEO dashboards (rankings, backlinks, Core Web Vitals) all look fine. AI search is a different game with no Search Console to tell you what's wrong.

## The Solution

Run a **Generative Engine Optimization (GEO) audit** instead of a traditional SEO audit. GEO scores the signals AI engines actually use to pick which sources to cite — whether AI crawlers can even reach your pages, how "liftable" your passages are as a direct answer, whether your site has an `llms.txt`, and how strong your entity signals (Wikipedia, schema, brand mentions) are.

Use the **generative-engine-optimization** skill to produce a 0–100 GEO Score with a six-category breakdown and a ranked fix list. Then use the **schema-markup** skill to implement the JSON-LD entity signals the audit flags, and the **seo-audit** skill to keep the traditional foundations (crawlability, HTTPS, sitemap) solid underneath. The biggest wins are usually fast and free: most sites are accidentally blocking AI crawlers and have no `llms.txt`.

## Step-by-Step Walkthrough

### 1. Run the GEO audit

Tell your AI agent:

> Run a GEO audit on https://acmepm.com. We want to get cited when people ask ChatGPT and Perplexity for "best project management tool for agencies." Give me a GEO Score and a prioritized fix list.

The **generative-engine-optimization** skill fetches the raw (pre-JavaScript) HTML, checks `robots.txt`, looks for `llms.txt`, inspects schema, and scores citability. You get:

```
GEO Score: 47 / 100 (Poor — AI systems may struggle to cite this site)

AI Citability & Visibility   38/100   GPTBot blocked; no llms.txt
Brand Authority Signals      55/100   Reddit + LinkedIn present; no Wikipedia
Content Quality & E-E-A-T    62/100   Strong guides, but no author attribution
Technical Foundations        71/100   SSR ok; sitemap missing from robots.txt
Structured Data              30/100   Organization schema only; no sameAs/Person
Platform Optimization        45/100   No question-headings or direct-answer blocks
```

### 2. Unblock AI crawlers (highest ROI, ~5 minutes)

The audit flags the single most damaging issue first:

> Your `robots.txt` has `User-agent: GPTBot` → `Disallow: /`, inherited from a 2023 scraping-protection config. ChatGPT cannot read any of your pages.

Apply the fix it gives you:

```
# Allow AI search crawlers
User-agent: GPTBot
Disallow:

User-agent: OAI-SearchBot
Disallow:

User-agent: PerplexityBot
Disallow:

Sitemap: https://acmepm.com/sitemap.xml
```

### 3. Add an llms.txt

> Generate an llms.txt for acmepm.com from our top pages.

The skill crawls the site and writes a root-level `llms.txt`:

```markdown
# Acme PM

> Project management software for creative and marketing agencies — task boards, time tracking, and client billing in one tool.

## Docs
- [Pricing](https://acmepm.com/pricing): Plans, per-seat pricing, and the free tier.
- [Agency Guide](https://acmepm.com/guides/agency-pm): How agencies run client work in Acme PM.
- [vs Competitors](https://acmepm.com/compare): Feature comparison against the main alternatives.

## Optional
- [Blog](https://acmepm.com/blog): Articles on agency operations and project workflows.
```

### 4. Rewrite key passages to be citable

The audit shows the "What is agency project management?" intro is 90 words, pronoun-heavy, and buries the answer. Ask:

> Rewrite that intro as a self-contained answer block following GEO citability rules.

You get a ~150-word passage that opens with a definition ("Agency project management is…"), answers in the first sentence, and includes two concrete stats with attribution — the exact shape AI engines lift into an answer.

### 5. Implement the entity signals

Hand the schema gaps to the **schema-markup** skill:

> Add Organization schema with sameAs links to our LinkedIn, G2, Crunchbase, and YouTube, and Person schema for each guide author.

This raises the Structured Data sub-score and gives AI models the entity links they use to associate "Acme PM" with the agency-PM topic.

### 6. Re-audit and track the delta

After deploying, re-run the audit. The GEO Score moves from 47 to the mid-70s — crawlers unblocked, `llms.txt` live, citable passages and schema in place. Re-run it monthly: AI search platforms change their sourcing behavior, and new competitor content shifts the landscape.

## Real-World Example

An agency-focused SaaS discovers via the audit that GPTBot has been blocked since 2023 and they have no `llms.txt`. They unblock the crawler, ship an `llms.txt` listing their pricing/comparison/guide pages, rewrite the intros of their five highest-traffic guides into self-contained answer blocks, and add Organization + Person schema with `sameAs` links. Their GEO Score goes from **47 to 78**. Six weeks later, the founder's test prompt — "best project management tool for agencies" — returns an answer in both Perplexity and ChatGPT that now names and links their product, and support starts logging inbound prospects who say an AI assistant recommended them.

## Related Skills

- **[generative-engine-optimization](/skills/generative-engine-optimization)** — The core GEO audit: citability scoring, AI crawler access, llms.txt, and platform optimization.
- **[schema-markup](/skills/schema-markup)** — Implement the Organization, Person, and Article JSON-LD the GEO audit recommends for entity recognition.
- **[seo-audit](/skills/seo-audit)** — Keep the traditional SEO foundations (crawlability, indexation, Core Web Vitals) solid beneath your GEO work.
- **[content-strategy](/skills/content-strategy)** — Plan the topic and authority coverage that earns AI citations over time.
