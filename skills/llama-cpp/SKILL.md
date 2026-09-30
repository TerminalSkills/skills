---
name: llama-cpp
description: >-
  llama.cpp runs large language and vision models locally from GGUF files on
  CPUs, Apple Silicon and GPUs, and serves them over an OpenAI-compatible HTTP
  API. Use when a user asks to run a model locally with llama.cpp, start
  llama-server or "llama serve", download a GGUF model from Hugging Face, host
  a local OpenAI-compatible endpoint, offload layers to the GPU, get embeddings
  or schema-constrained JSON from a local model, quantize a model to Q4_K_M, or
  benchmark tokens per second.
license: Apache-2.0
compatibility: "macOS, Linux, Windows or FreeBSD on x86_64 or arm64. Source builds need CMake and a C++17 compiler. GPU offload needs a Metal, CUDA, ROCm or Vulkan device."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["llama-cpp", "gguf", "local-llm", "inference-server", "openai-compatible"]
  repository: https://github.com/ggml-org/llama.cpp
---
# llama.cpp — Local LLM inference from GGUF files

## Overview

llama.cpp is a C/C++ inference engine for models stored in the GGUF format. Current builds ship one `llama` binary with subcommands: `llama serve` (HTTP server with OpenAI- and Anthropic-compatible routes plus a web UI), `llama cli` (terminal chat) and `llama download`. Docker images and older installs expose the same programs as `llama-server` and `llama-cli`; the flags are identical, so every `llama serve ...` line below also works as `llama-server ...`.

## Instructions

### Installation

```bash
# Package managers
brew install llama.cpp                   # macOS and Linux
winget install llama.cpp                 # Windows
conda install -c conda-forge llama.cpp   # CUDA, Vulkan and Metal builds

# Official installer from llama.app: probes CUDA, ROCm, Vulkan, Metal or CPU
# features and copies a matching prebuilt binary to ~/.local/bin/llama.
# Download it, read it, then run it — never pipe it straight into a shell.
curl -LsSf https://llama.app/install.sh -o llama-install.sh
sh llama-install.sh

llama version
llama help all        # also lists quantize, bench, perplexity, completion
```

Build from source when no prebuilt binary matches the machine:

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build -DGGML_CUDA=ON        # drop the flag for CPU; Vulkan: -DGGML_VULKAN=ON
cmake --build build --config Release -j 8
ls build/bin/                        # llama, llama-server, llama-cli, llama-quantize, llama-bench
```

Metal is enabled by default on macOS. Docker images are published as `ghcr.io/ggml-org/llama.cpp:server`, `:light` and `:full`, each with `-cuda`, `-rocm`, `-vulkan` and `-intel` variants.

### Get a model

```bash
# Download into the local cache and print the file path
llama download -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M

# Pick an exact file instead of a quantization tag
llama download -hf ggml-org/Qwen3.5-0.8B-GGUF -hff Qwen3.5-0.8B-Q8_0.gguf

llama cli --cache-list
```

`-hf user/repo[:quant]` defaults to `Q4_K_M` and falls back to the first file in the repository. Gated repositories read the token from `HF_TOKEN`. `LLAMA_CACHE` moves the cache directory, and `--offline` forbids network access.

### Run a prompt from the terminal

```bash
# Interactive chat
llama cli -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M

# One answer, then exit: the form to use from scripts and agents
llama cli -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M \
  -sys "You are a release-notes writer." \
  -p "Summarize: fixed login timeout, added CSV export, removed legacy v1 API." \
  -st -n 200 --temp 0.2 --no-display-prompt

# Vision model: the multimodal projector is downloaded together with the model
llama cli -hf ggml-org/gemma-3-4b-it-GGUF --image receipt-2026-09-14.jpg \
  -p "List the merchant, date and total." -st
```

### Serve an OpenAI-compatible API

```bash
export LLAMA_API_KEY="$(openssl rand -hex 24)"    # read by the server, same as --api-key

llama serve -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M \
  --alias qwen2.5-7b-instruct \
  -c 16384 -ngl all -np 4 \
  --host 127.0.0.1 --port 8080 --metrics
```

| Flag | Meaning |
|---|---|
| `-m FILE` / `-hf REPO` | Local GGUF file, or Hugging Face repository to fetch |
| `--alias NAME` | Model id returned by `/v1/models`; default is the file path |
| `-c N` | Context size in tokens; `0` takes the value stored in the model |
| `-ngl N` | Layers kept in VRAM: a number, `auto` (default) or `all` |
| `-np N` | Parallel request slots; `-1` (default) selects automatically |
| `--host`, `--port` | Defaults are `127.0.0.1` and `8080` |
| `--api-key KEY` | Require `Authorization: Bearer KEY`; also `--api-key-file` |
| `--metrics` | Enable the Prometheus endpoint `/metrics` |
| `--sleep-idle-seconds N` | Unload the model after N idle seconds, reload on demand |

Every flag has an environment equivalent such as `LLAMA_ARG_CTX_SIZE` or `LLAMA_ARG_N_GPU_LAYERS`; a command-line flag overrides the variable. Wait for readiness before sending work:

```bash
curl -s http://127.0.0.1:8080/health
# {"status":"ok"}   (HTTP 503 with "Loading model" until the weights are loaded)
curl -s http://127.0.0.1:8080/v1/models -H "Authorization: Bearer $LLAMA_API_KEY"
```

### Call the server

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LLAMA_API_KEY" \
  -d '{
    "model": "qwen2.5-7b-instruct",
    "messages": [
      {"role": "system", "content": "Answer in one sentence."},
      {"role": "user", "content": "What does HTTP status 429 mean?"}
    ],
    "temperature": 0.2,
    "max_tokens": 120
  }'
```

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8080/v1",
    api_key=os.environ.get("LLAMA_API_KEY", "sk-no-key-required"),
)

# Schema-constrained output: the sampler can only emit JSON matching the schema
reply = client.chat.completions.create(
    model="qwen2.5-7b-instruct",
    messages=[{"role": "user", "content": "Invoice INV-2041 from Nordwind GmbH, due 2026-10-15, total 1,284.50 EUR"}],
    response_format={
        "type": "json_schema",
        "schema": {
            "type": "object",
            "properties": {
                "invoice_number": {"type": "string"},
                "vendor": {"type": "string"},
                "due_date": {"type": "string"},
                "total": {"type": "number"},
            },
            "required": ["invoice_number", "vendor", "due_date", "total"],
        },
    },
)
print(reply.choices[0].message.content)
```

Other routes on the same port: `/v1/completions`, `/v1/responses`, `/v1/embeddings`, the Anthropic-compatible `/v1/messages`, plus native `/completion`, `/tokenize`, `/infill`, `/props` and `/slots`. Function calling uses the standard `tools` array and depends on the model's chat template; pass `"parallel_tool_calls": true` to allow several calls per turn.

### Embeddings

```bash
llama serve --embd-gemma-default --port 8081    # downloads EmbeddingGemma on first start

curl -s http://127.0.0.1:8081/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": ["refund policy", "shipping times"], "encoding_format": "float"}'
```

Any dedicated embedding GGUF works with `--embeddings`; add `--pooling mean` if the model file defines no pooling type.

### Serve several models (router mode)

```bash
# No -m and no -hf: the server becomes a router over every model in the cache
llama serve --models-max 2 --port 8080

curl -s http://127.0.0.1:8080/models          # ids and load status of each model
curl -s -X POST http://127.0.0.1:8080/models/load \
  -H "Content-Type: application/json" \
  -d '{"model": "bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M"}'
```

Requests are routed by the `"model"` field of the JSON body, and a model is loaded on first use unless `--no-models-autoload` is set. `--models-dir DIR` routes over a directory of GGUF files instead of the cache, and `--models-preset FILE.ini` sets per-model flags. Take the ids from `GET /models` rather than guessing them.

### Convert, quantize and benchmark

```bash
# From a source checkout
python3 -m pip install -r requirements.txt
python convert_hf_to_gguf.py --outfile gemma-4-E2B-it-bf16.gguf --outtype bf16 --remote google/gemma-4-E2B-it
./build/bin/llama-quantize gemma-4-E2B-it-bf16.gguf gemma-4-E2B-it-Q4_K_M.gguf Q4_K_M

# Compare CPU-only against full GPU offload, 128 generated tokens
./build/bin/llama-bench -m gemma-4-E2B-it-Q4_K_M.gguf -p 512 -n 128 -ngl 0,99 -o md
```

## Examples

### Example 1: Local endpoint for an existing OpenAI client

**Request:** "Serve Qwen 2.5 7B on this workstation so our scripts can call it like the OpenAI API."

```bash
export LLAMA_API_KEY="$(openssl rand -hex 24)"
llama serve -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M \
  --alias qwen2.5-7b-instruct -c 8192 -ngl all --port 8080 &

until curl -sf http://127.0.0.1:8080/health > /dev/null; do sleep 2; done
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" -H "Authorization: Bearer $LLAMA_API_KEY" \
  -d '{"model":"qwen2.5-7b-instruct","messages":[{"role":"user","content":"Reply with the word ready."}]}'
```

**Result:** a standard chat completion object with llama.cpp's extra `timings` block:

```json
{
  "choices": [{"index": 0, "finish_reason": "stop",
               "message": {"role": "assistant", "content": "ready"}}],
  "model": "qwen2.5-7b-instruct",
  "usage": {"prompt_tokens": 35, "completion_tokens": 2, "total_tokens": 37},
  "timings": {"prompt_per_second": 412.6, "predicted_per_second": 58.3}
}
```

Existing clients only need `base_url="http://127.0.0.1:8080/v1"` and the key.

### Example 2: One-shot structured extraction without a server

**Request:** "Pull the ticket id, product and severity out of this support email as JSON, fully offline."

```bash
llama cli -m "$HOME/models/Qwen2.5-7B-Instruct-Q4_K_M.gguf" --offline \
  -f support-email-48213.txt -st --temp 0 --no-display-prompt \
  -j '{"type":"object","properties":{"ticket_id":{"type":"string"},"product":{"type":"string"},"severity":{"type":"string","enum":["low","medium","high"]}},"required":["ticket_id","product","severity"]}'
```

**Result:**

```json
{"ticket_id": "48213", "product": "Billing Portal", "severity": "high"}
```

## Guidelines

- **Memory:** a model needs roughly its file size plus the context cache. When loading fails or swaps, lower `-c`, choose a smaller quantization (`Q4_K_M` instead of `Q8_0`) or reduce `-ngl`. `--fit` is on by default and shrinks unset parameters to fit device memory.
- **Context and slots:** all `-np` slots draw from the context budget set by `-c`. Raise `-c` together with `-np`, or long prompts stop fitting.
- **Model id:** without `--alias`, the id is the path passed to `-m`. Set an alias so clients are not tied to a file location.
- **Network exposure:** the server binds to `127.0.0.1`. Before using `--host 0.0.0.0`, set `--api-key` and put a TLS reverse proxy in front. `/health` stays public even with a key.
- **Tool flags are dangerous:** `--tools`, `--agent` and `--mcp-servers-config` let the model read and write files and run shell commands with the server's privileges. Never enable them on a server that untrusted clients can reach.
- **Chat template:** a model without a recognized template falls back to ChatML, which degrades answers and tool calls. Supply the right one with `--chat-template-file`.
- **Downloads:** `-hf` fetches multi-gigabyte files. Check free disk space first, and use `--offline` in air-gapped runs so a missing file fails fast instead of attempting a download.
- **Docker:** inside a container the server must listen on `--host 0.0.0.0`, and the model directory is mounted with `-v "$HOME/models:/models"`. The `-cuda` images need `--gpus all` and the NVIDIA container toolkit on the host.
- **Requantizing:** quantize from a 16-bit or 32-bit GGUF. Quantizing an already quantized file with `--allow-requantize` loses quality.
- **Updating:** `llama update` works only for binaries installed by the llama.app installer. Package-manager installs update through the package manager.
- **When not to use:** for a managed model library with automatic pulls and a daemon, Ollama is simpler. For high-throughput multi-GPU serving of unquantized weights, use vLLM. llama.cpp only loads GGUF, so safetensors checkpoints must be converted first.
