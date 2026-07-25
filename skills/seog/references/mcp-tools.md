# SEOG MCP — tool reference (90 tools)

Endpoint: `https://api.seog.ai/mcp` (streamable HTTP, MCP protocol `2025-06-18`).
Auth: `Authorization: Bearer <personal MCP token>` (issued in app Settings → MCP access).
All IDs are UUIDs scoped to the token's account. `businessId` is required by every
per-business tool. Results return as JSON text content.

💳 = spends credits (same price as the equivalent click in the app). A failed paid tool
is refunded automatically, so a failure never costs anything. `list_feature_prices`
returns the live price of every 💳 tool; `get_credit_balance` returns what is left.

🔒 = returns raw Google content, so it is registered **only** for cleared accounts
(standalone customers and admins). White-label / agency tokens never see these tools —
`tools/list` omits them and naming one returns "not found".

## Businesses

| Tool | Params | Notes |
|---|---|---|
| `list_businesses` | — | Place ids, rating/reviewCount, profileScore, categories, hours, photos |
| `get_business` | `businessId` | One business |
| `search_places` 💳🔒 | `query` (2–200 ch), `lat?`, `lng?` | Google Places candidates for import |
| `import_business` 💳🔒 | `placeId` | Idempotent per place |
| `update_business` | `businessId`, `name?`, `phone?`, `website?` | SEOG's own record only. The next profile pull overwrites it with Google's values — use `apply_profile_fix` to change what customers see |
| `delete_business` | `businessId`, **`confirm: true`** | **Irreversible** — cascades reviews/keywords/rankings/competitors |

## Profile health

| Tool | Params | Notes |
|---|---|---|
| `get_business_audit` | `businessId` | Field-by-field completeness + score |
| `get_action_plan` | `businessId` | Merged, prioritized "what to do next" across every module |
| `list_recommendations` | `businessId` | Stored recommendations (priority, type, status) |
| `analyze_business_profile` | `businessId` | Recompute recommendations from stored data (no Google call) |
| `set_recommendation_status` | `businessId`, `recommendationId`, `status` ∈ `PENDING\|IN_PROGRESS\|COMPLETED\|DISMISSED` | |

## Profile editing — writes to the live Google listing

| Tool | Params | Notes |
|---|---|---|
| `apply_profile_fix` 💳 | `businessId`, `fixId` ∈ `name\|phone\|website\|status\|hours`, `value?`, `periods?`, `attributes?` | Public on Google. `name` can trigger re-verification |
| `undo_profile_fix` | `businessId`, `fixId` | Reverts the last apply (free) |
| `draft_business_description` 💳 | `businessId` | Returns text only; writes nothing |
| `apply_business_description` 💳 | `businessId`, `text` (≤750 ch) | Public on Google |
| `undo_business_description` | `businessId` | Restores the previous description |
| `list_profile_photos` | `businessId` | `{name, url}` of live profile photos |
| `delete_profile_photo` | `businessId`, `photoName`, **`confirm: true`** | Removes it publicly; the bytes are not held anywhere, so it cannot be restored |
| `get_profile_fix_options` | `businessId`, `fixId` | Options Google's catalog offers for an attribute fix |
| `list_recent_profile_edits` | `businessId` | Edits since the last profile refresh (may still be in Google review) |

## Rankings

| Tool | Params | Notes |
|---|---|---|
| `list_keywords` | `businessId` | Latest position + movement per tracked keyword |
| `add_keyword` 💳 | `businessId`, `keyword` (2–120 ch), `locationLabel?`, `searchLat?`, `searchLng?`, `searchRadius?` (500–50000 m, default 5000), `languageCode?` | Empty location ⇒ business location |
| `check_keyword` 💳🔒 | `businessId`, `keywordId` | Live rank check + snapshot |
| `refresh_rankings` 💳 | `businessId` | Re-checks EVERY active keyword in one charge — cheaper than looping `check_keyword` |
| `keyword_history` | `businessId`, `keywordId`, `days?` (1–365, default 30) | Stored snapshots |
| `keyword_recommendations` 💳 | `businessId` | Suggestions with search volume |
| `keyword_recommendations_cache` | `businessId` | The last run's result, free |
| `toggle_keyword` | `businessId`, `keywordId`, `isActive` | Pause/resume scheduled checks |
| `remove_keyword` | `businessId`, `keywordId`, **`confirm: true`** | Deletes the keyword + its whole rank history; `toggle_keyword` pauses instead |

## Map grid + AI answers

| Tool | Params | Notes |
|---|---|---|
| `run_grid_scan` 💳🔒 | `businessId`, `keywordId`, `gridSize?` (3–9, default 5), `cellSize?` (100–10000 m, default 1000) | Rank at every grid point; **price scales with `gridSize²`** |
| `get_latest_grid_scan` | `businessId` | Most recent scan across keywords |
| `get_keyword_grid_scan` | `businessId`, `keywordId`, `gridSize?` | Latest scan for one keyword |
| `get_grid_history` | `businessId`, `keywordId`, `limit?` (1–100, default 30) | Avg rank + top-3 coverage per scan |
| `get_grid_snapshot` | `businessId`, `keywordId`, `snapshotId` | One full past scan |
| `check_ai_overview` 💳 | `businessId`, `keywordId`, `engine?` ∈ `gemini\|chatgpt\|claude` | Is the business named in the AI answer |
| `get_ai_overview` | `businessId`, `keywordId` | Latest stored check per engine |

## Reviews

| Tool | Params | Notes |
|---|---|---|
| `list_reviews` | `businessId`, `filter?` ∈ `all\|unanswered\|negative\|needs-response\|drafts\|responded\|risky`, `rating?`, `comment?`, `sort?`, `search?` | |
| `review_stats` | `businessId` | Counts, avg rating, distribution, response rate |
| `sync_reviews` 💳🔒 | `businessId` | Pull latest from Google, upsert |
| `draft_review_response` | `businessId`, `reviewId`, `text` (1–4000 ch) | Saves a DRAFT — publishes nothing |
| `generate_review_reply` 💳 | `businessId`, `reviewId`, `tone?` ∈ `apologetic\|professional\|grateful\|firm` | AI draft; publishes nothing |
| `publish_review_reply` 💳 | `businessId`, `reviewId`, `text` | **Public on Google.** Needs the owner Google connection |
| `verify_review_reply` 💳 | `businessId`, `reviewId` | Reads the reply back from Google to confirm it is live |

## Competitors

| Tool | Params | Notes |
|---|---|---|
| `discover_competitors` 💳🔒 | `businessId`, `radius?` (500–50000 m, default 5000), `minReviews?` | Returns `yourPosition` + per-candidate `searchPosition`/`outranksYou` so you can say who is ahead **before** tracking |
| `get_discovered_competitors` | `businessId` | Last discovery result, free |
| `list_competitors` | `businessId` | Tracked, with threat score + movement |
| `add_competitor` 💳🔒 | `businessId`, `placeId` | Takes an initial snapshot |
| `remove_competitor` | `businessId`, `competitorId`, **`confirm: true`** | Also drops its snapshot history |
| `set_competitor_watchlist` | `businessId`, `competitorId`, `isWatchListed` | Watched rivals raise alerts on snapshots |
| `snapshot_competitor` 💳🔒 | `businessId`, `competitorId` | Refresh metrics + raise alerts |
| `refresh_competitors` 💳 | `businessId` | Snapshots every tracked rival in one charge |
| `compare_competitors` | `businessId` | Head-to-head comparison + gaps |
| `list_competitor_alerts` | `businessId`, `unreadOnly?` | Rating/review/photo/profile changes |
| `mark_competitor_alerts_read` | `businessId`, `alertId?` | Omit `alertId` to clear all |
| `scan_competitor_spam` | `businessId` | Guideline violations worth reporting |

## AI visibility + citations

| Tool | Params | Notes |
|---|---|---|
| `get_ai_visibility` | `businessId` | Readiness score + per-signal breakdown |
| `get_ai_visibility_pillars` | `businessId` | Presence / Recommendations / Authority |
| `get_ai_presence_matrix` | `businessId` | Per-keyword presence across AI engines + cited sources |
| `check_ai_visibility` 💳🔒 | `businessId` | Re-pull profile + review signals, recompute |
| `list_citations` | `businessId` | NAP consistency per directory |
| `check_citations` 💳 | `businessId` | Re-scan the directories |

## Website + Search Console

| Tool | Params | Notes |
|---|---|---|
| `get_website_analysis` | `businessId` | Last audit: score, checks, PageSpeed, action plan |
| `refresh_website_analysis` 💳 | `businessId` | Re-crawl + recompute |
| `refresh_website_all` 💳 | `businessId` | Audit **and** Search Console in ONE charge (GSC best-effort) |
| `get_search_performance` | `businessId` | Stored clicks/impressions/top queries |
| `get_search_console_status` | `businessId` | Whether GSC is connected + property matched |
| `load_search_performance` 💳 | `businessId` | Live 16-week load; fails (refunded) with `NO_WEBSITE` / `GSC_NOT_CONNECTED` |

## Google posts

| Tool | Params | Notes |
|---|---|---|
| `list_posts` | `businessId` | Stored mirror of published posts |
| `get_post_templates` | `businessId` | Templates with placeholders resolved |
| `validate_post` | `businessId`, draft fields | Free rule check — always run before publishing |
| `draft_post_content` 💳 | `businessId`, `topicType`, `templateKey?`, `instructions?` | AI copy; publishes nothing |
| `publish_post` 💳 | `businessId`, `topicType` ∈ `STANDARD\|EVENT\|OFFER`, `summary?` (≤1500 ch), `ctaType?`, `ctaUrl?`, `eventTitle?` (≤58 ch), `eventStart/EndDate`, `eventStart/EndTime`, `photoUrl?`, `scheduledAt?` | **Public on Google.** `scheduledAt` uses Google-native scheduling |
| `refresh_posts` | `businessId` | Re-sync LIVE/REJECTED states |
| `delete_post` | `businessId`, `postId`, **`confirm: true`** | Removes it publicly; republishing costs a new `publish_post` |

## Google connection

| Tool | Params | Notes |
|---|---|---|
| `get_google_connection_status` | `businessId` | Connect flow itself needs a browser |
| `get_gbp_performance` | `businessId` | Stored views/calls/directions bundle |
| `load_gbp_performance` 💳 | `businessId` | Buys ~18 months of daily performance; later reads are free |
| `load_gbp_keyword_history` 💳 | `businessId`, `months?` (1–18, default 12) | GBP search-terms report |
| `list_gbp_import_locations` 🔒 | — | Locations the connected Google account manages |
| `import_gbp_business` 💳🔒 | `locationName` | Creates the business **and** binds its Google connection |

## Account + reports

| Tool | Params | Notes |
|---|---|---|
| `get_dashboard` | — | Portfolio summary across all businesses |
| `get_credit_balance` | — | Buckets, total CR, plan status |
| `list_feature_prices` | — | Live CR price of every paid feature |
| `get_metrics_history` | `businessId`, `days?` (1–365, default 90) | Daily snapshots for trends |
| `list_reports` / `get_report` | `businessId` (+ `reportId`) | PDF reports |
| `delete_report` | `businessId`, `reportId`, **`confirm: true`** | Deletes the stored PDF |
| `create_report` | `businessId` | Queues generation; poll `get_report` until ready |
| `refresh_business_profile` 💳🔒 | `businessId` | Re-pull the GBP profile |
| `refresh_business_overview` 💳🔒 | `businessId` | Profile **and** reviews in one charge |

## Irreversible tools

Six tools take a required **`confirm: true`**: `delete_business`, `delete_profile_photo`,
`delete_post`, `remove_keyword`, `remove_competitor`, `delete_report`. Omitting it (or
passing `false`) is a validation error and nothing is touched — MCP has no confirmation
channel of its own, so the schema is where intent gets enforced. Show the user exactly
what will be deleted, get a yes, then pass the flag.

## Errors

Tool errors are plain text and self-describing — read them, don't retry blindly:

| Condition | What the message says |
|---|---|
| Out of credits | `Not enough credits: this action costs N CR and the account balance is M CR. Nothing was run and nothing was charged. Top up or upgrade at https://app.seog.ai/billing` |
| Trial ended / no plan | `The SEOG free trial on this account has ended…` / `This account has no active SEOG plan…` — reads still work |
| Feature not in plan | Names the feature and the current plan key, with the upgrade link |
| Plan limit reached | e.g. `Your plan tracks up to 10 keywords per business — upgrade to Growth to add more` |
| Missing/revoked token | `401 Unauthorized` — reissue in Settings → MCP access |
| 404 on a valid UUID | The resource belongs to another account, or was deleted |
| Tool "not found" | The account is not cleared for that 🔒 tool (white-label/agency), or the name is wrong |
