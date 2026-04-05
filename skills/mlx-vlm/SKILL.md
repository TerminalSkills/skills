---
name: mlx-vlm
description: >-
  Run Vision Language Models locally on Apple Silicon Macs using MLX. Use when:
  installing mlx-vlm, running VLM inference (image + text → response), fine-tuning
  vision models on custom datasets, batch processing images with local AI,
  comparing local VLM to cloud APIs (GPT-4V, Claude Vision), or working with
  LLaVA, Phi-3-Vision, Qwen2-VL, Pixtral, Llama-3.2-Vision on Mac.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["mlx", "vision", "vlm", "mac", "apple-silicon", "local-ai", "fine-tuning"]
  use-cases:
    - "Analyze product photos locally without cloud API costs"
    - "Fine-tune a vision model on custom image datasets"
    - "Batch process images with AI-generated descriptions on Mac"
  agents: [claude-code, openai-codex, cursor]
---

# MLX-VLM — Vision Language Models on Apple Silicon

## Overview

mlx-vlm runs vision-language models natively on Apple Silicon using the MLX framework. It supports inference and fine-tuning with unified memory — no GPU server needed.

**Repo:** `Blaizzy/mlx-vlm`  
**Requirements:** macOS 14+, Apple Silicon (M1/M2/M3/M4), Python 3.10+

## Installation

```bash
# Create virtual environment (recommended)
python3 -m venv ~/.venvs/mlx-vlm
source ~/.venvs/mlx-vlm/bin/activate

# Install
pip install mlx-vlm
```

For development:
```bash
git clone https://github.com/Blaizzy/mlx-vlm.git
cd mlx-vlm && pip install -e .
```

## Supported Models

| Model | HuggingFace ID | Best For |
|-------|---------------|----------|
| Pixtral | `mistral-community/pixtral-12b-240910` | General vision, multi-image |
| Qwen2-VL | `Qwen/Qwen2-VL-7B-Instruct` | OCR, document understanding |
| Phi-3-Vision | `microsoft/Phi-3.5-vision-instruct` | Lightweight, fast inference |
| LLaVA-1.6 | `llava-hf/llava-v1.6-mistral-7b-hf` | Conversation about images |
| Llama-3.2-Vision | `meta-llama/Llama-3.2-11B-Vision-Instruct` | Strong general reasoning |

## Inference

### CLI

```bash
# Single image analysis
python -m mlx_vlm.generate \
  --model mlx-community/pixtral-12b-240910-4bit \
  --image path/to/image.jpg \
  --prompt "Describe this image in detail" \
  --max-tokens 512

# Multi-image comparison
python -m mlx_vlm.generate \
  --model mlx-community/pixtral-12b-240910-4bit \
  --image img1.jpg img2.jpg \
  --prompt "Compare these two images"
```

### Python API

```python
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template

model_path = "mlx-community/pixtral-12b-240910-4bit"
model, processor = load(model_path)

prompt = apply_chat_template(
    processor,
    config=model.config,
    prompt="What objects are in this image?",
    images=["product.jpg"],
)

output = generate(
    model, processor, prompt,
    images=["product.jpg"],
    max_tokens=512,
    temperature=0.7,
)
print(output)
```

### Batch Processing

```python
import os, csv
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template

model, processor = load("mlx-community/pixtral-12b-240910-4bit")
image_dir = "images/"

results = []
for filename in os.listdir(image_dir):
    if not filename.lower().endswith((".jpg", ".png", ".webp")):
        continue
    path = os.path.join(image_dir, filename)
    prompt = apply_chat_template(
        processor, config=model.config,
        prompt="Describe this product photo. Include: category, color, condition, key features.",
        images=[path],
    )
    desc = generate(model, processor, prompt, images=[path], max_tokens=256)
    results.append({"file": filename, "description": desc})

with open("descriptions.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["file", "description"])
    writer.writeheader()
    writer.writerows(results)
```

## Fine-Tuning

### Prepare Dataset

Create JSONL with image paths and conversations:
```json
{"image": "train/001.jpg", "conversations": [{"role": "user", "content": "Classify this product"}, {"role": "assistant", "content": "Category: Electronics, Subcategory: Headphones, Condition: New"}]}
{"image": "train/002.jpg", "conversations": [{"role": "user", "content": "Classify this product"}, {"role": "assistant", "content": "Category: Clothing, Subcategory: T-Shirt, Condition: Used - Good"}]}
```

### Run Fine-Tuning (LoRA)

```bash
python -m mlx_vlm.lora \
  --model mlx-community/pixtral-12b-240910-4bit \
  --data ./dataset \
  --train-file train.jsonl \
  --valid-file val.jsonl \
  --num-layers 8 \
  --batch-size 1 \
  --epochs 3 \
  --lr 1e-5 \
  --adapter-path ./adapters
```

### Inference with Fine-Tuned Adapter

```bash
python -m mlx_vlm.generate \
  --model mlx-community/pixtral-12b-240910-4bit \
  --adapter-path ./adapters \
  --image test.jpg \
  --prompt "Classify this product"
```

## Cloud API Comparison

| Factor | mlx-vlm (Local) | Cloud APIs (GPT-4V, Claude) |
|--------|-----------------|---------------------------|
| Cost | $0 after hardware | $0.01-0.04 per image |
| Privacy | Data stays local | Data sent to provider |
| Speed | ~2-8s per image (M3 Max) | ~1-3s per image |
| Offline | Yes | No |
| Custom models | LoRA fine-tuning | Limited / expensive |
| Quality | Good (7-12B models) | Excellent (frontier models) |

## Performance Tips

- Use 4-bit quantized models (`4bit` in name) for 2-3x speedup with minimal quality loss
- M3 Max / M4 Pro with 36GB+ RAM can run 12B models comfortably
- For M1/M2 with 16GB, stick to 7B 4-bit models
- Set `MLX_METAL_JIT=1` for potential speedup on first run
- Close memory-heavy apps before inference — unified memory is shared with system
