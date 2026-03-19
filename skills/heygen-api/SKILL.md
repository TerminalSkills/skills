---
name: heygen-api
description: >-
  HeyGen API for AI video generation — talking avatar videos, lip-sync, and
  video translation. Use when creating personalized video at scale, AI avatars
  for marketing, automated video content pipelines, or video localization with
  lip-sync in any language.
license: Apache-2.0
compatibility: "Requires Python 3.9+ or Node.js 18+. HeyGen API key required."
metadata:
  author: terminal-skills
  version: "1.0.0"
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

HeyGen provides REST APIs to create talking avatar videos, clone voices, translate videos with lip-sync, and stream live avatar sessions. Use it to automate video content production at scale — from personalized sales outreach to multilingual marketing campaigns.

## Setup

```bash
pip install requests python-dotenv
export HEYGEN_API_KEY="your_api_key_here"
```

Base URL: `https://api.heygen.com`

## Core Concepts

- **Avatar**: A digital human that delivers the video. Choose from HeyGen's library or create a custom avatar.
- **Voice**: TTS or cloned voice that speaks the script.
- **Video**: Generated asynchronously; poll for status then download.
- **Video Translation**: Send an existing video URL; HeyGen re-dubs it in the target language with matching lip-sync.

## Instructions

### Step 1: List available avatars and voices

```python
import os
import requests

API_KEY = os.environ["HEYGEN_API_KEY"]
HEADERS = {"X-Api-Key": API_KEY, "Content-Type": "application/json"}

def list_avatars():
    r = requests.get("https://api.heygen.com/v2/avatars", headers=HEADERS)
    r.raise_for_status()
    return r.json()["data"]["avatars"]

def list_voices():
    r = requests.get("https://api.heygen.com/v2/voices", headers=HEADERS)
    r.raise_for_status()
    return r.json()["data"]["voices"]

avatars = list_avatars()
voices = list_voices()

# Print first few
for a in avatars[:5]:
    print(f"Avatar: {a['avatar_id']} - {a.get('avatar_name', 'unnamed')}")

for v in voices[:5]:
    print(f"Voice: {v['voice_id']} - {v.get('name', 'unnamed')} ({v.get('language', 'en')})")
```

### Step 2: Create a talking-head video

```python
def create_avatar_video(script: str, avatar_id: str, voice_id: str, title: str = "My Video") -> str:
    """Submit a video generation job and return the video_id."""
    payload = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": avatar_id,
                    "avatar_style": "normal"
                },
                "voice": {
                    "type": "text",
                    "input_text": script,
                    "voice_id": voice_id,
                    "speed": 1.0
                },
                "background": {
                    "type": "color",
                    "value": "#FFFFFF"
                }
            }
        ],
        "dimension": {"width": 1280, "height": 720},
        "title": title
    }

    r = requests.post("https://api.heygen.com/v2/video/generate", json=payload, headers=HEADERS)
    r.raise_for_status()
    data = r.json()
    return data["data"]["video_id"]

video_id = create_avatar_video(
    script="Hi Sarah, I wanted to personally reach out about how we can help Acme Corp save 30% on cloud costs.",
    avatar_id="Angela-insuit-20220820",  # replace with valid avatar_id
    voice_id="en-US-JennyNeural",       # replace with valid voice_id
    title="Outreach - Sarah at Acme"
)
print(f"Video submitted: {video_id}")
```

### Step 3: Poll video status

```python
import time

def get_video_status(video_id: str) -> dict:
    r = requests.get(f"https://api.heygen.com/v1/video_status.get?video_id={video_id}", headers=HEADERS)
    r.raise_for_status()
    return r.json()["data"]

def wait_for_video(video_id: str, poll_interval: int = 10, timeout: int = 600) -> str:
    """Poll until video is ready; return download URL."""
    start = time.time()
    while True:
        status_data = get_video_status(video_id)
        status = status_data["status"]
        print(f"[{int(time.time() - start)}s] Status: {status}")

        if status == "completed":
            return status_data["video_url"]
        elif status == "failed":
            raise RuntimeError(f"Video generation failed: {status_data.get('error')}")
        elif time.time() - start > timeout:
            raise TimeoutError(f"Video not ready after {timeout}s")

        time.sleep(poll_interval)

video_url = wait_for_video(video_id)
print(f"Video ready: {video_url}")
```

### Step 4: Download the result

```python
def download_video(url: str, output_path: str = "output.mp4") -> str:
    r = requests.get(url, stream=True)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"Downloaded: {output_path} ({size_mb:.1f} MB)")
    return output_path

download_video(video_url, "sarah_acme_outreach.mp4")
```

### Video Translation (lip-sync)

Translate and re-dub an existing video into another language:

```python
def translate_video(video_url: str, target_language: str = "es", title: str = "Translated Video") -> str:
    """
    target_language examples: 'es' (Spanish), 'fr' (French), 'de' (German),
    'pt' (Portuguese), 'zh' (Chinese), 'ja' (Japanese), 'ko' (Korean)
    """
    payload = {
        "video_url": video_url,
        "output_language": target_language,
        "title": title
    }
    r = requests.post("https://api.heygen.com/v2/video_translate", json=payload, headers=HEADERS)
    r.raise_for_status()
    return r.json()["data"]["video_translate_id"]

def get_translation_status(translate_id: str) -> dict:
    r = requests.get(
        f"https://api.heygen.com/v2/video_translate/{translate_id}",
        headers=HEADERS
    )
    r.raise_for_status()
    return r.json()["data"]

translate_id = translate_video(
    video_url="https://your-video-host.com/original.mp4",
    target_language="es",
    title="Spanish Version"
)

# Poll for completion (same pattern as avatar video)
while True:
    data = get_translation_status(translate_id)
    if data["status"] == "completed":
        print(f"Translation ready: {data['video_url']}")
        break
    elif data["status"] == "failed":
        raise RuntimeError(data.get("error"))
    time.sleep(10)
```

### Webhook setup (optional)

Instead of polling, receive a POST callback when the video is done:

```python
# In your video generation payload, add:
payload["callback_id"] = "your-callback-url-or-id"

# HeyGen will POST to your webhook URL registered in the dashboard:
# POST https://your-server.com/heygen-webhook
# Body: { "event_type": "avatar_video.success", "event_data": { "video_id": "...", "video_url": "..." } }
```

## Examples

### Full pipeline: personalized outreach

```python
import csv

def bulk_generate_videos(csv_file: str, avatar_id: str, voice_id: str):
    """
    CSV columns: name, company, offer
    """
    with open(csv_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            script = (
                f"Hi {row['name']}, I wanted to personally reach out to you at {row['company']}. "
                f"{row['offer']} Let's connect!"
            )
            vid_id = create_avatar_video(script, avatar_id, voice_id, title=f"Outreach - {row['name']}")
            print(f"Submitted for {row['name']}: {vid_id}")
            # Store vid_id → contact mapping for later download
            time.sleep(1)  # be courteous to rate limits

bulk_generate_videos("contacts.csv", avatar_id="YOUR_AVATAR_ID", voice_id="YOUR_VOICE_ID")
```

## Guidelines

- HeyGen enforces rate limits. Add `time.sleep(1)` between submissions in bulk loops.
- Videos typically generate in 1–3 minutes for short clips (under 2 min).
- Video URLs from HeyGen expire after 7 days — download them promptly.
- For real-time interactive scenarios (chatbots, live calls), use the Streaming Avatar API via WebRTC (separate SDK: `@heygen/streaming-avatar` for JS).
- Keep scripts under 5 minutes per video for best results.
- Store your API key in environment variables — never hardcode it.
