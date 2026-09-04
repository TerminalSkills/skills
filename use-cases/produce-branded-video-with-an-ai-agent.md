---
title: Produce and Publish Branded Video Without a Video Team
slug: produce-branded-video-with-an-ai-agent
description: Wire an AI agent to the VidVibe MCP server to price, launch and follow AI video runs, keep every clip on-brand, batch a whole campaign from a spreadsheet, and publish the finished cuts to YouTube and TikTok — no editor, no render farm, no pipeline to build.
skills:
  - vidvibe
  - brand-guidelines
  - youtube-marketing
  - tiktok-marketing
category: content
tags:
  - video-production
  - mcp
  - ai-video
  - branding
  - publishing
---

# Produce and Publish Branded Video Without a Video Team

## The Problem

Marek is the only marketer at a 20-person SaaS company. Every feature release needs a
30-second vertical clip for LinkedIn, a 16:9 cut for YouTube, and a TikTok edit — three
videos, every two weeks, plus a product short for each of the 40 items in the catalogue.
A freelance editor charges €150 a video and turns work around in four days, so the
release video lands after the release.

The build-your-own route is not cheaper. Stitching an in-house pipeline —
text-to-speech, a video model API, stock footage, subtitle burn-in, FFmpeg assembly,
retry logic, storage, an upload integration per platform — is a month of engineering and
then a thing that breaks whenever a model version changes. Marek does not want to own a
render pipeline. He wants finished, on-brand video.

## The Solution

Connect the coding agent (Claude Code, Claude Desktop, Cursor, Gemini CLI) to the
**VidVibe** MCP server. VidVibe is a hosted AI video platform — brands, styles,
characters, and *flows* (node graphs that end in a Joiner that cuts clips together) —
and its endpoint exposes the whole product as **100 tools**. The agent prices a run,
launches it, follows it while it renders server-side, pulls the finished mp4, and pushes
it to a connected YouTube or TikTok channel.

Nothing is built and nothing is hosted: the render happens on the platform, the result
lands in the account's library, and the same run is visible in the web app if a human
wants to take over mid-way.

```bash
npx terminal-skills install vidvibe brand-guidelines youtube-marketing tiktok-marketing
```

## Step-by-Step Walkthrough

### Step 1: Connect the agent

Sign up at [app.vidvibe.io](https://app.vidvibe.io), then **Settings → API**
(`/api-keys`) → **Create Token**. Scope it to what the integration actually needs — for
this workflow: `flows:read`, `flows:execute`, `flow_runs:read`, `brands:read`,
`videos:read`, `videos:create`, `uploads:create`, `channels:read`,
`publishing:read`, `publishing:execute`, `billing:read`. The token (`vv_` + 64 hex) is
shown once.

```bash
claude mcp add --transport http vidvibe https://api.vidvibe.io/mcp \
  --header "Authorization: Bearer $VIDVIBE_TOKEN"
```

The token acts as the account: its runs spend the account's credits and its output shows
up in that user's library. Keep it in the environment, never in a committed config.

### Step 2: Define the brand once, inherit it everywhere

> "Create a VidVibe brand from our website and make it the default for my generations."

`create_brand_from_url("https://acme.dev")` pulls name, industry, audience, colours and
logo into a brand kit; VidVibe injects that context into every prompt made *for* that
brand. From then on `brand_id` is tri-state on `generate_video`, `generate_image` and
`create_character`: **omit** it to keep the last-used brand, pass `null` for explicitly
unbranded, pass an id for a specific one. (`launch_flow` is the exception — omitting
`brand_id` there means no brand, so pass it explicitly.) Use the **brand-guidelines**
skill to settle tone and visual rules first, then encode them as the brand plus a saved
style from `list_styles` — that is what keeps forty clips looking like one campaign.

### Step 3: Price the run, then launch it

Never launch blind. The agent's first call is the quote:

```
get_flow_price(flow_id, inputs)  → { price_cr: 30, balance_cr: 240, enough: true }
launch_flow(flow_id, inputs, brand_id)
                                 → { run_id, review_url, charged_credits: 30,
                                     poll: { tool: "get_flow_run", interval_seconds: 10 } }
```

VidVibe bills in credits (CR) and **prepays at launch, refunding a failed run**, so a
crash never quietly costs money. Pass `approval_mode: true` and the run pauses at its
review gates (`approve_flow_run` / `reject_flow_run`) — worth it for the first few runs
of a new flow, off once the template is trusted.

### Step 4: Follow the run instead of blocking on it

Every async tool returns a `poll` hint, and the agent should honour its cadence: 10 s for
a flow run, 5 s for a single step or a character, 15 s for a publish job. `get_flow_run`
answers with `poll_again_in_seconds` while work is in flight and `null` once it is done
*or* waiting on a human.

The important property: **the run is detached from the agent.** Closing the terminal,
losing the connection, or a tool timing out never stops it — the render finishes on the
platform and the result is saved to the account. A long batch does not need a babysat
session.

Not happy with scene three? `list_flow_run_steps` prices a re-run from each step and
`change_flow_run_step` restarts from that point with written feedback as a new run —
cheaper than regenerating the whole video.

### Step 5: Batch the catalogue, with a budget

> "Make a 20-second vertical short for every product in products.csv, on-brand, and
> leave them unlisted on YouTube for me to review."

Budget before the loop, not during it: `get_credit_balance` plus one `get_flow_price`
multiplied by the row count. If credits run short mid-batch the tool refuses in a way the
agent can act on, rather than throwing:

```json
{ "error": "insufficient_credits", "needed_cr": 30, "balance_cr": 15,
  "topup_url": "https://app.vidvibe.io/billing" }
```

The right behaviour is to stop the batch, relay the numbers and the link, and report the
`run_id`s that *did* launch — those are paid for and still rendering.

### Step 6: Publish to the channel

`list_channels` gives the connected `youtube_account_id`, `list_publishable` gives what
is ready to go out, and then:

```
publish_video_to_youtube(video_id, title, description, privacy: "unlisted", youtube_account_id)
get_publish_status(job_id)  every 15 s  → "published"
```

Publishing is public and hard to walk back, so the agent quotes the title, description
and privacy first and waits for a yes — `"unlisted"` for a first pass, flipped to public
once a human has watched it. The **youtube-marketing** and **tiktok-marketing** skills
supply the titles, descriptions, hooks and hashtags that decide whether the clip is
actually seen; VidVibe only makes and ships the file.

## Real-World Example

A two-person hardware startup had 38 SKUs and no product video for any of them. They
built one flow in the VidVibe canvas — product image in, generated B-roll, a character
reading a 20-second script, Joiner with burned subtitles and a branded end card — then
handed the agent a CSV.

The agent quoted the batch first (38 × 26 CR = 988 CR against a 1,200 CR balance),
launched them in sequence, and polled each run at 10 s. Six runs came back weak on the
same beat; `list_flow_run_steps` showed the script step was the cheap one to redo, so
`change_flow_run_step` re-ran only those six from that point with tighter copy instead of
regenerating 38 videos. All 38 landed unlisted on YouTube overnight with titles drafted
from the youtube-marketing skill. Cost: under a day of one person's attention, against
the €5,700 the same catalogue would have cost at freelance rates.

## Related Skills

- **vidvibe** — the MCP integration this workflow runs on: flows, runs, characters,
  brands, uploads and publishing, plus the credit rules every paid tool follows
- **brand-guidelines** — settle tone, palette and visual rules before encoding them as a
  VidVibe brand and style, so a batch of forty clips reads as one campaign
- **youtube-marketing** — titles, descriptions, thumbnails and the metadata that decides
  whether the published cut gets watched
- **tiktok-marketing** — hook structure, sound choice and posting cadence for the
  vertical edit of the same run
