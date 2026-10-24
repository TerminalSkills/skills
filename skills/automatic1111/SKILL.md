---
name: automatic1111
description: >-
  AUTOMATIC1111 Stable Diffusion WebUI is a self-hosted browser interface and REST API for
  generating images with Stable Diffusion models on your own GPU. Use this skill to install
  and launch it, call /sdapi/v1/txt2img and img2img from scripts, inpaint, apply LoRAs,
  add extensions such as ControlNet, or batch-generate images.
license: Apache-2.0
compatibility: 'Python 3.10.6 (3.11 works on Linux), git, an NVIDIA GPU (AMD via ROCm, Apple Silicon via the wiki), Linux/Windows/macOS'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/AUTOMATIC1111/stable-diffusion-webui
  tags:
    - stable-diffusion
    - image-generation
    - web-ui
    - img2img
    - lora
---

# Automatic1111 (Stable Diffusion WebUI)

## Overview

AUTOMATIC1111's stable-diffusion-webui is a Gradio web app that runs Stable Diffusion locally (txt2img, img2img, inpainting, upscaling, LoRA, extensions) and exposes the same features over a REST API under `/sdapi/v1/` when started with `--api`. The latest tagged release is v1.10.1 (July 2024; adds SD 3 support and new schedulers), so treat the project as stable and slow-moving. It runs SD 1.5, SD 2.x, SDXL and SD3 checkpoints; it does not run newer architectures such as Flux. The interactive API docs are at `http://127.0.0.1:7860/docs` once it is running.

## Instructions

Install and launch, then drive it from the UI or the API examples below. Keep to these points:

1. Python 3.10.6 is the documented version (newer Python often lacks matching torch wheels); `webui.sh` creates its own venv and installs dependencies on first run. Do not run it as root.
2. Put checkpoints in `models/Stable-diffusion/`, LoRAs in `models/Lora/`, VAEs in `models/VAE/`. Pick the model and resolution together: SD 1.5 is trained at 512x512, SDXL at 1024x1024.
3. Since 1.9 the scheduler is a separate field. Send `"sampler_name": "DPM++ 2M"` with `"scheduler": "Karras"` rather than the old combined name.
4. Set persistent launch flags in `webui-user.sh` (`export COMMANDLINE_ARGS="--api --xformers"`) instead of retyping them.
5. Low VRAM: `--medvram` (or `--medvram-sdxl`), `--lowvram` as a last resort.

## Installation

```bash
# install.sh — Clone and launch Stable Diffusion WebUI
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
cd stable-diffusion-webui

# Download a model (SDXL base, about 6.9 GB; use only .safetensors files)
wget -P models/Stable-diffusion/ \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"

# Launch (auto-installs dependencies on first run). Binds to 127.0.0.1 only.
./webui.sh --api --xformers
# Visit http://127.0.0.1:7860
```

## API: Text to Image

```python
# txt2img_api.py — Generate images via the built-in REST API
import requests
import base64
from pathlib import Path

API_URL = "http://localhost:7860"

payload = {
    "prompt": "A serene Japanese garden with cherry blossoms, watercolor painting style, detailed",
    "negative_prompt": "blurry, low quality, distorted, text, watermark",
    "steps": 30,
    "cfg_scale": 7.5,
    "width": 1024,
    "height": 1024,
    "sampler_name": "DPM++ 2M",
    "scheduler": "Karras",
    "seed": -1,
    "batch_size": 1,
}

response = requests.post(f"{API_URL}/sdapi/v1/txt2img", json=payload)
data = response.json()

for i, img_b64 in enumerate(data["images"]):
    img_bytes = base64.b64decode(img_b64)
    Path(f"output_{i}.png").write_bytes(img_bytes)
    print(f"Saved output_{i}.png")
```

## API: Image to Image

```python
# img2img_api.py — Transform an existing image with a new prompt
import requests
import base64
from pathlib import Path

API_URL = "http://localhost:7860"

# Read input image as base64
input_image = base64.b64encode(Path("input.png").read_bytes()).decode()

payload = {
    "init_images": [input_image],
    "prompt": "Transform into an oil painting, impressionist style",
    "negative_prompt": "blurry, distorted",
    "steps": 30,
    "cfg_scale": 7,
    "denoising_strength": 0.6,  # 0.0 = no change, 1.0 = full regeneration
    "width": 1024,
    "height": 1024,
    "sampler_name": "DPM++ 2M",
    "scheduler": "Karras",
}

response = requests.post(f"{API_URL}/sdapi/v1/img2img", json=payload)
data = response.json()

img_bytes = base64.b64decode(data["images"][0])
Path("output_img2img.png").write_bytes(img_bytes)
```

## API: Inpainting

```python
# inpainting_api.py — Edit specific regions of an image using a mask
import requests
import base64
from pathlib import Path

API_URL = "http://localhost:7860"

input_image = base64.b64encode(Path("photo.png").read_bytes()).decode()
mask_image = base64.b64encode(Path("mask.png").read_bytes()).decode()  # White = edit area

payload = {
    "init_images": [input_image],
    "mask": mask_image,
    "prompt": "A golden retriever puppy sitting on the grass",
    "negative_prompt": "blurry, distorted",
    "steps": 30,
    "cfg_scale": 7,
    "denoising_strength": 0.75,
    "inpainting_fill": 1,  # 0=fill, 1=original, 2=latent noise, 3=latent nothing
    "mask_blur": 4,
    "width": 1024,
    "height": 1024,
}
# img2img honours width/height; match them to the input image to avoid a crop or stretch

response = requests.post(f"{API_URL}/sdapi/v1/img2img", json=payload)
img_bytes = base64.b64decode(response.json()["images"][0])
Path("inpainted.png").write_bytes(img_bytes)
```

## Using LoRA Models

```bash
# Place LoRA files in the models directory
# models/Lora/my_style.safetensors
```

```python
# lora_usage.py — Apply LoRA weights in prompts via the API
import requests
import base64
from pathlib import Path

API_URL = "http://localhost:7860"

payload = {
    "prompt": "<lora:my_style:0.8> A portrait in my custom style, detailed, high quality",
    "negative_prompt": "blurry, low quality",
    "steps": 30,
    "cfg_scale": 7,
    "width": 1024,
    "height": 1024,
}

response = requests.post(f"{API_URL}/sdapi/v1/txt2img", json=payload)
img_bytes = base64.b64decode(response.json()["images"][0])
Path("lora_output.png").write_bytes(img_bytes)
```

## Extensions

```bash
# Install popular extensions via git clone into the extensions directory
cd stable-diffusion-webui/extensions

# ControlNet — Guided generation with edge/depth/pose
git clone https://github.com/Mikubill/sd-webui-controlnet.git

# Adetailer — Automatic face/hand detail improvement
git clone https://github.com/Bing-su/adetailer.git

# Regional Prompter — Different prompts for different image regions
git clone https://github.com/hako-mikan/sd-webui-regional-prompter.git

# Restart WebUI to load extensions
```

Or use Extensions > Install from URL in the UI. Each extension runs arbitrary Python inside the WebUI process, so install only ones you trust. ControlNet needs separate model files in `extensions/sd-webui-controlnet/models/`.

## Batch Processing

```python
# batch_generate.py — Generate multiple images with different prompts
import requests
import base64
from pathlib import Path

API_URL = "http://localhost:7860"

prompts = [
    "A cyberpunk city at night, neon lights, rain",
    "A cozy cabin in the mountains, snow, warm light",
    "An underwater coral reef, tropical fish, sunlight",
]

for i, prompt in enumerate(prompts):
    response = requests.post(f"{API_URL}/sdapi/v1/txt2img", json={
        "prompt": prompt,
        "negative_prompt": "blurry, low quality",
        "steps": 25,
        "cfg_scale": 7,
        "width": 1024,
        "height": 1024,
    })
    img_bytes = base64.b64decode(response.json()["images"][0])
    Path(f"batch_{i}.png").write_bytes(img_bytes)
    print(f"Generated batch_{i}.png")
```

## Examples

The scripts above are complete examples. Typical requests: "generate a 1024x1024 watercolor garden with SDXL" is the txt2img script (it writes `output_0.png`); "restyle photo.png as an oil painting at 0.6 strength" is the img2img script; "replace the dog in photo.png using mask.png" is the inpainting script. Before scripting, confirm the server answers with `curl -s http://127.0.0.1:7860/sdapi/v1/sd-models`, which lists the installed checkpoints. Switch checkpoints per request with `"override_settings": {"sd_model_checkpoint": "sd_xl_base_1.0.safetensors"}`.

## Key Concepts

- **txt2img**: Generate images from text prompts — the core feature
- **img2img**: Transform existing images using prompts and denoising strength
- **Inpainting**: Edit specific masked regions while preserving the rest
- **LoRA**: Apply fine-tuned style adapters via `<lora:name:weight>` in prompts
- **Extensions**: Plugin system for ControlNet, Adetailer, regional prompting, and more
- **API**: Full REST API at `/sdapi/v1/` — automate everything the UI can do
- **Samplers**: DPM++ 2M (with the Karras scheduler), Euler a, DDIM — different speed/quality tradeoffs

## Guidelines

- `--listen` binds to 0.0.0.0 and exposes the UI and API to your network. Leave it off on shared or public networks; if you need remote access add `--api-auth user:password` and `--gradio-auth user:password`, and put it behind a VPN or an SSH tunnel. Avoid `--share`, which publishes a public gradio.live URL, and `--enable-insecure-extension-access`.
- `--allow-code` lets the UI run arbitrary Python; never enable it on a reachable server.
- The API call blocks until generation finishes and returns base64 PNGs; set a long `timeout` in `requests.post` for big batches or SDXL on a slow GPU.
- A seed of `-1` is random; save the seed from the `info` field in the response to reproduce an image.
- `"width"`/`"height"` far from the model's trained size produce duplicated subjects; use hires fix or img2img upscaling instead.
- For newer models (Flux and similar) use a maintained UI such as ComfyUI or Forge; this project's last release is from 2024.
