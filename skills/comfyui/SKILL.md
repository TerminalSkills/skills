---
name: comfyui
description: |
  Node-based graphical interface for Stable Diffusion workflows. Build complex image generation
  pipelines by connecting nodes visually. Supports custom nodes, ControlNet, LoRA, upscaling,
  and advanced workflows with full control over the diffusion process.
license: Apache-2.0
compatibility:
  - python 3.10+
  - CUDA 11.8+ / ROCm
  - Linux/Windows (macOS experimental)
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - stable-diffusion
    - image-generation
    - node-editor
    - workflows
    - custom-nodes
---

# ComfyUI

## Installation

```bash
# install.sh — Clone and set up ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Install dependencies (NVIDIA GPU)
pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# Start the server
python main.py --listen 0.0.0.0 --port 8188
# Visit http://localhost:8188
```

## Model Setup

```bash
# setup_models.sh — Download and place models in the correct directories
cd ComfyUI

# SDXL base model
wget -P models/checkpoints/ \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"

# VAE
wget -P models/vae/ \
    "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors"

# LoRA adapters go in models/loras/
# ControlNet models go in models/controlnet/
# Upscale models go in models/upscale_models/
```

## API: Queue a Workflow

```python
# queue_prompt.py — Submit a workflow to ComfyUI via the API
import json
import requests
import uuid

COMFYUI_URL = "http://localhost:8188"

# Basic txt2img workflow
workflow = {
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 42,
            "steps": 25,
            "cfg": 7.5,
            "sampler_name": "euler_ancestral",
            "scheduler": "normal",
            "denoise": 1.0,
            "model": ["4", 0],
            "positive": ["6", 0],
            "negative": ["7", 0],
            "latent_image": ["5", 0],
        },
    },
    "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"},
    },
    "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "A majestic mountain landscape at golden hour, photorealistic, 8k",
            "clip": ["4", 1],
        },
    },
    "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "blurry, low quality, distorted",
            "clip": ["4", 1],
        },
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "comfyui_output", "images": ["8", 0]},
    },
}

client_id = str(uuid.uuid4())
response = requests.post(
    f"{COMFYUI_URL}/prompt",
    json={"prompt": workflow, "client_id": client_id},
)
print(f"Queued: {response.json()}")
```

## API: Get Results and Download Images

```python
# get_results.py — Poll for completion and download generated images
import requests
import time
import urllib.request

COMFYUI_URL = "http://localhost:8188"

def wait_for_completion(prompt_id: str) -> dict:
    while True:
        response = requests.get(f"{COMFYUI_URL}/history/{prompt_id}")
        history = response.json()
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(1)

def download_images(history: dict, output_dir: str = "./outputs"):
    import os
    os.makedirs(output_dir, exist_ok=True)
    for node_id, node_output in history["outputs"].items():
        if "images" in node_output:
            for image in node_output["images"]:
                url = f"{COMFYUI_URL}/view?filename={image['filename']}&subfolder={image.get('subfolder', '')}&type={image['type']}"
                filepath = os.path.join(output_dir, image["filename"])
                urllib.request.urlretrieve(url, filepath)
                print(f"Saved: {filepath}")

# Usage after queuing a prompt
prompt_id = "your-prompt-id"
history = wait_for_completion(prompt_id)
download_images(history)
```

## Custom Nodes (ComfyUI Manager)

```bash
# install_manager.sh — Install ComfyUI Manager for easy custom node management
cd ComfyUI/custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git

# Restart ComfyUI — Manager button appears in the UI
# Popular custom node packs:
# - ComfyUI-Impact-Pack: Detection, segmentation, inpainting
# - ComfyUI-AnimateDiff: Animation from static images
# - ComfyUI-IPAdapter: Image prompt adapter for style transfer
# - rgthree-comfy: Workflow organization utilities
```

## ControlNet Workflow

```python
# controlnet_workflow.py — Generate images guided by ControlNet (edge detection, depth, pose)
controlnet_nodes = {
    "10": {
        "class_type": "ControlNetLoader",
        "inputs": {"control_net_name": "control_v11p_sd15_canny.pth"},
    },
    "11": {
        "class_type": "LoadImage",
        "inputs": {"image": "input_image.png"},
    },
    "12": {
        "class_type": "CannyEdgePreprocessor",
        "inputs": {"image": ["11", 0], "low_threshold": 100, "high_threshold": 200},
    },
    "13": {
        "class_type": "ControlNetApply",
        "inputs": {
            "conditioning": ["6", 0],
            "control_net": ["10", 0],
            "image": ["12", 0],
            "strength": 0.8,
        },
    },
}
# Connect node "13" output to KSampler positive conditioning instead of "6"
```

## Docker Deployment

```yaml
# docker-compose.yml — Run ComfyUI in Docker with GPU support
version: "3.8"
services:
  comfyui:
    image: ghcr.io/ai-dock/comfyui:latest
    ports:
      - "8188:8188"
    volumes:
      - ./models:/workspace/ComfyUI/models
      - ./output:/workspace/ComfyUI/output
      - ./custom_nodes:/workspace/ComfyUI/custom_nodes
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
```

## Key Concepts

- **Nodes and links**: Visual programming — connect output slots to input slots to build pipelines
- **Workflows**: Saved as JSON files — shareable, version-controllable, API-submittable
- **Custom nodes**: Extend functionality via Python — community ecosystem via ComfyUI Manager
- **Checkpoints**: Model files (`.safetensors`) placed in `models/checkpoints/`
- **LoRA**: Lightweight fine-tuned adapters loaded alongside base models
- **ControlNet**: Guide generation with structural inputs (edges, depth, pose)
- **API-first**: Full HTTP API for queuing prompts and retrieving results programmatically
