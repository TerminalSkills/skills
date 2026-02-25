---
title: Build an AI Image Generation Pipeline
slug: build-ai-image-generation-pipeline
description: |
  Set up a Stable Diffusion image generation pipeline using ComfyUI for advanced workflows,
  Replicate for scalable API access, and Gradio for a user-friendly web interface.
skills:
  - comfyui
  - replicate
  - gradio
category: data-ai
tags:
  - image-generation
  - stable-diffusion
  - web-ui
  - api
  - creative-tools
---

# Build an AI Image Generation Pipeline

Zara is a creative technologist at a marketing agency. Her designers need a tool to generate product mockups, social media visuals, and concept art — fast. She wants ComfyUI for advanced workflows the art team can customize, Replicate for API-driven batch generation, and Gradio for a simple interface that non-technical team members can use.

## Step 1: Set Up ComfyUI for Advanced Workflows

Zara starts with ComfyUI as the power-user backend. The art director can build custom node workflows for different styles, and the whole thing is controllable via API.

```bash
# setup_comfyui.sh — Install ComfyUI with SDXL and popular custom nodes
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# Download SDXL model
wget -P models/checkpoints/ \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"

# Install ComfyUI Manager for easy node management
cd custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
cd ..

python main.py --listen 0.0.0.0 --port 8188
```

```python
# comfyui_client.py — Submit generation jobs to ComfyUI programmatically
import requests
import uuid
import time
import urllib.request
import os

COMFYUI_URL = "http://localhost:8188"

def generate_with_comfyui(prompt: str, negative: str = "", width: int = 1024, height: int = 1024, seed: int = -1) -> str:
    """Submit a workflow to ComfyUI and return the output image path."""
    import random
    if seed == -1:
        seed = random.randint(0, 2**32)

    workflow = {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative or "blurry, low quality", "clip": ["4", 1]}},
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 25, "cfg": 7.5, "sampler_name": "euler_ancestral",
            "scheduler": "normal", "denoise": 1.0,
            "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0],
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "api_output", "images": ["8", 0]}},
    }

    client_id = str(uuid.uuid4())
    resp = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow, "client_id": client_id})
    prompt_id = resp.json()["prompt_id"]

    # Wait for completion
    while True:
        history = requests.get(f"{COMFYUI_URL}/history/{prompt_id}").json()
        if prompt_id in history:
            break
        time.sleep(1)

    # Download the image
    images = history[prompt_id]["outputs"]["9"]["images"]
    image = images[0]
    url = f"{COMFYUI_URL}/view?filename={image['filename']}&subfolder={image.get('subfolder','')}&type={image['type']}"
    output_path = f"./outputs/{image['filename']}"
    os.makedirs("./outputs", exist_ok=True)
    urllib.request.urlretrieve(url, output_path)
    return output_path
```

## Step 2: Set Up Replicate for Scalable API Access

For batch generation jobs and when the local GPU is busy, Zara uses Replicate as a cloud fallback. It's also great for trying different models without downloading them.

```python
# replicate_generator.py — Generate images via Replicate API with fallback models
import replicate
import requests
import os

def generate_with_replicate(
    prompt: str,
    negative: str = "blurry, low quality, distorted",
    width: int = 1024,
    height: int = 1024,
    model: str = "stability-ai/sdxl",
) -> str:
    """Generate an image using Replicate's cloud GPU."""
    output = replicate.run(
        f"{model}:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
        input={
            "prompt": prompt,
            "negative_prompt": negative,
            "width": width,
            "height": height,
            "num_outputs": 1,
            "scheduler": "DPMSolverMultistep",
            "num_inference_steps": 25,
            "guidance_scale": 7.5,
        },
    )

    image_url = output[0]
    os.makedirs("./outputs", exist_ok=True)
    output_path = f"./outputs/replicate_{hash(prompt) % 10000}.png"
    img_data = requests.get(image_url).content
    with open(output_path, "wb") as f:
        f.write(img_data)
    return output_path

def batch_generate(prompts: list[str]) -> list[str]:
    """Generate multiple images in parallel using Replicate."""
    results = []
    for prompt in prompts:
        path = generate_with_replicate(prompt)
        results.append(path)
        print(f"Generated: {path}")
    return results

# Generate product mockup variations
prompts = [
    "A minimalist smartphone on a marble surface, product photography, soft lighting",
    "A sleek laptop on a wooden desk, lifestyle photography, warm tones",
    "Premium headphones floating on a gradient background, studio lighting",
]
paths = batch_generate(prompts)
```

## Step 3: Build the Gradio Interface

Now Zara builds the user-facing interface. Designers and marketing folks can type a prompt, pick a style preset, and generate images without touching any code.

```python
# app.py — Gradio interface combining ComfyUI and Replicate backends
import gradio as gr
import os

# Import generators from previous steps
# from comfyui_client import generate_with_comfyui
# from replicate_generator import generate_with_replicate

STYLE_PRESETS = {
    "Product Photography": ", professional product photography, studio lighting, white background, 8k",
    "Social Media": ", vibrant colors, modern design, instagram aesthetic, eye-catching",
    "Concept Art": ", concept art, digital painting, detailed, artstation trending",
    "Photorealistic": ", photorealistic, 8k, ultra detailed, DSLR quality, natural lighting",
    "Minimalist": ", minimalist design, clean, modern, simple composition, negative space",
}

def generate_image(prompt: str, style: str, backend: str, width: int, height: int, negative: str):
    """Generate an image using the selected backend and style."""
    full_prompt = prompt + STYLE_PRESETS.get(style, "")

    if backend == "ComfyUI (Local GPU)":
        try:
            path = generate_with_comfyui(full_prompt, negative, width, height)
        except Exception as e:
            return None, f"ComfyUI error: {e}. Try Replicate backend."
    else:
        try:
            path = generate_with_replicate(full_prompt, negative, width, height)
        except Exception as e:
            return None, f"Replicate error: {e}"

    return path, f"Generated with {backend} | {width}x{height}"

with gr.Blocks(title="Agency Image Generator", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🎨 Agency Image Generator")
    gr.Markdown("Generate product mockups, social media visuals, and concept art.")

    with gr.Row():
        with gr.Column(scale=2):
            prompt = gr.Textbox(
                label="Prompt",
                placeholder="A premium coffee mug on a wooden table...",
                lines=3,
            )
            negative = gr.Textbox(
                label="Negative Prompt",
                value="blurry, low quality, distorted, text, watermark",
                lines=2,
            )

            with gr.Row():
                style = gr.Dropdown(
                    choices=list(STYLE_PRESETS.keys()),
                    value="Product Photography",
                    label="Style Preset",
                )
                backend = gr.Radio(
                    choices=["ComfyUI (Local GPU)", "Replicate (Cloud)"],
                    value="ComfyUI (Local GPU)",
                    label="Backend",
                )

            with gr.Row():
                width = gr.Slider(512, 1536, value=1024, step=64, label="Width")
                height = gr.Slider(512, 1536, value=1024, step=64, label="Height")

            generate_btn = gr.Button("🎨 Generate", variant="primary", size="lg")

        with gr.Column(scale=2):
            output_image = gr.Image(label="Generated Image", type="filepath")
            status = gr.Textbox(label="Status", interactive=False)

    generate_btn.click(
        fn=generate_image,
        inputs=[prompt, style, backend, width, height, negative],
        outputs=[output_image, status],
    )

    gr.Examples(
        examples=[
            ["A sleek smartwatch on a dark surface with dramatic lighting", "Product Photography", "ComfyUI (Local GPU)"],
            ["Colorful abstract pattern for social media background", "Social Media", "Replicate (Cloud)"],
            ["A futuristic electric car in a cyberpunk city", "Concept Art", "Replicate (Cloud)"],
        ],
        inputs=[prompt, style, backend],
    )

demo.launch(server_name="0.0.0.0", server_port=7860, share=False)
```

## Step 4: Deploy for the Team

```bash
# run.sh — Launch the full pipeline for the agency team
#!/bin/bash

# Start ComfyUI in the background
cd /opt/ComfyUI && python main.py --listen 0.0.0.0 --port 8188 &

# Wait for ComfyUI to be ready
echo "Waiting for ComfyUI..."
until curl -s http://localhost:8188 > /dev/null 2>&1; do sleep 2; done
echo "ComfyUI ready!"

# Start the Gradio interface
cd /opt/image-gen && python app.py
```

## What Zara Achieved

Within a week, the agency's creative workflow transformed:
- **ComfyUI** handles the art director's complex workflows — ControlNet for pose matching, LoRA for brand-consistent styles, multi-step refinement pipelines
- **Replicate** picks up overflow when the office GPU is busy, and lets remote team members generate without VPN access
- **Gradio** interface gets 50+ generations/day from the marketing team — no training needed
- **Time to first mockup** dropped from 2 hours (photographer) to 30 seconds (AI + quick edits)
- The style presets ensure brand consistency across all generated assets
