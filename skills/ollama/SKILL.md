---
name: ollama
description: >-
  Runs LLMs locally with Ollama. Use when a user asks to run AI models locally,
  self-host a language model, use Gemma, Qwen, Llama or Mistral on their
  machine, run offline AI, build a local chatbot, avoid sending data to cloud
  AI providers, generate text without API costs, customize local models, or
  set up a private AI inference server. Covers model management, the native
  and OpenAI-compatible APIs, structured output, embeddings, Modelfile
  customization, context length and GPU configuration.
license: Apache-2.0
compatibility: 'Linux, macOS 14+, Windows (GPU recommended)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/ollama/ollama
  tags:
    - ollama
    - local-llm
    - self-hosted
    - inference
    - embeddings
---

# Ollama

## Overview

Ollama runs open-weight language models on your own hardware: `ollama run gemma4` downloads a model and opens a chat. A local server on `http://localhost:11434` serves a native API (`/api/*`) plus OpenAI-compatible (`/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`) and Anthropic-compatible (`/v1/messages`) endpoints, with no API key and no per-token cost. This skill covers installation, model management, API integration from Node.js and Python, structured output, custom models, and context/GPU configuration.

## Instructions

### Step 1: Installation

```bash
# macOS (Homebrew formula: CLI + server; `brew services start ollama` runs it in the background)
brew install ollama

# Docker, CPU only
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
# Docker with NVIDIA GPUs (needs the NVIDIA Container Toolkit on the host)
docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# Linux without Docker: download the release archive, verify it, then extract (needs the zstd package)
curl -fsSLO https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst
curl -fsSLO https://github.com/ollama/ollama/releases/latest/download/sha256sum.txt
sha256sum --ignore-missing -c sha256sum.txt     # must print "./ollama-linux-amd64.tar.zst: OK"
sudo tar --zstd -xf ollama-linux-amd64.tar.zst -C /usr
ollama serve                                    # foreground; see docs.ollama.com/linux for the systemd unit

# Verify
ollama -v
```

ARM64 Linux uses `ollama-linux-arm64.tar.zst`; AMD GPUs additionally need `ollama-linux-amd64-rocm.tar.zst` (Docker: the `ollama/ollama:rocm` tag). macOS and Windows desktop installers are at https://ollama.com/download.

### Step 2: Download and Run Models

```bash
ollama run gemma4                 # Google Gemma 4 — downloads on first use, then opens a chat (/bye to exit)
ollama run gpt-oss:20b            # OpenAI open-weight reasoning model
ollama run deepseek-r1:8b         # DeepSeek R1 reasoning model
ollama run llama3.2               # small Meta model (~2 GB)
ollama pull embeddinggemma        # embedding model, download only

ollama run gemma4 "Summarize: $(cat CHANGELOG.md)"   # one-shot prompt, prints and exits
ollama run gemma4 --format json "List three HTTP methods as JSON"

ollama list                       # downloaded models (alias: ollama ls)
ollama show gemma4                # architecture, context length, capabilities, parameters
ollama ps                         # loaded models, CPU/GPU split, context size
ollama stop gemma4                # unload from memory now
ollama rm llama3.2                # delete a downloaded model
```

Tags select a size or variant (`gemma4:e2b`, `llama3.1:70b`); browse them at https://ollama.com/library.

### Step 3: REST API

The native API lives under `/api`, the OpenAI-compatible one under `/v1`. The local server needs no authentication.

```bash
# Chat (native). Without "stream": false the reply is a stream of JSON lines.
curl http://localhost:11434/api/chat -d '{
  "model": "gemma4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is a closure in JavaScript?"}
  ],
  "stream": false,
  "options": {"temperature": 0.3, "num_ctx": 8192}
}'
# → {"model":"gemma4","message":{"role":"assistant","content":"..."},"done":true,"done_reason":"stop",...}

# Chat (OpenAI-compatible)
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma4", "messages": [{"role": "user", "content": "Explain recursion in one paragraph."}]}'

# Embeddings — use an embedding model, not a chat model
curl http://localhost:11434/api/embed -d '{
  "model": "embeddinggemma",
  "input": ["How to deploy a Node.js app", "Rotate the database password"]
}'
# → {"model":"embeddinggemma","embeddings":[[...768 floats...],[...]],...}

# Thinking models: "think": true|false (or a level such as "low" for gpt-oss);
# reasoning arrives in message.thinking, the answer in message.content
curl http://localhost:11434/api/chat -d '{
  "model": "deepseek-r1:8b",
  "messages": [{"role": "user", "content": "How many r are in strawberry?"}],
  "think": true, "stream": false
}'
```

### Step 4: Node.js Integration

```typescript
// lib/local-ai.ts — Use Ollama from Node.js via the OpenAI-compatible API
// npm install openai   (the native client is `npm install ollama`)
import OpenAI from 'openai'

const ollama = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',    // required by the SDK, ignored by Ollama
})

const response = await ollama.chat.completions.create({
  model: 'gemma4',
  messages: [
    { role: 'system', content: 'You are a code review assistant.' },
    { role: 'user', content: 'Review this function:\n\nfunction add(a, b) { return a + b; }' },
  ],
  temperature: 0.3,
})
console.log(response.choices[0].message.content)

// Streaming
const stream = await ollama.chat.completions.create({
  model: 'gemma4',
  messages: [{ role: 'user', content: 'Write a haiku about coding.' }],
  stream: true,
})
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '')
}
```

### Step 5: Python Integration

```python
# local_chat.py — pip install ollama pydantic
import ollama
from pydantic import BaseModel

response = ollama.chat(
    model='gemma4',
    messages=[
        {'role': 'system', 'content': 'You are a data analysis expert.'},
        {'role': 'user', 'content': 'Explain the difference between L1 and L2 regularization.'},
    ],
)
print(response.message.content)          # response['message']['content'] also works

# Streaming
for chunk in ollama.chat(model='gemma4',
                         messages=[{'role': 'user', 'content': 'Explain MapReduce.'}],
                         stream=True):
    print(chunk.message.content, end='', flush=True)

# Structured output: pass a JSON schema as `format`, then validate the reply
class Ticket(BaseModel):
    category: str
    priority: int
    summary: str

reply = ollama.chat(
    model='gemma4',
    messages=[{'role': 'user', 'content': 'Classify this ticket as JSON: "Checkout returns HTTP 500 since 09:00."'}],
    format=Ticket.model_json_schema(),
    options={'temperature': 0},
)
ticket = Ticket.model_validate_json(reply.message.content)

# Embeddings (vectors are L2-normalized)
result = ollama.embed(model='embeddinggemma', input='How to use PostgreSQL indexes')
print(len(result.embeddings[0]))         # 768 for embeddinggemma
```

### Step 6: Custom Models with Modelfile

```dockerfile
# Modelfile — a base model plus a fixed system prompt and parameters
FROM gemma4

SYSTEM """
You are a senior Python developer. You write clean, well-documented code
following PEP 8. You always include type hints and docstrings.
"""

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
```

```bash
ollama create python-coder -f Modelfile     # prints "success"; adds only a small layer on top of gemma4
ollama run python-coder
ollama show --modelfile python-coder        # print the resulting Modelfile
```

`FROM` also accepts a local GGUF file (`FROM ./qwen2.5-coder-7b-q4_k_m.gguf`) or a directory of Safetensors weights.

### Step 7: Server and GPU Configuration

The server is configured through environment variables (`ollama serve --help` lists them). With systemd, set them via `sudo systemctl edit ollama` (`Environment="OLLAMA_HOST=0.0.0.0:11434"`), then restart the service; on macOS use `launchctl setenv` and restart the app.

```bash
OLLAMA_CONTEXT_LENGTH=32768   # default context for every model (default: 4k/32k/256k depending on VRAM)
OLLAMA_HOST=0.0.0.0:11434     # bind address (default 127.0.0.1:11434)
OLLAMA_KEEP_ALIVE=30m         # how long a model stays loaded (default 5m; -1 = forever)
OLLAMA_MODELS=/data/ollama    # model storage directory
OLLAMA_NUM_PARALLEL=2         # parallel requests per model (default 1; memory scales with it)
OLLAMA_NO_CLOUD=1             # disable cloud models and web search — local-only mode
CUDA_VISIBLE_DEVICES=0        # restrict Ollama to specific NVIDIA GPUs
```

`ollama ps` shows whether a model fits on the GPU:

```
NAME             ID              SIZE      PROCESSOR    CONTEXT    UNTIL
gemma4:latest    c6eb396dbd59    9.6 GB    100% GPU     131072     2 minutes from now
```

`100% GPU` is the fast case; `48%/52% CPU/GPU` means the model spilled into system RAM and will be much slower — pick a smaller tag or a smaller context.

## Examples

### Example 1: Build a private code assistant
**User prompt:** "I want a code assistant that runs entirely on my machine — no code sent to the cloud. Should handle Python and TypeScript."

```bash
ollama pull qwen2.5-coder:7b
cat > Modelfile <<'EOF'
FROM qwen2.5-coder:7b
SYSTEM """You are a code reviewer for Python and TypeScript. Point out bugs first, then style. Answer with a short list."""
PARAMETER temperature 0.2
PARAMETER num_ctx 16384
EOF
ollama create code-reviewer -f Modelfile
git diff main -- src/billing/invoice.ts | ollama run code-reviewer "Review this diff:"
```

The review prints to the terminal; `ollama ps` shows `code-reviewer:latest ... 100% GPU ... 16384`. Editors and agents that speak the OpenAI API connect to `http://localhost:11434/v1` with model `code-reviewer`. Set `OLLAMA_NO_CLOUD=1` on the server so no request can be routed to a cloud model.

### Example 2: Run a local RAG pipeline
**User prompt:** "Index my company's internal docs and let employees query them with an AI — but we can't send data to OpenAI due to compliance."

```python
# rag.py — pip install ollama chromadb
import ollama, chromadb, pathlib

docs = {p.name: p.read_text() for p in pathlib.Path('handbook').glob('*.md')}
col = chromadb.PersistentClient(path='./chroma').get_or_create_collection('handbook')
col.upsert(ids=list(docs), documents=list(docs.values()),
        embeddings=ollama.embed(model='embeddinggemma', input=list(docs.values())).embeddings)

question = 'How many days of parental leave do we offer?'
hits = col.query(query_embeddings=ollama.embed(model='embeddinggemma', input=question).embeddings, n_results=3)
context = '\n\n'.join(hits['documents'][0])
answer = ollama.chat(model='gemma4', options={'num_ctx': 16384}, messages=[
    {'role': 'system', 'content': 'Answer only from the context. Say "not in the handbook" if it is missing.'},
    {'role': 'user', 'content': f'Context:\n{context}\n\nQuestion: {question}'},
])
print(answer.message.content)
```

With both models pulled (`ollama pull embeddinggemma`, `ollama pull gemma4`), `python rag.py` prints an answer grounded in the three closest handbook files, for example `Employees receive 16 weeks of paid parental leave.` Embedding and generation both happen on the local server; nothing leaves the machine.

## Guidelines

- The default context window is small: 4k tokens on machines with under 24 GiB of VRAM. Longer prompts are cut without an error, which shows up as a model that "forgets" the start of a document. Raise it with `OLLAMA_CONTEXT_LENGTH`, `options.num_ctx` (native API) or `PARAMETER num_ctx` in a Modelfile; agents and coding tools need about 64k. The OpenAI-compatible API has no context parameter, so use one of the other two there.
- A bigger context needs more memory. Check `ollama ps` after changing it: anything other than `100% GPU` means part of the model runs on the CPU.
- The OpenAI-compatible endpoints cover a subset: `tool_choice`, `logprobs`, `n` and image URLs (base64 only) are not supported, and `/v1/responses` is stateless (no `previous_response_id`).
- Use a dedicated embedding model (`embeddinggemma`, `qwen3-embedding`, `all-minilm`) with `/api/embed`, and the same one for indexing and querying. Chat models answer `this model does not support embeddings`.
- Always validate structured output against the schema instead of trusting `format`: a reply cut off by `num_predict` is incomplete JSON, and with thinking switched off some models have returned Markdown-fenced JSON.
- The API has no authentication and binds to `127.0.0.1` by default. Before setting `OLLAMA_HOST=0.0.0.0`, put it behind a reverse proxy with auth or a private network — anyone who can reach the port can run and delete models.
- Local models stay local, but tags ending in `-cloud` or `:cloud` (after `ollama signin`) run on ollama.com. For strict data-residency set `OLLAMA_NO_CLOUD=1`.
- Models unload after 5 minutes idle, so the first request afterwards pays the load time. Use `keep_alive` per request or `OLLAMA_KEEP_ALIVE` for latency-sensitive services.
- Ollama does not train or fine-tune models. A Modelfile only fixes the system prompt, template and parameters; to use fine-tuned weights, import them as GGUF or Safetensors with `FROM`.
- Update models with `ollama pull gemma4` — tags are mutable and get refreshed quantizations and templates.
