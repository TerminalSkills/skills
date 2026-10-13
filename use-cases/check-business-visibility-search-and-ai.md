---
title: Check Whether Your Business Is Visible in Search and AI Answers
slug: check-business-visibility-search-and-ai
description: Run one agent-driven visibility check on a local business across Google's map pack, organic search, and AI answers (ChatGPT, Google AI Overviews) using the SEOG MCP server — find exactly where you're invisible and what to fix first.
skills:
  - seog
  - generative-engine-optimization
  - seo-audit
  - schema-markup
category: business
tags:
  - local-seo
  - ai-visibility
  - google-business-profile
  - map-pack
  - mcp
---

# Check Whether Your Business Is Visible in Search and AI Answers

## The Problem

A local business owner assumes they show up when a customer searches "best dentist near
me" or asks ChatGPT "who should I see for Invisalign in Austin." Usually they don't — and
they have no way to tell. Visibility now splits across three surfaces that each work
differently:

- **The Google map pack** — the 3 results on the map. Rank there changes block by block,
  so a business can be #1 at its own address and invisible two neighborhoods over.
- **Organic / website** — the blue links, driven by on-page SEO, structured data, and
  Search Console health.
- **AI answers** — ChatGPT, Perplexity, and Google's AI Overviews, which cite a handful of
  sources and increasingly intercept the query before the user ever sees a map.

Checking all three by hand means juggling incognito searches from different locations,
typing prompts into three chatbots, and reading a Search Console you don't understand.
Most owners check none of it and find out they're invisible only when the phone stops
ringing.

## The Solution

Connect an AI agent to the [SEOG](../skills/seog/) MCP server and ask it for a single
visibility check. The agent runs the measurement tools across all three surfaces against
your own seog.ai account, then hands back a plain-language verdict: where you rank, where
you're missing, and the ranked list of fixes. Pair it with the
[generative-engine-optimization](../skills/generative-engine-optimization/),
[seo-audit](../skills/seo-audit/), and [schema-markup](../skills/schema-markup/) skills so
the agent doesn't just report gaps — it knows how to close them.

### Connect once

In **claude.ai (web/desktop)** add SEOG as a connector — **Settings → Connectors → Add
custom connector** → `https://api.seog.ai/mcp` — and sign in. In a **CLI** (Claude Code,
Codex, Cursor), register it with a token instead:

```bash
claude mcp add --transport http seog https://api.seog.ai/mcp \
  --header "Authorization: Bearer $SEOG_MCP_TOKEN"
```

Every call runs as that account, and the measurement tools spend its credits.

## Step-by-Step Walkthrough

### Step 1: Find the business

> "Check how visible Lumen Dental in Austin is."

The agent calls `list_businesses` to see if it's already in the portfolio. If not, it runs
`search_places("Lumen Dental Austin")`, confirms the right Places result, and brings it in
with `import_business` — or `list_gbp_import_locations` → `import_gbp_business` when the
owner's Google account is already connected. Every later call carries that `businessId`.

### Step 2: Measure the map pack, block by block

The agent runs a geo-grid scan — `get_keyword_grid_scan` (or `get_latest_grid_scan` for the
most recent run) — which ranks the business for a money keyword across a grid of points
around its address, not from a single IP. `get_grid_snapshot` / `get_grid_history` show the
coverage map and whether it's growing or shrinking. `list_keywords` and `check_keyword`
give the tracked positions. The output is concrete: "#1 within 1 mile, falls off a cliff to
#11 past Hyde Park."

### Step 3: Measure AI-answer visibility

`get_ai_visibility` and `get_ai_visibility_pillars` score how often the business surfaces in
AI answers and *why*; `get_ai_presence_matrix` breaks it down by prompt and engine.
`check_ai_overview` / `get_ai_overview` show whether Google's AI Overview mentions the
business for the target queries, `identify_ai_mentions` finds where it's already being cited,
and `check_citations` / `list_citations` audit the citation sources the models lean on. This
is exactly the surface the
[generative-engine-optimization](../skills/generative-engine-optimization/) skill knows how
to influence.

### Step 4: Check the website and organic health

`get_website_analysis` (refresh with `refresh_website_analysis`) audits the site;
`get_business_audit` rolls up the GBP profile's completeness; `get_search_performance`
reads Search Console for the queries actually bringing clicks. Weak structured data and
thin pages that show up here are what the [seo-audit](../skills/seo-audit/) and
[schema-markup](../skills/schema-markup/) skills address.

### Step 5: Compare against who's winning

`discover_competitors` / `list_competitors` surface who outranks the business in the map
pack and in AI answers; `compare_competitors` lines up the gaps side by side — so "we're
invisible" becomes "we're losing the map pack to two practices with 3× our review volume
and a Services section we never filled in."

### Step 6: Get the verdict and the fix list

`get_dashboard` and `get_action_plan` synthesize all of the above into a prioritized plan,
and `create_report` produces a shareable PDF. The agent reports back in plain language:
visible where, invisible where, and the three fixes that move the needle first.

## Real-World Example

Lumen Dental, a single-location practice in Austin, believed it ranked well — it was #1
when the owner Googled from the front desk. One agent visibility check told a different
story:

- **Map pack:** #1–#3 within a mile of the office, but #9–#14 across South Austin, where a
  third of its patients live. The geo-grid made the dead zone obvious.
- **AI answers:** `get_ai_visibility` scored 22/100. ChatGPT and Google's AI Overview named
  two competitors for "Invisalign dentist Austin" and never mentioned Lumen —
  `check_citations` showed the competitors cited from directories Lumen wasn't listed in.
- **Website:** `get_website_analysis` flagged missing `LocalBusiness` and `Dentist` schema
  and no dedicated Invisalign page — so the agent, following the
  [schema-markup](../skills/schema-markup/) skill, drafted the structured data to add.

The ranked fix list: fill out GBP Services and post weekly to recover the South Austin
grid; get listed in the three directories the AI models cite; ship the Invisalign page with
proper schema. Three moves, grounded in measurement, instead of a vague "do more SEO."

## Related Skills

- **[seog](../skills/seog/)** — the MCP server that runs every measurement in this guide
  against your own seog.ai account.
- **[generative-engine-optimization](../skills/generative-engine-optimization/)** — make the
  business show up and get cited in ChatGPT, Perplexity, and Google AI Overviews.
- **[seo-audit](../skills/seo-audit/)** — turn the website findings into a concrete on-page
  and technical fix list.
- **[schema-markup](../skills/schema-markup/)** — add the structured data that both Google
  and AI answer engines read to understand the business.
