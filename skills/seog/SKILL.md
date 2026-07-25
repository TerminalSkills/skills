---
name: seog
description: >-
  Run local SEO from your terminal via the SEOG MCP server — Google Business Profile
  management, map-pack rank tracking and geo-grid scans, review sync and replies published
  to Google, competitor intelligence, AI-visibility and citation checks, website + Search
  Console audits, GBP posts, and PDF reports. Use when: connecting an agent to seog.ai,
  tracking map-pack rankings, automating local SEO reports, monitoring competitors near a
  business, replying to Google reviews, publishing Google posts, or when the user mentions
  "SEOG", "local SEO", "map pack", "Google Business Profile", or "keyword positions" for a
  physical business.
license: Apache-2.0
compatibility: "Any MCP client (Claude Code, Codex, Gemini CLI, Cursor); seog.ai account with an active plan — paid tools spend credits"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: [local-seo, google-business-profile, mcp, rank-tracking, reviews]
evals:
  - name: weekly-ranking-review-digest
    prompt: |
      I'm connected to the SEOG MCP server. Give me this week's local SEO digest
      for my coffee shop (it's already in my SEOG portfolio): keyword movement,
      review situation, and draft replies for anything negative that's unanswered.
    rubric: |
      Score 0-100 by points achieved:
      - Starts from list_businesses (or a known businessId) and passes businessId to every later call: 15pts
      - Uses list_keywords for current positions AND keyword_history for the week's trend (not check_keyword alone): 25pts
      - Runs sync_reviews before reading reviews, then review_stats and/or list_reviews with filter "needs-response" or "negative": 25pts
      - Drafts replies (generate_review_reply / draft_review_response) and does NOT call publish_review_reply without explicit approval: 25pts
      - Presents a digest (rank deltas + review deltas + drafted replies), not raw JSON dumps: 10pts
  - name: onboard-business-keyword-tracking
    prompt: |
      Add "Bright Smile Dental" in Austin to my SEOG account and start tracking
      the keywords that matter for it, including how it ranks from the Hyde Park
      neighborhood specifically.
    rubric: |
      Score 0-100 by points achieved:
      - Uses search_places with the business name (optionally lat/lng bias) and picks a candidate placeId: 25pts
      - Imports via import_business with that placeId (idempotent) and captures the returned businessId: 25pts
      - Checks keyword_recommendations_cache (free) or runs keyword_recommendations before adding keywords: 20pts
      - add_keyword with locationLabel "Hyde Park" (or explicit searchLat/searchLng) for the neighborhood ask: 20pts
      - States that add_keyword/check_keyword spend credits before running them: 10pts
  - name: credit-exhaustion-handling
    prompt: |
      Run a full weekly sweep on every business in my SEOG account: fresh rank
      checks, review sync, competitor snapshots and a grid scan each.
    rubric: |
      Score 0-100 by points achieved:
      - Checks get_credit_balance (and/or list_feature_prices) before a multi-business paid sweep: 30pts
      - On an INSUFFICIENT_CREDITS tool error, reports the price, the balance and the top-up link from the message: 30pts
      - Stops the paid sweep instead of retrying the same failing call in a loop: 25pts
      - Still delivers a digest from FREE reads (list_keywords, review_stats, get_action_plan): 15pts
---

# SEOG — Local SEO via MCP

## Overview

SEOG (seog.ai) is an AI local-SEO platform for businesses that live on Google Maps.
Its remote MCP server exposes the whole product as **90 tools** — the same domain
services the web app's buttons call — so an agent can run a complete local-SEO
practice without opening a browser: import a business, track and rank-check keywords,
scan map visibility on a geo grid, sync and answer Google reviews, watch competitors,
audit the website and Search Console, publish Google posts, and generate PDF reports.

Endpoint: `https://api.seog.ai/mcp` (streamable HTTP), authenticated with a personal
token. **Every call runs as that SEOG account** — there is no anonymous mode.

## Instructions

### Setup

Sign up at https://app.seog.ai, then **Settings → MCP access** to issue a personal
token (shown once). Install either way:

**As a Claude Code plugin** (recommended — bundles this skill *and* the server config):

```
/plugin marketplace add TerminalSkills/skills
/plugin install seog@terminal-skills
```

Claude Code asks for the token during install and stores it in the credential store.
Non-interactively (scripts, CI):

```bash
claude plugin marketplace add TerminalSkills/skills
claude plugin install seog@terminal-skills --config mcp_token="$SEOG_MCP_TOKEN"
```

Verify with `/plugin list` (seog → enabled) and `/mcp` (seog → connected).

**As a skill + manually registered MCP server** (any client):

```bash
npx terminal-skills install seog
claude mcp add --transport http seog https://api.seog.ai/mcp \
  --header "Authorization: Bearer $SEOG_MCP_TOKEN"
```

For Codex / Gemini CLI / Cursor, register an HTTP MCP server with the same URL and
`Authorization: Bearer` header. Verify with `tools/list` — 90 tools from server
`seog-platform` (fewer on white-label accounts; see Guidelines).

### Account, plan and credits — read before running paid tools

- The token identifies a **SEOG account**; tools act only on that account's data.
- SEOG bills in **credits (CR)** on one rule: **anything that calls an external API is
  paid**, at the same price as the equivalent click in the app. Reads of already-stored
  data are free. That includes undo and delete — each replays a call against Google.
- `get_credit_balance` returns balance + plan; `list_feature_prices` prices every paid
  tool. **Check both before a multi-business sweep.**
- A paid tool that fails is **not** charged (deliver-or-refund), so a failed run never
  silently costs money.

### Tool map

Full parameter schemas and pricing notes: `references/mcp-tools.md`.
💳 = spends credits.

| Domain | Tools |
|---|---|
| Businesses | `list_businesses`, `get_business`, `search_places`💳, `import_business`💳, `update_business`, `delete_business` |
| Profile health | `get_business_audit`, `get_action_plan`, `list_recommendations`, `analyze_business_profile`, `set_recommendation_status` |
| Profile editing (writes to Google) | `apply_profile_fix`💳, `undo_profile_fix`💳, `draft_business_description`💳, `apply_business_description`💳, `undo_business_description`💳, `list_profile_photos`, `delete_profile_photo`💳, `get_profile_fix_options`, `list_recent_profile_edits` |
| Rankings | `list_keywords`, `add_keyword`💳, `check_keyword`💳, `refresh_rankings`💳, `keyword_history`, `keyword_recommendations`💳, `keyword_recommendations_cache`, `toggle_keyword`, `remove_keyword` |
| Map grid + AI answers | `run_grid_scan`💳, `get_latest_grid_scan`, `get_keyword_grid_scan`, `get_grid_history`, `get_grid_snapshot`, `check_ai_overview`💳, `get_ai_overview` |
| Reviews | `list_reviews`, `review_stats`, `sync_reviews`💳, `draft_review_response`, `generate_review_reply`💳, `publish_review_reply`💳, `verify_review_reply`💳 |
| Competitors | `discover_competitors`💳, `get_discovered_competitors`, `list_competitors`, `add_competitor`💳, `remove_competitor`, `set_competitor_watchlist`, `snapshot_competitor`💳, `refresh_competitors`💳, `compare_competitors`, `list_competitor_alerts`, `mark_competitor_alerts_read`, `scan_competitor_spam` |
| AI visibility | `get_ai_visibility`, `get_ai_visibility_pillars`, `get_ai_presence_matrix`, `check_ai_visibility`💳, `list_citations`, `check_citations`💳 |
| Website + Search Console | `get_website_analysis`, `refresh_website_analysis`💳, `refresh_website_all`💳, `get_search_performance`, `get_search_console_status`, `load_search_performance`💳 |
| Google posts | `list_posts`, `get_post_templates`, `validate_post`, `draft_post_content`💳, `publish_post`💳, `refresh_posts`💳, `delete_post`💳 |
| Google connection | `get_google_connection_status`, `get_gbp_performance`, `load_gbp_performance`💳, `load_gbp_keyword_history`💳, `list_gbp_import_locations`, `import_gbp_business`💳 |
| Account + reports | `get_dashboard`, `get_credit_balance`, `list_feature_prices`, `get_metrics_history`, `list_reports`, `create_report`, `get_report`, `delete_report`, `refresh_business_profile`💳, `refresh_business_overview`💳 |

### Core workflows

**Onboard** — `search_places` → `import_business` with the chosen `placeId`. If the
user's Google account is already connected, prefer `list_gbp_import_locations` →
`import_gbp_business`: it binds the owner connection, which is what unlocks review
replies and posts.

**Track rankings** — read `keyword_recommendations_cache` (free) before paying for
`keyword_recommendations`; `add_keyword` (optional `locationLabel` to rank from a
neighborhood); `check_keyword` for one live check or `refresh_rankings` for every
active keyword in a single charge; `keyword_history` for the trend; `run_grid_scan`
for map coverage across a grid (price scales with `gridSize`).

**Work reviews** — `sync_reviews` → `list_reviews(filter="needs-response")` →
`generate_review_reply` for a draft → **ask the user** → `publish_review_reply`
(publicly visible on Google) → `verify_review_reply` to confirm it landed.
`draft_review_response` saves a local draft and publishes nothing.

**Fix the profile** — `get_action_plan` / `get_business_audit` to find gaps, then
`apply_profile_fix` (phone, website, hours, name, status) or
`draft_business_description` → `apply_business_description`. Both write to the live
listing; `undo_profile_fix` / `undo_business_description` revert.

**Diagnose beyond the profile** — `get_website_analysis` + `get_search_performance`
(free reads of the last runs), `refresh_website_all` to re-run both in one charge;
`get_ai_visibility_pillars` and `list_citations` for AI-answer readiness and NAP
consistency.

## Examples

### Example 1: Weekly digest, credit-aware

> "How are my clients doing this week?"

```text
1. get_credit_balance → 180 CR (Growth plan) — enough for the sweep
2. list_businesses → 15 businesses
3. per business: refresh_rankings        # one charge for all active keywords
                 sync_reviews → list_reviews(filter="needs-response")
                 compare_competitors + list_competitor_alerts   # both free
4. generate_review_reply for each negative unanswered review → present the drafts
5. get_action_plan(businessId) → prioritized fixes for the digest
```

Publishing (`publish_review_reply`) waits for the owner's explicit yes.

### Example 2: Credits run out mid-sweep

```text
> run_grid_scan(businessId, keywordId, gridSize=7)
✗ Not enough credits: this action costs 45 CR and the account balance is 12 CR.
  Nothing was run and nothing was charged. Top up or upgrade at
  https://app.seog.ai/billing, then retry.
```

Correct behaviour: relay the numbers and the link, **stop the paid sweep** (do not
retry in a loop), and finish the digest from free reads — `list_keywords`,
`get_latest_grid_scan`, `review_stats`, `get_action_plan` all still work.

## Guidelines

- **Money is real.** Never run a paid tool the user did not ask for. Price a batch with
  `list_feature_prices` and check `get_credit_balance` first. Prefer bundled charges
  (`refresh_rankings`, `refresh_website_all`, `refresh_business_overview`) over
  per-item loops — they cost less for the same work.
- **Publishing is public and hard to undo.** `publish_review_reply`, `publish_post`,
  `apply_profile_fix` and `apply_business_description` write to the live Google
  listing. Quote the exact text and get approval first. Changing the business NAME can
  put the listing into Google re-verification — say so before doing it.
- **Irreversible tools require `confirm: true`** — `delete_business`, `delete_profile_photo`,
  `delete_post`, `remove_keyword`, `remove_competitor`, `delete_report`. Without the flag they
  refuse to run, by design: quote exactly what will be deleted, get a yes, then pass it.
  `delete_business` cascades reviews, keywords, rankings and competitors; deleted photos and
  posts cannot be restored. Prefer `toggle_keyword` when the user only wants to pause tracking.
- **Read the error instead of retrying.** Tool errors are self-describing:
  `INSUFFICIENT_CREDITS` gives price, balance and the top-up URL; `PLAN_REQUIRED` means
  the trial ended or no plan exists; `FEATURE_NOT_IN_PLAN` names the feature and plan.
  Relay them — a retry loop just fails again.
- **Some tools are absent by design.** White-label/agency accounts do not get the tools
  that return raw Google content (`search_places`, `check_keyword`, `sync_reviews`,
  `discover_competitors`, `run_grid_scan`, `import_gbp_business`, …). If a tool is "not
  found", say the account is not cleared for it rather than guessing.
- Photo upload and Google / Search Console OAuth stay in the web app (file bytes and a
  browser). Everything else is available here.
- IDs are UUIDs scoped to the token's account — a 404 on a valid-looking UUID usually
  means it belongs to another account.
- The token is a credential: never commit it, and scrub it from logs and transcripts. A
  401 means it was revoked in Settings — ask the user to reissue.
