---
name: vllm
category: AI & Machine Learning
tags: [inference, llm, serving, gpu, openai-compatible, batching, performance]
version: 1.0.0
author: terminal-skills
---

# vLLM — High-Throughput LLM Inference Engine

You are an expert in vLLM, the high-throughput LLM serving engine. You help developers deploy open-source models (Llama, Mistral, Qwen, Phi, Gemma) with PagedAttention for efficient memory management, continuous batching, tensor parallelism for multi-GPU, OpenAI-compatible API, and quantization support — achieving 2-24x higher throughput than HuggingFace Transformers for production LLM serving.

## Core Capabilities

### Server Deployment

```bash
# Start OpenAI-compatible API server
vllm serve meta-llama/Llama-3.1-8B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 1 \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.9 \
  --quantization awq \
  --api-key my-secret-key

# Multi-GPU (tensor parallelism)
vllm serve meta-llama/Llama-3.1-70B-Instruct \
  --tensor-parallel-size 4 \
  --pipeline-parallel-size 1 \
  --max-num-seqs 256

# With Docker
docker run --runtime nvidia --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3.1-8B-Instruct
```

### OpenAI-Compatible Client

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "my-secret-key",
});

// Chat completion
const response = await client.chat.completions.create({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  messages: [
    { role: "system", content: "You are a helpful coding assistant." },
    { role: "user", content: "Write a Python fibonacci function" },
  ],
  temperature: 0.7,
  max_tokens: 1024,
});

// Streaming
const stream = await client.chat.completions.create({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  messages: [{ role: "user", content: "Explain quantum computing" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}

// Embeddings
const embeddings = await client.embeddings.create({
  model: "BAAI/bge-large-en-v1.5",
  input: ["Your text here"],
});
```

### Python Offline Inference

```python
from vllm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    quantization="awq",
    gpu_memory_utilization=0.9,
    max_model_len=8192,
)

sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=512,
)

# Batch inference (processes all prompts efficiently)
prompts = [
    "Explain machine learning in simple terms",
    "Write a haiku about programming",
    "What is the capital of France?",
]

outputs = llm.generate(prompts, sampling_params)
for output in outputs:
    print(f"Prompt: {output.prompt[:50]}...")
    print(f"Output: {output.outputs[0].text}")
    print(f"Tokens/sec: {len(output.outputs[0].token_ids) / output.metrics.finished_time:.1f}")
```

## Installation

```bash
pip install vllm
# Requires: CUDA 12.1+, PyTorch 2.4+
# GPU: NVIDIA A100, H100, L40S, RTX 4090 recommended
```

## Best Practices

1. **PagedAttention** — vLLM's core innovation; manages KV cache like OS virtual memory, eliminates waste
2. **Continuous batching** — Processes new requests immediately without waiting; maximizes GPU utilization
3. **Quantization** — Use AWQ or GPTQ for 4-bit inference; 2-3x more throughput, minimal quality loss
4. **Tensor parallelism** — Split model across GPUs with `--tensor-parallel-size`; serve 70B+ models
5. **OpenAI compatibility** — Drop-in replacement for OpenAI API; any OpenAI SDK client works unchanged
6. **GPU memory** — Set `--gpu-memory-utilization 0.9` for max throughput; leave 10% for overhead
7. **Max sequences** — Tune `--max-num-seqs` based on your workload; higher = more concurrent requests
8. **Prefix caching** — Enable for shared system prompts; reuses KV cache across requests with same prefix
