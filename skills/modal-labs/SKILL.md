---
name: modal-labs
description: >-
  Serverless GPU infrastructure for ML and data pipelines using Modal. Use when:
  running GPU workloads without managing servers, deploying ML models for
  inference, batch processing large datasets, or scheduling ML jobs on a cron.
license: Apache-2.0
compatibility: "Requires Python 3.9+. Modal account and CLI required."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ml-infra
  tags: ["modal", "serverless-gpu", "ml", "inference", "python"]
  use-cases:
    - "Run fine-tuning on an A100 without provisioning any servers"
    - "Deploy an LLM inference endpoint that scales to zero when idle"
    - "Schedule nightly batch ML jobs with GPU acceleration"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Modal Labs

## Overview

Modal is a serverless cloud platform for Python that lets you run GPU-accelerated ML workloads, inference endpoints, and data pipelines without managing infrastructure. You define functions decorated with `@app.function`, and Modal handles provisioning, scaling, and billing — you only pay for what you use.

Key features:
- GPUs on demand: A100, H100, T4, L4, and more
- Auto-scaling including scale-to-zero
- Persistent volumes for model weights and datasets
- Web endpoints, job queues, and cron scheduling
- Fast container builds with image caching

## Setup

### Install and authenticate

```bash
pip install modal
modal setup   # opens browser to authenticate
```

### Initialize an app

Every Modal program starts with an `App` object:

```python
import modal

app = modal.App("my-ml-app")
```

## Instructions

### Step 1: Define a GPU function

Use the `@app.function` decorator with `gpu=` to request GPU hardware:

```python
import modal

app = modal.App("gpu-demo")

@app.function(gpu="T4")
def run_on_gpu():
    import torch
    device = torch.device("cuda")
    x = torch.randn(1000, 1000, device=device)
    result = (x @ x.T).sum().item()
    print(f"Result: {result:.2f}")
    return result

@app.local_entrypoint()
def main():
    result = run_on_gpu.remote()
    print("Got:", result)
```

### GPU options

```python
# Single GPU
@app.function(gpu="T4")       # NVIDIA T4 — affordable, good for inference
@app.function(gpu="L4")       # NVIDIA L4 — balanced performance
@app.function(gpu="A100-40GB") # A100 40GB — large model training
@app.function(gpu="A100-80GB") # A100 80GB — largest workloads
@app.function(gpu="H100")     # H100 — fastest available

# Multiple GPUs
@app.function(gpu=modal.gpu.A100(count=4))
```

### Step 2: Build custom container images

Pre-install packages to avoid reinstalling on every run:

```python
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.2.0",
        "transformers==4.40.0",
        "accelerate",
        "bitsandbytes",
    )
)

@app.function(image=image, gpu="A100-80GB")
def run_inference(prompt: str) -> str:
    from transformers import pipeline

    pipe = pipeline("text-generation", model="meta-llama/Llama-3-8B-Instruct")
    result = pipe(prompt, max_new_tokens=200)
    return result[0]["generated_text"]
```

### Step 3: Persistent volumes for model weights

Use `modal.Volume` to store large files (model weights, datasets) that persist across runs:

```python
volume = modal.Volume.from_name("model-weights", create_if_missing=True)

@app.function(
    image=image,
    gpu="A100-80GB",
    volumes={"/models": volume},
    timeout=3600,
)
def download_and_cache_model():
    from huggingface_hub import snapshot_download

    snapshot_download(
        "meta-llama/Llama-3-8B-Instruct",
        local_dir="/models/llama-3-8b",
        token="hf_your_token",
    )
    print("Model cached to volume.")
```

### Step 4: Web endpoints

Expose a function as an HTTP endpoint:

```python
from fastapi import FastAPI

web_app = FastAPI()

@app.function(image=image, gpu="T4")
@modal.asgi_app()
def serve():
    @web_app.post("/generate")
    async def generate(request: dict):
        prompt = request["prompt"]
        result = run_inference(prompt)
        return {"text": result}

    return web_app
```

Deploy and get a public URL:

```bash
modal deploy app.py
# → https://your-workspace--my-ml-app-serve.modal.run
```

### Step 5: Batch processing with `.map()`

Process many items in parallel — Modal spawns one container per item:

```python
@app.function(gpu="T4", image=image)
def embed_text(text: str) -> list[float]:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    return model.encode(text).tolist()

@app.local_entrypoint()
def main():
    texts = ["Hello world", "How are you?", "Modal is great"]
    embeddings = list(embed_text.map(texts))
    print(f"Got {len(embeddings)} embeddings")
```

### Step 6: Scheduled (cron) functions

Run a function on a schedule:

```python
@app.function(
    schedule=modal.Period(hours=6),  # every 6 hours
    gpu="T4",
    image=image,
)
def nightly_batch_job():
    print("Running scheduled ML job...")
    # fetch data, run inference, save results
    pass

# Or use a cron expression
@app.function(schedule=modal.Cron("0 2 * * *"))  # 2am UTC daily
def daily_retrain():
    pass
```

### Step 7: Run locally vs remotely

```python
# Run remotely on Modal
result = my_function.remote(arg)

# Run locally (for debugging)
result = my_function.local(arg)

# Spawn async
call = my_function.spawn(arg)
result = call.get()
```

## Complete Example: LLM Inference Service

```python
import modal

app = modal.App("llm-inference")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("transformers", "torch", "accelerate", "sentencepiece")
)

volume = modal.Volume.from_name("llm-weights", create_if_missing=True)

MODEL_DIR = "/models"
MODEL_ID = "mistralai/Mistral-7B-Instruct-v0.2"


@app.function(
    image=image,
    gpu="A100-40GB",
    volumes={MODEL_DIR: volume},
    timeout=600,
    memory=32768,
)
def generate(prompt: str, max_tokens: int = 512) -> str:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(f"{MODEL_DIR}/{MODEL_ID}")
    model = AutoModelForCausalLM.from_pretrained(
        f"{MODEL_DIR}/{MODEL_ID}",
        torch_dtype=torch.float16,
        device_map="auto",
    )

    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=max_tokens)

    return tokenizer.decode(outputs[0], skip_special_tokens=True)


@app.local_entrypoint()
def main():
    response = generate.remote("Explain transformers in simple terms.")
    print(response)
```

```bash
# Deploy
modal deploy app.py

# Run once
modal run app.py

# View logs and usage
modal app logs my-ml-app
```

## Guidelines

- Use `modal.Volume` for model weights — downloading multi-GB models on every cold start is slow and expensive.
- Choose the right GPU: T4/L4 for inference, A100 for training or large models, H100 for maximum performance.
- Set `timeout=` explicitly for long jobs (default is 300s); training runs may need `timeout=86400`.
- Use `.map()` for embarrassingly parallel workloads — it scales automatically.
- Use `@modal.web_endpoint()` or `@modal.asgi_app()` for HTTP APIs; Modal gives you a stable URL after `modal deploy`.
- Keep image builds fast: install packages in the image definition, not inside the function body.
- Use `modal run` for one-off jobs and `modal deploy` for persistent services.
- Check costs in the Modal dashboard — GPU time adds up quickly with large models.
