---
name: moneyprinterturbo
description: >-
  MoneyPrinterTurbo turns a topic or keyword into a finished short video: it writes the script, picks stock footage, adds a voiceover, subtitles and background music, and renders an HD clip. Use when asked to "generate a short video from a topic", "make faceless YouTube Shorts or TikToks", "batch-produce videos from a list of subjects", "run MoneyPrinterTurbo", or "call its API to create a video". Covers pip and Docker install, config.toml, the mpt CLI with batch manifests, and the REST API.
license: Apache-2.0
compatibility: "Python 3.11+ (or Docker 24+); an LLM API key and a Pexels or Pixabay API key for the default pipeline; FFmpeg is bundled through imageio-ffmpeg"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: "video-generation, short-video, tts, subtitles, faceless-channel"
  repository: https://github.com/harry0703/MoneyPrinterTurbo
---

# MoneyPrinterTurbo — topic in, finished short video out

## Overview

MoneyPrinterTurbo (MPT) runs a fixed pipeline: script (LLM) -> search terms -> voiceover (TTS) -> subtitles -> footage -> final render. You give it a subject; it returns an MP4 in portrait 9:16 (1080x1920), landscape 16:9 or square 1:1. Footage comes from Pexels, Pixabay or Coverr (free keys), your own local files, or paid AI video providers. The default voice (Microsoft Edge TTS) needs no key.

It has four front ends over the same engine: a Streamlit WebUI, the `mpt cli` command, a FastAPI service with interactive docs, and Docker. An agent should use the CLI or the API; the WebUI is for humans.

Use it for volume content (Shorts, Reels, explainers). Do not use it when you need editorial control over every frame; a programmatic editor such as Remotion or FFmpeg fits that better.

## Instructions

### Install with pip (recommended)

The official PyPI package is `mpt`. The package called `MoneyPrinterTurbo` on PyPI is maintained by a third party; do not install it.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install mpt
mpt --version
mpt cli --help
```

Config and output live in a data directory: `~/.local/share/MoneyPrinterTurbo` on Linux (or `$XDG_DATA_HOME/MoneyPrinterTurbo`), `~/Library/Application Support/MoneyPrinterTurbo` on macOS, `%LOCALAPPDATA%\MoneyPrinterTurbo` on Windows. Set `MPT_HOME` to choose another one. `config.toml` is created there on first launch; videos land in `storage/tasks/(one folder per task id)/final-1.mp4` inside it. Upgrade with `python -m pip install --upgrade mpt`.

The pip package provides `mpt webui` and `mpt cli`. It has no API-server command; for the API use the source checkout or Docker below.

### Install from source or Docker

```bash
git clone https://github.com/harry0703/MoneyPrinterTurbo.git
cd MoneyPrinterTurbo
uv python install 3.11
uv sync --frozen
```

Docker, prebuilt image `ghcr.io/harry0703/moneyprinterturbo:latest`. Copy the config first so it can be mounted:

```bash
cd MoneyPrinterTurbo
cp config.example.toml config.toml
docker compose -f docker-compose.release.yml up -d
```

The WebUI is then on http://127.0.0.1:8501 and the API docs on http://127.0.0.1:8080/docs.

### Configure credentials (config.toml)

All keys live in `config.toml`; MPT does not read LLM or footage keys from environment variables. Keep the file out of git. Minimum for the default pipeline: one LLM provider plus one footage key.

```toml
[app]
llm_provider = "openai"
openai_api_key = "paste-your-key-here"   # created at platform.openai.com/api-keys
openai_model_name = "gpt-4o-mini"
video_source = "pexels"
pexels_api_keys = ["paste-your-key-here"]   # free key from pexels.com/api
subtitle_provider = "edge"
```

Other LLM providers use the same pattern (`moonshot_api_key`, and so on; the full list with comments is in `config.example.toml`). To avoid pasting secrets into files by hand, have a script write them from your own environment variables:

```bash
python - <<'EOF'
import os, toml
from pathlib import Path
home = Path(os.environ.get("MPT_HOME", Path.home() / ".local/share/MoneyPrinterTurbo"))
path = home / "config.toml"
cfg = toml.load(path)
cfg["app"]["llm_provider"] = "openai"
cfg["app"]["openai_api_key"] = os.environ["OPENAI_API_KEY"]
cfg["app"]["pexels_api_keys"] = [os.environ["PEXELS_API_KEY"]]
path.write_text(toml.dumps(cfg))
EOF
```

This needs `toml`, which `mpt` already installs. Run it inside the activated environment, after `mpt webui --headless` or `mpt cli` has created the file once.

Other settings: `[app] api_key` protects the API (clients send it as the `x-api-key` header); `max_concurrent_tasks` (default 5) caps parallel renders; `subtitle_provider = "whisper"` plus `[whisper]` uses faster-whisper for more accurate subtitles at the cost of a model download on first use.

### Generate a video from the CLI

```bash
mpt cli --video-subject "How solar panels work" --video-aspect 9:16
```

From a source checkout use `uv run python cli.py` instead of `mpt cli`. The command prints a JSON line with `task_id` and `result` when done. Useful options (all verified in `--help`):

- `--video-script "..."` skips LLM script writing; `--paragraph-number 1..10` sets script length; `--video-language en-US`.
- `--video-source pexels|pixabay|coverr|local|...`; `--video-materials a.mp4,b.jpg` for your own footage with `--video-source local`.
- `--voice-name zh-CN-XiaoxiaoNeural-Female`, `--voice-rate`, `--voice-volume`, or `--custom-audio-file narration.mp3`.
- `--bgm-type none|random|custom` with `--bgm-file` and `--bgm-volume`.
- `--video-count N` produces N variants; `--video-clip-duration` seconds per clip.
- `--stop-at script|terms|audio|subtitle|materials|video` stops early, which is the cheap way to review the script before spending render time.
- Paid AI video sources (wavespeed, volcengine_seedance, ofox, metaso_minimax, muapi) refuse to run without the matching `--confirm-<provider>-charge` flag. Never add that flag unless the user approved the spend.

### Batch mode

A UTF-8 JSON array or JSONL file, at most 100 tasks and 1 MiB. CLI options are defaults; each entry overrides any `VideoParams` field. All entries are validated first; a runtime failure in one task does not stop the rest. A JSON summary with `total`, `succeeded`, `failed` and per-task `status` is printed at the end.

```json
[
  { "video_subject": "How solar panels work" },
  { "video_subject": "How wind turbines work", "video_aspect": "16:9" }
]
```

```bash
mpt cli --batch-file ./tasks.json --stop-at video
```

### Use the REST API

Start it from a source checkout (`uv run python main.py`, listens on port 8080) or via Docker. Routes are under `/api/v1`: `POST /api/v1/videos` (create task), `POST /api/v1/subtitle`, `POST /api/v1/audio`, `GET /api/v1/tasks` (list), `GET /api/v1/tasks/{task_id}` (status), `DELETE /api/v1/tasks/{task_id}`. Interactive docs are at `/docs`.

```bash
curl -s -X POST http://127.0.0.1:8080/api/v1/videos \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MPT_API_KEY" \
  -d '{"video_subject": "Why the sky is blue", "video_aspect": "9:16", "video_count": 1}'
curl -s -H "x-api-key: $MPT_API_KEY" http://127.0.0.1:8080/api/v1/tasks/0b1f6c2e-5d1a-4c1e-9a77-3f2d8e6a9c10
```

Omit the `x-api-key` header if `[app] api_key` is empty. Task state codes: 1 complete, 4 processing, -1 failed. A full queue returns HTTP 429. To call the API from a browser frontend on another origin, set `CORS_ALLOWED_ORIGINS`.

## Examples

### Example 1: One vertical Short from a topic

Request: "Make a 9:16 short about how espresso machines work, English voice."

```bash
export MPT_HOME="$HOME/mpt-data"
mpt cli --video-subject "How espresso machines work" \
  --video-language en-US --voice-name en-US-JennyNeural-Female \
  --video-aspect 9:16 --paragraph-number 1
```

Result: the console logs each stage, then prints `{"task_id": "...", "result": {...}}`. The file is `$HOME/mpt-data/storage/tasks/(the task id)/final-1.mp4`, with the script, Edge TTS narration, Pexels clips, burned-in subtitles and random background music. The `en-US-JennyNeural-Female` name format is locale, name, "Neural", gender (e.g. zh-CN-XiaoxiaoNeural-Female); confirm available names in the WebUI voice list.

### Example 2: Review scripts first, then render a weekly batch

Request: "I have five topics. Show me the scripts before rendering."

```bash
mpt cli --batch-file ./week-43.json --stop-at script
# read the scripts, edit video_script in week-43.json where needed
mpt cli --batch-file ./week-43.json --stop-at video
```

Result: the first run stops after script generation for every task and prints the summary; the second renders final videos. Entries that now carry a `video_script` skip the LLM and use your text, which keeps token cost and surprises down.

## Guidelines

- Credentials are config-file only. Never commit `config.toml`, never print it, and never pass keys on a command line.
- Check cost before scaling: the default pipeline costs LLM tokens only (Edge TTS and Pexels are free); AI video sources bill per second of footage.
- Pexels and Pixabay have licence and rate-limit terms; stock footage and generated scripts still need a human check for accuracy and for platform policies on automated content.
- The API has no authentication unless `[app] api_key` is set. Do not expose port 8080 to the internet without it and a reverse proxy; the Docker compose files bind to 127.0.0.1 by default.
- On Windows keep the project path free of spaces and non-ASCII characters. On Linux, many parallel renders can hit `Too many open files`; raise `ulimit -n`.
- With `subtitle_provider = "whisper"` the first run downloads a model; set up access to Hugging Face or pre-place the model first.
- The setup is heavy (moviepy, Streamlit, faster-whisper). Use a dedicated virtual environment, not a shared one.
