---
name: heygen-api
description: >-
  HeyGen API for AI video generation — talking avatar videos, lip-sync, and
  video translation. Use when creating personalized video at scale, AI avatars
  for marketing, automated video content pipelines, or video localization with
  lip-sync in any language.
license: Apache-2.0
compatibility: "HeyGen API v3 (v1/v2 endpoints are retired on October 31, 2026). Python 3.9+ with requests. HeyGen API key required."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["heygen", "video-generation", "avatar", "ai-video", "lip-sync"]
  use-cases:
    - "Generate personalized sales outreach videos with AI avatars at scale"
    - "Translate and lip-sync marketing videos into multiple languages"
    - "Automate talking-head video creation from scripts"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# HeyGen API

## Overview

HeyGen provides REST APIs to create talking avatar videos, clone voices, translate videos with lip-sync, and run real-time avatar sessions. Use it to automate video content production at scale — from personalized sales outreach to multilingual marketing campaigns.

The current API is v3 (`/v3/...`). The v1 and v2 endpoints this skill used before (`/v2/video/generate`, `/v1/video_status.get`, `/v2/video_translate`) are retired on October 31, 2026 and already answer with a `Deprecation` header and a `warning` object naming the v3 replacement.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install requests
read -rs HEYGEN_API_KEY && export HEYGEN_API_KEY   # paste the key; it stays out of shell history

# Check the key and see the remaining credits
curl -s https://api.heygen.com/v3/users/me -H "X-Api-Key: $HEYGEN_API_KEY"
```

Base URL: `https://api.heygen.com`. Keys are created in the API dashboard at `https://app.heygen.com/developers/api`. Every generation call spends credits.

## Core Concepts

- **Avatar look**: Avatars are groups (the character) that contain looks (outfit, pose). The look `id` is the `avatar_id` you send when creating a video.
- **Voice**: TTS or cloned voice that speaks the script. When `voice_id` is omitted, the look's default voice is used.
- **Video**: Generated asynchronously — status goes `pending` → `processing` → `completed` or `failed`; poll, or get a webhook.
- **Engine**: Avatar IV renders by default; `"engine": {"type": "avatar_v"}` or `avatar_iii` only for looks that list it in `supported_api_engines`.
- **Video Translation**: Send an existing video; HeyGen re-dubs it in the target languages with matching lip-sync.

## Instructions

### Step 1: List available avatars and voices

```python
import os
import time
import requests

BASE = "https://api.heygen.com"
HEADERS = {"X-Api-Key": os.environ["HEYGEN_API_KEY"]}

def api(method: str, path: str, **kwargs) -> dict:
    """Call the API; wait out rate limits, raise with the API's own error code and message."""
    headers = {**HEADERS, **kwargs.pop("headers", {})}   # lets a call add e.g. Idempotency-Key
    while True:
        r = requests.request(method, f"{BASE}{path}", headers=headers, timeout=60, **kwargs)
        if r.ok:
            return r.json()
        err = r.json().get("error", {})
        if r.status_code == 429 and err.get("code") == "rate_limit_exceeded":
            time.sleep(int(r.headers.get("Retry-After", "5")))
            continue
        raise RuntimeError(f"{r.status_code} {err.get('code')}: {err.get('message')}")

def list_all(path: str, **params) -> list:
    """Follow cursor pagination: has_more / next_token."""
    items, token = [], None
    while True:
        page = api("GET", path, params={**params, **({"token": token} if token else {})})
        items += page["data"]
        if not page.get("has_more"):
            return items
        token = page["next_token"]

looks = list_all("/v3/avatars/looks", ownership="public", limit=50)   # "private" for your own avatars
voices = list_all("/v3/voices", type="public", language="English", limit=100)

for look in looks[:5]:
    print(f"Avatar look: {look['id']} - {look['name']} ({look['avatar_type']})")
for v in voices[:5]:
    print(f"Voice: {v['voice_id']} - {v['name']} ({v['language']})")
```

### Step 2: Create a talking-head video

```python
def create_avatar_video(script: str, avatar_id: str, voice_id: str = "", title: str = "Avatar video") -> str:
    """Submit a video generation job and return the video_id."""
    body = {
        "type": "avatar",
        "avatar_id": avatar_id,          # a look id from /v3/avatars/looks
        "script": script,                # at most 5,000 characters
        "title": title,
        "resolution": "1080p",           # "720p", "1080p" or "4k"
        "aspect_ratio": "16:9",          # also "9:16", "1:1", "4:5", "5:4", "auto"
        "background": {"type": "color", "value": "#FFFFFF"},
        "voice_settings": {"speed": 1.0},  # 0.5–1.5
    }
    if voice_id:
        body["voice_id"] = voice_id
    return api("POST", "/v3/videos", json=body)["data"]["video_id"]

video_id = create_avatar_video(
    script="Hi Dana, I wanted to personally show how Brightline cut cloud costs by 30% for teams like yours.",
    avatar_id=looks[0]["id"],
    voice_id=voices[0]["voice_id"],
    title="Outreach - Dana at Brightline",
)
print(f"Video submitted: {video_id}")
```

To lip-sync your own recording instead of a script, replace `script` and `voice_id` with `audio_url` (or `audio_asset_id`); the two are mutually exclusive.

### Step 3: Poll video status

```python
def wait_for_video(video_id: str, poll_interval: int = 10, timeout: int = 900) -> dict:
    """Poll until the video is ready; return the video record."""
    start = time.time()
    while True:
        video = api("GET", f"/v3/videos/{video_id}")["data"]
        print(f"[{int(time.time() - start)}s] Status: {video['status']}")
        if video["status"] == "completed":
            return video
        if video["status"] == "failed":
            raise RuntimeError(f"{video.get('failure_code')}: {video.get('failure_message')}")
        if time.time() - start > timeout:
            raise TimeoutError(f"Video not ready after {timeout}s")
        time.sleep(poll_interval)

video = wait_for_video(video_id)
print(f"Video ready: {video['video_url']} ({video['duration']}s)")
```

### Step 4: Download the result

```python
def download_video(url: str, output_path: str = "output.mp4") -> str:
    r = requests.get(url, stream=True, timeout=120)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"Downloaded: {output_path} ({size_mb:.1f} MB)")
    return output_path

download_video(video["video_url"], "dana_brightline_outreach.mp4")
```

### Video Translation (lip-sync)

```python
def translate_video(video_url: str, languages: list[str], title: str = "Translated video") -> list[str]:
    """languages are names from GET /v3/video-translations/languages, e.g. "Spanish", "French"."""
    body = {
        "video": {"type": "url", "url": video_url},   # or {"type": "asset_id", "asset_id": ...}
        "output_languages": languages,
        "mode": "speed",                              # "precision" for better lip-sync, slower
        "title": title,
    }
    return api("POST", "/v3/video-translations", json=body)["data"]["video_translation_ids"]

def wait_for_translation(translation_id: str, poll_interval: int = 15) -> dict:
    while True:
        job = api("GET", f"/v3/video-translations/{translation_id}")["data"]
        if job["status"] == "completed":
            return job
        if job["status"] == "failed":
            raise RuntimeError(job.get("failure_message"))
        time.sleep(poll_interval)   # other statuses: "pending", "running"
```

### Webhook setup (optional)

Two ways to avoid polling. Per request: add `callback_url` and your own `callback_id` to the body of `POST /v3/videos` or `POST /v3/video-translations`. For all jobs: register an endpoint once and verify every delivery.

```python
import hashlib
import hmac

endpoint = api("POST", "/v3/webhooks/endpoints", json={
    "url": "https://hooks.brightline.io/heygen",
    "events": ["avatar_video.success", "avatar_video.fail", "video_translate.success", "video_translate.fail"],
})["data"]
# endpoint["secret"] is shown only now — store it as HEYGEN_WEBHOOK_SECRET

def is_valid_signature(raw_body: bytes, signature_header: str) -> bool:
    """The `signature` header is the hex HMAC-SHA256 of the raw request body."""
    secret = os.environ["HEYGEN_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

The body carries `event_type` and `event_data` (for `avatar_video.success`: `video_id`, `url`, `callback_id`). Answer with a 2xx within 10 seconds; failed deliveries are retried for up to 24 hours, so de-duplicate on `video_id` plus `event_type`.

## Examples

### Example 1: Personalized outreach in one batch

User request: "Make a short personalized video for every contact in contacts.csv (columns: name, company, offer)."

```python
import csv

def bulk_generate_videos(csv_file: str, avatar_id: str, voice_id: str) -> str:
    with open(csv_file, newline="") as f:
        rows = list(csv.DictReader(f))
    videos = [{
        "type": "avatar",
        "avatar_id": avatar_id,
        "voice_id": voice_id,
        "title": f"Outreach - {row['name']}",
        "script": f"Hi {row['name']}, I wanted to personally reach out to you at {row['company']}. {row['offer']} Let's connect!",
    } for row in rows]
    # One call queues up to 100 videos; split longer lists into chunks of 100
    return api("POST", "/v3/videos/batches", json={"title": "Outreach batch", "videos": videos})["data"]["batch_id"]

batch_id = bulk_generate_videos("contacts.csv", looks[0]["id"], voices[0]["voice_id"])
batch = api("GET", f"/v3/videos/batches/{batch_id}", params={"limit": 100})["data"]
print(batch["status"], batch["counts_by_status"])
for item in batch["items"]:
    print(item["item_index"], item["status"], item["video_id"])
```

Result: the batch id comes back immediately; polling prints something like `processing {'completed': 1, 'processing': 2}` and then one line per contact (`0 completed vid_9f2c…`). `item_index` is the row's position in the CSV, so it maps each `video_id` back to a contact; pass the id to `wait_for_video` and `download_video`.

### Example 2: Localize a product video into Spanish and French

User request: "Dub our launch video into Spanish and French with lip-sync."

```python
ids = translate_video(
    "https://cdn.brightline.io/videos/launch-2026.mp4",   # must be publicly downloadable
    ["Spanish", "French"],
    title="Launch video",
)
for translation_id in ids:
    job = wait_for_translation(translation_id)
    download_video(job["video_url"], f"launch_{job['output_language']}.mp4")
    print(job["output_language"], job.get("srt_caption_url"))   # caption fields are omitted until the file exists
```

Result: one translation job per language. Each finished job carries `video_url`, `audio_url` and, once the caption files are ready, `srt_caption_url` and `vtt_caption_url`, so the dubbed video and its captions are saved without a separate captions call.

## Guidelines

- Migrate v1/v2 code before October 31, 2026: `/v2/video/generate` → `POST /v3/videos`, `/v1/video_status.get` → `GET /v3/videos/{video_id}`, `/v2/avatars` → `GET /v3/avatars` (groups) and `GET /v3/avatars/looks` (the ids used as `avatar_id`), `/v2/voices` → `GET /v3/voices`, `/v2/video_translate` → `POST /v3/video-translations`. The v3 body is flat (`type`, `avatar_id`, `script`) — no `video_inputs` array, no `dimension`.
- HeyGen limits concurrent jobs (10 on Pay-As-You-Go, 20 on Enterprise) and request rate; a 429 carries a `Retry-After` header. Honour it instead of sleeping a fixed second between calls. A 429 with code `quota_exceeded` or a 402 (`insufficient_credit`) will not clear by retrying.
- Download URLs are presigned and expire. Save the file promptly, or call `GET /v3/videos/{video_id}` again for a fresh URL.
- Send an `Idempotency-Key` header on create calls you may retry, so a network error does not render (and bill) the same video twice.
- Input files referenced by URL must be publicly reachable and match their extension; otherwise the job fails with `download_failed`. Upload private files through `POST /v3/assets` and pass the `asset_id`.
- A digital twin of a real person has a consent step (`POST /v3/avatars/{group_id}/consent`) before it renders; do not build avatars of people who have not agreed.
- For real-time interactive scenarios (chatbots, live calls), use LiveAvatar (`@heygen/liveavatar-web-sdk`, documented at docs.liveavatar.com). The older `@heygen/streaming-avatar` package is deprecated.
- Verify webhook signatures against the raw body bytes before trusting a payload.
- Store your API key in environment variables — never hardcode it.
