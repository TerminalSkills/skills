---
name: localai
description: Expert guidance for LocalAI, the open-source drop-in replacement for OpenAI's API that runs locally. Helps developers self-host LLMs, image generators, audio transcription, and text-to-speech models with an OpenAI-compatible API — no GPU required, completely offline and private.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
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

```bash
# Run LocalAI with Docker (CPU-only, no GPU needed)
docker run -p 8080:8080 \
  -v ./models:/build/models \
  localai/localai:latest-cpu

# With GPU support (NVIDIA CUDA)
docker run -p 8080:8080 --gpus all \
  -v ./models:/build/models \
  localai/localai:latest-gpu-nvidia-cuda-12

# Docker Compose for production
```

```yaml
# docker-compose.yml — Production LocalAI setup
version: "3.8"
services:
  localai:
    image: localai/localai:latest-cpu
    ports:
      - "8080:8080"
    volumes:
      - ./models:/build/models
    environment:
      - THREADS=4                    # CPU threads for inference
      - CONTEXT_SIZE=4096            # Default context window
      - GALLERIES=[{"name":"model-gallery","url":"github:mudler/LocalAI/gallery/index.yaml@master"}]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/readyz"]
      interval: 30s
      timeout: 10s
```

### Model Installation

```bash
# Install models from the gallery (via API)
curl -X POST http://localhost:8080/models/apply \
  -H "Content-Type: application/json" \
  -d '{"id": "huggingface://TheBloke/Mistral-7B-Instruct-v0.2-GGUF/mistral-7b-instruct-v0.2.Q5_K_M.gguf"}'

# Or download GGUF files directly into the models directory
wget -P ./models/ \
  https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q5_K_M.gguf

# Create a model configuration
cat > ./models/mistral.yaml << 'EOF'
name: mistral
backend: llama-cpp
parameters:
  model: mistral-7b-instruct-v0.2.Q5_K_M.gguf
  temperature: 0.7
  top_p: 0.9
  top_k: 40
  context_size: 8192
template:
  chat_message: |
    {{.RoleName}}: {{.Content}}
  chat: |
    [INST] {{.Input}} [/INST]
EOF

# List available models
curl http://localhost:8080/v1/models | jq '.data[].id'
```

### OpenAI-Compatible API

```typescript
// src/local-ai.ts — Use LocalAI with OpenAI SDK
import OpenAI from "openai";

const ai = new OpenAI({
  apiKey: "not-needed",
  baseURL: "http://localhost:8080/v1",
});

// Chat completions
async function chat(prompt: string) {
  const response = await ai.chat.completions.create({
    model: "mistral",                      // Model name from config
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });
  return response.choices[0].message.content;
}

// Embeddings
async function embed(texts: string[]) {
  const response = await ai.embeddings.create({
    model: "text-embedding-ada-002",       // Mapped to local embedding model
    input: texts,
  });
  return response.data.map(d => d.embedding);
}

// Image generation (Stable Diffusion backend)
async function generateImage(prompt: string) {
  const response = await ai.images.generate({
    model: "stablediffusion",
    prompt,
    n: 1,
    size: "512x512",
  });
  return response.data[0].url;
}

// Audio transcription (Whisper backend)
async function transcribe(audioPath: string) {
  const response = await ai.audio.transcriptions.create({
    model: "whisper-1",
    file: fs.createReadStream(audioPath),
  });
  return response.text;
}

// Text-to-speech
async function textToSpeech(text: string) {
  const response = await ai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync("output.mp3", buffer);
}
```

### Multi-Model Configuration

```yaml
# models/chat-model.yaml — Chat model
name: chat
backend: llama-cpp
parameters:
  model: llama-3.1-8b-instruct.Q5_K_M.gguf
  context_size: 8192
  threads: 4
  gpu_layers: 0                            # 0 = CPU only, increase for GPU offloading

---
# models/code-model.yaml — Code completion model
name: code
backend: llama-cpp
parameters:
  model: codellama-7b-instruct.Q5_K_M.gguf
  context_size: 16384
  threads: 4

---
# models/embedding-model.yaml — Embedding model
name: embedding
backend: sentencetransformers
parameters:
  model: all-MiniLM-L6-v2

---
# models/whisper-model.yaml — Audio transcription
name: whisper-1
backend: whisper
parameters:
  model: whisper-base.bin
  language: en
```

### Function Calling

```typescript
// LocalAI supports function calling with compatible models
async function chatWithFunctions(prompt: string) {
  const response = await ai.chat.completions.create({
    model: "mistral",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "get_current_weather",
          description: "Get the weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });
  return response;
}
```

## Installation

```bash
# Docker (recommended)
docker pull localai/localai:latest-cpu

# Binary (Linux/macOS)
curl -Lo local-ai https://github.com/mudler/LocalAI/releases/latest/download/local-ai-$(uname -s)-$(uname -m)
chmod +x local-ai
./local-ai --models-path ./models

# Homebrew (macOS)
brew install localai
```


## Examples


### Example 1: Integrating Localai into an existing application

**User request:**

```
Add Localai to my Next.js app for the AI chat feature. I want streaming responses.
```

The agent installs the SDK, creates an API route that initializes the Localai client, configures streaming, selects an appropriate model, and wires up the frontend to consume the stream. It handles error cases and sets up proper environment variable management for the API key.

### Example 2: Optimizing model installation performance

**User request:**

```
My Localai calls are slow and expensive. Help me optimize the setup.
```

The agent reviews the current implementation, identifies issues (wrong model selection, missing caching, inefficient prompting, no batching), and applies optimizations specific to Localai's capabilities — adjusting model parameters, adding response caching, and implementing retry logic with exponential backoff.


## Guidelines

1. **CPU is fine for most use cases** — 7B models run well on CPU; GPU helps for 13B+ and image generation
2. **Q5_K_M quantization** — Best balance of quality and speed; Q4_K_M for faster inference, Q6_K for higher quality
3. **One model per purpose** — Run separate models for chat, embedding, and code; don't force one model to do everything
4. **Docker for production** — Use Docker Compose with health checks and restart policies; don't run the binary directly
5. **OpenAI SDK compatibility** — Your existing OpenAI code works with LocalAI; just change the base URL
6. **Context size = memory** — Each model uses ~(context_size × 2MB) RAM; set context_size based on available memory
7. **Thread count = physical cores** — Set `THREADS` to your physical CPU core count; hyperthreading doesn't help inference
8. **Gallery for easy setup** — Use the model gallery for one-click model installation instead of manual GGUF downloads
