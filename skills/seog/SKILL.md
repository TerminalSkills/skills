---
name: seog
description: >-
  Manage local SEO from your terminal via the SEOG MCP server — Google Business Profile
  businesses, keyword rank tracking, review monitoring and reply drafts, and competitor
  intelligence. Use when: connecting an agent to seog.ai, tracking map-pack rankings,
  automating local SEO reports, monitoring competitors near a business, drafting review
  responses, or when the user mentions "SEOG", "local SEO", "map pack", "Google Business
  Profile rankings", or "keyword positions" for a physical business.
license: Apache-2.0
compatibility: "Any MCP client (Claude Code, Codex, Gemini CLI, Cursor); seog.ai account"
metadata:
  author: terminal-skills
  version: "1.0.0"
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
      - Uses draft_review_response for negative unanswered reviews and states drafts are NOT published to Google (owner approves in-app): 25pts
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
      - Uses keyword_recommendations before adding keywords (volume-informed choice): 20pts
      - add_keyword with locationLabel "Hyde Park" (or explicit searchLat/searchLng) for the neighborhood ask: 20pts
      - Optionally runs check_keyword for a first live snapshot and notes it consumes quota: 10pts
  - name: competitor-watchlist-setup
    prompt: |
      Who are the strongest untracked competitors within 1km of my café in SEOG,
      and set up ongoing monitoring for the most threatening one.
    rubric: |
      Score 0-100 by points achieved:
      - Uses discover_competitors with radius=1000 (and optionally minReviews) on the right businessId: 30pts
      - Justifies "most threatening" from the returned data (rating/review count/distance), not arbitrarily: 20pts
      - Tracks it via add_competitor with the placeId from discovery: 20pts
      - Enables alerts via set_competitor_watchlist isWatchListed=true: 20pts
      - Takes/refreshes a snapshot (snapshot_competitor or notes add_competitor snapshots initially): 10pts
---

# SEOG — Local SEO via MCP

## Overview

SEOG (seog.ai) is an AI local-SEO platform for businesses that live on Google Maps:
it tracks map-pack keyword rankings, syncs and analyzes Google reviews, and watches
nearby competitors. Its remote MCP server exposes the whole platform as 25 tools, so
an agent can run a complete local-SEO workflow — import a business, pick keywords,
check live rankings, draft review replies, monitor rivals — without opening a browser.

The server is a streamable-HTTP MCP endpoint at `https://api.seog.ai/mcp`,
authenticated with a personal token.

## Instructions

### Setup

1. Sign up at https://app.seog.ai and open **Settings → MCP access** to issue a
   personal MCP token (shown once — store it safely).
2. Register the server with your MCP client:

```bash
# Claude Code
claude mcp add --transport http seog https://api.seog.ai/mcp \
  --header "Authorization: Bearer <your-seog-mcp-token>"
```

For other clients, add an HTTP MCP server with the same URL and an
`Authorization: Bearer` header. Verify with a handshake: `tools/list` should
return 25 tools from server `seog-platform`.

### Tool map

All tools operate on the authenticated user's own portfolio. Full parameter
schemas: `references/mcp-tools.md`.

| Domain | Tools |
|---|---|
| Businesses | `list_businesses`, `get_business`, `search_places`, `import_business`, `update_business`, `delete_business` |
| Keywords / rankings | `list_keywords`, `add_keyword`, `check_keyword`, `keyword_history`, `keyword_recommendations`, `toggle_keyword`, `remove_keyword` |
| Reviews | `list_reviews`, `review_stats`, `sync_reviews`, `draft_review_response` |
| Competitors | `discover_competitors`, `list_competitors`, `add_competitor`, `remove_competitor`, `set_competitor_watchlist`, `snapshot_competitor` |

### Core workflows

**Onboard a business** — `search_places` (query + optional lat/lng bias) returns
Google Places candidates; `import_business` with the chosen `placeId` adds it
(idempotent per place). Everything else keys off the returned `businessId`.

**Track rankings** — `keyword_recommendations` suggests terms with volume;
`add_keyword` starts tracking (optional `locationLabel`/coords to rank-check from a
specific neighborhood); `check_keyword` runs a live map-pack check and stores a
snapshot; `keyword_history` returns up to 365 days of positions for trend analysis.

**Work reviews** — `sync_reviews` pulls the latest from Google; `list_reviews`
filters (`unanswered`, `negative`, `needs-response`, `risky`); `review_stats` gives
counts/average/distribution; `draft_review_response` saves a reply draft (it does
NOT publish to Google — the owner approves in-app).

**Watch competitors** — `discover_competitors` finds untracked same-category rivals
within a radius; `add_competitor` snapshots one by `placeId`;
`set_competitor_watchlist` opts it into alerting; `snapshot_competitor` refreshes
metrics and raises alerts on watched rivals.

## Examples

### Example 1: Weekly ranking + review digest

> "How is my coffee shop doing this week?"

```text
1. list_businesses → Starbucks (Sedlárska 12, Bratislava), id ff0ee55a-…, 4.3★/957
2. list_keywords(businessId) → "coffee shop bratislava" #2 (▲1), "espresso near me" #5 (=)
3. keyword_history(businessId, keywordId, days=7) → positions [4,4,3,3,2,2,2]
4. review_stats(businessId) → 957 reviews, 4.3 avg, 12 unanswered
5. list_reviews(businessId, filter="needs-response") → 3 negative since Monday
6. draft_review_response(businessId, reviewId, text="Hi Marek, thanks for flagging the
   slow service on Saturday — we've added a second barista at peak hours…")
```

Output a digest: rank movement, review deltas, drafted replies awaiting approval.

### Example 2: Competitive threat scan

> "Who's beating me nearby and what should I do about it?"

```text
1. discover_competitors(businessId, radius=1000, minReviews=100)
   → 20 cafés; La Putika 2 (4.2★/962 reviews, 264 m, no website),
     The Miners TownHall (4.8★/188, 80 m)
2. add_competitor(businessId, placeId="ChIJnzesEkOJbEcRCxv2Q0zJEls")   # La Putika 2
3. set_competitor_watchlist(businessId, competitorId, isWatchListed=true)
4. snapshot_competitor(businessId, competitorId) → threat score stored, alerts armed
```

Recommend actions from the data: the review-count race is tied (962 vs 957), but the
rating gap (4.2 vs 4.3) and the rival's missing website are exploitable advantages.

## Guidelines

- **`delete_business` is irreversible** — it cascades reviews, keywords, rankings, and
  competitors. Confirm with the user before calling it; prefer pausing keywords
  (`toggle_keyword`) when they just want to stop tracking.
- `check_keyword` and `snapshot_competitor` hit live Google data and consume account
  quota — batch on a schedule (daily/weekly) rather than in tight loops.
- `draft_review_response` only saves drafts. Never imply a reply was published. For
  regulated businesses (medical, legal), keep drafts generic — never confirm a
  customer's visit or treatment in public replies.
- IDs are UUIDs scoped to the token's account; a 404 on a valid-looking UUID usually
  means it belongs to another account.
- The token is a credential: never commit it, and scrub it from logs/transcripts.
- 401 responses mean the token was revoked in Settings — ask the user to reissue.
