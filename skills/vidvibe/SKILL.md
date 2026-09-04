---
name: vidvibe
description: >-
  Produce video with AI from the terminal via the VidVibe MCP server — price and launch
  flows, generate videos and images, create and lip-sync characters, edit a flow canvas,
  manage brands and styles, upload assets, and publish finished cuts to YouTube and TikTok.
  Use when: connecting an agent to vidvibe.io, generating short-form or marketing video,
  batch-producing branded clips, driving a video pipeline that keeps running server-side,
  publishing to a connected channel, or when the user mentions "VidVibe", "flow run",
  "character", "Joiner", or spending "credits" on video.
license: Apache-2.0
compatibility: "Any MCP client (Claude Code, Claude Desktop, Codex, Gemini CLI, Cursor); vidvibe.io account — generation tools spend credits"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: [video-generation, mcp, ai-video, youtube, characters]
evals:
  - name: price-before-launch
    prompt: |
      I'm connected to the VidVibe MCP server. Make me a 30-second product teaser
      for my brand from this script, using one of the ready-made flows.
    rubric: |
      Score 0-100 by points achieved:
      - Calls list_flows (or list_my_flows) and get_flow to read the flow's input schema: 20pts
      - Calls get_flow_price with the intended inputs and states price_cr vs balance_cr to the user BEFORE launching: 30pts
      - Passes brand_id from list_brands (or explains that omitting it keeps the last-used brand): 15pts
      - Launches with launch_flow, then polls get_flow_run at the returned poll.interval_seconds instead of a tight loop: 25pts
      - Returns the review_url / app_url link, not just raw JSON: 10pts
  - name: generation-two-step
    prompt: |
      Generate a 16:9 hero image for the landing page and put it in my VidVibe library.
    rubric: |
      Score 0-100 by points achieved:
      - Calls generate_image with aspect_ratio "16:9" and captures the returned flow_run_id: 30pts
      - Polls get_flow_run with that flow_run_id until status = "completed": 30pts
      - Calls save_image with the SAME flow_run_id to mint the library entry (does not assume generation alone saves it): 30pts
      - Surfaces the returned app_url / share link so the user can open the result: 10pts
  - name: insufficient-credits-handling
    prompt: |
      Run my "weekly product shorts" flow for all 12 products in this CSV.
    rubric: |
      Score 0-100 by points achieved:
      - Checks get_credit_balance and get_flow_price for one run, then multiplies out the batch cost before starting: 30pts
      - On an {"error": "insufficient_credits"} result, relays needed_cr, balance_cr and topup_url: 30pts
      - Stops the batch instead of retrying the same refused launch in a loop: 25pts
      - Reports which runs did launch (run_ids) so nothing paid for is lost: 15pts
---

# VidVibe — AI Video Production via MCP

## Overview

VidVibe (vidvibe.io) is an AI video-creation platform: brands, flows (node graphs that
end in a Joiner that cuts clips together), characters (AI presenters that lip-sync a
script), and one-form studios for video and image generation.

Its remote MCP server exposes the product as **100 tools** — the same services the app's
buttons call — so an agent can run a whole production without a browser: price a flow,
launch it, follow the run, fetch the cut, and publish it to YouTube or TikTok.

Endpoint: `POST https://api.vidvibe.io/mcp` (streamable HTTP, stateless, tools only —
no resources or prompts). **Every call runs as the token's VidVibe account**, spends its
credits, and writes rows the web app then shows.

## Instructions

### Setup

Sign up at https://app.vidvibe.io, then **Settings → API** (`/api-keys`) → **Create
Token** → pick scopes. The token (`vv_` + 64 hex) is shown **once**.

```bash
npx terminal-skills install vidvibe
claude mcp add --transport http vidvibe https://api.vidvibe.io/mcp \
  --header "Authorization: Bearer $VIDVIBE_TOKEN"
```

Claude Desktop / Codex / Gemini CLI / Cursor: register an HTTP MCP server with the same
URL and header. Clients that reserve `Authorization` for their own OAuth (claude.ai
custom connectors) may send `x-api-key: vv_…` instead — the server accepts either, and
`Authorization` wins if both are present. The server does **not** implement OAuth, so set
authentication to *None* and add the header manually.

Verify with `tools/list` — the response contains only the tools the token's scopes allow.

### Scopes

Tokens carry `resource:operation` scopes: `characters`, `flows` (read · **execute**),
`flow_runs`, `brands`, `styles`, `projects`, `videos`, `images`, `assets`, `uploads`,
`publishing` (read · **execute**), `channels`, `favorites`, `trash`, `billing`,
`showcase`, `blog`. A call outside them fails with *API key lacks permission for tool*.
The `blog_*` tools additionally need `role = admin` — scope alone is not enough. Tokens
cannot create tokens, change plans, manage the team, or edit system templates.

### Credits — read before running anything paid

- VidVibe bills in **credits (CR)**. Generation is priced by model and length; processing
  steps are a small flat amount; reads are free. New accounts get a 14-day trial with
  100 CR.
- Paid work is **prepaid at launch and refunded if the run fails**, so a failure never
  silently costs money. `cancel_flow_run` refunds the prepaid charge.
- A refused charge is a **JSON result, not an error**:
  `{"error": "insufficient_credits", "needed_cr", "balance_cr", "topup_url"}` or
  `{"error": "subscription_expired", "reason", "balance_cr", "topup_url"}`. A lapsed trial
  or expired subscription cannot spend whatever the balance says.
- `get_flow_price(flow_id, inputs)` returns `price_cr`, `balance_cr`, `enough` and charges
  nothing. **Call it and state the price before every paid tool.** `get_credit_balance`
  and `get_billing_info` are the account-level reads.

### Tool map

💳 = spends credits.

| Domain | Tools |
|---|---|
| Flows | `list_flows`, `list_my_flows`, `get_flow`, `get_flow_step`, `get_flow_price`, `launch_flow`💳, `regenerate_flow_run`💳, `run_flow`💳, `run_flow_and_wait`💳, `run_flow_step`💳, `export_flow`, `import_flow` |
| Runs | `list_flow_runs`, `get_flow_run`, `list_flow_run_steps`, `change_flow_run_step`💳, `approve_flow_run`, `reject_flow_run`, `retry_flow_node`, `continue_flow_run_yolo`, `cancel_flow_run`, `get_flow_run_video_url`, `view_flow_run_video`, `view_flow_step_output` |
| Canvas editing | `add_canvas_step`, `connect_steps`, `disconnect_steps`, `update_step_settings`, `add_motion_layer`, `edit_motion_layer`, `move_motion_layer`, `remove_motion_layer` |
| Projects (template pipelines) | `get_project_status`, `get_project_video_url`, `get_project_video`, `list_projects` |
| Videos | `list_videos`, `get_video`, `generate_video`💳, `save_video`, `view_video`, `rename_video`, `get_video_url`, `delete_video` |
| Images | `list_images`, `get_image`, `generate_image`💳, `save_image`, `view_image`, `get_image_url`, `delete_image` |
| Characters | `list_characters`, `get_character`, `get_character_versions`, `get_character_image`, `get_character_image_url`, `create_character`💳, `create_character_and_wait`💳, `edit_character`💳, `edit_character_and_wait`💳, `upload_character`💳, `set_active_character`, `rename_character`, `delete_character` |
| Brands & styles | `list_brands`, `get_brand`, `create_brand`, `create_brand_from_url`💳, `update_brand`, `delete_brand`, `list_styles` |
| Uploads & library | `upload_video`, `upload_image`, `create_upload`, `finalize_upload`, `list_assets`, `view_asset`, `list_showcase`, `list_favorites`, `toggle_favorite`, `list_trash`, `restore_from_trash`, `permanent_delete` |
| Publishing | `list_channels`, `list_publishable`, `publish_video_to_youtube`, `publish_video_to_tiktok`, `get_publish_status`, `list_publish_history` |
| Account | `get_credit_balance`, `get_billing_info` |
| Blog `[admin]` | `list_blog_categories`, `create_blog_category`, `update_blog_category`, `delete_blog_category`, `list_blog_posts`, `get_blog_post`, `create_blog_post`, `update_blog_post`, `delete_blog_post` |

### Polling — never block, never busy-loop

Every tool that starts async work returns
`poll: { tool, args, interval_seconds, note }`. Honour that interval: **10 s** for a flow
run, **5 s** for one step or a character, **15 s** for a pipeline project or a publish job.
`get_flow_run` returns `poll_again_in_seconds` while it is going and `null` when it is
finished *or* waiting on the user (`waiting_on_user: true` → `approve_flow_run` /
`reject_flow_run` / `retry_flow_node`). The `*_and_wait` variants check every 10 s and
return a snapshot after 10 minutes — **the work keeps going** either way. A paid run is
detached from the MCP request: disconnecting never stops it, and the result lands in the
account.

### Core workflows

**Run a ready-made flow** — `list_flows` → `get_flow` for the input schema →
`get_flow_price` → `launch_flow(flow_id, inputs, brand_id)` → poll `get_flow_run` →
`get_flow_run_video_url` for a signed mp4 (24 h). Pass `approval_mode: true` to pause at
review gates. Not happy with one step? `list_flow_run_steps` prices a re-run from each,
`change_flow_run_step` re-runs from there with feedback as a new run.

**Generate a single clip or image** — `generate_video` / `generate_image` return a
`flow_run_id`; poll `get_flow_run` on it, then call `save_video` / `save_image` **with the
same id** to mint the library entry. Generation alone does not save it. `generate_video`
takes `prompt`, `model` (default `veo-3.1`), `aspect_ratio` (`9:16` default), `duration`
(1–60 s, default 5), `reference_url`, `brand_id`, `style_id`.

**Brand and style on every generation** — `brand_id` is tri-state on `generate_image`,
`generate_video`, `create_character` and `run_flow_step`: **omit** = keep the user's
last-used brand, `null` = explicitly none, an id from `list_brands` = that brand.
(`launch_flow` differs: omitting it means *no* brand.) `style_id` comes from
`list_styles`; omit for none — an unknown or foreign id is a 404, never a silent fallback.

**Build a canvas** — `add_canvas_step(flow_id, kind, prompt, settings)` places an image /
video / text / audio card **without running it**, `connect_steps` wires a result into
another card's parameter (`"input"` on the Joiner puts a clip in the cut; `"audio"`,
`"subtitles"` are its other slots), `update_step_settings` patches `styleId` / `brandId`
(`"none"` = unbranded), and `run_flow_step` generates one card (charged, 1 CR floor).
System templates are read-only — fork one in the app first. `export_flow` → edit →
`import_flow` round-trips a flow as `.flow.json`.

**Publish** — `list_channels` for the connected account id, `list_publishable` for what
can go out, then `publish_video_to_youtube(video_id, title, description, privacy,
youtube_account_id)` or `publish_video_to_tiktok`, and poll `get_publish_status`.

## Examples

### Example 1: Priced, polled, published

> "Turn this week's changelog into a 30-second vertical short for our YouTube channel."

```text
1. get_credit_balance                       → 240 CR
2. list_flows → get_flow("shorts-explainer") → inputs: topic, script, duration
3. get_flow_price(flow_id, inputs)          → { price_cr: 30, balance_cr: 240, enough: true }
   → tell the user "this run costs 30 CR of your 240" and wait for a yes
4. list_brands → brand_id
5. launch_flow(flow_id, inputs, brand_id)   → { run_id, review_url, charged_credits: 30,
                                                poll: { tool: "get_flow_run", interval_seconds: 10 } }
6. get_flow_run(run_id) every 10 s          → status "running" … → "completed"
7. get_flow_run_video_url(run_id)           → signed .mp4 (24 h)  +  review_url for the app
8. list_channels → publish_video_to_youtube(video_id, title, privacy: "unlisted", youtube_account_id)
9. get_publish_status every 15 s            → "published"
```

### Example 2: The batch stops instead of looping

```text
> get_flow_price(flow_id, inputs)  → { price_cr: 30, balance_cr: 45 }
  12 products × 30 CR = 360 CR against a 45 CR balance — say so before launching anything.

> launch_flow(...)  # product 2
{ "error": "insufficient_credits", "needed_cr": 30, "balance_cr": 15,
  "topup_url": "https://app.vidvibe.io/billing" }
```

Correct behaviour: relay the numbers and the link, **stop the batch** (a retry just fails
again), and report what did launch — `run_id` for product 1 is real work already paid for
and still running server-side. Free reads still answer the rest: `list_flow_runs`,
`list_videos`, `get_credit_balance`.

## Guidelines

- **Money is real.** Never launch a paid tool the user did not ask for. `get_flow_price`
  first, state `price_cr` vs `balance_cr`, multiply out batches, and get a yes. Prefer one
  `launch_flow` over re-running steps one at a time.
- **Generation is two calls.** `generate_video` / `generate_image` start work; the library
  entry only exists after `save_video` / `save_image` with the same `flow_run_id`.
  Reporting "done" before saving loses the result.
- **Publishing is public.** `publish_video_to_youtube` / `publish_video_to_tiktok` push to
  a live channel. Quote the title, description and privacy, get approval, and prefer
  `privacy: "unlisted"` for a first pass.
- **Respect the poll hint.** Polling faster than `interval_seconds` gains nothing and
  risks rate limits; the work is detached from the connection, so waiting is safe. If a
  run reports `waiting_on_user: true`, ask the user — do not auto-`approve_flow_run`, and
  treat `continue_flow_run_yolo` (skip all remaining gates) as needing an explicit yes.
- **Deletes are real deletes.** `delete_video`, `delete_image`, `delete_character`,
  `delete_brand` and `permanent_delete` remove the user's work; `permanent_delete` empties
  trash beyond recovery. Name exactly what goes and confirm first.
- **Show links, not blobs.** Signed media URLs expire in ~24 h; every image/character
  result also carries a permanent `app_url` (`/share/image/:id`, `/share/avatar/:id`,
  `/share/video/:id`) — give that. Images come back as inline MCP `image` blocks; video
  cannot be played in chat, so video tools attach a **poster frame** and say so in
  `inline_preview`. A client cannot open a URL on its own — link it for the user.
- **Read the error instead of retrying.** `insufficient_credits` / `subscription_expired`
  carry the price, the balance and the top-up URL. "API key lacks permission" means a
  missing scope (or a non-admin token on a `blog_*` tool), not a bad request.
- **IDs are UUIDs scoped to the token's account** — a 404 on a valid-looking id usually
  means it belongs to another account.
- The token acts as the user: its runs, uploads and publishes appear in their library and
  spend their credits. Never commit it, scrub it from logs, and treat a 401 as revoked —
  ask them to reissue in Settings → API.
