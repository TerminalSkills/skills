---
title: Batch-Produce On-Brand Designs from a Spreadsheet with Canva
slug: batch-produce-brand-designs-with-canva
description: Turn one approved Canva brand template plus a CSV into hundreds of on-brand social posts, ads or certificates — autofilled, exported to PNG/PDF, and filed into folders by an agent, without a designer touching each variant.
skills:
  - canva
  - brand-guidelines
  - social-content
  - csv-parse
category: design
tags:
  - canva
  - design-automation
  - brand-templates
  - batch-processing
  - marketing-ops
---

# Batch-Produce On-Brand Designs from a Spreadsheet with Canva

## The Problem

Priya runs marketing ops for a franchise with 240 locations. Every seasonal campaign means
240 versions of the same poster: same layout, different city, address, offer price and
hero photo. The design team builds one master in Canva, then someone duplicates it 240
times and retypes four fields per copy. It takes three days, and roughly a dozen come out
wrong — a stale price, a city misspelled, a logo nudged out of the safe zone.

The workaround everyone reaches for is worse. Exporting the layout to a script that draws
text onto a PNG loses the brand: fonts drift, the design team can no longer edit it, and
every future change means editing code instead of a design.

## The Solution

Keep the master **in Canva** as a brand template and let an agent fill it. Canva's
**autofill** takes a brand template id and a map of field values and produces a real Canva
design — same fonts, same brand kit, still editable by the design team. The agent reads
the CSV, uploads each hero image as a Canva asset, fires one autofill job per row, polls
the jobs, exports the finished designs, and files them into a folder per region.

Two ways in, same underlying API: the **AI Connector MCP** (`https://mcp.canva.com/mcp`)
for a human-in-the-loop run, or the **Connect REST API** for an unattended job in CI.

```bash
terminal-skills install canva brand-guidelines social-content csv-parse
```

## Step-by-Step Walkthrough

### Step 1: Check the plan before building anything

Autofill and brand kits are **Enterprise** features; brand templates and resize need
**Pro**. `GET /v1/users/me/capabilities` answers this in one call, and it is the difference
between a working pipeline and a batch of `permission_denied` responses at row 1. On a Pro
account the fallback is `create-design-from-brand-template` plus manual editing — real,
but not unattended.

### Step 2: Connect the agent

For the interactive path:

```bash
claude mcp add --transport http canva https://mcp.canva.com/mcp
```

The first tool call opens a browser to authorize the account. For the unattended path,
register an integration at canva.com/developers and implement the OAuth 2.0 **PKCE** flow
(`code_challenge_method=S256`), requesting exactly the scopes the job needs:
`brandtemplate:meta:read`, `asset:write`, `design:content:write`, `folder:write`. Canva
implies nothing — `asset:write` does not grant `asset:read`.

### Step 3: Read the template's real field names

The single most common failure is guessing field names: a key the template doesn't have is
**silently ignored**, so the job succeeds and returns a design with empty placeholders.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.canva.com/rest/v1/brand-templates/DAFxyz123/dataset
# → { "headline": {"type":"text"}, "city": {"type":"text"},
#     "price": {"type":"text"}, "hero": {"type":"image"} }
```

Map CSV columns onto those exact keys once, and validate every row against them before
spending a single API call. Use the **brand-guidelines** skill to settle what actually
varies per location versus what must stay locked in the master.

### Step 4: Upload the images, then autofill each row

Images enter autofill as **asset ids**, not URLs, so each hero photo is uploaded first —
`POST /v1/asset-uploads` with the raw bytes and the name in the
`Asset-Upload-Metadata: {"name_base64": "..."}` header (or `upload-asset-from-url` over
MCP, which takes the URL directly).

```json
POST /v1/autofills
{ "brand_template_id": "DAFxyz123",
  "title": "Autumn promo — Leeds",
  "data": { "headline": {"type":"text","text":"30% off through October"},
            "city":     {"type":"text","text":"Leeds"},
            "price":    {"type":"text","text":"£24.99"},
            "hero":     {"type":"image","asset_id":"MSGxyz789"} } }
```

### Step 5: Treat every response as a job, not a result

Autofills, uploads and exports are all async. The POST returns
`{"job": {"id", "status": "in_progress"}}`; the design only exists once a GET on
`/v1/autofills/{jobId}` returns `success`, with the id at `job.result.design.id`. Poll on a
back-off (1s → 2s → 4s), never in a tight loop.

Rate limits are per user per minute and they are the real pacing constraint: **autofill
60/min, creates and exports 20/min, reads 100/min**. 240 rows is a throttled queue that
finishes in about twenty minutes — not a `Promise.all` that trips 429 on row 30.

### Step 6: Export, file, and hand back editable links

`POST /v1/exports` with `format: {"type":"png"}` (or `pdf` with `size: "a4"` for print),
poll `/v1/exports/{exportId}`, then download immediately — **export URLs die after 24
hours**. `POST /v1/folders/move` files each design into a folder per region so the local
teams can find theirs.

What Priya sends the franchisees is the design's `edit_url` (valid 30 days), not the export
link: a location that needs a tweak opens it in Canva and edits it, because it is a real
Canva design and not a flattened image. Pair the output with the **social-content** skill
for the caption and posting cadence that go with each variant.

## Real-World Example

A 240-location franchise ran its autumn campaign this way. The design team built one
master template and signed it off once. The agent validated all 240 CSV rows against the
template dataset up front and caught 9 bad rows before spending an API call — two missing
prices, seven cities with no hero image — and reported them instead of generating
half-empty posters.

The run took 23 minutes wall-clock, paced by the 60/min autofill limit, and produced 231
designs exported as print-ready A4 PDFs plus 1080×1080 PNGs, filed into 12 regional
folders. Three locations later asked for a different photo; they opened their `edit_url`
and changed it themselves in Canva. Against three days of manual duplication, the
measurable win was less the time than the error rate: zero stale prices, because no human
retyped one.

## Related Skills

- **canva** — the integration this workflow runs on: MCP connector, Connect API OAuth,
  autofill, exports, folders, and the tier gates and rate limits that shape the batch
- **brand-guidelines** — decide what varies per variant and what stays locked in the
  master template before you automate the duplication
- **social-content** — captions, formats and posting cadence for the variants once the
  designs exist
- **csv-parse** — validate and stream the source rows, so a malformed row is caught before
  it becomes an empty poster
