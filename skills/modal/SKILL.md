---
name: modal
description: |
  Serverless GPU compute platform for running Python functions in the cloud. Deploy ML models,
  run training jobs, and serve inference endpoints without managing infrastructure. Supports
  A100/H100 GPUs, custom container images, and scales to zero automatically.
license: Apache-2.0
compatibility:
  - python 3.9+
  - modal-client 0.50+
  - Linux/macOS
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - serverless
    - gpu-compute
    - model-serving
    - cloud
    - inference
---

# Modal

## Installation

```bash
# Install Modal client and authenticate
pip install modal
modal setup  # Opens browser for authentication
```

## Hello World — Run a Function on GPU

```python
# hello_gpu.py — Run a simple function on a cloud GPU
import modal

app = modal.App("hello-gpu")

@app.function(gpu="T4")
def gpu_info():
    import subprocess
    result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
    return result.stdout

@app.local_entrypoint()
def main():
    print(gpu_info.remote())
```

```bash
# Run it
modal run hello_gpu.py
```

## Custom Container Images

```python
# custom_image.py — Define a custom container with ML dependencies
import modal

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch==2.1.0",
    "transformers==4.36.0",
    "accelerate",
    "bitsandbytes",
)

app = modal.App("ml-inference", image=image)

@app.function(gpu="A100", timeout=300)
def generate(prompt: str) -> str:
    from transformers import pipeline
    pipe = pipeline("text-generation", model="mistralai/Mistral-7B-v0.1", device=0)
    result = pipe(prompt, max_new_tokens=200)
    return result[0]["generated_text"]

@app.local_entrypoint()
def main():
    print(generate.remote("The meaning of life is"))
```

## Model Serving with Web Endpoints

```python
# serve_model.py — Deploy an inference API with automatic scaling
import modal

app = modal.App("llm-server")

image = modal.Image.debian_slim().pip_install("vllm")

@app.cls(gpu="A100", image=image, container_idle_timeout=300)
class LLMServer:
    @modal.enter()
    def load_model(self):
        from vllm import LLM
        self.llm = LLM(model="mistralai/Mistral-7B-Instruct-v0.2")

    @modal.web_endpoint(method="POST")
    def generate(self, request: dict):
        from vllm import SamplingParams
        params = SamplingParams(temperature=0.7, max_tokens=request.get("max_tokens", 200))
        outputs = self.llm.generate([request["prompt"]], params)
        return {"text": outputs[0].outputs[0].text}
```

```bash
# Deploy the endpoint
modal deploy serve_model.py
# Returns: https://your-username--llm-server-llmserver-generate.modal.run
```

## Volumes for Persistent Storage

```python
# volume_cache.py — Cache model weights across function invocations
import modal

volume = modal.Volume.from_name("model-cache", create_if_missing=True)
app = modal.App("cached-model")

image = modal.Image.debian_slim().pip_install("huggingface_hub", "torch", "transformers")

@app.function(gpu="A100", volumes={"/models": volume}, image=image, timeout=600)
def run_inference(prompt: str) -> str:
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import torch

    model_path = "/models/mistral-7b"
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForCausalLM.from_pretrained(model_path, torch_dtype=torch.float16, device_map="auto")

    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    outputs = model.generate(**inputs, max_new_tokens=100)
    return tokenizer.decode(outputs[0], skip_special_tokens=True)
```

## Parallel Map (Batch Processing)

```python
# batch_process.py — Process many items in parallel across GPUs
import modal

app = modal.App("batch-embeddings")
image = modal.Image.debian_slim().pip_install("sentence-transformers")

@app.function(gpu="T4", image=image, concurrency_limit=10)
def embed(text: str) -> list[float]:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")
    return model.encode(text).tolist()

@app.local_entrypoint()
def main():
    texts = [f"Document {i}: This is sample text." for i in range(100)]
    # Process all texts in parallel
    results = list(embed.map(texts))
    print(f"Generated {len(results)} embeddings of dim {len(results[0])}")
```

## Scheduled Jobs (Cron)

```python
# scheduled_job.py — Run a function on a schedule
import modal

app = modal.App("daily-training")

@app.function(schedule=modal.Cron("0 2 * * *"), gpu="A100", timeout=3600)
def nightly_finetune():
    """Runs every night at 2 AM UTC"""
    print("Starting nightly fine-tuning job...")
    # training logic here
```

## Secrets Management

```python
# secrets.py — Access API keys and secrets securely
import modal

app = modal.App("with-secrets")

@app.function(secrets=[modal.Secret.from_name("my-openai-secret")])
def call_openai():
    import os
    from openai import OpenAI
    # OPENAI_API_KEY is injected from the secret
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello"}],
    ).choices[0].message.content
```

## Key Concepts

- **Scales to zero**: No cost when idle; containers spin up on demand
- **GPU selection**: `"T4"`, `"A10G"`, `"A100"`, `"H100"` — pick by workload
- **`@modal.enter()`**: Runs once when container starts — ideal for loading models
- **Volumes**: Persistent storage shared across function calls for model caching
- **`.map()`**: Fan out work across many containers in parallel
- **Web endpoints**: Auto-generated HTTPS URLs with authentication
- **`modal deploy`** for persistent endpoints, `modal run` for one-off execution
