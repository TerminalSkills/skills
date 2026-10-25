---
name: dalle-api
description: >-
  DALL-E API successor: the OpenAI Images API with the gpt-image models, which replaced DALL-E 2 and DALL-E 3 (shut down 2026-05-12). Covers text-to-image generation, edits with masks and multiple reference images, sizes, quality, output formats, base64 handling and moderation. Use when generating or editing images with OpenAI, migrating old dall-e-3 code, or fixing "model not found" errors from dall-e-2/dall-e-3 calls.
license: Apache-2.0
compatibility: "Requires Python 3.9+ and the openai package (pip install openai). OpenAI API key required."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: data-ai
  tags: "dalle, openai, gpt-image, image-generation, image-editing"
  use-cases: "Generate product visuals from text descriptions for e-commerce listings, Edit an existing image by replacing a region using a mask, Migrate dall-e-3 code to the gpt-image models"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# DALL-E API (gpt-image models)

## Overview

**DALL-E 2 and DALL-E 3 were shut down on 2026-05-12.** OpenAI's deprecations page lists both as removed from the API and recommends `gpt-image-2`, `gpt-image-1` or `gpt-image-1-mini` instead. Code that passes `model="dall-e-3"` or `"dall-e-2"` no longer works, and variations (a DALL-E 2 feature) have no gpt-image equivalent. The endpoints are the same: `images.generate` (`/v1/images/generations`) and `images.edit` (`/v1/images/edits`).

Key differences from DALL-E: gpt-image models always return base64 (`data[0].b64_json`), never URLs; they do not return `revised_prompt`; `style`, `response_format` are not supported; edits take multiple input images and a prompt-guided mask. OpenAI's reference also lists newer `gpt-image-1.5` and `gpt-image-2.5-sunburst` / `gpt-image-2.5-flare` models; check the model list in the reference before pinning one. This skill uses `gpt-image-2`.

## Instructions

### Step 1: Client

```bash
pip install openai
export OPENAI_API_KEY="..."   # set in your shell or secret manager
```

```python
import base64
from pathlib import Path
from openai import OpenAI

client = OpenAI()  # reads OPENAI_API_KEY
MODEL = "gpt-image-2"

def save(response, path: str, index: int = 0) -> str:
    Path(path).write_bytes(base64.b64decode(response.data[index].b64_json))
    return path
```

### Step 2: Generate

```python
res = client.images.generate(
    model=MODEL,
    prompt="A ceramic mug with steam rising on a marble kitchen counter, warm morning light, 50mm photo",
    size="1536x1024",
    quality="medium",
    output_format="webp",
    output_compression=85,
)
save(res, "mug.webp")
print(res.usage)  # token counts, use them to measure cost
```

Parameters (verified against the API reference):

| Parameter | Values |
|-----------|--------|
| `size` | `1024x1024`, `1536x1024`, `1024x1536`, `auto`. The gpt-image-2 family also takes custom `WIDTHxHEIGHT`: both sides multiples of 16, aspect ratio between 1:3 and 3:1, max 3840x2160 (above 2560x1440 is experimental) |
| `quality` | `low`, `medium`, `high`, `auto` (default). Only the 2.5 models add `xhigh` and `max` |
| `output_format` | `png` (default), `jpeg`, `webp` |
| `output_compression` | 0-100, `jpeg`/`webp` only |
| `background` | `transparent`, `opaque`, `auto`; transparent needs `png` or `webp` (preview on gpt-image-2) |
| `moderation` | `auto` (default) or `low` (less restrictive filtering) |
| `n` | 1 to 10 images per request |
| `prompt` | up to 32,000 characters |

### Step 3: Edit with a mask or several images

```python
# Mask edit: fully transparent pixels in the mask mark where to change.
with open("living-room.png", "rb") as img, open("sofa-mask.png", "rb") as mask:
    res = client.images.edit(
        model=MODEL,
        image=img,
        mask=mask,
        prompt="Replace the sofa with a dark green velvet sofa, keep everything else",
    )
save(res, "living-room-green.png")

# Combine several reference images (up to 16, each PNG/WebP/JPG under 50MB).
files = [open(p, "rb") for p in ("lotion.png", "soap.png", "candle.png")]
res = client.images.edit(
    model=MODEL,
    image=files,
    prompt="A gift basket product shot with all three items on a linen cloth",
)
for f in files:
    f.close()
save(res, "gift-basket.png")
```

Mask rules: PNG under 4MB, same dimensions as the image, must have an alpha channel; with several images the mask applies to the first. Masking is prompt-guided, so the model may not follow the exact outline. `input_fidelity` (`high`/`low`) exists for gpt-image-1 style models (`gpt-image-1-mini` supports only `low`); omit it for gpt-image-2.

To build a mask with Pillow: open the image as RGBA, create a same-size opaque image, and set alpha to 0 where edits should happen.

### Step 4: Handle errors and moderation

A blocked request fails with error code `moderation_blocked`; `moderation_details` carries `categories` and `moderation_stage` (`input` means revise the prompt or input images, `output` means change the prompt and retry). Wrap calls with retry and backoff for rate limits (limits depend on your usage tier; see the Limits page of your account).

## Migration from DALL-E 3

| Old (no longer works) | New |
|-----------------------|-----|
| `model="dall-e-3"` | `model="gpt-image-2"` (or `gpt-image-1-mini` for cheaper drafts) |
| `size="1792x1024"` / `"1024x1792"` | `"1536x1024"` / `"1024x1536"` or a custom size |
| `quality="standard"` / `"hd"` | `"medium"` / `"high"` |
| `style="vivid"` / `"natural"` | remove; describe the style in the prompt |
| `response_format="url"` or `"b64_json"` | remove; always `b64_json` |
| `response.data[0].url` | `base64.b64decode(response.data[0].b64_json)` |
| `revised_prompt` | not returned; log your own prompt |
| `n=1` only | `n` up to 10 |
| edits with `dall-e-2`, square PNG under 4MB | `gpt-image-2` edit, non-square OK, images up to 50MB |
| `images.create_variation` | no equivalent; use `images.edit` with the source image and a prompt |

## Examples

### Example 1: "Hero image for our electric-car landing page"

```python
res = client.images.generate(
    model="gpt-image-2",
    prompt="A sleek electric car driving through a futuristic city at night, neon reflections on wet streets, cinematic",
    size="1536x1024", quality="high",
)
save(res, "electric_car.png")
```
Result: a 1536x1024 PNG on disk; `res.usage` shows the input and output tokens used.

### Example 2: "Swap the background behind our product photo for a beach"

Make `background-mask.png` with transparent pixels over the background, then:

```python
with open("product.png", "rb") as img, open("background-mask.png", "rb") as mask:
    res = client.images.edit(model="gpt-image-2", image=img, mask=mask,
        prompt="A tropical beach at sunset behind the product; do not change the product")
save(res, "product_beach.png")
```
Result: `product_beach.png` with the masked area regenerated.

### Example 3: "A logo sticker with a transparent background"

```python
res = client.images.generate(model="gpt-image-2", prompt="Flat vector fox logo sticker, white outline",
    background="transparent", output_format="png")
save(res, "fox.png")
```

## Guidelines

- Pricing is token-based, not per image: cost depends on model, quality and size. Read `res.usage` to measure real cost, and use `low`/`medium` quality for drafts. For the current per-token rates see the OpenAI pricing page.
- Never rely on image URLs; decode `b64_json` and store the file yourself.
- Pin an explicit model name; do not rely on defaults.
- Keep the API key in an environment variable and never log it.
- For Azure-hosted deployments or general OpenAI SDK usage, see the `azure-openai` and `openai-sdk` skills.
