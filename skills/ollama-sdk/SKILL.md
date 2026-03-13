---
name: ollama-sdk
description: >-
   You are an expert in Ollama, the tool for running open-source LLMs locally.
  You help developers run Llama, Mistral, Gemma, Phi, CodeLlama, and other
  models on their machine with a simple CLI and REST API — enabling private AI
  development, offline inference, fine-tuning experiments, and cost-free
  prototyping without sending data to cloud APIs.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - local-llm
    - inference
    - privacy
    - self-hosted
    - open-source
    - embedding
---

# Ollama — Run LLMs Locally

You are an expert in Ollama, the tool for running open-source LLMs locally. You help developers run Llama, Mistral, Gemma, Phi, CodeLlama, and other models on their machine with a simple CLI and REST API — enabling private AI development, offline inference, fine-tuning experiments, and cost-free prototyping without sending data to cloud APIs.

## Core Capabilities

### CLI Usage

```bash
# Install and run models
ollama pull llama3.1                      # Download model (~4.7GB for 8B)
ollama pull mistral                       # Mistral 7B
ollama pull codellama:13b                 # CodeLlama 13B
ollama pull nomic-embed-text              # Embedding model

# Interactive chat
ollama run llama3.1 "Explain quantum computing"

# List local models
ollama list

# Create custom model
cat > Modelfile <<EOF
FROM llama3.1
SYSTEM "You are a senior Python developer. You write clean, documented code."
PARAMETER temperature 0.3
PARAMETER num_ctx 8192
EOF
ollama create python-coder -f Modelfile
ollama run python-coder "Write a FastAPI CRUD endpoint for users"
```

### REST API

```typescript
// Direct HTTP API
const response = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  body: JSON.stringify({
    model: "llama3.1",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Write a Python fibonacci function" },
    ],
    stream: false,
  }),
});
const data = await response.json();
console.log(data.message.content);

// Streaming
const streamResponse = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  body: JSON.stringify({
    model: "llama3.1",
    messages: [{ role: "user", content: "Tell me a story" }],
    stream: true,
  }),
});

const reader = streamResponse.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = JSON.parse(decoder.decode(value));
  process.stdout.write(chunk.message.content);
}

// Embeddings
const embeddingResponse = await fetch("http://localhost:11434/api/embed", {
  method: "POST",
  body: JSON.stringify({
    model: "nomic-embed-text",
    input: ["Your text to embed", "Another text"],
  }),
});
const embeddings = await embeddingResponse.json();
// embeddings.embeddings → [[0.123, -0.456, ...], [...]]
```

### OpenAI-Compatible API

```typescript
// Use OpenAI SDK with Ollama (drop-in replacement)
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",                       // Required but unused
});

const completion = await openai.chat.completions.create({
  model: "llama3.1",
  messages: [{ role: "user", content: "Hello!" }],
});

// Works with any OpenAI-compatible library:
// - Vercel AI SDK: createOllama()
// - LangChain: ChatOllama
// - Instructor: instructor.from_openai(OpenAI(base_url="..."))
```

### Python Client

```python
import ollama

# Chat
response = ollama.chat(model="llama3.1", messages=[
    {"role": "user", "content": "Explain Docker in simple terms"},
])
print(response["message"]["content"])

# Streaming
for chunk in ollama.chat(model="llama3.1", messages=[
    {"role": "user", "content": "Write a haiku"},
], stream=True):
    print(chunk["message"]["content"], end="")

# Embeddings
result = ollama.embed(model="nomic-embed-text", input="Your text here")
```

## Installation

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Docker
docker run -d -v ollama:/root/.ollama -p 11434:11434 ollama/ollama

# Start server (if not using Docker)
ollama serve
```

## Best Practices

1. **OpenAI compatibility** — Use Ollama's `/v1` endpoint with OpenAI SDK; switch between local and cloud with one config change
2. **Right-size models** — 7B models for fast inference; 13B for better quality; 70B needs serious GPU (48GB+ VRAM)
3. **Custom Modelfiles** — Create specialized models with system prompts and parameters; reproducible behavior
4. **Embeddings locally** — Use `nomic-embed-text` for local RAG; no API costs, complete privacy
5. **GPU acceleration** — Ollama auto-detects NVIDIA/AMD/Apple Silicon GPU; falls back to CPU if unavailable
6. **Context window** — Set `num_ctx` in Modelfile for longer context; default 2048, can go to 128K for some models
7. **Batch processing** — Use keep_alive to prevent model unloading between requests; faster batch inference
8. **Privacy-first** — All data stays on your machine; ideal for sensitive documents, HIPAA/GDPR compliance
