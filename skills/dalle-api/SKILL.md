---
name: dalle-api
description: >-
  DALL-E 3 API for AI image generation — text-to-image, image editing, and
  variations via OpenAI. Use when generating images from text prompts, creating
  product visuals, illustrating content, or editing images with an inpainting
  mask.
license: Apache-2.0
compatibility: "Requires Python 3.9+ or Node.js 18+. Install: pip install openai. OpenAI API key required."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["dalle", "openai", "image-generation", "text-to-image", "ai-art"]
  use-cases:
    - "Generate product visuals from text descriptions for e-commerce listings"
    - "Create custom illustrations for blog articles or social media"
    - "Edit an existing image by replacing a region using an inpainting mask"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# DALL-E 3 API

## Overview

DALL-E 3 is OpenAI's image generation model, accessible via the OpenAI Python SDK. It supports text-to-image generation with high prompt fidelity, image editing with alpha-channel masks, and returns a "revised prompt" showing how the model interpreted your request.

## Setup

```bash
pip install openai python-dotenv
export OPENAI_API_KEY="your_api_key_here"
```

## Core Concepts

- **Generations** (`/v1/images/generations`): Create a new image from a text prompt.
- **Edits** (`/v1/images/edits`): Modify an existing image by painting over a masked region.
- **Variations** (DALL-E 2 only): Generate variations of an existing image.
- **Revised prompt**: DALL-E 3 rewrites your prompt for safety and quality — always log `revised_prompt` to understand the actual input.
- **Response format**: `url` (temporary CDN link, expires in 1 hour) or `b64_json` (base64-encoded PNG).

## Instructions

### Step 1: Initialize the client

```python
import os
import base64
import requests
from pathlib import Path
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
```

### Step 2: Generate an image (text-to-image)

```python
def generate_image(
    prompt: str,
    model: str = "dall-e-3",
    size: str = "1024x1024",
    quality: str = "standard",
    style: str = "vivid",
    output_path: str = "output.png"
) -> dict:
    """
    Generate an image with DALL-E 3.

    size options:       1024x1024 | 1792x1024 | 1024x1792
    quality options:    standard | hd
    style options:      vivid (dramatic) | natural (more realistic)
    Returns dict with saved path and revised_prompt.
    """
    response = client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        quality=quality,
        style=style,
        n=1,
        response_format="b64_json"
    )

    image_data = response.data[0]
    revised_prompt = image_data.revised_prompt
    print(f"Revised prompt: {revised_prompt}")

    # Decode and save
    img_bytes = base64.b64decode(image_data.b64_json)
    Path(output_path).write_bytes(img_bytes)
    size_kb = len(img_bytes) // 1024
    print(f"Saved: {output_path} ({size_kb} KB)")

    return {"path": output_path, "revised_prompt": revised_prompt}

# Standard quality, vivid style
result = generate_image(
    prompt="A sleek electric car driving through a futuristic city at night, neon reflections on wet streets, cinematic",
    size="1792x1024",
    quality="standard",
    style="vivid",
    output_path="electric_car.png"
)

# HD quality, natural style for photorealism
result = generate_image(
    prompt="A professional headshot of a confident businesswoman in a modern office, natural lighting, 50mm lens",
    size="1024x1024",
    quality="hd",
    style="natural",
    output_path="headshot.png"
)
```

### Step 3: Image editing with inpainting mask

```python
def edit_image(
    image_path: str,
    mask_path: str,
    prompt: str,
    size: str = "1024x1024",
    output_path: str = "edited.png"
) -> str:
    """
    Edit an image by replacing the masked region with generated content.

    image_path: PNG file, RGBA or RGB, must be square, ≤ 4MB
    mask_path:  PNG file with alpha channel. Transparent pixels = area to edit.
    Returns path to the edited image.
    """
    with open(image_path, "rb") as img_f, open(mask_path, "rb") as mask_f:
        response = client.images.edit(
            model="dall-e-2",  # edits require dall-e-2
            image=img_f,
            mask=mask_f,
            prompt=prompt,
            size=size,
            n=1,
            response_format="b64_json"
        )

    img_bytes = base64.b64decode(response.data[0].b64_json)
    Path(output_path).write_bytes(img_bytes)
    print(f"Edited image saved: {output_path}")
    return output_path

# Example: replace the background of a product photo
edit_image(
    image_path="product.png",          # Original product image
    mask_path="background_mask.png",   # Alpha mask over background area
    prompt="A tropical beach at sunset as background",
    size="1024x1024",
    output_path="product_beach.png"
)
```

### Step 4: Create a mask programmatically

```python
from PIL import Image  # pip install Pillow
import numpy as np

def create_circular_mask(image_path: str, center_x: float = 0.5, center_y: float = 0.5,
                          radius: float = 0.3, output_path: str = "mask.png") -> str:
    """
    Create an inpainting mask with a transparent circle.
    center_x/y: 0.0–1.0 relative position
    radius: 0.0–0.5 relative radius
    """
    img = Image.open(image_path).convert("RGBA")
    w, h = img.size
    mask = Image.new("RGBA", (w, h), (255, 255, 255, 255))  # fully opaque

    cx, cy, r = int(w * center_x), int(h * center_y), int(min(w, h) * radius)
    mask_arr = np.array(mask)
    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
    mask_arr[dist <= r, 3] = 0  # transparent = area to edit
    Image.fromarray(mask_arr).save(output_path)
    print(f"Mask saved: {output_path}")
    return output_path

create_circular_mask("product.png", center_x=0.5, center_y=0.5, radius=0.4, output_path="circle_mask.png")
```

### Step 5: Batch generation

```python
import time

def batch_generate(prompts: list[str], size: str = "1024x1024",
                   quality: str = "standard", output_dir: str = "output/") -> list[str]:
    """Generate multiple images with rate-limit handling."""
    Path(output_dir).mkdir(exist_ok=True)
    paths = []
    for i, prompt in enumerate(prompts):
        try:
            out_path = f"{output_dir}/image_{i:03d}.png"
            result = generate_image(prompt, size=size, quality=quality, output_path=out_path)
            paths.append(result["path"])
            time.sleep(1)  # respect rate limits (5 images/min on standard tier)
        except Exception as e:
            print(f"Error on prompt {i}: {e}")
            time.sleep(5)
    return paths

products = [
    "A wooden cutting board with fresh vegetables, overhead shot, natural light",
    "A ceramic mug with steam rising, cozy kitchen background, warm tones",
    "A leather wallet on a marble surface, minimal style, luxury feel"
]
batch_generate(products, quality="hd", output_dir="product_shots")
```

## Parameters reference

| Parameter | Values | Description |
|-----------|--------|-------------|
| `model` | `dall-e-3`, `dall-e-2` | DALL-E 3 = generations only; DALL-E 2 = edits + variations |
| `size` | `1024x1024`, `1792x1024`, `1024x1792` | Output dimensions (DALL-E 3) |
| `quality` | `standard`, `hd` | `hd` has finer details, costs 2x credits |
| `style` | `vivid`, `natural` | `vivid` = dramatic; `natural` = more realistic |
| `response_format` | `url`, `b64_json` | URL expires in 1 hour; b64_json is permanent |
| `n` | `1` (DALL-E 3) | DALL-E 3 supports n=1 only |

## DALL-E 3 behaviors to know

- **Prompt rewriting**: DALL-E 3 automatically rewrites prompts. Log `revised_prompt` to understand what was actually generated.
- **Safety filters**: Some content is refused and returns an error. The revised prompt handles most edge cases automatically.
- **No n>1**: DALL-E 3 only generates 1 image per API call. Use a loop for batches.
- **Edits use DALL-E 2**: The `/v1/images/edits` endpoint only supports DALL-E 2.
- **URL expiry**: Response URLs expire after 1 hour. Always download and store images immediately.

## Guidelines

- Use `quality="hd"` and `style="natural"` for photorealistic product images.
- Use `quality="standard"` and `style="vivid"` for illustrations, concept art, and marketing visuals.
- For best results, be specific: include subject, style, lighting, camera angle, and mood in the prompt.
- Use `b64_json` instead of `url` format to avoid download failures on slow networks.
- Rate limits: ~5 images/minute on standard tier. Add `time.sleep(1)` between batch requests.
- Store API keys in environment variables — never hardcode them.
