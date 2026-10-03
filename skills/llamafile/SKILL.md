---
name: llamafile
description: llamafile packages a large language model and the llama.cpp runtime into one executable that runs on Linux, macOS, Windows and BSD without installation. Use when running an LLM offline from a single file, serving a local OpenAI- or Anthropic-compatible API, scripting one-shot prompts with --cli, bundling a GGUF model with zipalign, or distributing a portable AI app.
license: Apache-2.0
compatibility: "Linux, macOS, Windows, FreeBSD/OpenBSD/NetBSD; x86-64 and ARM64; optional NVIDIA, AMD or Apple GPU; Windows executables must stay under 4 GB"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/mozilla-ai/llamafile
  tags:
  - local-llm
  - inference
  - portable
  - single-file
  - offline
---

# llamafile — Single-File LLM Executables

## Overview

llamafile ([mozilla-ai/llamafile](https://github.com/mozilla-ai/llamafile), Apache 2.0) combines llama.cpp with Cosmopolitan Libc, so one file runs on many operating systems. Version 0.10 moved to a new build system that tracks upstream llama.cpp; it supports newer models but dropped some older features. Checked against 0.10.6 (September 2026): the `--help` output and `zipalign` embedding were run on that release; model inference was not (needs a model download).

Release files: `llamafile` (bundled GPU libraries, ~370 MB), `llamafile-thin` (no bundled libraries, ~44 MB), `zipalign`, `whisperfile` and `transcribefile` (speech to text), `diffusionfile` (image generation). Release assets list a SHA-256 digest on the release page; compare it with `sha256sum` before running a download.

## Instructions

### Run a prebuilt llamafile

```bash
curl -LO https://huggingface.co/mozilla-ai/llamafile_0.10/resolve/main/Qwen3.5-0.8B-Q8_0.llamafile
chmod +x Qwen3.5-0.8B-Q8_0.llamafile
./Qwen3.5-0.8B-Q8_0.llamafile
```

With no mode flag you get a terminal chat and a web server together (UI at `http://localhost:8080/`). On Windows rename the file to end in `.exe`. Modes:

| Flag | Behaviour |
|------|-----------|
| (none) | terminal chat plus HTTP server |
| `--server` | HTTP server only |
| `--chat` | terminal chat only |
| `--cli -p "..."` | one prompt, print the answer, exit (clean output for scripts) |

Useful options: `-m model.gguf` (external weights), `-ngl 999` (offload layers to GPU), `--gpu auto|nvidia|amd|apple|disable`, `-c 8192` (context), `-t 8` (threads), `--host`, `--port`, `-sys "system prompt"`, `--api-key-file keys.txt`, `--jinja`. The server listens on 127.0.0.1 only unless you pass `--host 0.0.0.0`. On Linux it sandboxes itself with pledge/seccomp; `--unsecure` turns that off.

### Use your own GGUF model

```bash
curl -L -o llamafile https://github.com/mozilla-ai/llamafile/releases/download/0.10.6/llamafile-0.10.6
chmod +x llamafile
./llamafile -m Qwen3-8B-Q5_K_M.gguf --server --port 8080
```

On Windows, where executables over 4 GB cannot run, keep the weights external: `llamafile.exe -m gpt-oss-20b-Q5_K_S.gguf`.

### Bundle a model into one file

The old `llamafile --create` flow no longer exists. Embed files with `zipalign` and an `.args` file:

```bash
curl -L -o zipalign https://github.com/mozilla-ai/llamafile/releases/download/0.10.6/zipalign-0.10.6 && chmod +x zipalign
cp llamafile-0.10.6 support-bot.llamafile
printf -- '-m\n/zip/Qwen3-8B-Q5_K_M.gguf\n--server\n--host\n127.0.0.1\n...\n' > .args
./zipalign -j0 support-bot.llamafile Qwen3-8B-Q5_K_M.gguf .args
./support-bot.llamafile
```

`.args` holds one argument per line; `/zip/` points at embedded files and a final `...` lets users append command-line flags. A multimodal model adds `--mmproj` and its projector file to both `.args` and the zipalign command.

### Call the API

Endpoints: `POST /v1/chat/completions`, `/v1/embeddings`, `/v1/completions`, `/v1/messages` (Anthropic format), `GET /v1/models`, `GET /health`. Without `--api-key`, no key is required.

```typescript
import OpenAI from "openai";

const llm = new OpenAI({ baseURL: "http://localhost:8080/v1", apiKey: process.env.LLAMAFILE_API_KEY ?? "sk-no-key-required" });

const stream = await llm.chat.completions.create({
  model: "LLaMA_CPP",          // any name works; set a stable one with --alias
  messages: [{ role: "user", content: "Explain Docker in one sentence." }],
  stream: true,
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
```

Embeddings need a model that supports them; start a dedicated server with `--embedding`.

### Run as a subprocess

```python
import subprocess, time, requests

proc = subprocess.Popen(["./support-bot.llamafile", "--server", "--port", "8081", "--host", "127.0.0.1"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):                              # model load can take a while
    try:
        if requests.get("http://127.0.0.1:8081/health", timeout=1).ok: break
    except requests.ConnectionError:
        time.sleep(1)
reply = requests.post("http://127.0.0.1:8081/v1/chat/completions", json={
    "messages": [{"role": "user", "content": "What is the capital of France?"}]}).json()
print(reply["choices"][0]["message"]["content"])
proc.terminate()
```

## Examples

### Example 1: "Summarise every report in a folder, offline"

```bash
for f in reports/*.txt; do
  echo "=== $f ==="
  ./Qwen3.5-0.8B-Q8_0.llamafile --cli --nothink -sys "Summarise in 3 bullet points." --temp 0 -f "$f"
done
```

Each report prints a short bullet summary; nothing leaves the machine. `--nothink` hides reasoning output for models that emit it.

### Example 2: "Give my teammate a chatbot they can double-click"

Build `support-bot.llamafile` with the zipalign steps above, with `-sys "You are the support assistant for Northwind Logistics. Be concise."` added to `.args`. Share the file (under 4 GB if Windows users need it). Result: running it opens the chat in the terminal and the web UI on port 8080.

## Guidelines

- A 7-8B model at Q4_K_M or Q5_K_M needs roughly 5-7 GB of RAM plus context; larger `-c` values need more.
- Without a GPU flag llamafile detects a GPU; use `-ngl` to control how many layers go to VRAM, and `--gpu disable` to force CPU.
- Binding to `0.0.0.0` exposes an unauthenticated API: add `--api-key-file` or keep it on localhost.
- `--tools` (built-in file-access tools for agents) is experimental; do not enable it on untrusted input.
- Only run llamafiles from sources you trust; each one is a native executable.
- One model per llamafile; run several on different ports for routing.
