---
name: runway-ml
description: >-
  Runway ML API for AI video generation and editing — Gen-3 Alpha Turbo,
  image-to-video, and video-to-video. Use when generating video from text or
  images, applying AI video effects, or automating creative video production
  pipelines.
license: Apache-2.0
compatibility: "Requires Python 3.9+ or Node.js 18+. Runway API key required."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-media
  tags: ["runway", "video-generation", "gen-3", "text-to-video", "ai-video"]
  use-cases:
    - "Generate cinematic video clips from text descriptions"
    - "Animate a product photo into a dynamic video for ads"
    - "Automate B-roll video generation for content pipelines"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Runway ML API

## Overview

Runway's Gen-3 Alpha Turbo model generates high-quality video from text prompts or images. The REST API follows an async task pattern: create a task, poll for completion, then download the result. Use it to produce cinematic clips, animate images, or build automated video content pipelines.

## Setup

```bash
pip install requests python-dotenv
export RUNWAY_API_KEY="your_api_key_here"
```

Base URL: `https://api.dev.runwayml.com/v1`  
API docs: https://docs.runwayml.com

## Core Concepts

- **Task**: An async video generation job. Returns a `task_id` immediately.
- **Gen-3 Alpha Turbo**: Fastest Gen-3 model — best for production pipelines.
- **image-to-video** (`gen3a_turbo`): Animate a still image into motion.
- **text-to-video**: Generate video purely from a text prompt.
- **Duration**: 5 or 10 seconds.
- **Ratio**: `1280:720` (landscape), `720:1280` (portrait), `1104:832`, `832:1104`, `960:960` (square).

## Instructions

### Step 1: Set up the client

```python
import os
import time
import requests

API_KEY = os.environ["RUNWAY_API_KEY"]
BASE_URL = "https://api.dev.runwayml.com/v1"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "X-Runway-Version": "2024-11-06"
}
```

### Step 2: Text-to-video generation

```python
def text_to_video(
    prompt_text: str,
    duration: int = 5,
    ratio: str = "1280:720",
    seed: int = None
) -> str:
    """Submit a text-to-video task and return the task_id."""
    payload = {
        "model": "gen3a_turbo",
        "promptText": prompt_text,
        "duration": duration,
        "ratio": ratio
    }
    if seed is not None:
        payload["seed"] = seed

    r = requests.post(f"{BASE_URL}/image_to_video", json=payload, headers=HEADERS)
    r.raise_for_status()
    return r.json()["id"]

task_id = text_to_video(
    prompt_text="A drone shot flying over a misty mountain valley at golden hour, cinematic, slow motion",
    duration=5,
    ratio="1280:720"
)
print(f"Task submitted: {task_id}")
```

### Step 3: Image-to-video generation

```python
import base64
from pathlib import Path

def image_to_video(
    image_path: str,
    prompt_text: str = "",
    duration: int = 5,
    ratio: str = "1280:720",
    seed: int = None
) -> str:
    """Animate an image into video. image_path can be a local file or URL."""

    if image_path.startswith("http"):
        prompt_image = image_path
    else:
        # Encode local file as data URI
        img_bytes = Path(image_path).read_bytes()
        ext = Path(image_path).suffix.lstrip(".").lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/png")
        b64 = base64.b64encode(img_bytes).decode()
        prompt_image = f"data:{mime};base64,{b64}"

    payload = {
        "model": "gen3a_turbo",
        "promptImage": prompt_image,
        "promptText": prompt_text,
        "duration": duration,
        "ratio": ratio
    }
    if seed is not None:
        payload["seed"] = seed

    r = requests.post(f"{BASE_URL}/image_to_video", json=payload, headers=HEADERS)
    r.raise_for_status()
    return r.json()["id"]

task_id = image_to_video(
    image_path="product_shot.png",
    prompt_text="The product slowly rotates, sparkling particles float around it, luxury feel",
    duration=5,
    ratio="1280:720"
)
print(f"Task submitted: {task_id}")
```

### Step 4: Poll for task status

```python
def get_task(task_id: str) -> dict:
    r = requests.get(f"{BASE_URL}/tasks/{task_id}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def wait_for_task(task_id: str, poll_interval: int = 5, timeout: int = 600) -> list[str]:
    """Poll until task completes; return list of output video URLs."""
    start = time.time()
    while True:
        task = get_task(task_id)
        status = task["status"]
        progress = task.get("progress", 0)
        print(f"[{int(time.time()-start)}s] Status: {status} ({int(progress*100)}%)")

        if status == "SUCCEEDED":
            return task["output"]  # list of video URLs
        elif status in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"Task {status}: {task.get('failure', '')}")
        elif time.time() - start > timeout:
            raise TimeoutError(f"Task not done after {timeout}s")

        time.sleep(poll_interval)

output_urls = wait_for_task(task_id)
print(f"Video(s) ready: {output_urls}")
```

### Step 5: Download the result

```python
def download_video(url: str, output_path: str = "output.mp4") -> str:
    r = requests.get(url, stream=True)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"Saved: {output_path} ({size_mb:.1f} MB)")
    return output_path

download_video(output_urls[0], "mountain_valley.mp4")
```

## Full pipeline example

```python
def generate_and_download(prompt: str, output_path: str = "output.mp4", **kwargs) -> str:
    """One-shot: generate video from text and download it."""
    print(f"Generating: {prompt[:80]}...")
    task_id = text_to_video(prompt, **kwargs)
    urls = wait_for_task(task_id)
    return download_video(urls[0], output_path)

# Generate a product ad clip
generate_and_download(
    prompt="Close-up of a sleek smartphone on a white desk, screen lights up, smooth camera pull-back",
    output_path="product_ad.mp4",
    duration=5,
    ratio="1280:720"
)
```

## Parameters reference

| Parameter | Values | Description |
|-----------|--------|-------------|
| `model` | `gen3a_turbo` | Use Gen-3 Alpha Turbo (fastest) |
| `duration` | `5`, `10` | Video length in seconds |
| `ratio` | `1280:720`, `720:1280`, `1104:832`, `832:1104`, `960:960` | Resolution aspect ratio |
| `seed` | integer | Reproducibility seed for deterministic outputs |
| `promptText` | string | Text prompt describing the desired video |
| `promptImage` | URL or data URI | Starting image for image-to-video |

## Guidelines

- Runway tasks take 30–120 seconds depending on duration and load.
- Output URLs expire after a period — download videos promptly after generation.
- Keep prompts descriptive and cinematic: include camera movement, lighting, mood.
- Use `seed` to reproduce the same result when iterating on prompts.
- For batch generation, queue tasks in parallel but respect rate limits (check HTTP 429 and retry after the `Retry-After` header value).
- Store API keys in environment variables — never hardcode them.
- Check https://docs.runwayml.com for the latest model names and endpoints as they evolve rapidly.
