---
name: screenshot-to-code
description: >-
  screenshot-to-code is a self-hosted web app that turns a screenshot, mockup or short screen recording into HTML, Tailwind, React, Vue, Bootstrap or Ionic code using a multimodal LLM. Use it when a user asks to "turn this screenshot into code", "clone this UI from an image", "run screenshot-to-code locally", "self-host a screenshot to HTML tool", or "generate a React component from a mockup". It needs an OpenAI, Anthropic or Gemini API key that the user supplies; the skill covers setup, configuration and scripting the backend.
license: Apache-2.0
compatibility: "Python 3.10+, Poetry, Node.js 18+ with pnpm, or Docker with Compose; at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "screenshot-to-code, design-to-code, tailwind, react, llm"
  repository: https://github.com/abi/screenshot-to-code
---

# screenshot-to-code — turn a UI image into working front-end code

## Overview

The repository (MIT licensed, no tagged releases, so pin a commit) has two parts: a FastAPI backend in `backend/` that calls the model providers, and a React + Vite frontend in `frontend/` where you drop an image, pick a stack and watch the code stream in. Each request produces several variants (four for image input, two for video) so you can compare models.

Supported stacks, as the backend accepts them: `html_tailwind`, `html_css`, `react_tailwind`, `vue_tailwind`, `bootstrap`, `ionic_tailwind`. Input modes are `image`, `video` and `text`. Generation costs money on your provider account, and the backend enforces a per-generation spend ceiling of 3 USD (`GENERATION_MAX_COST_USD` in `backend/config.py`).

A hosted version exists at screenshottocode.com; this skill is only about running the open-source code yourself.

## Instructions

### 1. Get the code at a pinned commit

```bash
git clone --depth 1 https://github.com/abi/screenshot-to-code.git
cd screenshot-to-code
git rev-parse HEAD
```

Record the printed commit hash in your project notes so the setup is reproducible.

### 2. Create the keys file

The backend reads `backend/.env`. Only one of the three model keys is required:

| Variable | Needed | Effect |
|---|---|---|
| `OPENAI_API_KEY` | one of three | GPT code generation |
| `ANTHROPIC_API_KEY` | one of three | Claude code generation |
| `GEMINI_API_KEY` | one of three, recommended | Gemini generation, asset extraction from the screenshot, required for video input |
| `REPLICATE_API_KEY` | recommended | image generation, background removal, image editing |
| `OPENAI_BASE_URL` | optional | OpenAI-compatible proxy, must end in `/v1` |

Write the file with your editor from keys you created in each provider's console. Never commit `.env`. You can also paste keys into the frontend settings dialog (gear icon) instead; `REPLICATE_API_KEY` is the exception and must be in `backend/.env`.

### 3. Run the backend

```bash
cd backend
poetry install
poetry run playwright install chromium
poetry run python start.py --host 127.0.0.1 --port 7001
```

`start.py` binds to 127.0.0.1 by default and picks the next free port if 7001 is taken (it prints the port it chose). The upstream README runs `poetry run uvicorn main:app --reload --port 7001`, which works the same (uvicorn also binds to 127.0.0.1 by default).

Chromium is optional: it enables a screenshot-preview tool that lets the model look at its own generated page. Without it the app still works.

Check that it is up:

```bash
curl -s http://127.0.0.1:7001/
curl -s http://127.0.0.1:7001/api/capabilities
```

The first returns an HTML line saying the backend is running; the second returns `{"screenshot_preview":false}` until Chromium is installed.

### 4. Run the frontend

```bash
cd ../frontend
pnpm install
pnpm dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. The repository's `vite.config.ts` sets `host: true`, so a plain `pnpm dev` listens on all interfaces; the flag keeps it on loopback. By default the dev server proxies `/generate-code` and `/api` to `http://127.0.0.1:7001`. If the backend runs on another port, create `frontend/.env.local` with `VITE_WS_BACKEND_URL=ws://127.0.0.1:7002` and `VITE_HTTP_BACKEND_URL=http://127.0.0.1:7002`, then restart the dev server.

### 5. Docker alternative

```bash
printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY" > .env
docker compose up -d --build
```

The compose file builds both services, reads the root `.env`, publishes the backend on `${BACKEND_PORT:-7001}` and the frontend on 5173. It publishes on all interfaces and rebuilds are manual, so it is for running, not developing. On a shared host change the `ports` entries to `127.0.0.1:7001:7001` and `127.0.0.1:5173:5173`.

### 6. Script the backend

Generation runs over a WebSocket at `/generate-code`, not a REST call. The first message is a JSON object:

```python
import asyncio, base64, json, pathlib, websockets

async def generate(png_path: str, stack: str = "html_tailwind") -> list[str]:
    data_url = "data:image/png;base64," + base64.b64encode(pathlib.Path(png_path).read_bytes()).decode()
    request = {
        "generatedCodeConfig": stack,
        "inputMode": "image",
        "generationType": "create",
        "prompt": {"text": "", "images": [data_url], "videos": []},
        "history": [],
    }
    variants: dict[int, str] = {}
    async with websockets.connect("ws://127.0.0.1:7001/generate-code", max_size=None) as ws:
        await ws.send(json.dumps(request))
        async for raw in ws:
            msg = json.loads(raw)
            if msg["type"] == "setCode":
                variants[msg["variantIndex"]] = msg["value"]
            elif msg["type"] in ("error", "variantError"):
                raise RuntimeError(msg["value"])
    return [variants[i] for i in sorted(variants)]

pages = asyncio.run(generate("pricing-page.png", "react_tailwind"))
```

Messages the server sends include `variantCount`, `status`, `setCode`, `variantError` and `error`, each with a `variantIndex` where relevant. The socket closes when generation ends. Without any key set the server replies with an `error` message naming the missing environment variables, then closes. Install the client with `pip install websockets`. The keys come from `backend/.env`, or from the request fields `openAiApiKey`, `anthropicApiKey`, `geminiApiKey` and `replicateApiKey` that the settings dialog uses.

Other HTTP routes: `POST /api/screenshot` (capture a URL as a PNG data URL, used by the "screenshot of a website" input) and `POST /api/export`.

## Examples

### Example 1: Set up locally and confirm it runs

Request: "Run screenshot-to-code on my laptop with my Anthropic key."

```bash
git clone --depth 1 https://github.com/abi/screenshot-to-code.git
cd screenshot-to-code/backend
poetry install
```

The user writes `ANTHROPIC_API_KEY=...` (from their console.anthropic.com key page) into `backend/.env`, then:

```bash
poetry run python start.py --host 127.0.0.1 --port 7001 &
curl -s http://127.0.0.1:7001/api/capabilities
```

Result: `{"screenshot_preview":false}` (or `true` after `playwright install chromium`). Start `pnpm dev --host 127.0.0.1` in `frontend/` and open http://127.0.0.1:5173.

### Example 2: Turn a pricing-page mockup into a React component

Request: "Generate a React and Tailwind component from `pricing-page.png`."

Run the script from step 6 with `stack="react_tailwind"`, then write the first variant to disk:

```python
import pathlib
pathlib.Path("PricingPage.jsx").write_text(pages[0])
```

Result: up to four candidate files; open each in a browser, pick the closest and adjust spacing and copy by hand. This step needs a provider key, so it was checked against the source and not run.

## Guidelines

- The model call is the product: results depend on the provider and model, and each run bills your account. Start with one image and `html_tailwind` before batch use.
- Treat output as a first draft. Check semantics, accessibility, responsiveness and any copied logos or text before shipping.
- Never expose the backend to the internet as it stands: it has `allow_origins=["*"]` CORS, no authentication, and it spends your keys on every request. Keep it on 127.0.0.1 or put an authenticating proxy in front.
- `backend/.env` holds secrets; keep it out of git and out of Docker images shared with others.
- Running without any provider key only gets you the health check and the capabilities route; there is no offline generation. The README mentions Ollama only through a linked issue comment and calls the results poor, so do not promise it.
- Not for pixel-exact Figma handoff (use a Figma-based design-to-code workflow) and not for generating a whole application; it produces single pages or components.
