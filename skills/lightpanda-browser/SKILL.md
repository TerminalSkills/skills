---
name: lightpanda-browser
description: >-
  Use Lightpanda headless browser optimized for AI agents — fast, lightweight, designed for
  web scraping and automation at scale. Use when: building AI web scrapers, automating web
  tasks with agents, running headless browsing in resource-constrained environments.
license: AGPL-3.0
compatibility: "Linux/macOS, any language via CDP"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: [headless-browser, scraping, automation, ai-agents, lightpanda]
  use-cases:
    - "Build a web scraper that's 10x faster than Puppeteer for AI pipelines"
    - "Run headless browsing for AI agents with minimal resource usage"
    - "Automate web interactions for data extraction at scale"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Lightpanda Browser

## Overview

Lightpanda is a headless browser built from scratch for AI and automation workloads. Unlike Chrome/Chromium-based tools (Puppeteer, Playwright), it skips rendering and focuses on DOM manipulation and network — making it 10-50x faster and using 10x less memory. It speaks the Chrome DevTools Protocol (CDP), so existing tools work with it.

| Feature | Lightpanda | Puppeteer/Playwright |
|---------|-----------|---------------------|
| **Startup time** | ~5ms | ~500ms |
| **Memory per page** | ~2MB | ~50-100MB |
| **Pages per GB RAM** | ~500 | ~10-20 |
| **JavaScript engine** | Zig-based, subset | Full V8/SpiderMonkey |
| **CSS rendering** | None (DOM only) | Full rendering |
| **Best for** | Scraping, data extraction | Visual testing, screenshots |

**Trade-off:** Lightpanda doesn't render CSS or produce screenshots. It's purpose-built for reading/extracting data, not visual testing.

## Instructions

When a user asks to build a web scraper, automate browsing for AI, or needs lightweight headless browsing:

1. **Install Lightpanda** — Binary or Docker
2. **Start the CDP server** — `lightpanda --host 127.0.0.1 --port 9222`
3. **Connect with existing tools** — Puppeteer, Playwright, or raw CDP
4. **Build scraping logic** — Navigate, extract, repeat

### Installation

```bash
# Linux (x86_64)
curl -LO https://github.com/nichochar/lightpanda/releases/latest/download/lightpanda-x86_64-linux
chmod +x lightpanda-x86_64-linux
sudo mv lightpanda-x86_64-linux /usr/local/bin/lightpanda

# macOS (Apple Silicon)
curl -LO https://github.com/nichochar/lightpanda/releases/latest/download/lightpanda-aarch64-macos
chmod +x lightpanda-aarch64-macos
sudo mv lightpanda-aarch64-macos /usr/local/bin/lightpanda

# Docker
docker pull nichochar/lightpanda:latest
docker run -p 9222:9222 nichochar/lightpanda:latest
```

### Start the server

```bash
lightpanda --host 127.0.0.1 --port 9222
```

## Examples

### Example 1: Scrape Hacker News with Puppeteer

```typescript
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserWSEndpoint: "ws://127.0.0.1:9222" });
const page = await browser.newPage();
await page.goto("https://news.ycombinator.com");

const stories = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".titleline > a")).map((a) => ({
    title: a.textContent,
    url: a.getAttribute("href"),
  }));
});

console.log(stories); // [{title: "Show HN: ...", url: "https://..."}, ...]
await browser.close();
```

### Example 2: AI Scraping Pipeline with Playwright

```python
"""Scrape a page and extract structured data with AI."""
import asyncio
import json
from playwright.async_api import async_playwright
from openai import OpenAI

client = OpenAI()

async def scrape_page(url: str) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        context = browser.contexts[0]
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded")

        text = await page.evaluate("""() => {
            document.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
            return document.body.innerText;
        }""")
        await page.close()

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "Extract structured data from this webpage. Return JSON with: title, main_content, key_points, entities."},
            {"role": "user", "content": text[:8000]},
        ],
    )
    return json.loads(response.choices[0].message.content)

# Usage
result = asyncio.run(scrape_page("https://openai.com/blog"))
print(result)  # {"title": "OpenAI Blog", "main_content": "...", "key_points": [...], "entities": [...]}
```

### Example 3: Raw CDP with Zero Dependencies

```python
"""Direct CDP connection — zero dependencies beyond websockets."""
import json, asyncio, websockets, httpx

async def scrape_with_cdp(url: str) -> str:
    resp = httpx.get("http://127.0.0.1:9222/json/version")
    ws_url = resp.json()["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url) as ws:
        msg_id = 0
        async def send(method: str, params: dict = {}) -> dict:
            nonlocal msg_id; msg_id += 1
            await ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == msg_id: return resp

        await send("Page.navigate", {"url": url})
        await asyncio.sleep(2)
        result = await send("Runtime.evaluate", {"expression": "document.body.innerText", "returnByValue": True})
        return result["result"]["result"]["value"]
```

## Guidelines

1. **Reuse browser connections** — Don't connect/disconnect per page. Open new pages on the same connection
2. **Skip waiting for network idle** — Use `domcontentloaded` instead of `networkidle`. Lightpanda is DOM-focused
3. **Concurrent pages** — Lightpanda handles 50+ concurrent pages easily. Use asyncio semaphores to control concurrency
4. **Minimal JavaScript** — Lightpanda's JS engine is a subset. Keep `evaluate()` calls simple — DOM queries, no complex frameworks
5. **No screenshots** — Lightpanda doesn't render visually. Use Playwright with Chromium for screenshot needs
6. **Limited JavaScript** — Complex SPAs with heavy JS may not fully work. Best for server-rendered or simple pages
7. **CDP subset** — Not all CDP commands are implemented yet. Stick to Page, Runtime, DOM, and Network domains
