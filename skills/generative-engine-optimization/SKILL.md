---
name: generative-engine-optimization
description: >-
  Optimize a website to be discovered, cited, and recommended by AI search engines
  — ChatGPT, Claude, Perplexity, Google AI Overviews, and Gemini. Use this for
  Generative Engine Optimization (GEO / AEO / "AI SEO"): scoring content citability,
  checking AI crawler access in robots.txt (OAI-SearchBot, PerplexityBot, Claude-SearchBot,
  GPTBot), auditing or generating an llms.txt file, validating schema for
  entity recognition, assessing brand authority signals, and producing a GEO audit
  report. Trigger on "GEO," "AI search optimization," "get cited by ChatGPT/Perplexity,"
  "llms.txt," "AI crawlers," "AI Overviews," "citability." This is about generative AI
  search visibility, NOT geographic/geolocation. For traditional keyword ranking see
  seo-audit; for structured data see schema-markup.
license: Apache-2.0
compatibility: "Any website (URL). Optional: Python 3.8+ for fetching/scoring scripts."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags:
    - geo
    - ai-search
    - seo
    - llms-txt
    - citability
---

# Generative Engine Optimization (GEO)

## Overview

Generative Engine Optimization (GEO) makes a website visible inside AI-generated answers.
AI assistants (ChatGPT, Claude, Perplexity, Google AI Overviews, Gemini) increasingly answer
questions directly instead of sending users to ten blue links, and they cite a small set of
sources. GEO is the practice of becoming one of those cited sources.

GEO is distinct from traditional SEO. Keyword rankings, backlinks, and Core Web Vitals
still matter as a foundation, but AI engines additionally reward content that is
*self-contained, fact-dense, and directly answers a question*, that is *crawlable by AI
bots*, and that is backed by *recognizable entity signals* (Wikipedia, schema, brand
mentions). AI citations overlap only partly with Google rankings, so AI visibility is its
own discipline.

This skill is adapted from the open-source [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude)
project by zubair-trabzada (MIT License, Copyright (c) 2026 Zubair Trabzada). For traditional ranking audits use the **seo-audit** skill;
for implementing JSON-LD use the **schema-markup** skill — this skill tells you *which*
schema and crawler signals matter for AI citation.

## Instructions

### 1. Scope the audit

Ask for (or infer): the target URL, the business type (SaaS, e-commerce, local business,
publisher, agency), and which AI platforms matter most. Then fetch the page's **raw,
server-rendered HTML** (e.g. `curl -sL <url>` or a fetch script). This is critical: most
AI crawlers do **not** execute JavaScript (a Vercel/MERJ study from Dec 2024 found that OpenAI's and Anthropic's crawlers fetch JS files but do not run them, and PerplexityBot does not render JS either; Googlebot does), so evaluate the HTML that
arrives *before* JS runs. If the `<body>` is empty without JS, that is a critical finding —
no content optimization can help a page AI crawlers see as blank.

### 2. Compute the GEO Score (0–100)

Score six categories, then combine with these weights:

| Category | Weight | What it measures |
|---|---|---|
| AI Citability & Visibility | 25% | Can passages be lifted as a cited answer; are AI crawlers allowed; is llms.txt present |
| Brand Authority Signals | 20% | Wikipedia, Reddit, YouTube, review-site and LinkedIn presence |
| Content Quality & E-E-A-T | 20% | Experience, Expertise, Authoritativeness, Trust |
| Technical Foundations | 15% | Server-side rendering, robots/sitemap, HTTPS, meta tags |
| Structured Data | 10% | Organization/Person/Article schema, sameAs, JSON-LD |
| Platform Optimization | 10% | Readiness for each specific AI platform |

`GEO = .25·Citability + .20·Brand + .20·EEAT + .15·Technical + .10·Schema + .10·Platform`

Interpretation: **90–100** Excellent (highly likely to be cited) · **75–89** Good ·
**60–74** Fair · **40–59** Poor · **0–39** Critical (largely invisible to AI).
The weights and bands are this skill's rubric, not an industry standard.

### 3. Score AI Citability (the highest-weight category)

For each content block (a section under a heading), score five dimensions out of 100:

- **Answer Block Quality (30)** — Does it open with a definition pattern ("X is a…",
  "X refers to…")? Does the answer appear in the first ~60 words? Question-style heading?
  Short clear sentences (5–25 words)? Attributed claims ("research shows…")?
- **Self-Containment (25)** — Target roughly **100–200 words** per passage. Low pronoun
  density (<2%) and 3+ proper nouns mean the block stands alone without surrounding context.
  The rubric's exact full-point band is a heuristic, not a published optimum.
- **Structural Readability (20)** — Average sentence length 10–20 words; lists, numbered
  steps, and paragraph breaks the model can lift cleanly.
- **Statistical Density (15)** — Percentages, dollar amounts, numbers with units, years,
  and named sources. Fact-rich passages get cited; vague ones don't.
- **Uniqueness Signals (10)** — Original research ("our study found…"), case studies,
  specific named tools/products.

The page citability score is the average of its top five blocks. Then rewrite the weakest
high-value passages to hit the patterns above.

### 4. Check AI crawler access (robots.txt)

A blocked crawler is invisible in that engine regardless of content quality. Fetch
`<domain>/robots.txt` and build an access map. Crawlers fall into three purposes, and the
purpose decides whether blocking hurts visibility:

**Tier 1 — recommend ALLOW** (these power AI search or answers a user asks for):
`OAI-SearchBot` (ChatGPT Search), `Claude-SearchBot` and `Claude-User` (Claude),
`PerplexityBot` and `Perplexity-User` (Perplexity), `Googlebot` (powers AI Overviews indexing).

**Tier 2 — strategic, training-only** (blocking has no effect on search visibility):
`GPTBot` (OpenAI training), `ClaudeBot` (Anthropic training), `Google-Extended` (Gemini
training and grounding; blocking it does **not** affect Google Search rank), `CCBot`
(Common Crawl), `anthropic-ai` (legacy token, no longer listed on Anthropic's crawler page), `Bytespider`, `Applebot-Extended`.

`ChatGPT-User`, `Claude-User` and `Perplexity-User` are fetches a user triggers. OpenAI says
robots.txt rules may not apply to `ChatGPT-User`, and Perplexity says `Perplexity-User`
generally ignores them; Anthropic says `Claude-User` can be controlled through robots.txt.

Scoring: start at 100; −15 per Tier-1 crawler blocked, −5 per Tier-2 crawler blocked (a
deliberate training opt-out is a valid choice, so this penalty is advisory), −10 if robots.txt
has no `Sitemap:` line.

### 5. Audit or generate llms.txt

`llms.txt` is a proposed standard: a single Markdown file at `<domain>/llms.txt` that tells
AI systems what your site is and which pages matter. Google's AI optimization guide says llms.txt is not needed for Google Search and does not
affect visibility or rankings, so treat it as an optional, low-cost addition. Format:

```markdown
# FieldLedger

> One-sentence factual description of what the business does and who it serves (<200 chars).

## Docs
- [Page Title](https://fieldledger.io/pricing): Concise description of what this page covers.

## Optional
- [Secondary Page](https://fieldledger.io/guides/product-analytics): Description.
```

Rubric scores (this skill's convention): 0 absent · 30 present but malformed · 50 valid but
minimal · 70 covers primary content · 90–100 comprehensive with a companion `/llms-full.txt`.
Generate one by crawling the site and listing its highest-value pages with honest,
fact-first descriptions.

### 6. Validate entity & schema signals

AI models link content to *entities*. Reward, in server-rendered JSON-LD:
`Organization`/`LocalBusiness` with `sameAs` to 3+ (ideally 5+) platforms including
Wikipedia; `Person` schema for authors with `sameAs`, `jobTitle`, `knowsAbout`;
`Article` with `dateModified`; `WebSite`+`SearchAction`; `BreadcrumbList`. Flag schema
injected by JavaScript (crawlers miss it) and deprecated types: `HowTo` (rich result
no longer shown since Sep 2023) and `FAQPage` (restricted to government and health sites from
Aug 2023, and no longer shown in Google Search at all since May 7, 2026).

### 7. Assess brand authority & platform readiness

**Brand signals** (what AI models draw on for entity knowledge): Wikipedia, industry and
review sites (G2, Trustpilot, Capterra), Reddit discussion, YouTube, LinkedIn. An Ahrefs study
of 75k brands (December 2025) found YouTube mentions had the strongest correlation with AI
visibility, about 0.74 (Spearman), and branded web mentions were also strong. These are
correlations, not causes. **Platform tactics:** Google AI Overviews reward question headings,
direct-answer paragraphs and comparison tables. Platform-specific weighting is not documented
by the platforms, so present platform notes as hypotheses.

### 8. Deliver a report

Produce a prioritized report: GEO Score with the six-category breakdown, a ranked
fix list (highest impact first — usually unblock crawlers, then rewrite the top citable
passages and add schema; llms.txt is optional), and platform-specific notes. Keep
recommendations concrete and copy-pasteable (the exact robots.txt lines and the JSON-LD).

## Examples

### Example 1: Full GEO audit of a SaaS marketing site

> Run a GEO audit on https://fieldledger.io — we want to show up when people ask ChatGPT
> and Perplexity for "best product analytics tools."

1. Fetch raw HTML: `curl -sL https://fieldledger.io`. The homepage `<body>` renders
   server-side ✅, but the `/compare` and `/guides/*` pages are a client-only React SPA
   (empty `<body>` without JS) — **critical**: those guide pages are invisible to AI crawlers.
2. `robots.txt` contains `User-agent: OAI-SearchBot` / `Disallow: /` (inherited from a 2023
   scraping-protection config) — **−15**, FieldLedger is excluded from ChatGPT Search.
3. No `llms.txt` (optional, so no penalty). Schema: `Organization` exists but `sameAs` has
   only Twitter and GitHub — no Wikipedia, no `Person` schema on the guides.
4. Citability: the homepage hero is marketing fluff (pronoun-heavy, no stats); the best
   block is a 90-word definition that is close but under the 100-word target.

**GEO Score: 41/100 (Poor).** Top fixes, in order:
- Remove `Disallow: /` for OAI-SearchBot; allow OAI-SearchBot, Claude-SearchBot, PerplexityBot. *(+~12)*
- Server-render the `/guides/*` pages (or pre-render to static HTML). *(+~10 technical)*
- Rewrite the "What is product analytics?" guide intro as a self-contained 150-word answer
  with two stats and an attributed claim; add `Article`+`Person` schema with author `sameAs`.
- Optionally add `/llms.txt` listing the pricing, comparison, and top-5 guide pages.

### Example 2: AI crawler access check

> Are AI search engines allowed to crawl https://devnotes-blog.io?

Fetch `https://devnotes-blog.io/robots.txt`:

```
User-agent: *
Disallow: /admin/

User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /
```

**Access map:**

| Crawler | Purpose | Status | Verdict |
|---|---|---|---|
| OAI-SearchBot | ChatGPT Search | ✅ Allowed (via `*`) | OK |
| GPTBot | OpenAI training | ❌ Blocked | Deliberate training opt-out; no search effect |
| ClaudeBot | Anthropic training | ✅ Allowed | OK |
| PerplexityBot | Perplexity search | ✅ Allowed | OK |
| CCBot | Common Crawl (training) | ❌ Blocked | Optional — no search impact |

**Crawler Access Score: 80/100** (−5 GPTBot and −5 CCBot, both Tier-2 training crawlers; −10 no `Sitemap:` line).
Keep the GPTBot block if the team wants to opt out of training. If it wants ChatGPT to cite the
site, the search bot (OAI-SearchBot) is already allowed. Add a sitemap line so crawlers find
all pages:

```
Sitemap: https://devnotes-blog.io/sitemap.xml
```

## Guidelines

- **Always audit the pre-JavaScript HTML.** Server-side rendering is the single biggest
  technical lever — a client-only SPA is invisible to AI crawlers no matter how good the copy is.
- **Unblocking search crawlers is the highest-ROI fix** and usually free. A `Disallow: /` for
  OAI-SearchBot removes a site from ChatGPT Search; GPTBot only controls training.
- **Write for extraction, not just reading.** Lead with the answer, keep citable passages
  self-contained, and pack in real numbers, dates, and named sources.
- **Entity signals compound.** A Wikipedia page + complete `sameAs` schema + Reddit/YouTube
  presence do more for AI citation than another backlink. Recommend the entity work, not just on-page tweaks.
- **`Google-Extended` ≠ Google Search.** Blocking it only affects Gemini/AI-Overviews
  training and grounding, never standard rankings — correct this common misconception when you see it.
- **Be honest about what's deterministic.** Crawler access, llms.txt validity, and schema
  presence are objective. Citability, E-E-A-T, brand, and platform scores are guided
  judgments — two audits may differ by a few points. Present them as diagnostic, not exact.
- **GEO is diagnostic, not a guarantee.** A high score improves the structural conditions
  for citation; it cannot promise any specific model will cite the site. Avoid promising rankings.
- **Don't fabricate entity data.** Never invent a Wikipedia page, review count, or author
  credential to inflate a score — recommend creating the real signal instead.
- **Respect honest robots.txt choices.** If an owner deliberately blocks training-only bots
  (GPTBot, CCBot, anthropic-ai) for IP reasons, note the trade-off; don't override their intent.
