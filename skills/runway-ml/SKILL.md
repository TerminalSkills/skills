---
name: runway-ml
description: >-
  Runway ML API generates and edits AI video and images from text, images or video, with models such as Gen-4.5, Gen-4 Turbo and Aleph 2.0. Use when generating video from a prompt or a still image, editing a clip with video-to-video, automating B-roll or product-ad pipelines, or polling Runway tasks from Python or Node.js.
license: Apache-2.0
compatibility: "Python 3.9+ or Node.js 18+. Runway developer account with API key and prepaid credits required."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["runway", "video-generation", "gen-4", "text-to-video", "ai-video"]
  use-cases:
    - "Generate cinematic video clips from text descriptions"
    - "Animate a product photo into a dynamic video for ads"
    - "Automate B-roll video generation for content pipelines"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Runway ML API

## Overview

Runway's developer API (docs.dev.runwayml.com) exposes video, image, audio and upscaling models behind one task pattern: POST a generation request, receive a task id, poll the task until it is `SUCCEEDED`, then download the output. The older Gen-3 Alpha Turbo model (`gen3a_turbo`) is no longer in the model list; current video models include `gen4.5`, `gen4_turbo`, `aleph2` (video editing), `veo3.1`, `seedance2_5`, `hailuo3`, `wan3` and others. Model identifiers change, so check https://docs.dev.runwayml.com/guides/models before hard-coding one. Official SDKs: `runwayml` (Python) and `@runwayml/sdk` (Node.js).

## Instructions

### Setup

Create an API key in the Runway developer portal (dev.runway.com), buy credits, and export the key. The SDKs read `RUNWAYML_API_SECRET` automatically.

```bash
pip install runwayml          # or: npm install @runwayml/sdk
export RUNWAYML_API_SECRET="key_live_from_dev_portal"
```

REST base URL is `https://api.dev.runwayml.com/v1`; every request needs `Authorization: Bearer $RUNWAYML_API_SECRET` and `X-Runway-Version: 2024-11-06`.

### Choose an endpoint and model

| Endpoint | Use | Models (examples) |
|----------|-----|-------------------|
| `POST /v1/text_to_video` | prompt only | `gen4.5`, `veo3.1`, `veo3.1_fast`, `seedance2`, `wan3` |
| `POST /v1/image_to_video` | animate a still | `gen4.5`, `gen4_turbo`, `veo3.1`, `seedance2_5` |
| `POST /v1/video_to_video` | edit or restyle a clip | `aleph2` (input at most 30 s), `seedance2` |
| `POST /v1/text_to_image` | stills and reference images | `gen4_image`, `gen4_image_turbo`, `gemini_2.5_flash` |
| `GET /v1/tasks/{id}` | status and output | - |

Allowed `ratio` and `duration` depend on the model. For `gen4.5` text-to-video: ratio `1280:720` or `720:1280`, duration an integer from 2 to 10, `promptText` up to 1000 characters. `gen4_turbo` is image-to-video only; ratios `1280:720`, `720:1280`, `1104:832`, `832:1104`, `960:960`, `1584:672`; `promptText` optional. `veo3.1` takes durations 4, 6 or 8 and an `audio` boolean that changes the price. A wrong ratio for the model returns a 400 error.

### Generate with the Python SDK

```python
from runwayml import RunwayML, TaskFailedError

client = RunwayML()  # reads RUNWAYML_API_SECRET

try:
    task = client.text_to_video.create(
        model="gen4.5",
        prompt_text="Drone shot over a misty alpine valley at golden hour, slow forward motion",
        ratio="1280:720",
        duration=5,
    ).wait_for_task_output()
    print(task.output[0])          # URL of the mp4
except TaskFailedError as e:
    print("Generation failed:", e.task_details)
```

Image to video accepts an HTTPS URL, a Runway upload URI, or a base64 data URI as `prompt_image`:

```python
import base64, pathlib

png = base64.b64encode(pathlib.Path("kettle-product.png").read_bytes()).decode()
task = client.image_to_video.create(
    model="gen4_turbo",
    prompt_image=f"data:image/png;base64,{png}",
    prompt_text="Steam rises from the spout, camera slowly pushes in",
    ratio="1280:720",
    duration=5,
).wait_for_task_output()
```

### Generate with Node.js

```javascript
import RunwayML, { TaskFailedError } from '@runwayml/sdk';

const client = new RunwayML();
try {
  const task = await client.imageToVideo
    .create({
      model: 'gen4.5',
      promptImage: 'https://assets.northwind-outdoor.com/tent-hero.jpg',
      promptText: 'Wind moves the grass, light shifts across the tent',
      ratio: '1280:720',
      duration: 5,
    })
    .waitForTaskOutput();
  console.log(task.output[0]);
} catch (error) {
  if (error instanceof TaskFailedError) console.error(error.taskDetails);
  else throw error;
}
```

### Plain REST with polling

```python
import os, time, requests

BASE = "https://api.dev.runwayml.com/v1"
HEADERS = {
    "Authorization": f"Bearer {os.environ['RUNWAYML_API_SECRET']}",
    "X-Runway-Version": "2024-11-06",
}

def generate(payload: dict, endpoint: str = "text_to_video") -> list[str]:
    r = requests.post(f"{BASE}/{endpoint}", json=payload, headers=HEADERS, timeout=60)
    r.raise_for_status()
    task_id = r.json()["id"]
    while True:
        time.sleep(5)            # the API updates a task at most every 5 seconds
        t = requests.get(f"{BASE}/tasks/{task_id}", headers=HEADERS, timeout=60).json()
        if t["status"] == "SUCCEEDED":
            return t["output"]
        if t["status"] in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"{t['status']}: {t.get('failure')} ({t.get('failureCode')})")

urls = generate({"model": "gen4.5", "promptText": "Close-up of espresso pouring, shallow depth of field",
                 "ratio": "720:1280", "duration": 5})
with requests.get(urls[0], stream=True, timeout=120) as resp, open("espresso.mp4", "wb") as f:
    for chunk in resp.iter_content(1 << 16):
        f.write(chunk)
```

Task statuses: `PENDING`, `THROTTLED`, `RUNNING` (with `progress`), `SUCCEEDED` (with `output`), `FAILED` (with `failure` and `failureCode`), `CANCELLED`. `DELETE /v1/tasks/{id}` cancels or deletes a task.

### Editing video with Aleph 2.0

```python
task = client.video_to_video.create(
    model="aleph2",
    video_uri="https://assets.northwind-outdoor.com/trail-clip.mp4",
    prompt_text="Change the season to autumn, keep the camera motion",
).wait_for_task_output()
```

### Cost

Generation costs credits per second of output, and the task response shows `estimatedCost` while running and `cost` when done. At the time of writing `gen4_turbo` is 5 credits per second, `gen4.5` 12, `aleph2` 28 (56-credit minimum); see https://docs.dev.runwayml.com/guides/pricing. Professional formats (`outputFormat`: `prores`, `hdr10`, ...) on Gen-4.5 and Aleph 2.0 add a surcharge.

## Examples

### Example 1: Product ad from a still photo

**User request:** "Turn kettle-product.png into a 5-second landscape clip for our ad."

Run the data-URI `image_to_video` snippet above with `gen4_turbo`. The script prints a task id, waits roughly a minute, and returns a signed URL; download it to `kettle-ad.mp4`. The result is a 1280x720 mp4 of about 5 seconds costing about 25 credits.

### Example 2: Vertical B-roll batch

**User request:** "Make three 6-second vertical clips for our coffee shop reels."

Call `generate()` three times with `model: "gen4.5"`, `ratio: "720:1280"`, `duration: 6` and different `promptText` values, using a thread pool of 2-3 workers. Each call returns an mp4 URL; save them as `reel-1.mp4` to `reel-3.mp4`. Expect about 72 credits per clip.

## Guidelines

- Output URLs expire within 24-48 hours: download and store files immediately; fetching the task again returns fresh URLs.
- `promptText` is limited to 1000 characters; describe subject, camera movement, lighting and mood.
- Keep API keys in environment variables, never in code, and call the API only from a server, not from a browser.
- Handle HTTP 429 and `THROTTLED` tasks by backing off; the SDKs retry some errors twice by default.
- Reuse `seed` (0 to 4294967295) to compare prompt changes under otherwise identical settings.
- Content moderation can fail a task (`failureCode`); do not retry blindly, change the input.
- Pin the model id in config, and re-check the models page when a request starts returning 400: models are retired.
