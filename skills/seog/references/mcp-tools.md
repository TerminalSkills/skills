# SEOG MCP — tool reference

Endpoint: `https://api.seog.ai/mcp` (streamable HTTP, MCP protocol `2025-06-18`).
Auth: `Authorization: Bearer <personal MCP token>` (issued in app Settings → MCP access).
All IDs are UUIDs scoped to the token's account. `businessId` is required by every
per-business tool. Results return as JSON text content.

## Businesses

| Tool | Params | Notes |
|---|---|---|
| `list_businesses` | — | Full business records: place ids, rating/reviewCount, profileScore, categories, hours, photos |
| `get_business` | `businessId` | One business |
| `search_places` | `query` (2–200 ch), `lat?`, `lng?` | Google Places candidates for import; read-only |
| `import_business` | `placeId` | Idempotent per place |
| `update_business` | `businessId`, `name?`, `phone?`, `website?` | Mutable fields only |
| `delete_business` | `businessId` | **Irreversible** — cascades reviews/keywords/rankings/competitors |

## Keywords / rankings

| Tool | Params | Notes |
|---|---|---|
| `list_keywords` | `businessId` | Latest position + movement per tracked keyword |
| `add_keyword` | `businessId`, `keyword` (2–120 ch), `locationLabel?`, `searchLat?`, `searchLng?`, `searchRadius?` (500–50000 m, default 5000), `languageCode?` | Empty location ⇒ business location |
| `check_keyword` | `businessId`, `keywordId` | Live rank check, stores a snapshot (consumes quota) |
| `keyword_history` | `businessId`, `keywordId`, `days?` (1–365, default 30) | Stored snapshots |
| `keyword_recommendations` | `businessId` | Suggestions with volume where available |
| `toggle_keyword` | `businessId`, `keywordId`, `isActive` | Pause/resume scheduled checks |
| `remove_keyword` | `businessId`, `keywordId` | Deletes the keyword + its history |

## Reviews

| Tool | Params | Notes |
|---|---|---|
| `list_reviews` | `businessId`, `filter?` ∈ `all\|unanswered\|negative\|needs-response\|drafts\|responded\|risky`, `search?` | |
| `review_stats` | `businessId` | Counts, avg rating, distribution |
| `sync_reviews` | `businessId` | Pull latest from Google, upsert |
| `draft_review_response` | `businessId`, `reviewId`, `text` (1–4000 ch) | Saves a DRAFT — does not publish to Google |

## Competitors

| Tool | Params | Notes |
|---|---|---|
| `discover_competitors` | `businessId`, `radius?` (500–50000 m, default 5000), `minReviews?` | Nearby same-category, not yet tracked |
| `list_competitors` | `businessId` | Tracked, with threat score + movement |
| `add_competitor` | `businessId`, `placeId` | Takes an initial snapshot |
| `remove_competitor` | `businessId`, `competitorId` | |
| `set_competitor_watchlist` | `businessId`, `competitorId`, `isWatchListed` | Watched rivals raise alerts on snapshots |
| `snapshot_competitor` | `businessId`, `competitorId` | Refresh metrics, store snapshot, raise alerts (consumes quota) |

## Errors

- `401` — missing/revoked token (reissue in Settings)
- `404` on a UUID — the resource belongs to a different account or was deleted
- Validation errors echo the failing parameter constraint (e.g. radius bounds)
