---
name: ollama
description: >-
  Run LLMs locally with Ollama. Use when a user asks to run AI models locally,
  self-host a language model, use LLaMA or Mistral on their machine, run
  offline AI, build a local chatbot, avoid sending data to cloud AI providers,
  generate text without API costs, fine-tune or customize local models, or
  set up a private AI inference server. Covers model management, API usage,
  Modelfile customization, GPU acceleration, and integration with LangChain
  and other frameworks.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (GPU recommended)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai
  tags:
    - ollama
    - local-llm
    - llama
    - mistral
    - self-hosted
    - ai
    - inference
---

# Ollama

## Overview

Ollama makes running large language models locally as simple as `ollama run llama3`. No cloud API, no API keys, no per-token costs — models run entirely on your hardware. It supports LLaMA 3, Mistral, Phi, Gemma, CodeLlama, and dozens of other open models. This skill covers model management, API integration, custom model configuration, GPU setup, and building applications with local LLMs.

## Instructions

### Step 1: Installation

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS
brew install ollama

# Docker
docker run -d --gpus all -v ollama_data:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# Verify
ollama --version
```

### Step 2: Download and Run Models

```bash
# Download and start chatting
ollama run llama3.1              # Meta LLaMA 3.1 8B
ollama run mistral               # Mistral 7B
ollama run codellama              # Code-focused LLaMA
ollama run phi3                   # Microsoft Phi-3 (small, fast)
ollama run gemma2                 # Google Gemma 2
ollama run llama3.1:70b           # Larger 70B model (needs ~40GB RAM)
ollama run deepseek-r1:8b         # DeepSeek R1 reasoning model

# List downloaded models
ollama list

# Remove a model
ollama rm mistral

# Model info
ollama show llama3.1
```

### Step 3: REST API

Ollama exposes an OpenAI-compatible API at `http://localhost:11434`.

```bash
# Generate completion
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1",
  "prompt": "Explain recursion in one paragraph.",
  "stream": false
}'

# Chat completion (OpenAI-compatible)
curl http://localhost:11434/v1/chat/completions -d '{
  "model": "llama3.1",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is a closure in JavaScript?"}
  ]
}'

# Generate embeddings
curl http://localhost:11434/api/embed -d '{
  "model": "llama3.1",
  "input": "How to deploy a Node.js app"
}'
```

### Step 4: Node.js Integration

```typescript
// lib/local-ai.ts — Use Ollama from Node.js via OpenAI-compatible API
// Any OpenAI SDK works — just change the base URL
import OpenAI from 'openai'

const ollama = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',    // required by SDK but not used by Ollama
})

// Chat completion (same API as OpenAI)
const response = await ollama.chat.completions.create({
  model: 'llama3.1',
  messages: [
    { role: 'system', content: 'You are a code review assistant.' },
    { role: 'user', content: 'Review this function:\n\nfunction add(a, b) { return a + b; }' },
  ],
  temperature: 0.3,
})

console.log(response.choices[0].message.content)

// Streaming
const stream = await ollama.chat.completions.create({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Write a haiku about coding.' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '')
}
```

### Step 5: Python Integration

```python
# local_chat.py — Use Ollama from Python
import ollama

# Simple generation
response = ollama.chat(
    model='llama3.1',
    messages=[
        {'role': 'system', 'content': 'You are a data analysis expert.'},
        {'role': 'user', 'content': 'Explain the difference between L1 and L2 regularization.'},
    ],
)
print(response['message']['content'])

# Streaming
stream = ollama.chat(
    model='llama3.1',
    messages=[{'role': 'user', 'content': 'Explain MapReduce.'}],
    stream=True,
)
for chunk in stream:
    print(chunk['message']['content'], end='', flush=True)

# Embeddings
result = ollama.embed(model='llama3.1', input='How to use PostgreSQL indexes')
print(len(result['embeddings'][0]))    # embedding dimensions
```

### Step 6: Custom Models with Modelfile

```dockerfile
# Modelfile — Create a custom model with specific behavior
FROM llama3.1

# System prompt baked into the model
SYSTEM """
You are a senior Python developer. You write clean, well-documented code
following PEP 8. You always include type hints and docstrings.
When asked to write code, provide complete, runnable examples.
"""

# Parameters
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
```

```bash
# Build and use custom model
ollama create python-coder -f Modelfile
ollama run python-coder
```

### Step 7: GPU Configuration

```bash
# Check GPU detection
ollama ps    # shows running models and GPU memory usage

# Environment variables for GPU control
OLLAMA_GPU_LAYERS=35    # number of layers to offload to GPU
CUDA_VISIBLE_DEVICES=0  # select specific GPU

# Memory requirements (approximate):
# 7B model:  ~4GB RAM (GPU) or ~8GB RAM (CPU)
# 13B model: ~8GB RAM (GPU) or ~16GB RAM (CPU)
# 70B model: ~40GB RAM (GPU) or ~64GB RAM (CPU)
```

## Examples

### Example 1: Build a private code assistant
**User prompt:** "I want a code assistant that runs entirely on my machine — no code sent to the cloud. Should handle Python and TypeScript."

The agent will:
1. Install Ollama and download `codellama:13b` or `deepseek-coder:6.7b`.
2. Create a Modelfile with a system prompt optimized for coding.
3. Build a simple CLI or web interface using the OpenAI-compatible API.
4. All inference runs locally — zero data leaves the machine.

### Example 2: Run a local RAG pipeline
**User prompt:** "Index my company's internal docs and let employees query them with an AI — but we can't send data to OpenAI due to compliance."

The agent will:
1. Set up Ollama with `llama3.1` for generation and embeddings.
2. Chunk documents and store embeddings in a local vector database (ChromaDB).
3. Build a retrieval pipeline: query → embed → search → generate answer.
4. Deploy as an internal web app. All processing stays on-premises.

## Guidelines

- Model selection by hardware: 7B models run well on 8GB+ RAM machines; 13B needs 16GB+; 70B needs 64GB+ or a high-end GPU. Start with the smallest model that meets quality requirements.
- Ollama's API is OpenAI-compatible — the OpenAI SDK, LangChain, LlamaIndex, and most AI frameworks work by just changing the base URL to `http://localhost:11434/v1`.
- Use GPU acceleration whenever available — inference is 5-10x faster on GPU than CPU. Ollama auto-detects NVIDIA GPUs with CUDA and Apple Silicon's Metal.
- Create custom Modelfiles for specific use cases — baking a system prompt and temperature into the model saves tokens and ensures consistent behavior.
- For production deployments, run Ollama behind a reverse proxy (nginx, Traefik) with authentication. The default API has no auth.
- Keep models updated (`ollama pull model_name`) — the community frequently releases improved quantizations and fine-tunes.
