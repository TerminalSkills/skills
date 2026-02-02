---
name: ollama-local
description: >-
  Run open-source LLMs locally with Ollama. Use when a user asks to run a
  local language model, install Ollama, use Llama locally, run Mistral or
  DeepSeek on their machine, set up local AI inference, create a custom
  Modelfile, or serve models via a local API. Covers installation, model
  management, API usage, and custom model creation.
license: Apache-2.0
compatibility: "Requires Ollama installed locally"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["ollama", "local-llm", "llama", "inference", "self-hosted"]
  use-cases:
    - "Run Llama, Mistral, Qwen, or DeepSeek models locally"
    - "Serve local models via an OpenAI-compatible API"
    - "Create custom models with system prompts and parameters"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Ollama Local

## Overview

Run open-source large language models locally using Ollama. Download and manage models with a single command, serve them via an OpenAI-compatible REST API, and create custom models with tailored system prompts and parameters. Supports Llama, Mistral, Qwen, DeepSeek, Gemma, Phi, and many more.

## Instructions

When a user asks to run local models with Ollama, determine the task:

### Task A: Install and set up Ollama

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS (also available via Homebrew)
brew install ollama

# Verify installation
ollama --version

# Start the Ollama server (runs in background)
ollama serve &
```

The API server starts at `http://localhost:11434` by default.

### Task B: Download and run models

```bash
# Pull and run a model (downloads on first use)
ollama run llama3.1:8b

# Popular models and recommended sizes:
ollama pull llama3.1:8b          # Meta Llama 3.1 8B (~4.7 GB)
ollama pull mistral:7b           # Mistral 7B (~4.1 GB)
ollama pull qwen2.5:7b           # Qwen 2.5 7B (~4.4 GB)
ollama pull deepseek-r1:8b       # DeepSeek R1 8B (~4.9 GB)
ollama pull gemma2:9b            # Google Gemma 2 9B (~5.4 GB)
ollama pull phi3:mini             # Microsoft Phi-3 Mini (~2.3 GB)
ollama pull codellama:7b         # Code Llama 7B (~3.8 GB)

# List downloaded models
ollama list

# Remove a model
ollama rm mistral:7b

# Show model details
ollama show llama3.1:8b
```

### Task C: Use the REST API

```bash
# Generate a completion
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "Explain quantum computing in simple terms",
  "stream": false
}'

# Chat completion (OpenAI-compatible)
curl http://localhost:11434/v1/chat/completions -d '{
  "model": "llama3.1:8b",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Docker?"}
  ]
}'
```

### Task D: Use Ollama from Python

```python
import requests

def ollama_chat(prompt: str, model: str = "llama3.1:8b", system: str = "") -> str:
    response = requests.post("http://localhost:11434/api/chat", json={
        "model": model,
        "messages": [
            {"role": "system", "content": system} if system else None,
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    })
    return response.json()["message"]["content"]

# Or use the OpenAI Python client
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
response = client.chat.completions.create(
    model="llama3.1:8b",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

Using the official Ollama Python library:

```python
# pip install ollama
import ollama

response = ollama.chat(
    model="llama3.1:8b",
    messages=[{"role": "user", "content": "Explain recursion"}],
)
print(response["message"]["content"])

# Streaming
for chunk in ollama.chat(model="llama3.1:8b",
    messages=[{"role": "user", "content": "Write a poem"}], stream=True):
    print(chunk["message"]["content"], end="", flush=True)
```

### Task E: Create custom models with a Modelfile

```dockerfile
# Modelfile for a custom coding assistant
FROM llama3.1:8b

# Set system prompt
SYSTEM """You are a senior software engineer. You write clean, well-documented
code. Always explain your reasoning before writing code. Use best practices
and handle edge cases."""

# Adjust parameters
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
PARAMETER stop "<|eot_id|>"
```

Build and run the custom model:

```bash
# Create the custom model
ollama create coding-assistant -f Modelfile

# Run it
ollama run coding-assistant

# Use via API
curl http://localhost:11434/api/generate -d '{
  "model": "coding-assistant",
  "prompt": "Write a Python function to merge two sorted lists"
}'
```

### Task F: Model management and system info

```bash
# Check running models and memory usage
ollama ps

# Copy a model to a new name
ollama cp llama3.1:8b my-llama

# Check system resources
curl http://localhost:11434/api/tags  # List all models with sizes
```

Memory requirements (approximate, quantized):
- 3B models: ~2 GB RAM
- 7-8B models: ~5 GB RAM
- 13B models: ~8 GB RAM
- 34B models: ~20 GB RAM
- 70B models: ~40 GB RAM

## Examples

### Example 1: Set up a local coding assistant

**User request:** "I want a local AI coding helper that runs offline"

```bash
ollama pull codellama:7b
ollama create my-coder -f - <<'EOF'
FROM codellama:7b
SYSTEM "You are an expert programmer. Write concise, correct code with brief explanations."
PARAMETER temperature 0.2
PARAMETER num_ctx 4096
EOF
ollama run my-coder
```

### Example 2: Batch process documents with a local model

**User request:** "Summarize 100 documents using a local model"

```python
import ollama
from pathlib import Path

for doc_path in Path("./docs").glob("*.txt"):
    text = doc_path.read_text()[:4000]  # Trim to context window
    response = ollama.chat(
        model="llama3.1:8b",
        messages=[{"role": "user", "content": f"Summarize in 2 sentences:\n\n{text}"}],
    )
    print(f"{doc_path.name}: {response['message']['content']}\n")
```

### Example 3: Run a multilingual model

**User request:** "I need a model that handles Chinese and English"

```bash
ollama pull qwen2.5:7b
ollama run qwen2.5:7b
```

## Guidelines

- Start with 7-8B models for a good balance of quality and speed on consumer hardware.
- Use the `:latest` tag for the default quantization (usually Q4_K_M), which works well for most tasks.
- Set `num_ctx` in your Modelfile to match your needs; higher values use more memory.
- For CPU-only machines, expect ~10-30 tokens/second for 7B models. GPU acceleration gives 50-100+ tokens/second.
- Keep Ollama running as a background service for instant inference without startup delay.
- Use the OpenAI-compatible endpoint (`/v1/chat/completions`) for easy migration between local and cloud models.
- Monitor memory with `ollama ps`; only one model loads at a time by default.
- For production use, set `OLLAMA_HOST=0.0.0.0` to allow network access, and add authentication via a reverse proxy.
