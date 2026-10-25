---
name: flux-model
description: >-
  FLUX is Black Forest Labs' family of image generation models (FLUX.2, FLUX 3
  Image, and the older FLUX.1 Dev, Schnell and Pro), available through the BFL
  API, fal.ai and Replicate. Use when generating photorealistic or product
  images, text-heavy graphics, exact brand colors, image editing with
  references, fast batch generation, or LoRA styles with FLUX.1 Dev or FLUX.2
  klein. Covers model choice, request code for each provider, and licensing.
license: Apache-2.0
compatibility: "Requires Python 3.9+ and an API key for the chosen provider (BFL_API_KEY, FAL_KEY or REPLICATE_API_TOKEN)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "flux, image-generation, black-forest-labs, fal-ai, replicate"
  use-cases: "Generate photorealistic product images from text descriptions, Fine-tune Flux Dev with a LoRA for a brand's visual style, Build a high-throughput image generation pipeline using Flux Schnell"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# FLUX Image Generation Models

## Overview

FLUX is made by Black Forest Labs (BFL). The original FLUX.1 trio (Pro, Dev, Schnell) has been superseded; BFL's docs now recommend **FLUX.2** for new projects, and **FLUX 3 Image** is the newest line.

| Model | API endpoint (`api.bfl.ai/v1/...`) | Use it for |
|-------|-----------------------------------|-----------|
| FLUX 3 Image | `flux-3-image` | Newest image model: text-to-image, editing, up to 10 references, bounding-box layouts |
| FLUX.2 [max] | `flux-2-max` | Highest quality, grounded web search for real-world facts |
| FLUX.2 [pro] | `flux-2-pro-preview` (latest) or `flux-2-pro` (pinned snapshot) | Production quality, hex-color control, up to 4MP, multi-reference editing |
| FLUX.2 [flex] | `flux-2-flex` | Fine-grained control over generation settings |
| FLUX.2 [klein] | `flux-2-klein-4b`, `flux-2-klein-9b-preview` / `flux-2-klein-9b` | Sub-second, cheap, open weights (4B Apache 2.0, 9B non-commercial) |
| FLUX.1 [dev] / [schnell] | via fal.ai / Replicate | Legacy; LoRA ecosystem (Dev), 4-step speed (Schnell, Apache 2.0) |
| FLUX1.1 [pro], Kontext | `flux-pro-1.1`, Kontext endpoints | Legacy; docs steer new work to FLUX.2 |

Use `-preview` endpoints for the latest improvements and the unsuffixed ones when you need reproducible output. Prices are in BFL credits (1 credit = $0.01) and change; check bfl.ai/pricing. FLUX.1 [dev] weights and FLUX.2 [klein] 9B / [dev] are **non-commercial** licensed: commercial use goes through a paid API or license.

## Instructions

### Provider 1: BFL API (direct, async)

Create a key in the BFL dashboard (dashboard.bfl.ai) and export `BFL_API_KEY`. Requests are asynchronous: submit, then poll the `polling_url` from the response (required on `api.bfl.ai`; use `api.eu.bfl.ai` or `api.us.bfl.ai` to keep traffic in a region). The old host `api.bfl.ml` and the `get_result?id=` polling URL are legacy.

```python
import os, time, requests
from pathlib import Path

HEADERS = {"x-key": os.environ["BFL_API_KEY"], "accept": "application/json"}

def flux_bfl(prompt: str, endpoint: str = "flux-2-pro-preview", out: str = "output.jpg", **params) -> str:
    """FLUX.2 takes width/height; FLUX 3 Image takes aspect_ratio (and rejects width, height, seed)."""
    r = requests.post(f"https://api.bfl.ai/v1/{endpoint}", headers=HEADERS,
                      json={"prompt": prompt, **params}, timeout=60)
    r.raise_for_status()
    polling_url = r.json()["polling_url"]
    while True:
        s = requests.get(polling_url, headers=HEADERS, timeout=60).json()
        if s["status"] == "Ready":
            break
        if s["status"] not in ("Pending", "Reasoning", "Generating"):
            # Error, Request Moderated, Content Moderated, Task not found, No Card Generated
            raise RuntimeError(f"FLUX request failed: {s}")
        time.sleep(1)
    img = requests.get(s["result"]["sample"], timeout=60)   # result URL expires (10 min on FLUX.2, 1 h on FLUX 3), no CORS
    img.raise_for_status()
    Path(out).write_bytes(img.content)
    return out

flux_bfl("Studio photo of a red running shoe on a white sweep, soft shadow, 85mm lens",
         endpoint="flux-2-pro-preview", width=1440, height=1440, out="shoe.jpg")
flux_bfl("Poster with the headline 'Harvest Fair' in #2E7D32 on cream paper, 1950s style",
         endpoint="flux-3-image", aspect_ratio="3:4", out="poster.jpg")
```

Download results immediately: delivery URLs under `delivery.*.bfl.ai` expire (10 minutes for FLUX.2, 1 hour for FLUX 3 Image) and are not meant to be served to users. Allow `*.bfl.ai` through firewalls. Hex colors in prompts (`#2E7D32`) are matched closely by FLUX.2; JSON-structured prompts work for complex scenes. FLUX.2 [klein] does not rewrite prompts, so write them in detail.

### Provider 2: fal.ai

```bash
pip install fal-client requests
export FAL_KEY=...        # key from the fal.ai dashboard
```

```python
import fal_client, requests
from pathlib import Path

def flux_fal(prompt, model="fal-ai/flux-2-pro", out="output.jpg", **args):
    result = fal_client.subscribe(model, arguments={"prompt": prompt, **args})
    Path(out).write_bytes(requests.get(result["images"][0]["url"], timeout=60).content)
    return out

flux_fal("Minimalist logo of a lighthouse, navy and white, flat vector",
         model="fal-ai/flux/schnell", num_inference_steps=4, image_size="square_hd", out="logo.jpg")
flux_fal("Cinematic coffee cup on a wooden desk, morning window light",
         model="fal-ai/flux-2-pro", image_size="landscape_16_9", out="coffee.jpg")
```

Endpoint IDs confirmed on fal.ai: `fal-ai/flux-2-pro`, `fal-ai/flux/dev`, `fal-ai/flux/schnell`, `fal-ai/flux-pro/v1.1`, `fal-ai/flux-lora`, `fal-ai/flux-2/klein/4b`. Parameters differ per endpoint: `flux-2-pro` accepts `image_size`, `seed`, `output_format` (jpeg/png), `safety_tolerance` ("1" to "5") and `enable_safety_checker`, but no step count or guidance. Schnell and `flux-lora` accept `num_inference_steps` (defaults 4 and 28), `guidance_scale` (3.5) and `num_images`. `image_size` takes presets (`square_hd`, `portrait_4_3`, `landscape_16_9`, ...) or `{"width": w, "height": h}`. Unknown arguments are rejected, so read the model's schema on its fal.ai page.

### Provider 3: Replicate

```bash
pip install replicate
export REPLICATE_API_TOKEN=...
```

```python
import replicate
from pathlib import Path

out = replicate.run("black-forest-labs/flux-schnell",
                    input={"prompt": "A lighthouse at dusk, oil painting", "aspect_ratio": "16:9"})
Path("lighthouse.webp").write_bytes(out[0].read())     # returns FileOutput objects
```

Model slugs: `black-forest-labs/flux-2-pro`, `flux-2-max`, `flux-2-klein-4b`, `flux-dev`, `flux-schnell`, `flux-1.1-pro`. Inputs and default output format vary per model; check each model page. Save outputs right away; Replicate deletes output files after a limited time.

### LoRA styles

LoRAs are trained on open-weight bases: FLUX.1 [dev] (non-commercial weights license) and FLUX.2 [klein] (BFL has a training guide; 4B is Apache 2.0). FLUX Pro endpoints cannot load LoRAs.

```python
flux_fal("Portrait in TOK style, studio light", model="fal-ai/flux-lora", out="lora.jpg",
         loras=[{"path": "https://huggingface.co/acme-studio/brand-style-lora/resolve/main/lora.safetensors",
                 "scale": 0.9}], num_inference_steps=28, guidance_scale=3.5)
```

## Examples

### Example 1: Product shots with exact brand color

**User prompt:** "Generate a hero image of our water bottle in brand green #1B7F5C on a light grey backdrop."

Call `flux_bfl("Matte water bottle in #1B7F5C on a light grey seamless backdrop, soft studio light, product photo", endpoint="flux-2-pro-preview", width=1536, height=1024, out="bottle.jpg")`. The script prints nothing until done, then `bottle.jpg` exists. If the green is off, repeat with the hex code attached to the object ("the bottle is #1B7F5C"), and keep the same `seed` when varying only the framing.

### Example 2: 200 draft thumbnails quickly and cheaply

**User prompt:** "Make 200 rough concept thumbnails for blog posts, speed matters more than polish."

Loop over the prompts with `flux_fal(p, model="fal-ai/flux/schnell", num_inference_steps=4, image_size="landscape_16_9", out=f"thumb_{i}.jpg")` using a thread pool of 8; Schnell is the fastest tier. Pick the best, then regenerate those few with `flux-2-pro-preview` for final art. Result: 200 JPEG files for a small fraction of the Pro cost.

## Guidelines

- **Pick by job**: klein or Schnell for volume, FLUX.2 [pro]/[max] or FLUX 3 for finals, FLUX.1 Dev or klein for LoRA work.
- **Do not copy FLUX.1 parameters to FLUX.2 endpoints.** FLUX.2 [pro] on the BFL API takes `width`/`height`; steps and guidance are not tuning knobs there. Schnell stays at 4 steps.
- **Check the license** before shipping: Dev and klein 9B weights are non-commercial; Schnell and klein 4B are Apache 2.0; API outputs are governed by the provider's terms.
- **Safety filters**: `safety_tolerance` / `enable_safety_checker` control moderation strictness; a moderated request is not fixed by retrying unchanged.
- **Rate limits and timeouts**: add exponential backoff on HTTP 429 and a maximum polling time.
- **Keys** only in environment variables; never log request headers.
