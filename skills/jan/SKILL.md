---
name: jan
description: >-
  Jan is an open-source desktop app that runs LLMs on your own computer and serves them through an OpenAI- and Anthropic-compatible local API. Use this skill to install Jan, start and secure its Local API Server (127.0.0.1:1337), call it from curl or the OpenAI SDK, and inspect its model and thread files in the data folder. It also marks which steps are GUI-only. Trigger phrases: "run a local model with Jan", "Jan local API server", "ChatGPT alternative that runs offline", "point my app at Jan".
license: Apache-2.0
compatibility: "Windows 10+, macOS on Apple Silicon, or Linux (Flatpak, .deb or AppImage); enough RAM for the chosen GGUF model"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "local-llm, desktop-app, openai-compatible, privacy, gguf"
  repository: https://github.com/janhq/jan
---
# Jan — a local ChatGPT-style app with a built-in API server

## Overview

Jan (release 0.8.8 at the time of writing) is a desktop application. It downloads models in GGUF format from Hugging Face, runs them with a built-in llama.cpp engine (MLX on Apple Silicon), and gives you a chat window. It can also connect cloud providers with your own API key. Its Local API Server exposes `/v1/models` and `/v1/chat/completions` (OpenAI format) and `/v1/messages` (Anthropic format) on your machine, so existing code can use a local model by changing a base URL.

Most of Jan is a GUI. What an agent can do reliably:

- install the app with a package manager,
- call the local API once the user has started the server,
- read the data folder (model files, `model.yml`, threads, logs),
- write the client code and configuration that uses the server.

GUI-only steps (tell the user to click, do not try to automate them): downloading models in the **Hub**, importing a local GGUF under **Settings > Llama.cpp**, and the Local API Server settings and **Start Server** button under **Settings > Local API Server**. The docs describe no config file or flag for those.

For a headless server with no desktop, use a server-first tool such as `llama-cpp`, `localai` or `ollama` instead.

## Instructions

### Install

On Linux the docs recommend Flatpak:

```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install -y flathub ai.jan.Jan
flatpak run ai.jan.Jan
```

Other options are the `.deb` and the AppImage from https://github.com/janhq/jan/releases. Check the file against the SHA-256 digest GitHub lists for the release asset before installing it:

```bash
gh api repos/janhq/jan/releases/tags/v0.8.8 --jq '.assets[] | select(.name=="Jan_0.8.8_amd64.deb") | .digest'
# sha256:ed8b23d763a0fa99bc87c400ace65ebd448f1b066596cc0b8ec0d18bd8842c38
echo "ed8b23d763a0fa99bc87c400ace65ebd448f1b066596cc0b8ec0d18bd8842c38  Jan_0.8.8_amd64.deb" | sha256sum -c -
sudo apt-get install ./Jan_0.8.8_amd64.deb
```

The AppImage (`Jan_0.8.8_amd64.AppImage`, digest `sha256:ef98314c0230e3066235fd195ff1ffdf652b85b264bbd9ddf337f99d077c9159`) is checked the same way, then made executable with `chmod +x`. On Windows use the Microsoft Store listing or the `.exe` installer; on macOS use the `.dmg` (Apple Silicon only for local models: Intel Macs run only remote providers). Do not run a downloaded installer without telling the user which file and from where.

### Get a model (GUI)

The user opens the **Hub** tab, picks a model whose fit pill says **Fits**, and clicks **Download**. A Hugging Face repo ID such as `unsloth/Qwen3.5-9B-GGUF` can be pasted into the Hub search box. Gated models need a token in **Settings > General > Others > HuggingFace Token**. A GGUF file already on disk is linked in place with **Settings > Llama.cpp > Import**.

### Start the Local API Server (GUI)

The user opens **Settings > Local API Server**, sets the options below, and clicks **Start Server**. The server is ready when the server log shows `JAN API listening at http://127.0.0.1:1337`.

| Setting | Default | Notes |
|---|---|---|
| Server Host | `127.0.0.1` | `0.0.0.0` exposes it to the LAN; without an API key Jan still starts and only logs a warning that the API is reachable unauthenticated |
| Server Port | `1337` | any free port |
| API Prefix | `/v1` | |
| API Key | empty | set one; requests then need `Authorization: Bearer <key>` |
| Trusted Hosts | | extra hostnames allowed to reach the server |
| CORS | on | turn off if only scripts and CLIs call it |

Keep the host at `127.0.0.1` unless another machine really needs it. If it does, set an API key first.

### Call the API

Keep the key in an environment variable the user exports (`JAN_API_KEY`), never in the command history:

```bash
curl -s http://127.0.0.1:1337/v1/models \
  -H "Authorization: Bearer $JAN_API_KEY"
```

The `id` values in the result are the model names to send. Chat:

```bash
curl -s http://127.0.0.1:1337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JAN_API_KEY" \
  -d '{"model": "jan-v3-4b-base-instruct",
       "messages": [{"role": "user", "content": "Summarize: invoice 4471 is 12 days overdue."}],
       "stream": false}'
```

With the OpenAI SDK (Python):

```python
import os
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:1337/v1", api_key=os.environ["JAN_API_KEY"])
reply = client.chat.completions.create(
    model="jan-v3-4b-base-instruct",
    messages=[{"role": "user", "content": "List three risks of an unpinned base image."}],
)
print(reply.choices[0].message.content)
```

The Anthropic-format endpoint takes the key in an `x-api-key` header: `POST /v1/messages` with `model`, `max_tokens` and `messages`. The OpenAI Responses API (`/v1/responses`) is listed as coming soon: do not use it.

A `401` means a missing or wrong key. A `404` means the model ID is not one returned by `/v1/models` or the prefix differs. `Connection refused` means the server is not started or the port differs.

### Read the data folder

Jan keeps its data as plain files. Default locations: Linux `~/.local/share/Jan/data`, macOS `~/Library/Application Support/Jan/data`, Windows `%APPDATA%/Jan/data`. The user can move it (**Settings > General > Jan Data Folder**), and the Flatpak build may use another path, so ask for the path shown in Settings if the default is empty.

```text
llamacpp/models/janhq/Jan-v3-4B-base-instruct-gguf/model.yml and the .gguf file
mlx/models/Jan-v3-4B-base-instruct-4bit/model.yml
llamacpp/router.preset.ini          per-model inference settings (generated by the app)
threads/jan_1751012639/messages.jsonl and thread.json
assistants/jan/assistant.json
logs/app.log
```

Each `model.yml` has `model_path`, `name`, `size_bytes`, `embedding` and `model_sha256`. Reading these is safe; edit nothing while Jan is running, and change model settings in the app.

## Examples

### Example 1: Give a script a private model for log summaries

**Request:** "I already installed Jan. Make my log-summary script use the local model instead of OpenAI."

```bash
curl -s http://127.0.0.1:1337/v1/models -H "Authorization: Bearer $JAN_API_KEY" | python3 -c "import json,sys; print([m['id'] for m in json.load(sys.stdin)['data']])"
```

Result: a list such as `['jan-v3-4b-base-instruct']`. The agent changes the script's client to `base_url="http://127.0.0.1:1337/v1"`, `api_key=os.environ["JAN_API_KEY"]` and `model="jan-v3-4b-base-instruct"` (the ID printed above). If the command fails with `Connection refused`, it asks the user to open **Settings > Local API Server** and click **Start Server**, because it cannot start it.

### Example 2: Check which models are on disk and how big they are

**Request:** "Which models does Jan have, and how much disk do they use?"

```bash
DATA="$HOME/.local/share/Jan/data"
find "$DATA/llamacpp/models" -name model.yml | while read -r f; do
  echo "$(grep '^name:' "$f")  $(grep '^size_bytes:' "$f")"
done
du -sh "$DATA/llamacpp/models"
```

Result: one line per installed model, for example `name: Jan-v3-4B-base-instruct-gguf  size_bytes: 2999182272`, then the folder total. To remove a model the agent tells the user to use the trash icon in **Settings > Llama.cpp**, so Jan's own records stay consistent.

## Guidelines

- Jan is a GUI application: do not claim the agent started the server, loaded a model or downloaded one. Ask the user to do those steps and then verify with `/v1/models`.
- The docs describe a `jan` command line (`jan serve`, `jan launch`), but the troubleshooting page says that since 0.8.5 the desktop app no longer ships it, and the current quickstart for `jan` is a separate preview coding agent that calls remote providers. Do not rely on `jan serve` for a local server; use the Local API Server.
- Local models need memory: pick a quantization the Hub marks as **Fits**. Large models on small machines time out; raise the request timeout in the server settings.
- Do not bind to `0.0.0.0` without an API key, and do not put that port on the internet. Prefer an SSH tunnel for remote use.
- Local inference keeps prompts on the machine. Cloud providers added in Settings send prompts to those providers: say so when privacy is the reason for choosing Jan.
- Chat history is stored in plain text under `threads/`; treat the data folder as sensitive.
- Not suited to serving many concurrent users or running without a desktop session: use a server-based stack for that.
