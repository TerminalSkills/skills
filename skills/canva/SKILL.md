---
name: canva
description: >-
  Automate Canva from an agent — via the AI Connector MCP server (generate, find, edit,
  export designs in natural language) or the Connect REST API (OAuth 2.0 + PKCE, brand
  template autofill, asset uploads, exports, folders, comments). Use when: connecting an
  agent to Canva, batch-producing social posts or decks from a brand template and a
  spreadsheet, exporting designs to PDF/PNG/PPTX/MP4, uploading assets into a Canva
  account, building a Canva integration, or when the user mentions "Canva", "brand
  template", "autofill", "Connect API", or "mcp.canva.com".
license: Apache-2.0
compatibility: "Any MCP client for the connector; any HTTP client (curl, Node 18+, Python 3.9+) for the REST API. Canva account — Pro for resize/brand templates, Enterprise for autofill and brand kits"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [canva, design-automation, brand-templates, oauth, mcp]
---

# Canva — Design Automation via MCP and the Connect API

## Overview

Canva exposes two automation surfaces, and picking the wrong one wastes an afternoon:

| | **AI Connector MCP** | **Connect REST API** |
|---|---|---|
| Endpoint | `https://mcp.canva.com/mcp` | `https://api.canva.com/rest/v1/` |
| Auth | client-managed OAuth (browser once) | OAuth 2.0 + PKCE you implement |
| Best for | interactive work in a chat/agent session | batch jobs, servers, CI, other people's accounts |
| Editing | yes — editing transactions | no (create / autofill / export only) |

Use the **MCP connector** with a human in the loop; use the **Connect API** for
unattended runs, hundred-row fan-outs, or acting for users other than the developer.
(A third server, the *Dev MCP* at canva.dev, only serves docs for building Canva apps —
it does not touch designs.)

## Instructions

### Setup A — AI Connector MCP

```bash
claude mcp add --transport http canva https://mcp.canva.com/mcp
```

Clients without HTTP transport go through the bridge:
`npx -y mcp-remote@latest https://mcp.canva.com/mcp`. The first call opens a browser to
authorize the Canva account; the client stores the token. Verify with `tools/list`.

**Tools** (rate limit per user per minute in parentheses):

| Group | Tools |
|---|---|
| Designs | `generate-design` (20), `create-design-from-candidate` (20), `copy-design` (20), `search-designs` (100), `get-design` (100), `get-design-pages` (100), `get-design-content` (100), `get-presenter-notes` (100), `get-export-formats` (100), `get-design-thumbnail` (100) |
| Editing | `start-editing-transaction` (20), `perform-editing-operations` (50), `commit-editing-transaction` (20), `cancel-editing-transaction` (20) |
| Export / import | `export-design` (20), `import-design-from-url` (20), `resolve-shortlink` (unlimited) |
| Assets | `upload-asset-from-url` (30), `get-assets` (100) |
| Folders | `create-folder` (20), `list-folder-items` (100), `search-folders` (100), `move-item-to-folder` (100) |
| Comments | `comment-on-design` (100), `reply-to-comment` (20), `list-comments` (100), `list-replies` (100) |
| **Pro+** | `resize-design` (20), `search-brand-templates` (100), `list-brand-kits` (100), `create-design-from-brand-template` (20) |
| **Enterprise** | `autofill-design` (60), `get-brand-template-dataset` (100) |

**Editing is transactional.** `start-editing-transaction` → `perform-editing-operations`
(repeatable) → `commit-editing-transaction`. Nothing lands in the design until the commit;
cancel explicitly rather than dropping an open transaction.

### Setup B — Connect API (OAuth 2.0 + PKCE)

Create an integration at [canva.com/developers](https://www.canva.com/developers/), set
the redirect URI and scopes. The flow is PKCE-mandatory:

```bash
# 1. verifier (43–128 chars) + S256 challenge
VERIFIER=$(openssl rand -base64 96 | tr -d '\n=+/' | cut -c1-96)
CHALLENGE=$(printf %s "$VERIFIER" | openssl dgst -binary -sha256 | basenc --base64url | tr -d '=')

# 2. send the user here (scopes space-separated, state = CSRF nonce)
https://www.canva.com/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID\
&code_challenge=$CHALLENGE&code_challenge_method=S256&state=$NONCE\
&scope=design:content:write%20design:meta:read%20asset:write

# 3. exchange the code — Basic auth is base64("client_id:client_secret")
curl -X POST https://api.canva.com/rest/v1/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=authorization_code -d code="$CODE" -d code_verifier="$VERIFIER"
```

Access tokens last **4 hours**; refresh with `grant_type=refresh_token`. **Each refresh
token is single-use** — the response returns a new one, and losing it means re-consent,
so persist the rotation atomically before using the new access token.

### Scopes — nothing is implied

`asset:read` · `asset:write` · `design:meta:read` · `design:content:read` ·
`design:content:write` · `brandtemplate:meta:read` · `brandtemplate:content:read` ·
`brandtemplate:content:write` · `folder:read` · `folder:write` ·
`folder:permission:write` · `comment:read` · `comment:write` · `collaboration:event` ·
`profile:read` · `openid` · `profile` · `email`

`asset:write` does **not** grant `asset:read`. Request each one you call.

### The async job pattern — exports, autofills, uploads, imports, resizes, merges

Every heavy Connect operation is a job: the POST returns
`{"job": {"id", "status": "in_progress"|"success"|"failed"}}`, and the result exists only
once a GET on the job returns `success`. Never treat the POST response as the result.

| Operation | POST | Poll |
|---|---|---|
| Export | `/v1/exports` | `/v1/exports/{exportId}` |
| Autofill | `/v1/autofills` | `/v1/autofills/{jobId}` |
| Asset upload | `/v1/asset-uploads` | `/v1/asset-uploads/{jobId}` |
| URL asset upload | `/v1/url-asset-uploads` | `/v1/url-asset-uploads/{jobId}` |
| Design import | `/v1/imports` · `/v1/url-imports` | same path + `/{jobId}` |
| Resize | `/v1/resizes` | `/v1/resizes/{jobId}` |

Poll on a back-off (1s → 2s → 4s, cap ~5s). Tight loops burn the 100 req/min read budget
long before the job finishes.

### Endpoint map (Connect API)

- **Designs** — `POST /v1/designs` (`design_type` preset `doc|email|presentation|whiteboard`
  or custom 40–8000 px, max 25 MP area; or from `design_id` / `brand_template_id`),
  `GET /v1/designs` (`query`, `ownership=any|owned|shared`, `sort_by`, `limit` 1–100,
  `continuation`), `GET /v1/designs/{id}`, `/pages`, `/export-formats`, `/dataset`
- **Assets** — `POST /v1/asset-uploads` with `Content-Type: application/octet-stream`, the
  raw bytes as the body, and the name in a header: `Asset-Upload-Metadata:
  {"name_base64":"<base64 of a ≤50-char name>"}`. `GET`/`PATCH`/`DELETE /v1/assets/{id}`
- **Autofill** — `POST /v1/autofills` with `brand_template_id` + `data` keyed by the
  template's field names
- **Brand templates** — `GET /v1/brand-templates`, `/{id}`, `/{id}/dataset` (the dataset
  is the field list autofill expects — read it, never guess field names)
- **Exports** — `POST /v1/exports`, formats `pdf`, `png`, `jpg` (`quality` 1–100 required),
  `gif`, `pptx`, `mp4` (`quality` required), `csv`, `html_bundle`, `html_standalone`
- **Folders** — `POST /v1/folders`, `GET /v1/folders/{id}/items`, `POST /v1/folders/move`
- **Comments** — threads and replies on a design; **Analytics** — views, viewers, links
- **User** — `GET /v1/users/me`, `/me/profile`, `/me/capabilities` (check tier here before
  calling a gated endpoint)

Paginate with `continuation`: pass the token from the previous response until it is absent.

## Examples

### Example 1: 240 localized social posts from one brand template

> "Fill our 'Q3 Promo' brand template with every row in offers.csv and export PNGs."

```bash
# 1. Read the template's real field names — never guess them
curl -H "Authorization: Bearer $TOKEN" \
  https://api.canva.com/rest/v1/brand-templates/DAFxyz123/dataset
# → { "dataset": { "headline": {"type":"text"}, "price": {"type":"text"},
#                  "hero": {"type":"image"} } }

# 2. Product shot → asset (poll the job, capture asset.id)
curl -X POST https://api.canva.com/rest/v1/asset-uploads \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Asset-Upload-Metadata: {"name_base64":"aGVyby1hdXR1bW4ucG5n"}' \
  -H "Content-Type: application/octet-stream" --data-binary @hero-autumn.png

# 3. One autofill job per row (60/min — throttle the loop)
curl -X POST https://api.canva.com/rest/v1/autofills \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"brand_template_id":"DAFxyz123","title":"Autumn promo — Berlin",
       "data":{"headline":{"type":"text","text":"30% off through October"},
               "price":{"type":"text","text":"€24.99"},
               "hero":{"type":"image","asset_id":"MSGxyz789"}}}'
# → {"job":{"id":"af_01H...","status":"in_progress"}}

# 4. Poll → success gives job.result.design.id → POST /v1/exports → poll → job.urls[]
```

Scopes needed: `brandtemplate:meta:read`, `asset:write`, `design:content:write`.
Autofill is **Enterprise-only** — on a lower tier this returns `permission_denied`, and
the fallback is `create-design-from-brand-template` (Pro) followed by manual editing.

### Example 2: Same job, one prompt, over MCP

> "Find our Q3 Promo brand template, make a version for the Berlin offer with this
> product shot, and export it as a PNG."

```text
search-brand-templates("Q3 Promo")        → template id
get-brand-template-dataset(id)            → headline / price / hero  (Enterprise)
upload-asset-from-url("https://cdn.acme.dev/hero-autumn.png")  → asset id
autofill-design(id, { headline, price, hero })                 → design id + edit_url
export-design(design_id, format: "png")   → download URL (valid 24 h)
```

Give the user the `edit_url` — it lasts 30 days and opens in Canva, while the export URL
dies in 24 hours. If `autofill-design` is missing from `tools/list`, the account is not
Enterprise: say so instead of retrying.

## Guidelines

- **Every URL expires, at a different rate.** Thumbnails ~15 min, export downloads 24 h,
  `edit_url` / `view_url` 30 days. Download export bytes at once; hand humans the
  `edit_url`, never a signed export link.
- **Read the dataset before autofilling.** `GET /v1/brand-templates/{id}/dataset` (or
  `get-brand-template-dataset`) returns the exact field names and types. A guessed key is
  silently ignored, producing a design with empty placeholders rather than an error.
- **Tier gates are hard.** Resize and brand templates need Pro; autofill and brand kits
  need Enterprise. Check `GET /v1/users/me/capabilities` before a batch and read
  `permission_denied` as "wrong plan", not "wrong request".
- **Limits are per user, per minute:** creates and exports 20, autofill 60, reads 100.
  A 240-row batch is a throttled queue, not a `Promise.all`. Back off on 429.
- **Jobs are not results.** A `200` on `POST /v1/exports` means *accepted*. Poll until
  `success`, and handle `failed` by reading `job.error.code` rather than re-submitting.
- **Blank designs vanish.** A design created via the API and never edited is deleted after
  7 days. Autofill or edit it in the same run if it needs to persist.
- **Refresh tokens are single-use.** Store the rotated token before the next call; a lost
  rotation means the user must re-consent through the full PKCE flow.
- **PKCE is mandatory**; the `code_verifier` and `client_secret` stay server-side. A Canva
  integration cannot be driven safely from client-side code.
- Design ids (`DAF…`), asset ids (`MSG…`) and job ids are scoped to the authorized
  account; a 404 on a valid-looking id usually means it belongs to a different team.
