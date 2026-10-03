---
name: localai
description: Expert guidance for LocalAI, the open-source drop-in replacement for OpenAI's API that runs locally. Helps developers self-host LLMs, image generators, audio transcription, and text-to-speech models with an OpenAI-compatible API — no GPU required, completely offline and private.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/mudler/LocalAI
  category: data-ai
  tags:
  - local-llm
  - self-hosted
  - inference
  - openai-compatible
  - docker
---

# LocalAI — Self-Hosted OpenAI Alternative


## Overview


LocalAI, the open-source drop-in replacement for OpenAI's API that runs locally. Helps developers self-host LLMs, image generators, audio transcription, and text-to-speech models with an OpenAI-compatible API — no GPU required, completely offline and private.


## Instructions

### Quick Start with Docker

Backends are downloaded on demand the first time a model needs them, so keep the `backends` volume persistent.

```bash
# CPU only
docker run -d --name local-ai -p 8080:8080 \
  -v localai-models:/models -v localai-backends:/backends \
  localai/localai:latest

# NVIDIA GPU (CUDA 12 image; a CUDA 13 image also exists)
docker run -d --name local-ai -p 8080:8080 --gpus all \
  -v localai-models:/models -v localai-backends:/backends \
  localai/localai:latest-gpu-nvidia-cuda-12
```

Other tags: `latest-gpu-hipblas` (AMD ROCm, add `--device=/dev/kfd --device=/dev/dri`), `latest-gpu-intel`, `latest-gpu-vulkan`. On macOS use the DMG from the GitHub releases page (remove the quarantine flag as the README describes). Pin a version tag such as `v4.11.0` in production instead of `latest`.

```yaml
# docker-compose.yml
services:
  localai:
    image: localai/localai:latest
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      - MODELS_PATH=/models
      - LOCALAI_THREADS=4            # physical cores
      - LOCALAI_CONTEXT_SIZE=4096    # default context window
      - LOCALAI_API_KEY=${LOCALAI_API_KEY}
    volumes:
      - models:/models
      - backends:/backends
    restart: unless-stopped
volumes:
  models:
  backends:
```

Docs list env vars as `LOCALAI_MODELS_PATH`, `LOCALAI_THREADS`, `LOCALAI_CONTEXT_SIZE`, `LOCALAI_GALLERIES`, `LOCALAI_ADDRESS` and `LOCALAI_API_KEY`. Without an API key anyone who reaches the port can use it; bind to localhost or put a reverse proxy in front.

### Model Installation

```bash
# Gallery model by name (downloads weights, writes the YAML, starts serving)
docker exec -it local-ai local-ai run qwen3-4b

# Straight from Hugging Face, the Ollama registry, an OCI image or a YAML URL
local-ai run huggingface://TheBloke/phi-2-GGUF/phi-2.Q8_0.gguf
local-ai run ollama://gemma:2b
local-ai run oci://localai/phi-2:latest

# Browse and install without starting a server
local-ai models list
local-ai models install qwen3-4b

# See what the API serves
curl -s http://localhost:8080/v1/models | jq '.data[].id'
```

You can also drop a GGUF file into the models directory and add a YAML next to it. `context_size`, `threads`, `gpu_layers` and `f16` are top-level keys, not children of `parameters`. Each model gets its own file (one YAML document per file):

```yaml
# /models/mistral.yaml
name: mistral
backend: llama-cpp
context_size: 8192
threads: 4
gpu_layers: 0            # 0 = CPU only; raise to offload layers to the GPU
parameters:
  model: mistral-7b-instruct-v0.2.Q5_K_M.gguf
  temperature: 0.7
  top_p: 0.9
```

Current llama.cpp builds normally read the chat template from the GGUF file; add a `template:` block (`chat`, `chat_message`, `completion`) only when a model needs an override.

### OpenAI-Compatible API

```typescript
// src/local-ai.ts
import fs from "node:fs";
import OpenAI from "openai";

const ai = new OpenAI({
  apiKey: process.env.LOCALAI_API_KEY ?? "not-needed",
  baseURL: "http://localhost:8080/v1",
});

async function chat(prompt: string) {
  const response = await ai.chat.completions.create({
    model: "mistral", // the `name` in the model YAML or the gallery name
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
  });
  return response.choices[0].message.content;
}

async function embed(texts: string[]) {
  const response = await ai.embeddings.create({ model: "text-embedding-ada-002", input: texts });
  return response.data.map((d) => d.embedding);
}

async function transcribe(audioPath: string) {
  const response = await ai.audio.transcriptions.create({
    model: "whisper-1",
    file: fs.createReadStream(audioPath),
  });
  return response.text;
}
```

Image generation (`ai.images.generate`) and speech (`ai.audio.speech.create`) work the same way: set `model` to the name of an installed diffusers or TTS model from the gallery.

### Multi-Model Configuration

Create one file per model in the models directory:

```yaml
# /models/embedding.yaml  (name matches what OpenAI clients ask for)
name: text-embedding-ada-002
backend: sentencetransformers
embeddings: true
parameters:
  model: all-MiniLM-L6-v2
```

```yaml
# /models/whisper.yaml
name: whisper-1
backend: whisper
parameters:
  model: ggml-base.en.bin
```

For llama.cpp embeddings use `backend: llama-cpp`, `embeddings: true` and a GGUF embedding model. To define many models in one place use a `--models-config-file` list instead.

### Function Calling

The request shape is the OpenAI `tools` / `tool_choice` one. With the llama.cpp backend tool calls are parsed automatically for GGUF models trained for tools; vLLM needs an explicit tool parser in the model options (for example `tool_parser:hermes`). Pick a tool-capable model (Qwen3, Hermes, Llama 3.1+); small or old models ignore tools.

```typescript
const response = await ai.chat.completions.create({
  model: "qwen3-4b",
  messages: [{ role: "user", content: "Weather in Lisbon in celsius?" }],
  tools: [{
    type: "function",
    function: {
      name: "get_current_weather",
      description: "Get the weather for a location",
      parameters: {
        type: "object",
        properties: { location: { type: "string" }, unit: { type: "string", enum: ["celsius", "fahrenheit"] } },
        required: ["location"],
      },
    },
  }],
  tool_choice: "auto",
});
console.log(response.choices[0].message.tool_calls);
```

## Installation

```bash
# Docker is the supported path
docker pull localai/localai:latest
```

Standalone binaries and the macOS DMG are on https://github.com/mudler/LocalAI/releases; check the downloaded file against the checksums published on that release page before running it.


## Examples


### Example 1: Serve a local chat model to an existing app

**User request:**

```
Run LocalAI on my laptop with a small chat model and point my Next.js app's OpenAI client at it.
```

```bash
docker run -d --name local-ai -p 127.0.0.1:8080:8080 \
  -v localai-models:/models -v localai-backends:/backends localai/localai:latest
docker exec -it local-ai local-ai run qwen3-4b
curl -s http://localhost:8080/v1/chat/completions -H "Content-Type: application/json" \
  -d '{"model":"qwen3-4b","messages":[{"role":"user","content":"Say hi"}]}' | jq -r '.choices[0].message.content'
```

The first call pulls the llama.cpp backend, then returns a JSON completion. In the app set `baseURL: "http://localhost:8080/v1"` and `model: "qwen3-4b"`; nothing else changes.

### Example 2: Local embeddings for a RAG pipeline

**User request:**

```
I need OpenAI-style embeddings offline for my document search.
```

Add `/models/embedding.yaml` from the section above, restart the container, then:

```bash
curl -s http://localhost:8080/v1/embeddings -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-ada-002","input":"invoice 4471 is overdue"}' | jq '.data[0].embedding | length'
```

It prints the vector length (384 for all-MiniLM-L6-v2). Existing code that calls `embeddings.create` keeps working.


## Guidelines

1. **Size the model to the machine** - 4B to 8B quantized models run acceptably on CPU; 13B+ and image generation want a GPU
2. **Quantization** - Q4_K_M is faster and smaller, Q5_K_M balances quality, Q6_K favors quality
3. **One model per purpose** - separate chat, embedding and transcription models, each with its own YAML
4. **Persist `/models` and `/backends`** - otherwise every container recreate re-downloads weights and backends
5. **Secure the port** - set `LOCALAI_API_KEY` and bind to localhost or a reverse proxy; the API has no other protection by default
6. **Context costs memory** - the KV cache grows with `context_size`; lower it if the container is OOM-killed
7. **Threads = physical cores** - hyperthreads do not speed up inference
8. **Pin image tags** - `latest` changes weekly; pin `vX.Y.Z` for reproducible deployments
9. **Model names are yours** - the `model` field must equal the YAML `name` (or the gallery name), not the file name
