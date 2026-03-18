---
name: flux-model
description: >-
  FLUX image generation models — Flux Pro, Dev, and Schnell via fal.ai,
  Replicate, or Black Forest Labs API. Use when generating high-quality or
  photorealistic images, applying LoRA fine-tuning for custom styles, or
  building production image generation pipelines.
license: Apache-2.0
compatibility: "Requires Python 3.9+. API key required for chosen provider (fal.ai, Replicate, or BFL)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["flux", "image-generation", "black-forest-labs", "fal-ai", "replicate"]
  use-cases:
    - "Generate photorealistic product images from text descriptions"
    - "Fine-tune Flux Dev with a LoRA for a brand's visual style"
    - "Build a high-throughput image generation pipeline using Flux Schnell"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# FLUX Image Generation Models

## Overview

FLUX by Black Forest Labs is the leading open-weight image generation architecture. Three model tiers cover different needs:

| Model | Best For | Speed | Quality |
|-------|----------|-------|---------|
| **Flux Pro** | Production, photorealism, commercial | Slow | ⭐⭐⭐⭐⭐ |
| **Flux Dev** | Open weight, LoRA fine-tuning, research | Medium | ⭐⭐⭐⭐ |
| **Flux Schnell** | Speed, batch generation, prototyping | Fast | ⭐⭐⭐ |

Access FLUX via three providers: **fal.ai** (recommended, easiest), **Replicate**, or **Black Forest Labs API** directly.

## Provider 1: fal.ai (recommended)

### Setup

```bash
pip install fal-client python-dotenv
export FAL_KEY="your_fal_api_key"
```

### Generate image with fal.ai

```python
import os
import base64
import fal_client
from pathlib import Path

def flux_fal(
    prompt: str,
    model: str = "fal-ai/flux-pro",  # or flux/dev, flux/schnell
    image_size: str = "landscape_4_3",
    num_inference_steps: int = 28,
    guidance_scale: float = 3.5,
    num_images: int = 1,
    output_format: str = "jpeg",
    output_path: str = "output.jpg"
) -> list[str]:
    """
    Generate images using FLUX via fal.ai.
    image_size options: square_hd, square, portrait_4_3, portrait_16_9,
                        landscape_4_3, landscape_16_9 (or custom WxH)
    Returns list of saved file paths.
    """
    result = fal_client.subscribe(
        model,
        arguments={
            "prompt": prompt,
            "image_size": image_size,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
            "num_images": num_images,
            "output_format": output_format,
            "enable_safety_checker": True
        }
    )

    saved = []
    for i, image in enumerate(result["images"]):
        # image["url"] is a CDN URL
        import requests
        r = requests.get(image["url"])
        path = output_path if num_images == 1 else output_path.replace(".", f"_{i}.")
        Path(path).write_bytes(r.content)
        print(f"Saved: {path} ({len(r.content) // 1024} KB)")
        saved.append(path)
    return saved

# Flux Pro - highest quality
flux_fal(
    prompt="A hyperrealistic photo of a red sneaker floating in mid-air, studio lighting, white background",
    model="fal-ai/flux-pro",
    image_size="square_hd",
    output_path="sneaker_pro.jpg"
)

# Flux Schnell - fast generation
flux_fal(
    prompt="Minimalist tech startup logo, geometric, dark blue and white",
    model="fal-ai/flux/schnell",
    num_inference_steps=4,  # Schnell works great with 4 steps
    output_path="logo_schnell.jpg"
)
```

### LoRA with fal.ai

```python
def flux_dev_lora(prompt: str, lora_url: str, lora_scale: float = 0.9, output_path: str = "lora_output.jpg"):
    """Generate using Flux Dev with a LoRA adapter for custom style."""
    result = fal_client.subscribe(
        "fal-ai/flux-lora",
        arguments={
            "prompt": prompt,
            "loras": [{"path": lora_url, "scale": lora_scale}],
            "image_size": "landscape_4_3",
            "num_inference_steps": 28,
            "guidance_scale": 3.5,
            "num_images": 1
        }
    )
    import requests
    r = requests.get(result["images"][0]["url"])
    Path(output_path).write_bytes(r.content)
    print(f"LoRA image saved: {output_path}")

flux_dev_lora(
    prompt="A portrait in TOK style",
    lora_url="https://huggingface.co/your-org/your-lora/resolve/main/lora.safetensors",
    lora_scale=1.0
)
```

## Provider 2: Replicate

### Setup

```bash
pip install replicate
export REPLICATE_API_TOKEN="your_replicate_token"
```

### Generate via Replicate

```python
import replicate
import requests
from pathlib import Path

def flux_replicate(
    prompt: str,
    model: str = "black-forest-labs/flux-pro",
    aspect_ratio: str = "1:1",
    output_format: str = "jpg",
    output_quality: int = 90,
    output_path: str = "output.jpg"
) -> str:
    """
    Generate image with FLUX via Replicate.
    model options:
      - black-forest-labs/flux-pro
      - black-forest-labs/flux-dev
      - black-forest-labs/flux-schnell
    aspect_ratio: "1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2"
    """
    output = replicate.run(
        model,
        input={
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "output_format": output_format,
            "output_quality": output_quality,
            "safety_tolerance": 2,
            "prompt_upsampling": True  # Pro only: auto-enhance prompt
        }
    )
    # output is a list of FileOutput objects
    url = str(output[0])
    r = requests.get(url)
    Path(output_path).write_bytes(r.content)
    print(f"Saved: {output_path}")
    return output_path

flux_replicate(
    prompt="Cinematic shot of a coffee cup on a wooden desk, morning light streaming through a window, 8k",
    model="black-forest-labs/flux-pro",
    aspect_ratio="16:9",
    output_path="coffee_hero.jpg"
)
```

### Flux Dev with LoRA on Replicate

```python
output = replicate.run(
    "lucataco/flux-dev-lora:091495765fa5ef2725a175a57b276ec30dc9d39c22436ba424772c35501d6f",
    input={
        "prompt": "A photo of TOK person at the beach",
        "hf_lora": "alvdansen/flux-koda",  # HuggingFace LoRA path
        "lora_scale": 0.85,
        "num_inference_steps": 28,
        "guidance_scale": 3.5
    }
)
```

## Provider 3: Black Forest Labs API (direct)

### Setup

```bash
export BFL_API_KEY="your_bfl_api_key"
```

### Generate via BFL API

```python
import os
import time
import requests

BFL_KEY = os.environ["BFL_API_KEY"]
BFL_HEADERS = {"x-key": BFL_KEY, "Content-Type": "application/json"}

def flux_bfl(
    prompt: str,
    model: str = "flux-pro-1.1",  # flux-pro, flux-pro-1.1, flux-dev, flux-schnell
    width: int = 1024,
    height: int = 1024,
    steps: int = None,  # None = default
    guidance: float = None,
    output_path: str = "output.jpg"
) -> str:
    """Generate image via BFL's native API."""
    payload = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "output_format": "jpeg",
        "safety_tolerance": 2
    }
    if steps:
        payload["steps"] = steps
    if guidance:
        payload["guidance"] = guidance

    r = requests.post(f"https://api.bfl.ml/v1/{model}", json=payload, headers=BFL_HEADERS)
    r.raise_for_status()
    polling_id = r.json()["id"]

    # Poll for result
    while True:
        poll = requests.get("https://api.bfl.ml/v1/get_result", params={"id": polling_id}, headers=BFL_HEADERS)
        poll.raise_for_status()
        data = poll.json()
        if data["status"] == "Ready":
            image_url = data["result"]["sample"]
            break
        elif data["status"] in ("Error", "Content Moderated", "Request Moderated"):
            raise RuntimeError(f"BFL error: {data['status']}")
        print(f"Status: {data['status']}...")
        time.sleep(3)

    img_data = requests.get(image_url).content
    Path(output_path).write_bytes(img_data)
    print(f"Saved: {output_path}")
    return output_path

flux_bfl(
    prompt="Ultra-detailed macro photo of a mechanical watch movement, studio lighting",
    model="flux-pro-1.1",
    width=1440,
    height=1440,
    output_path="watch_macro.jpg"
)
```

## Parameters reference

| Parameter | Values | Description |
|-----------|--------|-------------|
| `num_inference_steps` | 4 (Schnell), 20–50 (Dev/Pro) | More steps = higher quality, slower |
| `guidance_scale` | 1.5–5.0 | How closely to follow the prompt |
| `aspect_ratio` / `image_size` | 1:1, 16:9, 9:16, etc. | Output dimensions |
| LoRA scale | 0.7–1.0 | Strength of LoRA style adapter |

## Guidelines

- **Flux Schnell**: Use 4 steps. It's distilled — more steps don't improve quality.
- **Flux Dev**: Use 20–30 steps. Best for LoRA fine-tuning and customization.
- **Flux Pro**: Use 28–50 steps. Best for commercial quality and photorealism.
- For LoRA fine-tuning, use Flux Dev as the base (open weights). Flux Pro is proprietary.
- fal.ai is the easiest provider with the most complete feature set and lowest latency.
- BFL API gives direct access to the latest Pro model versions before other providers.
- Store API keys in environment variables — never hardcode them.
