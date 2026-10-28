---
name: sglang
description: >-
  SGLang is a high-throughput serving engine that runs open-weight language, vision-language and embedding models on your own GPU behind an OpenAI-compatible HTTP API. Use this skill when asked to serve a Hugging Face model with SGLang, run `sglang serve` or `python -m sglang.launch_server`, split a model across GPUs with tensor parallelism, tune GPU memory, enable tool calling, reasoning parsing or JSON-schema constrained output, or call a self-hosted model with the OpenAI SDK.
license: Apache-2.0
compatibility: "Linux with an NVIDIA GPU and CUDA 13-compatible driver, Python 3.11+ (or Docker with NVIDIA Container Toolkit); AMD, TPU, Intel and Apple Silicon have separate install guides"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "sglang, llm-serving, inference, openai-compatible, gpu"
  repository: https://github.com/sgl-project/sglang
---

# SGLang — serve open-weight models on your own GPU

## Overview

SGLang loads a model from the Hugging Face Hub (or a local folder) and exposes it as an HTTP server with OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings` and `/v1/models`. It is built for throughput under many concurrent requests (prefix caching, continuous batching, tensor and data parallelism, quantized weights and KV cache) and for agent workloads that need tool calls, reasoning output and schema-constrained JSON.

It is a serving engine, not a model: you choose the weights. It needs an accelerator. This skill covers NVIDIA GPUs on Linux; for AMD, TPU, Intel or Apple Silicon follow the hardware guides at https://docs.sglang.io/docs/hardware-platforms/overview.md. Neighbouring skills: `vllm` is the closest alternative (same job, different engine), `llama-cpp` and `ollama` suit CPUs and small GPUs.

## Instructions

### Install

With uv, in a fresh environment (Python 3.11 or newer):

```bash
uv venv --python 3.12
source .venv/bin/activate
uv pip install --prerelease=allow sglang
python -m sglang.launch_server --help
```

Or use the official image, which already contains Python, SGLang and CUDA 13 libraries. It needs Docker and the NVIDIA Container Toolkit:

```bash
docker pull lmsysorg/sglang:latest
```

`latest` is the newest stable release; for reproducible deployments pin a release tag from https://hub.docker.com/r/lmsysorg/sglang/tags. Images for CUDA 12 are no longer published (`v0.5.19-cu129` is the last).

### Start a server

The current entry point is `sglang serve`. The older `python -m sglang.launch_server --model-path ...` still works and takes the same arguments.

```bash
sglang serve Qwen/Qwen3-0.6B --host 127.0.0.1 --port 30000
```

Wait for the log line `The server is fired up and ready to roll!`. The first start downloads the weights, so it can take minutes. Defaults: host `127.0.0.1`, port `30000`.

In Docker, bind the published port to loopback on the host, and let the process listen on all container interfaces:

```bash
docker run --rm --gpus all --ipc=host --shm-size 32g \
  -p 127.0.0.1:30000:30000 \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  lmsysorg/sglang:latest \
  sglang serve Qwen/Qwen3-0.6B --host 0.0.0.0 --port 30000
```

For gated models, export `HF_TOKEN` (created at https://huggingface.co/settings/tokens) and add `--env HF_TOKEN` before the image name.

### Check health and call it

```bash
curl -s http://127.0.0.1:30000/health            # 200 when the server is up
curl -s http://127.0.0.1:30000/v1/models         # lists the served model name
curl -s http://127.0.0.1:30000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "Qwen/Qwen3-0.6B",
       "messages": [{"role": "user", "content": "What is the capital of France?"}],
       "max_tokens": 128}'
```

`/health_generate` generates one token, a stricter probe. The answer is in `choices[0].message.content`. With the OpenAI Python SDK (`uv pip install openai`):

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:30000/v1", api_key="EMPTY")
stream = client.chat.completions.create(
    model="Qwen/Qwen3-0.6B",
    messages=[{"role": "user", "content": "Explain prefix caching in two sentences."}],
    stream=True,
)
for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### Key server arguments

These are from the server-arguments reference (https://docs.sglang.io/docs/advanced_features/server_arguments.md); `python -m sglang.launch_server --help` prints the full current list.

| Argument | Purpose |
|---|---|
| `--model-path` (or `--model`, or the first positional) | Hub ID or local folder |
| `--host`, `--port` | Bind address (default `127.0.0.1:30000`) |
| `--api-key` | Require this bearer key on the OpenAI endpoints |
| `--served-model-name` | Name returned by `/v1/models` and expected in requests |
| `--tp` / `--tp-size` | Tensor parallelism: split one model over N GPUs |
| `--dp` / `--dp-size` | Data parallelism: N replicas for throughput |
| `--mem-fraction-static` | GPU fraction for weights plus KV cache; lower it (for example 0.7) on out-of-memory |
| `--context-length` | Override the model's maximum context |
| `--chunked-prefill-size` | Smaller value (for example 4096) fixes OOM on long prompts |
| `--quantization fp8` | Quantize an fp16 checkpoint to fp8 on load |
| `--kv-cache-dtype fp8_e4m3` | Smaller KV cache |
| `--max-running-requests` | Cap concurrent requests |
| `--tool-call-parser`, `--reasoning-parser` | Enable tool calls and reasoning separation (below) |
| `--grammar-backend` | `xgrammar` (default), `outlines`, `llguidance` for constrained output |
| `--is-embedding` | Serve a decoder-style model as an embedding model |
| `--trust-remote-code` | Allow custom modelling code from the Hub (see Guidelines) |
| `--enable-metrics` | Expose Prometheus metrics |
| `--config config.yaml` | Read arguments from a YAML file whose keys are flag names without the leading dashes (`model-path`, `port`); CLI flags override it |

A multi-GPU example on a 2-GPU host (Llama weights are gated: accept the license on the Hub and export `HF_TOKEN`):

```bash
sglang serve meta-llama/Llama-3.1-8B-Instruct --tp 2 --mem-fraction-static 0.85 \
  --api-key "$SGLANG_API_KEY" --port 30000
```

If it fails with "peer access is not supported between these two devices", add `--enable-p2p-check`. Multi-node tensor parallelism uses `--nnodes`, `--node-rank` and `--dist-init-addr` (see the server-arguments page).

### Tool calling and reasoning

Pick the parser that matches the model family; `--tool-call-parser auto` and `--reasoning-parser auto` detect it from the chat template. For Qwen2.5 instruct models the documented tool parser is `qwen25`; for Qwen3 reasoning models use `--reasoning-parser qwen3`, and `qwen3_coder` as the tool parser for models that use that format (the Cookbook names the right one per model).

```bash
sglang serve Qwen/Qwen2.5-7B-Instruct --tool-call-parser qwen25 --port 30000
```

Then send `tools` in the normal OpenAI format; the response carries `message.tool_calls`. With a reasoning parser, pass `extra_body={"separate_reasoning": True}` and read `message.reasoning_content` apart from `message.content`.

### Structured output

Constrain output with a JSON schema through the standard `response_format`:

```python
from pydantic import BaseModel
from openai import OpenAI

class Ticket(BaseModel):
    category: str
    urgent: bool

client = OpenAI(base_url="http://127.0.0.1:30000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "Classify: 'Checkout page returns 500 for all users'. Reply as JSON."}],
    temperature=0,
    response_format={"type": "json_schema",
                     "json_schema": {"name": "ticket", "schema": Ticket.model_json_schema()}},
)
print(Ticket.model_validate_json(resp.choices[0].message.content))
```

`regex` and `ebnf` constraints exist too; only one of `json_schema`, `regex`, `ebnf` per request. Still tell the model in the prompt which format you want.

### Embeddings

```bash
sglang serve Alibaba-NLP/gte-Qwen2-1.5B-instruct --is-embedding --port 30001
curl -s http://127.0.0.1:30001/v1/embeddings -H "Content-Type: application/json" \
  -d '{"model": "Alibaba-NLP/gte-Qwen2-1.5B-instruct", "input": "refund policy for annual plans"}'
```

The vector is at `data[0].embedding`. Native encoder embedding models are detected automatically; decoder-style ones need `--is-embedding`.

## Examples

### Example 1: serve a small model for a private internal chat tool

User request: "We have one RTX 4090 in the office. Serve Qwen3-0.6B locally so our script can call it with the OpenAI SDK, and don't expose it to the network."

```bash
uv venv --python 3.12 && source .venv/bin/activate
uv pip install --prerelease=allow sglang openai
sglang serve Qwen/Qwen3-0.6B --host 127.0.0.1 --port 30000 --api-key "$SGLANG_API_KEY"
```

Set `SGLANG_API_KEY` to a long random string first (for example from `openssl rand -hex 24`). Once `The server is fired up and ready to roll!` appears, the script calls it with `OpenAI(base_url="http://127.0.0.1:30000/v1", api_key=os.environ["SGLANG_API_KEY"])`. `curl -s http://127.0.0.1:30000/v1/models` shows `Qwen/Qwen3-0.6B`. Nothing listens on a public interface.

### Example 2: fix an out-of-memory start on a long-context model

User request: "Llama 3.1 8B crashes with CUDA out of memory when prompts are long. Two 24 GB GPUs."

```bash
sglang serve meta-llama/Llama-3.1-8B-Instruct --tp 2 \
  --mem-fraction-static 0.75 --chunked-prefill-size 4096 \
  --context-length 16384 --host 127.0.0.1 --port 30000
```

The model is split over both GPUs, the KV-cache pool is smaller (`--mem-fraction-static`), long prompts are prefilled in 4096-token chunks and the context is capped at 16k. The agent then sends a 12k-token prompt through `/v1/chat/completions` and confirms a normal answer, watching `nvidia-smi` for headroom. If it still fails, lower `--mem-fraction-static` further (0.7, 0.65) before reducing the context.

### Example 3: JSON classification for a support queue

User request: "Classify incoming tickets as JSON with a category and an urgent flag, always valid."

Start a server with `sglang serve Qwen/Qwen2.5-7B-Instruct --port 30000`, then run the structured-output snippet above for each ticket. Because decoding is constrained by the schema, `Ticket.model_validate_json` never fails on syntax; a ticket such as "Checkout page returns 500 for all users" returns `{"category": "bug", "urgent": true}` (exact values depend on the model).

## Guidelines

- Default bind is loopback. Use `--host 0.0.0.0` only inside a container whose published port is bound to `127.0.0.1`, or behind a reverse proxy with TLS. If a server is reachable from a network, set `--api-key`.
- `--trust-remote-code` runs Python from the model repository on your machine. Add it only for models you trust, and only when the loader asks for it.
- A multimodal server that accepts untrusted clients should set `--allowed-media-domains` so remote image or video URLs are limited to named hosts.
- Model names in requests must match the served name: the model path, or `--served-model-name` if set. Check `/v1/models` when a request returns "model not found".
- Parsers are per model family. A wrong `--tool-call-parser` yields tool calls left as plain text in `content`; look up the model in the Cookbook (https://cookbook.sglang.io/) for its tested launch command.
- Shared memory matters in containers: use `--ipc=host` or a large `--shm-size`.
- GPU engines cannot be exercised on a laptop without an accelerator. If the host has no supported GPU, say so rather than attempting a CPU run; use `llama-cpp` or `ollama` instead.
- Not for training or fine-tuning. For one-user local chat on modest hardware, `ollama` is simpler; choose SGLang when throughput, many concurrent requests or structured agent output matter.
