---
name: mlx-vlm
description: >-
  Runs and fine-tunes vision language models (image, audio and video plus text) locally on Apple Silicon Macs with MLX, from a CLI, a Python API or an OpenAI-compatible server. Use when installing mlx-vlm, describing or extracting text from images with a local model, batch processing images, serving a local VLM over HTTP, LoRA fine-tuning a vision model, or comparing a local VLM to cloud vision APIs.
license: Apache-2.0
compatibility: "Apple Silicon Mac (M1 or newer) with a recent macOS, Python 3.10+. mlx-vlm 0.7.x needs mlx 0.32+ and transformers 5.14+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["mlx", "vision", "apple-silicon", "vlm", "local-llm"]
  repository: https://github.com/Blaizzy/mlx-vlm
---

# MLX-VLM — Vision Language Models on Apple Silicon

## Overview

mlx-vlm runs vision-language models natively on Apple Silicon through Apple's MLX framework: image, multi-image, audio and video input, plus quantization, LoRA fine-tuning and an OpenAI-compatible HTTP server. Unified memory means no separate GPU server. Models are downloaded from the Hugging Face Hub, usually as pre-converted `mlx-community/...` repositories.

This page follows mlx-vlm 0.7.x (0.7.4 at the time of writing). The project moves fast: run `mlx_vlm.generate --help` to see the flags of your installed version.

## Instructions

### Installation

```bash
python3 -m venv ~/.venvs/mlx-vlm
source ~/.venvs/mlx-vlm/bin/activate
pip install -U mlx-vlm
pip install -U "mlx-vlm[ui]"      # adds Gradio for mlx_vlm.chat_ui
pip install -U "mlx-vlm[train]"   # adds `datasets` for mlx_vlm.lora
```

Installed commands: `mlx_vlm.generate`, `mlx_vlm.chat`, `mlx_vlm.chat_ui`, `mlx_vlm.server`, `mlx_vlm.convert`. Fine-tuning runs as a module: `python -m mlx_vlm.lora`.

### Model choice

| Model (mlx-community repo) | Good for |
|---------------------------|----------|
| `Qwen2.5-VL-3B-Instruct-4bit` | Small and fast, OCR and documents, 16 GB Macs |
| `Qwen2.5-VL-7B-Instruct-4bit`, `Qwen3-VL-8B-Instruct-4bit` | Stronger OCR and reasoning |
| `gemma-3-4b-it-4bit` | General image Q&A |
| `SmolVLM-Instruct-4bit` | Very light, quick tests |
| `Llama-3.2-11B-Vision-Instruct-4bit`, `pixtral-12b-4bit` | Larger general models (36 GB+ advised) |

Check a repository exists on huggingface.co before using it; names change. The supported architectures also include Idefics3, Moondream, LLaVA variants and audio-capable models such as Gemma-3n and MiniCPM-o.

### CLI

```bash
mlx_vlm.generate --model mlx-community/Qwen2.5-VL-3B-Instruct-4bit \
  --image receipt.jpg --prompt "Extract the merchant, date and total as JSON" \
  --max-tokens 512

# several images in one prompt
mlx_vlm.generate --model mlx-community/Qwen2.5-VL-3B-Instruct-4bit \
  --image before.png after.png --prompt "What changed between these screenshots?"
```
`--image` accepts local paths or URLs. Also available: `--audio`, `--video` with `--fps`, `--temperature` (default 0), `--top-p`, `--system`, `--adapter-path`. The default `--max-tokens` is 2048.

### Python API

```python
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config

model_path = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"
model, processor = load(model_path)
config = load_config(model_path)

images = ["product.jpg"]
prompt = apply_chat_template(processor, config, "What objects are in this image?", num_images=len(images))
result = generate(model, processor, prompt, image=images, max_tokens=512, temperature=0.0)
print(result.text)
```
The keyword is `image` (not `images`), and `generate` returns a result object: the answer is `result.text`, token counts and speed are on the same object. `stream_generate` yields chunks with `.text`.

### OpenAI-compatible server

```bash
mlx_vlm.server --model mlx-community/Qwen2.5-VL-3B-Instruct-4bit --host 127.0.0.1 --port 8080
```
Serves `/v1/chat/completions`, `/v1/responses`, `/v1/models` and `/health`; image parts use the normal OpenAI `image_url` content format. `--api-key` (or env `MLX_VLM_SERVER_API_KEY`) requires a bearer token.

### Convert and quantize a model

```bash
mlx_vlm.convert --hf-path Qwen/Qwen2.5-VL-3B-Instruct --mlx-path ./qwen25vl-3b-4bit \
  --quantize --q-bits 4 --q-group-size 64
```

### LoRA fine-tuning

```bash
python -m mlx_vlm.lora \
  --model-path mlx-community/Qwen2-VL-2B-Instruct-bf16 \
  --dataset ./invoice-dataset --split train \
  --epochs 2 --batch-size 1 --learning-rate 1e-5 \
  --lora-rank 8 --lora-alpha 16 \
  --output-path ./adapters/invoice.safetensors
```
`--dataset` is passed to Hugging Face `datasets.load_dataset`: a Hub dataset id or a local dataset. Rows need an `images` (or `image`) column plus either a `messages` / `conversations` column in chat format, or `question` and `answer` columns for single-turn tasks. Other flags: `--iters` (default 1000), `--train-on-completions`, `--grad-checkpoint`, `--full-finetune`, `--train-mode orpo`. Use the result with `mlx_vlm.generate --adapter-path` or `load(model_path, adapter_path=...)`.

## Examples

### Example 1: "Describe every product photo in a folder into a CSV"

```python
import csv, pathlib
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config

model_path = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"
model, processor = load(model_path)
config = load_config(model_path)

rows = []
for photo in sorted(pathlib.Path("catalog-photos").glob("*.jpg")):
    prompt = apply_chat_template(
        processor, config,
        "Describe this product photo in one sentence: category, color, condition.",
        num_images=1,
    )
    out = generate(model, processor, prompt, image=[str(photo)], max_tokens=120)
    rows.append({"file": photo.name, "description": out.text.strip()})

with open("descriptions.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["file", "description"])
    writer.writeheader()
    writer.writerows(rows)
```
Load the model once, outside the loop. The CSV has one row per photo, e.g. `blue-kettle.jpg, "A blue stainless-steel electric kettle, like new."`.

### Example 2: "Give my scripts a local vision endpoint"

```bash
mlx_vlm.server --model mlx-community/Qwen2.5-VL-3B-Instruct-4bit --host 127.0.0.1 --port 8080
curl http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "mlx-community/Qwen2.5-VL-3B-Instruct-4bit",
  "messages": [{"role": "user", "content": [
    {"type": "text", "text": "What is the total on this receipt?"},
    {"type": "image_url", "image_url": {"url": "https://shop.test/receipts/1042.jpg"}}]}],
  "max_tokens": 100}'
```
The reply is a standard chat-completion JSON, so the OpenAI SDK works with `base_url="http://127.0.0.1:8080/v1"`.

## Guidelines

- Local versus cloud: local keeps images on the machine, costs nothing per image and works offline; frontier cloud models are usually more accurate on hard documents and faster per image. Use a local 3-12B model for private or high-volume jobs, a cloud model when accuracy matters most.
- The server defaults to host `0.0.0.0` (all interfaces). Pass `--host 127.0.0.1`, or set `--api-key`, so it is not exposed to your network.
- Prefer 4-bit models (`4bit` in the name): far less memory and faster, with a small quality loss. Rough guide: 16 GB Macs take 3-4B 4-bit models, 32 GB and more take 7-12B.
- The first run downloads the model (several GB for 7B+); `HF_HOME` controls where the cache goes.
- Large images use many tokens and memory; `--resize-shape` on `mlx_vlm.generate` shrinks the input.
- Models flagged `trust_remote_code` run code from the repository; only add `--trust-remote-code` for repositories you trust.
- mlx-vlm needs Apple Silicon; on Linux or Windows use a CUDA stack (vLLM, transformers) instead.
