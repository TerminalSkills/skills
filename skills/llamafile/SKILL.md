---
name: llamafile
description: Expert guidance for llamafile, the tool that packages LLMs into single executable files that run on any OS (Linux, macOS, Windows, FreeBSD) without installation. Helps developers create portable AI applications, run models offline, and distribute LLMs as self-contained binaries with built-in web UI and OpenAI-compatible API.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - local-llm
  - inference
  - portable
  - single-file
  - offline
---

# llamafile — Single-File LLM Executables


## Overview


Llamafile, the tool that packages LLMs into single executable files that run on any OS (Linux, macOS, Windows, FreeBSD) without installation. Helps developers create portable AI applications, run models offline, and distribute LLMs as self-contained binaries with built-in web UI and OpenAI-compatible API.


## Instructions

### Running a llamafile

```bash
# Download a pre-built llamafile (model + runtime in one file)
wget https://huggingface.co/Mozilla/Meta-Llama-3.1-8B-Instruct-llamafile/resolve/main/Meta-Llama-3.1-8B-Instruct.Q5_K_M.llamafile

# Make it executable and run
chmod +x Meta-Llama-3.1-8B-Instruct.Q5_K_M.llamafile
./Meta-Llama-3.1-8B-Instruct.Q5_K_M.llamafile

# Opens web UI at http://localhost:8080
# Also serves OpenAI-compatible API at http://localhost:8080/v1

# Run with specific settings
./Meta-Llama-3.1-8B-Instruct.Q5_K_M.llamafile \
  --host 0.0.0.0 \
  --port 8080 \
  --ctx-size 8192 \
  --threads 8 \
  --gpu auto                  # Use GPU if available (CUDA, Metal, ROCm)
```

### Creating Custom llamafiles

```bash
# Build a llamafile from any GGUF model

# 1. Download the llamafile runtime
wget https://github.com/Mozilla-Ocho/llamafile/releases/latest/download/llamafile
chmod +x llamafile

# 2. Download a GGUF model from HuggingFace
wget https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q5_K_M.gguf

# 3. Create the llamafile (packages model + runtime)
./llamafile \
  --model mistral-7b-instruct-v0.2.Q5_K_M.gguf \
  --create my-assistant.llamafile

# 4. The resulting file runs anywhere — no dependencies
./my-assistant.llamafile --port 8080

# With a custom system prompt baked in
./llamafile \
  --model mistral-7b-instruct-v0.2.Q5_K_M.gguf \
  --system-prompt "You are a customer support assistant for Acme Inc. Be helpful and concise." \
  --create acme-support-bot.llamafile
```

### OpenAI-Compatible API

```typescript
// src/local-llm.ts — Use llamafile with any OpenAI-compatible SDK
import OpenAI from "openai";

// Point to the local llamafile server
const llm = new OpenAI({
  apiKey: "not-needed",                    // llamafile doesn't require auth
  baseURL: "http://localhost:8080/v1",
});

async function chat(prompt: string) {
  const response = await llm.chat.completions.create({
    model: "local",                        // Model name doesn't matter for llamafile
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 512,
  });
  return response.choices[0].message.content;
}

// Streaming works too
async function streamChat(prompt: string) {
  const stream = await llm.chat.completions.create({
    model: "local",
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  }
}

// Embeddings
async function embed(text: string) {
  const response = await llm.embeddings.create({
    model: "local",
    input: text,
  });
  return response.data[0].embedding;
}
```

### CLI Usage (No Server)

```bash
# One-shot completion (no server, just stdin → stdout)
echo "Explain Docker in one sentence:" | ./llamafile --cli

# With a system prompt
./llamafile --cli \
  --system "You are a Linux expert. Answer in one line." \
  --prompt "How do I find files larger than 100MB?"

# Process a file
cat error_log.txt | ./llamafile --cli \
  --system "Analyze this error log. Identify the root cause."

# Batch processing with a script
for file in reports/*.txt; do
  echo "=== $file ==="
  cat "$file" | ./llamafile --cli \
    --system "Summarize this report in 3 bullet points." \
    --temp 0
done
```

### Embedding in Applications

```python
# Run llamafile as a subprocess from your application
import subprocess
import requests

class LlamafileServer:
    """Manage a llamafile server as a subprocess."""

    def __init__(self, model_path: str, port: int = 8080):
        self.model_path = model_path
        self.port = port
        self.process = None
        self.base_url = f"http://localhost:{port}"

    def start(self):
        self.process = subprocess.Popen(
            [self.model_path, "--port", str(self.port), "--host", "127.0.0.1"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Wait for server to be ready
        import time
        for _ in range(30):
            try:
                requests.get(f"{self.base_url}/health", timeout=1)
                return
            except requests.ConnectionError:
                time.sleep(1)
        raise RuntimeError("llamafile failed to start")

    def chat(self, prompt: str, system: str = "") -> str:
        response = requests.post(
            f"{self.base_url}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
            },
        )
        return response.json()["choices"][0]["message"]["content"]

    def stop(self):
        if self.process:
            self.process.terminate()
            self.process.wait()

# Usage
server = LlamafileServer("./my-model.llamafile", port=8081)
server.start()
answer = server.chat("What is the capital of France?")
server.stop()
```

## Installation

```bash
# No installation needed — llamafile IS the installation
# Download and run. That's it.

# For creating llamafiles:
wget https://github.com/Mozilla-Ocho/llamafile/releases/latest/download/llamafile
chmod +x llamafile
```


## Examples


### Example 1: Integrating Llamafile into an existing application

**User request:**

```
Add Llamafile to my Next.js app for the AI chat feature. I want streaming responses.
```

The agent installs the SDK, creates an API route that initializes the Llamafile client, configures streaming, selects an appropriate model, and wires up the frontend to consume the stream. It handles error cases and sets up proper environment variable management for the API key.

### Example 2: Optimizing creating custom llamafiles performance

**User request:**

```
My Llamafile calls are slow and expensive. Help me optimize the setup.
```

The agent reviews the current implementation, identifies issues (wrong model selection, missing caching, inefficient prompting, no batching), and applies optimizations specific to Llamafile's capabilities — adjusting model parameters, adding response caching, and implementing retry logic with exponential backoff.


## Guidelines

1. **Single file = single deployment** — Distribute your AI as one file; users double-click to run, no Python/Docker/CUDA setup
2. **GPU auto-detection** — llamafile automatically uses GPU when available (CUDA, Metal, ROCm); falls back to CPU
3. **Quantized models for speed** — Use Q5_K_M or Q4_K_M quantizations; they're 3-5x smaller with minimal quality loss
4. **OpenAI API compatibility** — Use the same code for local llamafile and cloud APIs; swap by changing the base URL
5. **CLI mode for scripts** — Use `--cli` for batch processing; pipe text in, get completions out, no server needed
6. **Air-gapped environments** — llamafile runs completely offline; ideal for sensitive data or environments without internet
7. **Context size matters** — Set `--ctx-size` based on your use case; larger contexts need more RAM
8. **One model per llamafile** — Each llamafile contains one model; run multiple on different ports for model routing
