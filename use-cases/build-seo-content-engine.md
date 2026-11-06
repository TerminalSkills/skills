---
title: "Build an SEO Content Engine for Your SaaS"
slug: build-seo-content-engine
description: "Audit your site, plan content from real customer evidence, research competitor pages and ship a measured 90-day calendar to grow organic traffic systematically."
skills: [seo-audit, content-strategy, web-research]
category: content
tags: [SEO, content-marketing, organic-traffic, keyword-research, SaaS]
---

# Build an SEO Content Engine for Your SaaS

## The Problem

Your SaaS gets a few hundred organic visitors a month. Your top competitor's blog has well over a hundred articles covering every angle of the problem you solve. You have three posts: a launch announcement, a feature update nobody read, and a "why we built this" founder story.

Content marketing is a cost-effective long-term growth channel, but it needs both volume and strategy. Freelancers and agencies are expensive, and without evidence about what readers need you can write thirty articles on topics nobody searches for, or on pages Google cannot index because of a technical fault nobody checked. You do not have an SEO specialist, a content strategist or a writer, and the gap widens every month you do not publish.

## The Solution

Combine three skills, each doing one job:

- **seo-audit** checks that the site can be crawled and indexed at all (robots.txt, sitemap, canonicals, rendering, Core Web Vitals), so new articles are not published into a broken foundation.
- **content-strategy** turns counted customer evidence and Search Console data into a scored backlog and a 90-day calendar sized to the hours the team really has.
- **web-research** reads what currently ranks for a target query through the Brave Search API and finds what those pages leave out, so each outline can beat them.

## Step-by-Step Walkthrough

### Step 1: Audit the technical foundation

```text
Run an SEO audit of https://example-analytics.dev. We have 3 blog posts and almost no organic traffic.
Check robots.txt, the sitemap, canonicals, rendering and Core Web Vitals, and rank the findings.
```

The agent works in a scratch directory and keeps every output, as `seo-audit` prescribes. It checks the four host variants (http/https, www/bare) for one clean redirect, fetches `robots.txt` and `sitemap.xml`, runs a per-page signal checker over a sample of each template, compares the HTML the server sends with the rendered page, and reads Core Web Vitals field data from the CrUX API and a lab run from Lighthouse. The report is one table: severity, finding, the command and output that showed it, affected URLs, and the file to change.

A typical result for a young SaaS site: the blog index is client-rendered so the server HTML has no links to posts, the sitemap lists staging URLs, and every blog post canonicalises to the blog index. Those are Blockers and Majors; fix them before writing anything, because every article in the calendar inherits them.

### Step 2: Turn evidence into needs and a backlog

```text
Plan our content for the next quarter. One marketer with 8 hours a week, an engineer who can review.
Inputs: 60 support tickets, notes from 15 sales calls, 90 onboarding survey answers in docs/inputs/.
We have no Search Console history yet beyond the 3 posts.
```

`content-strategy` does not start from a keyword tool. It tallies how many separate people raise each problem and writes each need with its count and evidence, for example "As a PM at a seed-stage startup who has an event table but no dashboards, I need to find out which features people actually use. Evidence: 11 of 15 sales calls, 23 of 90 survey answers". It then gives each candidate page one search intent and scores it:

`score = (demand evidence + business fit + right to win) ÷ effort`

Anything scoring 0 on business fit or on right to win is dropped, whatever its total. That removes the "What is product analytics?" article that every large competitor already owns and that you have nothing original to add to. Keyword volume from whichever tool you use is a supporting signal, not the ranking criterion.

The calendar comes from capacity: 8 hours × 13 weeks = 104 hours, minus 30% reserved for distribution, updates and review = 72 production hours. Pieces are taken from the top of the backlog until those hours run out, and the remainder is kept as slack. Each row names the publish week, title, need, intent, primary query, the original material it must include (your own usage data, a customer story, a template), the owner, the reviewer and the metric it is judged on. Pages on one topic link to a hub page and to each other, so the cluster is easy for readers and crawlers to follow.

### Step 3: Research what ranks, then outline a better page

```text
Research "cohort analysis tutorial". Read the top 5 ranking pages, compare what they cover,
find what none of them include, and draft an outline that fills the gaps.
```

`web-research` plans sub-questions, then searches with the Brave Search API (`GET https://api.search.brave.com/res/v1/web/search`, key in the `X-Subscription-Token` header from `$BRAVE_API_KEY`). It fetches each of the top results, strips navigation and scripts, and tabulates what every page covers: depth, whether it has worked examples, code, downloadable data, and how recent it is. Brave's search plan includes $5 of free credit each month and requires a card, so a few dozen research queries cost nothing.

The output is a research report with sources and a short list of gaps. Typical gaps for a tutorial query: no runnable example data, no explanation of how to read a retention curve for a small user base, and no note on common mistakes such as mixing signup and activation cohorts. The outline then puts those into dedicated sections and names the first-hand material you must supply, such as your own anonymised cohort table. A fetched page is evidence of what competitors say, not a source for facts you will publish; verify every figure against its primary source before it goes into your article.

### Step 4: Draft, review and publish

Drafts from an agent are a starting point. The calendar row's owner adds the first-hand material and product screenshots, and the reviewer checks accuracy: code snippets should run, numbers should trace to a source. Google's guidance is that there is no preferred word count and that pages produced mainly to rank fall under its scaled-content-abuse policy however they were made, so publish the pages the plan justifies, not as many as you can.

Before each publish, rerun the page signal check from step 1 on the new URL: status 200, one H1, a self-referencing canonical, no `noindex`, present in the sitemap.

### Step 5: Measure and re-plan

```text
Pull Search Console data for the last 3 months by page and query and run the content audit.
```

Once pages have been live for a while, `content-strategy` reads a Search Analytics export grouped by page and query and lists three things: near-miss queries (average position 8 to 20 with real impressions, so improving that page is the cheapest win), queries split across two of your pages (merge or differentiate), and pages shown in search that nobody clicks (rewrite, merge or remove). Judge each page on its clicks and average position for its primary query 8 to 12 weeks after publication; Google says changes can take from hours to several months to show. Re-plan every quarter and update before you create: a refreshed article with existing links and history usually beats a brand-new one.

## Real-World Example

The co-founder of a small analytics SaaS had tried content marketing twice. First attempt: five posts aimed at head terms that the largest vendors own; none ranked. Second attempt: eight generic freelance articles from a writer who had never used analytics software. Neither was ever checked technically.

She ran the three skills over one weekend. The audit found that every blog post canonicalised to the blog index, so none could be indexed under its own URL, a one-line template fix. The evidence tally showed her sales calls kept returning to implementation questions, such as setting up event tracking and choosing what to track first, while both main competitors published mostly thought leadership. Research on the top results for those queries showed no page with working example data.

The plan, built for her 8 hours a week, had eleven pages: a hub, six implementation guides with real event schemas from her own product, a comparison page and three templates. Two months in she reran the Search Console audit. It showed two of her guides at positions 9 to 12 with growing impressions, so she spent a week on those rather than writing new pages. Her own numbers will differ; the method is what carries over: fix the foundation, plan from evidence, research each page against what already ranks, and measure per page before deciding what to write next.

## Related Skills

- **seo-audit**: confirms the site can be crawled and indexed before content is published, and re-checks each new URL.
- **content-strategy**: scores evidence-backed topics, sizes the calendar to real hours, and audits Search Console data after launch.
- **web-research**: reads the pages that currently rank for each target query via the Brave Search API and finds the gaps an outline should fill.
