---
name: generative-engine-optimization
description: >-
  Optimize a website to be discovered, cited, and recommended by AI search engines
  — ChatGPT, Claude, Perplexity, Google AI Overviews, and Gemini. Use this for
  Generative Engine Optimization (GEO / AEO / "AI SEO"): scoring content citability,
  checking AI crawler access in robots.txt (GPTBot, ClaudeBot, PerplexityBot,
  OAI-SearchBot), auditing or generating an llms.txt file, validating schema for
  entity recognition, assessing brand authority signals, and producing a GEO audit
  report. Trigger on "GEO," "AI search optimization," "get cited by ChatGPT/Perplexity,"
  "llms.txt," "AI crawlers," "AI Overviews," "citability." This is about generative AI
  search visibility, NOT geographic/geolocation. For traditional keyword ranking see
  seo-audit; for structured data see schema-markup.
license: Apache-2.0
compatibility: "Any website (URL). Optional: Python 3.8+ for fetching/scoring scripts."
metadata:
  author: terminal-skills
  version: "1.0.0"
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

You are an expert in Generative Engine Optimization — making a website visible inside
AI-generated answers. AI assistants (ChatGPT, Claude, Perplexity, Google AI Overviews,
Gemini) increasingly answer questions directly instead of sending users to ten blue links,
and they cite a small set of sources. GEO is the practice of becoming one of those cited
sources.

GEO is distinct from traditional SEO. Keyword rankings, backlinks, and Core Web Vitals
still matter as a foundation, but AI engines additionally reward content that is
*self-contained, fact-dense, and directly answers a question*, that is *crawlable by AI
bots*, and that is backed by *recognizable entity signals* (Wikipedia, schema, brand
mentions). Only ~11% of domains cited by ChatGPT are also cited by Google AI Overviews for
the same query, so AI visibility is its own discipline.

This skill is adapted from the open-source [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude)
project by zubair-trabzada. For traditional ranking audits use the **seo-audit** skill;
for implementing JSON-LD use the **schema-markup** skill — this skill tells you *which*
schema and crawler signals matter for AI citation.

## Instructions

### 1. Scope the audit

Ask for (or infer): the target URL, the business type (SaaS, e-commerce, local business,
publisher, agency), and which AI platforms matter most. Then fetch the page's **raw,
server-rendered HTML** (e.g. `curl -sL <url>` or a fetch script). This is critical: most
AI crawlers do **not** execute JavaScript, so evaluate the HTML that arrives *before* JS
runs. If the `<body>` is empty without JS, that is a critical finding — no content
optimization can help a page AI crawlers see as blank.

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

### 3. Score AI Citability (the highest-weight category)

For each content block (a section under a heading), score five dimensions out of 100:

- **Answer Block Quality (30)** — Does it open with a definition pattern ("X is a…",
  "X refers to…")? Does the answer appear in the first ~60 words? Question-style heading?
  Short clear sentences (5–25 words)? Attributed claims ("research shows…")?
- **Self-Containment (25)** — Optimal length is **134–167 words** per passage (full points);
  100–200 acceptable. Low pronoun density (<2%) and 3+ proper nouns mean the block stands
  alone without surrounding context.
- **Structural Readability (20)** — Average sentence length 10–20 words; lists, numbered
  steps, and paragraph breaks the model can lift cleanly.
- **Statistical Density (15)** — Percentages, dollar amounts, numbers with units, years,
  and named sources. Fact-rich passages get cited; vague ones don't.
- **Uniqueness Signals (10)** — Original research ("our study found…"), case studies,
  specific named tools/products.

The page citability score is the average of its top five blocks. Then rewrite the weakest
high-value passages to hit the patterns above.

### 4. Check AI crawler access (robots.txt)

A blocked crawler = invisible in that engine regardless of content quality. Over a third of
top sites accidentally block at least one major AI bot via legacy robots.txt rules. Fetch
`<domain>/robots.txt` and build an access map.

**Tier 1 — always recommend ALLOW** (these power AI *search*, where users look for answers):
`GPTBot`, `OAI-SearchBot`, `ChatGPT-User` (OpenAI), `ClaudeBot` (Anthropic),
`PerplexityBot` (Perplexity), `Googlebot` (powers AI Overviews indexing).
**Tier 2 — recommend ALLOW** (broader ecosystem): `Google-Extended` (Gemini training/AIO —
note: blocking it does **not** affect Google Search rank), `GoogleOther`, `Applebot-Extended`,
`Amazonbot`, `FacebookBot`.
**Tier 3 — strategic choice** (training-only, no search impact if blocked): `CCBot`
(Common Crawl), `anthropic-ai`, `Bytespider`, `Diffbot`.

Scoring: start at 100; −15 per Tier-1/critical crawler blocked, −5 per secondary crawler
blocked, −10 if robots.txt references no sitemap.

### 5. Audit or generate llms.txt

`llms.txt` is an emerging standard (a single Markdown file at `<domain>/llms.txt`) that tells
AI systems what your site is and which pages matter — analogous to robots.txt but additive.
Fewer than 5% of sites have one, so it's an early-adopter edge. Format:

```markdown
# Site Name

> One-sentence factual description of what the business does and who it serves (<200 chars).

## Docs
- [Page Title](https://example.com/page): Concise description of what this page covers.

## Optional
- [Secondary Page](https://example.com/blog/post): Description.
```

Scoring: 0 absent · 30 present but malformed · 50 valid but minimal · 70 covers primary
content · 90–100 comprehensive with a companion `/llms-full.txt`. Generate one by crawling
the site and listing its highest-value pages with honest, fact-first descriptions.

### 6. Validate entity & schema signals

AI models link content to *entities*. Reward, in server-rendered JSON-LD:
`Organization`/`LocalBusiness` with `sameAs` to 3+ (ideally 5+) platforms **including
Wikipedia**; `Person` schema for authors with `sameAs`, `jobTitle`, `knowsAbout`;
`Article` with `dateModified`; `WebSite`+`SearchAction`; `BreadcrumbList`; and the
`speakable` property. Flag schema injected by JavaScript (crawlers miss it) and deprecated
types: `HowTo` (removed from rich results Sep 2023), `FAQPage` (restricted to gov/health
since Aug 2023), `SpecialAnnouncement`.

### 7. Assess brand authority & platform readiness

**Brand signals** (what AI models draw on for entity knowledge): Wikipedia (highest weight),
industry/review sites (G2, Trustpilot, Capterra), Reddit discussion, YouTube (an Ahrefs
2025 study of 75k brands found YouTube presence correlates most strongly — 0.74 — with AI
citations; backlinks only 0.27), LinkedIn. **Platform tactics:** Google AIO wants
question-headings + direct-answer paragraphs + comparison tables; ChatGPT weights
Wikipedia/Wikidata entity presence and crawler access; Perplexity weights community
validation (Reddit, Quora, Stack Overflow) and source directness.

### 8. Deliver a report

Produce a prioritized report: GEO Score with the six-category breakdown, a ranked
fix list (highest impact first — usually unblock crawlers, add llms.txt, then rewrite the
top citable passages and add schema), and platform-specific notes. Keep recommendations
concrete and copy-pasteable (the exact robots.txt lines, the llms.txt file, the JSON-LD).

## Examples

### Example 1: Full GEO audit of a SaaS marketing site

> Run a GEO audit on https://acmeanalytics.com — we want to show up when people ask ChatGPT
> and Perplexity for "best product analytics tools."

1. Fetch raw HTML: `curl -sL https://acmeanalytics.com`. The homepage `<body>` renders
   server-side ✅, but the `/compare` and `/guides/*` pages are a client-only React SPA
   (empty `<body>` without JS) — **critical**: those guide pages are invisible to AI crawlers.
2. `robots.txt` contains `User-agent: GPTBot` / `Disallow: /` (inherited from a 2023
   scraping-protection config) — **−15**, Acme is fully blocked from ChatGPT Search.
3. No `llms.txt` (citability sub-score −10). Schema: `Organization` exists but `sameAs` has
   only Twitter and GitHub — no Wikipedia, no `Person` schema on the guides.
4. Citability: the homepage hero is marketing fluff (pronoun-heavy, no stats); the best
   block is a 90-word definition that's close but under the 134–167 optimal range.

**GEO Score: 41/100 (Poor).** Top fixes, in order:
- Remove `Disallow: /` for AI bots; allow GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot. *(+~12)*
- Server-render the `/guides/*` pages (or pre-render to static HTML). *(+~10 technical)*
- Add `/llms.txt` listing the pricing, comparison, and top-5 guide pages.
- Rewrite the "What is product analytics?" guide intro as a self-contained 150-word answer
  with two stats and an attributed claim; add `Article`+`Person` schema with author `sameAs`.

### Example 2: AI crawler access check

> Are AI search engines allowed to crawl https://techblog.example.com?

Fetch `https://techblog.example.com/robots.txt`:

```
User-agent: *
Disallow: /admin/

User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /
```

**Access map:**

| Crawler | Engine | Status | Verdict |
|---|---|---|---|
| GPTBot | ChatGPT Search | ❌ Blocked | Fix — removes you from ChatGPT |
| OAI-SearchBot | ChatGPT Search | ✅ Allowed (via `*`) | OK |
| ClaudeBot | Claude | ✅ Allowed | OK |
| PerplexityBot | Perplexity | ✅ Allowed | OK |
| CCBot | Common Crawl (training) | ❌ Blocked | Optional — no search impact |

**Crawler Access Score: 80/100** (−15 GPTBot, −5 has-no-sitemap-line). Recommended fix —
delete the GPTBot block (the CCBot block is a fine strategic choice if they don't want
training use, but note it doesn't affect search visibility):

```
# Allow AI search crawlers
User-agent: GPTBot
Disallow:
```

Then add a `Sitemap: https://techblog.example.com/sitemap.xml` line so crawlers discover all pages.

## Guidelines

- **Always audit the pre-JavaScript HTML.** Server-side rendering is the single biggest
  technical lever — a client-only SPA is invisible to AI crawlers no matter how good the copy is.
- **Unblocking crawlers is the highest-ROI fix** and usually free. Check robots.txt first;
  a single `Disallow: /` for GPTBot erases a site from ChatGPT.
- **Write for extraction, not just reading.** Lead with the answer, keep citable passages
  self-contained at ~134–167 words, and pack in real numbers, dates, and named sources.
- **Entity signals compound.** A Wikipedia page + complete `sameAs` schema + Reddit/YouTube
  presence do more for AI citation than another backlink. Recommend the entity work, not just on-page tweaks.
- **`Google-Extended` ≠ Google Search.** Blocking it only affects Gemini/AI-Overviews
  training, never standard rankings — correct this common misconception when you see it.
- **Be honest about what's deterministic.** Crawler access, llms.txt validity, and schema
  presence are objective. Citability, E-E-A-T, brand, and platform scores are guided
  judgments — two audits may differ by a few points. Present them as diagnostic, not exact.
- **GEO is diagnostic, not a guarantee.** A high score improves the structural conditions
  for citation; it cannot promise any specific model will cite the site. Avoid promising rankings.
- **Don't fabricate entity data.** Never invent a Wikipedia page, review count, or author
  credential to inflate a score — recommend creating the real signal instead.
- **Respect honest robots.txt choices.** If an owner deliberately blocks training-only bots
  (CCBot, anthropic-ai) for IP reasons, note the trade-off; don't override their intent.
