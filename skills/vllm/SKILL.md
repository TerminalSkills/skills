---
name: vllm
description: >-
  vLLM is a high-throughput inference and serving engine for large language
  models that exposes an OpenAI-compatible HTTP API and a Python batch API. Use
  this skill when asked to serve an open-weight model (Llama, Qwen, Mistral,
  Gemma, Phi) on NVIDIA GPUs, run `vllm serve`, split a model across GPUs with
  tensor parallelism, serve quantized checkpoints, run it in Docker, or call it
  with the OpenAI SDK.
license: Apache-2.0
compatibility: "Linux, Python 3.10+, NVIDIA GPU with compute capability 7.5+ (also AMD ROCm, TPU, CPU builds); WSL on Windows"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/vllm-project/vllm
  tags: ["inference", "llm", "serving", "gpu", "openai-compatible"]
---

# vLLM

## Overview

vLLM serves LLMs with paged KV-cache memory (PagedAttention), continuous batching, prefix caching, chunked prefill, quantization and tensor/pipeline/data parallelism. `vllm serve` starts an OpenAI-compatible server (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, plus tokenization, health and Prometheus `/metrics` endpoints); the `LLM` class runs offline batch inference in Python. The engine is the V1 engine; older flags and environment variables from 2024-era guides may no longer exist, so check `vllm serve --help` for the installed version (0.30 at the time of writing).

## Instructions

### Install

```bash
uv venv --python 3.12 && source .venv/bin/activate
uv pip install vllm --torch-backend=auto     # picks the PyTorch/CUDA build for your driver
# plain pip alternative: pip install vllm
```

Use a fresh environment: the wheel pins its own PyTorch and CUDA kernels, and mixing in an existing PyTorch usually breaks. Blackwell GPUs need CUDA 12.8 or newer. Gated models (Llama, Gemma) need `export HF_TOKEN=...` and accepted licence terms on Hugging Face.

### Serve a model

```bash
vllm serve Qwen/Qwen3-8B \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.90 \
  --api-key "$VLLM_API_KEY"
```

The model is a positional argument (`--model` also still works). Useful flags:

- `--tensor-parallel-size 4` splits one model over 4 GPUs on one machine; `--pipeline-parallel-size` spans nodes; `--data-parallel-size` runs replicas.
- `--max-model-len` caps context length; lowering it is the first fix for out-of-memory at start-up because the KV cache is sized from it.
- `--max-num-seqs` caps concurrent sequences; `--gpu-memory-utilization` is the fraction of each GPU vLLM may use (default about 0.9).
- `--served-model-name chat-prod` sets the name clients must send as `model`.
- `--quantization` is normally unnecessary: pre-quantized checkpoints (for example `Qwen/Qwen2.5-7B-Instruct-AWQ`, GPTQ, FP8) are detected from their config. Passing `awq` for a non-AWQ model fails. Quantization needs a checkpoint that is already quantized (or an FP8 option vLLM applies on load); it does not quantize an arbitrary model for you.
- `--enable-auto-tool-choice --tool-call-parser hermes` turns on tool calling (pick the parser that matches the model family); `--reasoning-parser` is for reasoning models.
- Prefix caching is on by default in V1 for models that support it; `--enable-prefix-caching` / `--no-enable-prefix-caching` override.
- `VLLM_API_KEY` in the environment is equivalent to `--api-key`.

### Docker

```bash
docker run --runtime nvidia --gpus all --ipc=host \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  --env "HF_TOKEN=$HF_TOKEN" \
  -p 127.0.0.1:8000:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen3-8B --max-model-len 8192
```

Arguments after the image name are the same as for `vllm serve`. `--ipc=host` (or a large `--shm-size`) is required for multi-GPU. Pin a version tag such as `vllm/vllm-openai:v0.11.0` instead of `latest` in production.

### Call it with the OpenAI SDK

```python
import os
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key=os.environ["VLLM_API_KEY"])

resp = client.chat.completions.create(
    model="Qwen/Qwen3-8B",
    messages=[{"role": "user", "content": "Write a Python function that returns the nth Fibonacci number."}],
    temperature=0.7,
    max_tokens=512,
)
print(resp.choices[0].message.content)
```

`stream=True` works as with OpenAI. List what the server exposes with `curl -H "Authorization: Bearer $VLLM_API_KEY" localhost:8000/v1/models`.

### Embeddings

Serve an embedding model on its own server; a pooling model such as `BAAI/bge-large-en-v1.5` is detected automatically (`--runner pooling` forces it):

```bash
vllm serve BAAI/bge-large-en-v1.5 --port 8001
```

```python
emb = OpenAI(base_url="http://localhost:8001/v1", api_key="unused").embeddings.create(
    model="BAAI/bge-large-en-v1.5", input=["How do I reset my password?"])
print(len(emb.data[0].embedding))   # 1024
```

(If the server was started with `--api-key`, send that key instead of "unused".)

### Offline batch inference

```python
from vllm import LLM, SamplingParams

llm = LLM(model="Qwen/Qwen3-8B", max_model_len=8192, gpu_memory_utilization=0.90)
params = SamplingParams(temperature=0.7, top_p=0.9, max_tokens=256)

outputs = llm.generate(["Summarize PagedAttention in two sentences.",
                        "Write a haiku about GPUs."], params)
for o in outputs:
    print(o.prompt, "->", o.outputs[0].text.strip())

# chat-formatted input applies the model's chat template for you
chat = llm.chat([{"role": "user", "content": "What is continuous batching?"}], params)
print(chat[0].outputs[0].text)
```

## Examples

### Example 1: Serve a 70B model on four GPUs

Request: "Host Llama 3.3 70B on our 4xA100 box so the team can use the OpenAI SDK."

```bash
export HF_TOKEN=...   # from your Hugging Face account, licence accepted
vllm serve meta-llama/Llama-3.3-70B-Instruct \
  --tensor-parallel-size 4 --max-model-len 16384 --max-num-seqs 128 \
  --served-model-name llama-70b --api-key "$VLLM_API_KEY" --host 127.0.0.1
```

Weights download on first start, then the log prints the KV cache size and `Application startup complete`. A 70B bf16 model needs about 140 GB of GPU memory in total, so 4x80 GB fits with room for cache; on smaller cards use an FP8 or AWQ checkpoint. Clients use `model="llama-70b"`. Put nginx or another gateway with TLS in front before exposing it.

### Example 2: Fix an out-of-memory error at start-up

Request: "vllm crashes at startup on my 24 GB RTX 4090 with an out-of-memory error."

Lower the context and, if needed, use a quantized checkpoint: `vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ --max-model-len 8192 --gpu-memory-utilization 0.90`. A 14B bf16 model (about 28 GB) cannot fit in 24 GB at all; the 4-bit version is about 9 GB, leaving the rest for KV cache. Check GPU use with `nvidia-smi` and make sure no other process holds memory.

## Guidelines

- `--api-key` protects only the `/v1`-style inference paths; other endpoints on the same port (`/invocations`, for one, exposes the same capability as `/v1`) are not covered. Bind to 127.0.0.1 or put a reverse proxy in front; never publish port 8000 to the internet.
- `--trust-remote-code` runs code shipped with a model repository; use it only for repositories you trust.
- Do not run vLLM for a single low-traffic user on a laptop; Ollama or llama.cpp are simpler. vLLM pays off with concurrent requests on server GPUs.
- Throughput numbers in blog posts ("24x") depend on workload; benchmark your own prompts with `vllm bench serve`.
- Embedding and generation models are separate servers; one `vllm serve` process serves one model.
- Keep the vLLM version, PyTorch and CUDA driver in step; upgrading usually means recreating the environment.
