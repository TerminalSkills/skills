---
name: lightpanda-browser
description: >-
  Lightpanda is a headless browser written in Zig for AI agents and scraping: no rendering, a V8 JavaScript engine, a CDP server for Puppeteer and Playwright, a fetch command that dumps pages as Markdown, and a built-in MCP server. Use when building AI web scrapers, giving an agent a lightweight browser, or running headless browsing where Chrome is too heavy.
license: AGPL-3.0
compatibility: "Linux (glibc) and macOS binaries, Docker image, Windows via WSL2; any language via CDP"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: [headless-browser, scraping, automation, ai-agents, lightpanda]
  repository: https://github.com/lightpanda-io/browser
  use-cases:
    - "Build a web scraper that uses far less memory than headless Chrome"
    - "Give an AI agent a lightweight browser through MCP"
    - "Dump web pages as Markdown for an LLM pipeline"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Lightpanda Browser

## Overview

Lightpanda is a browser built from scratch for automation, not a Chromium fork. It runs JavaScript (V8), loads pages over libcurl, builds a DOM, and speaks the Chrome DevTools Protocol (CDP) and WebDriver BiDi, so Puppeteer and Playwright can connect to it. It does not lay out or paint pages. The project reports about 16x less memory and 9x faster execution than headless Chrome on a 100-page crawl; treat that as a vendor benchmark and measure your own sites.

Version 1.0.0 (2 October 2026) has five subcommands: `fetch` (load URLs and dump them), `serve` (CDP/BiDi server), `mcp` (MCP server over stdio or HTTP), `agent` (an LLM-driven browsing REPL) and `run` (replay a saved script, no LLM). Older guides use a bare `lightpanda --host ... --port ...`; use `serve` instead.

## Instructions

### Install

Packages first, then a checksum-verified binary:

```bash
brew install lightpanda-io/browser/lightpanda        # macOS / Linux, tracks the nightly build
```

Release assets are listed with their SHA-256 on the GitHub release page. Verify before running:

```bash
curl -L -o lightpanda https://github.com/lightpanda-io/browser/releases/download/1.0.0/lightpanda-x86_64-linux
echo "aa5a4b8ed53d1e38b3c73f5b2647d0a84a82e6744557f45f9a9c85858aa031c3  lightpanda" | sha256sum -c
chmod +x lightpanda && ./lightpanda version
```

Other assets: `lightpanda-aarch64-linux`, `lightpanda-aarch64-macos`, `lightpanda-x86_64-macos`, and `.deb` packages. Linux binaries need glibc (they fail on Alpine with "required file not found"); there is no native Windows or Android build. Docker: `docker run -d --name lightpanda -p 127.0.0.1:9222:9222 lightpanda/browser:nightly`.

Telemetry is on by default; set `LIGHTPANDA_DISABLE_TELEMETRY=true` to turn it off.

### Fetch a page without any client library

```bash
lightpanda fetch --dump markdown --strip-mode js https://news.ycombinator.com
```

`--dump` takes `html`, `markdown`, `pdf`, `png` (text-only rendering), `semantic_tree` or `semantic_tree_text`. Useful companions: `--dump-selector "main"`, `--strip-mode clutter|shell|css|js|invisible`, `--dump-max-bytes 60000`, `--fail-on-http-error`, `--json`, `--obey-robots`, `--cookie`, and the `--wait-until`, `--wait-ms`, `--wait-selector`, `--wait-script` flags for pages that finish rendering late.

### Serve CDP for Puppeteer or Playwright

```bash
lightpanda serve --host 127.0.0.1 --port 9222 --obey-robots
```

Check it with `curl http://127.0.0.1:9222/json/version`. Add `--protocol webdriver` for BiDi (repeat `--protocol` to serve both). Keep the host on 127.0.0.1: the endpoint has no authentication.

### MCP server for agents

```json
{ "mcpServers": { "lightpanda": { "command": "/usr/local/bin/lightpanda", "args": ["mcp"] } } }
```

`lightpanda mcp --port 9223` serves MCP over HTTP at `/mcp`; each client gets its own session through the `Mcp-Session-Id` header.

### Agent mode and scripts

`lightpanda agent --task "top story on news.ycombinator.com?"` drives the browser from plain English. It detects the provider from environment variables (Anthropic, OpenAI, Gemini, Vertex, Mistral, Hugging Face, OpenRouter, Vercel AI Gateway, Ollama, llama.cpp); `--no-llm` gives a REPL. `/save` (or `--save out.js`) writes a PandaScript, a JavaScript file you replay with `lightpanda run out.js` with no model calls.

## Examples

### Example 1: Turn a docs page into Markdown for an LLM

Request: "Get the pricing section of that page as Markdown, small enough for a prompt."

```bash
lightpanda fetch --dump markdown --dump-selector "main" --strip-mode clutter \
  --dump-max-bytes 40000 https://demo-browser.lightpanda.io/campfire-commerce/ > page.md
```

Result: `page.md` holds the main content as Markdown, cut at 40 kB with a `[truncated]` marker if longer.

### Example 2: Scrape links with Puppeteer

Request: "List every link on the demo shop page using Puppeteer."

```bash
lightpanda serve --port 9222 &
```

```typescript
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserWSEndpoint: "ws://127.0.0.1:9222" });
const context = await browser.createBrowserContext();
const page = await context.newPage();
await page.goto("https://demo-browser.lightpanda.io/amiibo/", { waitUntil: "networkidle0" });
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href")),
);
console.log(links);
await page.close();
await context.close();
await browser.disconnect();
```

Result: an array of href strings. Stop the server by its PID when finished.

### Example 3: Playwright over CDP

```python
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto("https://demo-browser.lightpanda.io/campfire-commerce/")
        print(await page.title())
        await browser.close()

asyncio.run(main())
```

Result: the page title is printed. If a Playwright call is not implemented, fall back to `page.evaluate`.

## Guidelines

- Prefer `fetch --dump markdown` when you only need page text; start `serve` only when you need clicks, forms or a client library.
- Reuse one browser connection and open a context per task instead of reconnecting per page.
- No screenshots in the Chrome sense: `png` and `pdf` dumps are text-only renderings. Use Chromium for visual testing.
- Web API coverage is still partial (see the Web Platform Tests dashboard linked from the README). If a heavy single-page app breaks, test the same flow in Chromium before blaming your code.
- Respect `robots.txt` with `--obey-robots`, rate-limit requests, and never scrape pages behind logins you do not own.
- `agent` scripts and `.js` files run arbitrary JavaScript in pages; run only scripts you trust. LLM API keys come from environment variables such as `ANTHROPIC_API_KEY`.
- The licence is AGPL-3.0: check it before embedding the binary in a distributed product.
