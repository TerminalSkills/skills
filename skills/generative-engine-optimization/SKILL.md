---
name: generative-engine-optimization
description: >-
  Audits and improves how a website is found and cited by AI answer engines (Google AI Overviews and AI Mode, ChatGPT search, Perplexity, Claude, Copilot). Use for Generative Engine Optimization (GEO, AEO, "AI SEO"): "get cited by ChatGPT", "are AI crawlers blocked", "AI Overviews visibility", "llms.txt", "will AI bots see my site". Checks crawler access in robots.txt, server-rendered content, entity markup and answer-ready writing, and says which findings are documented and which are heuristics. Not about geography. For classic ranking use seo-audit; for JSON-LD use schema-markup.
license: Apache-2.0
compatibility: "Any public website. curl and Python 3.8+ (standard library only) for the checks; Search Console and Bing Webmaster Tools access helps for measurement."
metadata:
  author: terminal-skills
  version: "3.0.0"
  category: business
  tags:
    - geo
    - ai-search
    - seo
    - robots-txt
    - llms-txt
---

# Generative Engine Optimization (GEO)

## Overview

AI answer engines read the web, write a short answer and show a few source links. GEO is the work of making a site eligible for that retrieval and easy to quote. It is not a separate algorithm to game. The vendors' own documentation says so, and this skill is built on what they publish.

What the primary sources actually establish, as of late 2026:

- **Google** says AI Overviews and AI Mode have no extra technical requirements: a page must be indexed and eligible to show with a snippet. Google tells site owners to ignore "chunking" and special AI text files for Google Search. Search Console has a Generative AI performance report.
- **OpenAI, Anthropic and Perplexity** each publish separate crawlers for search, for training and for user-triggered fetches. Allowing the search crawler while blocking the training crawler is a documented, supported choice.
- **Microsoft** reports citations in Copilot and Bing AI answers through the AI Performance view in Bing Webmaster Tools (public preview since February 2026).
- **llms.txt** is a community proposal (llmstxt.org). No engine in this list documents using it for ranking or citation.

So an audit has three layers, and the report must keep them apart:

1. **Gates**: facts you can verify and that decide whether an engine can see the page at all (robots.txt, HTTP status, rendered HTML, indexability).
2. **Documented practice**: guidance the vendors publish (helpful original content, structured data that matches visible text, clear authorship).
3. **Heuristics**: widely repeated advice with no vendor backing (passage length, answer-first layout, brand-mention volume). Useful, but label it as a guess.

Nobody outside the vendors can measure how often an engine cites a page, because answers vary by prompt, user, location and time. Do not produce a "GEO score out of 100"; any such number is invented weights.

## Instructions

### 1. Scope

Ask for: the site URL, the business type, the 5-10 questions customers ask that the site should answer, which engines matter, and whether the owner wants to opt out of AI training (a separate decision from search visibility). Check what they already have: Search Console, Bing Webmaster Tools, server logs or a CDN bot report.

### 2. Gate 1: can the crawlers fetch it?

Fetch `/robots.txt` and evaluate each agent under RFC 9309 rules: the most specific `User-agent` group wins, and within a group the longest matching path wins. Run this stdlib script and read the output next to the file itself, because `urllib.robotparser` is simpler than Google's parser (check wildcards by hand):

```python
import sys, urllib.request
from urllib.robotparser import RobotFileParser

BOTS = ["OAI-SearchBot", "GPTBot", "ChatGPT-User", "Claude-SearchBot", "ClaudeBot",
        "Claude-User", "PerplexityBot", "Perplexity-User", "Googlebot",
        "Google-Extended", "Bingbot", "Applebot", "Applebot-Extended"]

site, path = sys.argv[1].rstrip("/"), (sys.argv[2] if len(sys.argv) > 2 else "/")
req = urllib.request.Request(site + "/robots.txt", headers={"User-Agent": "geo-audit/1.0"})
rp = RobotFileParser()
rp.parse(urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace").splitlines())
for bot in BOTS:
    print(f"{bot:18} {'allow' if rp.can_fetch(bot, site + path) else 'BLOCK'}")
```

Classify by what each vendor documents, not by a tier list:

| Agent | Vendor-documented purpose | Blocking it means |
|---|---|---|
| OAI-SearchBot | Surfaces sites in ChatGPT search | Not shown in ChatGPT search results |
| GPTBot | Training of OpenAI foundation models | Opt-out of training only |
| ChatGPT-User | Fetches a page when a user asks | OpenAI says robots.txt rules may not apply |
| Claude-SearchBot | Indexing for Claude search quality | May reduce visibility in Claude search |
| ClaudeBot | Collecting content for training | Opt-out of training |
| Claude-User | Fetch on a user's request | May reduce visibility for user-directed search |
| PerplexityBot | Surfaces and links sites in Perplexity; not used for foundation-model training | Not listed in Perplexity results |
| Perplexity-User | User-triggered fetch | Perplexity says it generally ignores robots.txt |
| Googlebot | Crawling for Google Search, including AI features | Out of Google Search and its AI features |
| Google-Extended | robots.txt token for Gemini training and grounding in other Google systems | Does not affect Search inclusion or ranking |
| Bingbot | Bing index, which feeds Copilot | Out of Bing and Copilot answers |
| Applebot / Applebot-Extended | Apple search; the Extended token opts out of generative training | Extended: training opt-out only |

Verify names against the vendor pages (listed in Guidelines) before advising a change: agent names have been added and retired.

Other things that block crawlers while robots.txt looks fine: a WAF or bot-protection challenge, geo blocks, rate limits, and login or cookie walls. Request a key page with each user-agent string using curl and compare status codes. Vendors publish IP ranges (OpenAI, Anthropic, Perplexity) for allow-listing; verify those rather than trusting the header. Anthropic warns that blocking by IP can stop its bots from reading robots.txt.

### 3. Gate 2: is the content in the HTML?

```bash
curl -sL -A "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)" -o page.html https://northwind-bikes.example/guides/chain-wear
python3 - page.html <<'EOF'
import sys
from html.parser import HTMLParser

class Visible(HTMLParser):
    skip, words = 0, 0
    def handle_starttag(self, tag, attrs): self.skip += tag in ("script", "style", "noscript")
    def handle_endtag(self, tag): self.skip -= tag in ("script", "style", "noscript")
    def handle_data(self, data): self.words += 0 if self.skip else len(data.split())

p = Visible(); p.feed(open(sys.argv[1], encoding="utf-8", errors="replace").read())
print(p.words, "visible words in the server HTML")
EOF
```

Compare the word count and the presence of the main heading, answer text, prices and author with the rendered page. Googlebot renders JavaScript; there is no equivalent public commitment from the other crawlers, so treat client-only content as invisible to them. An empty `<body>` shell is a critical finding. Also check: HTTP 200 on the canonical URL, no stray `noindex` or `nosnippet` (a `nosnippet` or low `max-snippet` limits what Google can quote), a canonical tag that points to itself, and content not hidden behind tabs that load on click.

For Google specifically, confirm the page is indexed with URL Inspection. Eligibility for AI features equals being indexed and snippet-eligible.

### 4. Content: write what can be quoted

Documented guidance (Google): original, helpful content for people, clear authorship, accurate and current. Heuristics that fit how answers are assembled, to be offered as suggestions:

- Put a plain statement of the answer directly under the question heading, then the detail. Engines often issue several sub-queries per question (Google calls this query fan-out), so cover the sub-questions a buyer would ask: price, limits, alternatives, how it compares.
- Make each section understandable alone: name the subject instead of "it", give units, dates and the source of every figure.
- Prefer facts the model cannot guess: your own measurements, policies, specifications, version numbers, dated changes.
- Use real HTML structure: headings, lists, and `<table>` for comparisons, not images of tables.
- Show the date updated and the author, and keep both true.

There is no verified ideal passage length. Do not report one as a standard.

### 5. Entities and structured data

Structured data helps engines tie the page to a real thing. Google states that markup must match visible content. Check in the server HTML (not injected late by scripts, though Google can read JavaScript-generated markup):

- `Organization` with `name`, `url`, `logo`, and `sameAs` links to profiles you really own (LinkedIn, GitHub, Crunchbase, Wikipedia or Wikidata only if the entity genuinely has one).
- `Article` / `BlogPosting` with `author` (a `Person` with a profile URL), `datePublished`, `dateModified`.
- `Product`, `SoftwareApplication`, `LocalBusiness` where they fit, with the same prices and hours the page shows.
- Check the current Google structured data gallery before recommending FAQ or HowTo markup: Google has retired most of those rich results, so add them only if the content needs them, not for AI.

Validate with the Rich Results Test and schema.org's validator. Hand the JSON-LD writing to the `schema-markup` skill.

### 6. Off-site presence (correlation only)

Engines also lean on what other sites say. Look for accurate listings and reviews on the sites buyers use, third-party comparisons, documentation mentions, and community threads. Studies correlating brand mentions with AI visibility exist, but they show correlation, and sample choices differ. Recommend earning real mentions. Never fake reviews or buy mentions; Google's guide says chasing inauthentic mentions is not as helpful as it seems.

### 7. llms.txt (optional)

Per the proposal: a Markdown file at `/llms.txt` with an H1 name, a blockquote summary, and sections of links with short notes; `## Optional` marks skippable links. Google says it neither helps nor harms Search. It is cheap and can serve coding agents and docs tooling that choose to read it. Offer it last, after the gates. Never present it as a ranking factor.

### 8. Measure what can be measured

- Google: Search Console, Generative AI performance report.
- Microsoft: Bing Webmaster Tools, AI Performance (citations, cited pages, grounding queries, a sample).
- All engines: server or CDN logs filtered by the agent names above (search crawlers show up here; referral hits from chat products appear as referrers such as chatgpt.com or perplexity.ai).
- Manual prompt sampling: run each target question several times on different days and record whether the site is cited. Report it as a sample with the date, never as a rank.

### 9. Report

Deliver: (a) gate results as pass/fail with evidence, (b) documented-practice findings, (c) heuristics clearly marked, (d) ordered fixes with the exact robots.txt lines or JSON-LD, (e) the measurement plan, (f) a short list of things nobody can verify.

## Examples

### Example 1: Hardware retailer invisible in ChatGPT

> Audit northwind-bikes.example. Customers say ChatGPT never mentions us.

Findings:
1. robots.txt has `User-agent: OAI-SearchBot` then `Disallow: /`, copied from a 2023 "block AI" snippet. Gate failure: no ChatGPT search results.
2. `/guides/chain-wear` returns 200 but the HTML has 40 words: the guide is a client-rendered React shell. Gate failure for every crawler except Googlebot.
3. `Organization` JSON-LD exists with no `sameAs`; articles have no `Person` author.
4. The wear-limit answer sits in paragraph four under a heading "Introduction".

Fix list, in order:

```
User-agent: OAI-SearchBot
Allow: /

User-agent: GPTBot
Disallow: /
```

(keep the GPTBot block only if the owner confirmed a training opt-out), then server-render `/guides/*`, retitle the heading "How do you tell if a bike chain is worn?", put the 0.5% / 0.75% elongation limits first, add the `Person` author and `sameAs` links to the shop's real profiles. Measurement: Bing AI Performance and a weekly five-prompt sample. Nothing here is a promise of citation.

### Example 2: Docs site asking about llms.txt

> Our docs are on docs.ledgerlane.io. Should we add llms.txt and block GPTBot?

Answer in three lines. llms.txt: optional; Google says it has no effect on Search, a docs generator may already produce one, and coding agents may fetch it, so add a short one linking the quickstart, API reference and changelog. GPTBot: independent of search; blocking affects OpenAI training only, so it is the owner's policy call. Verify first: OAI-SearchBot and Claude-SearchBot are allowed and the API reference renders without JavaScript. The `llms.txt`:

```markdown
# Ledgerlane Docs

> Ledgerlane is an invoicing API for freelancers. These docs cover authentication, invoices, webhooks and rate limits.

## Docs
- [Quickstart](https://docs.ledgerlane.io/quickstart): create a key and send a first invoice
- [Webhooks](https://docs.ledgerlane.io/webhooks): event types, retries, signature check

## Optional
- [Changelog](https://docs.ledgerlane.io/changelog): dated API changes
```

## Guidelines

- Sources to re-check before each audit: Google Search Central "AI features and your website" and "Optimizing for generative AI"; OpenAI "Overview of OpenAI Crawlers" (platform.openai.com/docs/bots); Anthropic Help Center "Does Anthropic crawl data from the web"; Perplexity "Perplexity Crawlers" (docs.perplexity.ai/guides/bots); Apple "About Applebot"; Bing Webmaster blog on AI Performance; RFC 9309; llmstxt.org; schema.org.
- Fix gates first; they cost little and decide everything else. Content rewrites come after.
- Keep search and training decisions apart. Blocking a training crawler does not remove a site from that vendor's search, and blocking a search crawler does.
- A crawler that is allowed may still be unable to read the page behind a WAF. Test with real requests.
- Never promise citations, rankings or traffic. State the evidence level of every recommendation.
- Do not invent a Wikipedia page, reviews, author credentials or statistics. Recommend creating the real thing.
- Vendor behavior changes; this is a 2026 snapshot, and facts here were taken from the vendor pages listed above.
- Skip this skill for pure ranking problems with no AI angle; use seo-audit.
