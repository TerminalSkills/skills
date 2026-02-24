---
name: vllm
description: |
  High-throughput LLM serving engine with PagedAttention for efficient memory management.
  Serves open-source models with OpenAI-compatible API, continuous batching, tensor parallelism,
  and quantization support. Optimized for production inference workloads.
license: Apache-2.0
compatibility:
  - python 3.8+
  - CUDA 11.8+
  - Linux (GPU required)
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - llm-serving
    - inference
    - high-throughput
    - paged-attention
    - openai-compatible
---

# vLLM

## Installation

```bash
# Install vLLM
pip install vllm
```

## Start OpenAI-Compatible Server

```bash
# serve.sh — Launch vLLM as an OpenAI-compatible API server
python -m vllm.entrypoints.openai.api_server \
    --model mistralai/Mistral-7B-Instruct-v0.2 \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len 8192 \
    --dtype auto \
    --gpu-memory-utilization 0.9
```

```bash
# Test with curl
curl http://localhost:8000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "mistralai/Mistral-7B-Instruct-v0.2",
        "messages": [{"role": "user", "content": "Hello!"}],
        "max_tokens": 100
    }'
```

## Use with OpenAI SDK

```python
# client.py — Connect to vLLM server using OpenAI Python SDK
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="unused")

response = client.chat.completions.create(
    model="mistralai/Mistral-7B-Instruct-v0.2",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain PagedAttention in simple terms."},
    ],
    max_tokens=300,
    temperature=0.7,
)
print(response.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="mistralai/Mistral-7B-Instruct-v0.2",
    messages=[{"role": "user", "content": "Write a poem"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## Offline Batch Inference

```python
# batch_inference.py — Run batch inference without starting a server
from vllm import LLM, SamplingParams

llm = LLM(
    model="mistralai/Mistral-7B-Instruct-v0.2",
    dtype="auto",
    gpu_memory_utilization=0.9,
)

sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.95,
    max_tokens=200,
)

prompts = [
    "Explain quantum computing:",
    "Write a Python quicksort:",
    "What is the meaning of life?",
]

outputs = llm.generate(prompts, sampling_params)

for output in outputs:
    print(f"Prompt: {output.prompt[:50]}...")
    print(f"Output: {output.outputs[0].text}\n")
```

## Multi-GPU / Tensor Parallelism

```bash
# multi_gpu.sh — Serve a large model across multiple GPUs
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-2-70b-chat-hf \
    --tensor-parallel-size 4 \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len 4096
```

## Quantization (AWQ / GPTQ)

```bash
# quantized.sh — Serve a quantized model for reduced VRAM usage
python -m vllm.entrypoints.openai.api_server \
    --model TheBloke/Mistral-7B-Instruct-v0.2-AWQ \
    --quantization awq \
    --dtype auto \
    --max-model-len 8192
```

## LoRA Adapters

```bash
# lora_serve.sh — Serve a base model with LoRA adapters
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-2-7b-hf \
    --enable-lora \
    --lora-modules my-adapter=./path/to/lora/adapter \
    --max-lora-rank 16
```

```python
# lora_client.py — Request inference using a specific LoRA adapter
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="unused")

response = client.chat.completions.create(
    model="my-adapter",  # Use the LoRA adapter name as the model
    messages=[{"role": "user", "content": "Hello!"}],
)
```

## Docker Deployment

```yaml
# docker-compose.yml — Deploy vLLM with Docker
version: "3.8"
services:
  vllm:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    ports:
      - "8000:8000"
    environment:
      - HUGGING_FACE_HUB_TOKEN=hf_xxxx
    volumes:
      - model-cache:/root/.cache/huggingface
    command: >
      --model mistralai/Mistral-7B-Instruct-v0.2
      --host 0.0.0.0
      --port 8000
      --max-model-len 8192
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
volumes:
  model-cache:
```

## Key Concepts

- **PagedAttention**: Manages KV cache like virtual memory pages — eliminates memory waste
- **Continuous batching**: Dynamically batches incoming requests for maximum throughput
- **Tensor parallelism**: Split large models across multiple GPUs with `--tensor-parallel-size`
- **OpenAI-compatible**: Drop-in replacement for OpenAI API — use any existing client
- **Quantization**: AWQ and GPTQ support for running larger models on less VRAM
- **LoRA serving**: Serve multiple fine-tuned adapters from a single base model
- **GPU memory utilization**: `--gpu-memory-utilization 0.9` uses 90% of VRAM for KV cache
