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
  category: ai-tools
  tags: [headless-browser, scraping, automation, ai-agents, lightpanda, web]
  use-cases:
    - "Build a web scraper that's 10x faster than Puppeteer for AI pipelines"
    - "Run headless browsing for AI agents with minimal resource usage"
    - "Automate web interactions for data extraction at scale"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Lightpanda Browser

## Overview

Lightpanda is a headless browser built from scratch for AI and automation workloads. Unlike Chrome/Chromium-based tools (Puppeteer, Playwright), it skips rendering and focuses on DOM manipulation and network — making it 10-50x faster and using 10x less memory. It speaks the Chrome DevTools Protocol (CDP), so existing tools work with it.

## Why Lightpanda vs Puppeteer/Playwright

| Feature | Lightpanda | Puppeteer/Playwright |
|---------|-----------|---------------------|
| **Startup time** | ~5ms | ~500ms |
| **Memory per page** | ~2MB | ~50-100MB |
| **Pages per GB RAM** | ~500 | ~10-20 |
| **JavaScript engine** | Zig-based, subset | Full V8/SpiderMonkey |
| **CSS rendering** | None (DOM only) | Full rendering |
| **Protocol** | CDP compatible | CDP / native |
| **Best for** | Scraping, data extraction | Visual testing, screenshots |

**Trade-off:** Lightpanda doesn't render CSS or produce screenshots. It's purpose-built for reading/extracting data, not visual testing.

## Installation

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

## Instructions

When a user asks to build a web scraper, automate browsing for AI, or needs lightweight headless browsing:

1. **Install Lightpanda** — Binary or Docker
2. **Start the CDP server** — `lightpanda --host 127.0.0.1 --port 9222`
3. **Connect with existing tools** — Puppeteer, Playwright, or raw CDP
4. **Build scraping logic** — Navigate, extract, repeat

## Quick Start

### Start the server

```bash
# Start Lightpanda CDP server
lightpanda --host 127.0.0.1 --port 9222
```

### Connect with Puppeteer

```typescript
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserWSEndpoint: "ws://127.0.0.1:9222",
});

const page = await browser.newPage();
await page.goto("https://news.ycombinator.com");

// Extract all story titles and links
const stories = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".titleline > a")).map((a) => ({
    title: a.textContent,
    url: a.getAttribute("href"),
  }));
});

console.log(stories);
await browser.close();
```

### Connect with Playwright

```typescript
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();

await page.goto("https://example.com");
const content = await page.content();
await browser.close();
```

## AI Scraping Pipeline

```python
"""Scrape → Extract → Summarize pipeline for AI agents."""
import asyncio
import json
from playwright.async_api import async_playwright
from openai import OpenAI

client = OpenAI()

async def scrape_page(url: str) -> dict:
    """Scrape a page using Lightpanda and extract structured data with AI."""
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        context = browser.contexts[0]
        page = await context.new_page()

        await page.goto(url, wait_until="domcontentloaded")

        # Get clean text content
        text = await page.evaluate("""
            () => {
                // Remove scripts, styles, nav, footer
                const remove = document.querySelectorAll('script, style, nav, footer, header');
                remove.forEach(el => el.remove());
                return document.body.innerText;
            }
        """)

        await page.close()

    # AI extraction
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[{
            "role": "system",
            "content": "Extract structured data from this webpage text. Return JSON with: title, main_content (summary), key_points (list), entities (people/orgs/products mentioned).",
        }, {
            "role": "user",
            "content": text[:8000],
        }],
    )
    return json.loads(response.choices[0].message.content)


async def batch_scrape(urls: list[str], concurrency: int = 10) -> list[dict]:
    """Scrape multiple URLs concurrently."""
    semaphore = asyncio.Semaphore(concurrency)

    async def limited_scrape(url: str) -> dict:
        async with semaphore:
            try:
                return await scrape_page(url)
            except Exception as e:
                return {"url": url, "error": str(e)}

    return await asyncio.gather(*[limited_scrape(url) for url in urls])
```

## Raw CDP (No Dependencies)

```python
"""Direct CDP connection — zero dependencies beyond websockets."""
import json
import asyncio
import websockets

async def scrape_with_cdp(url: str) -> str:
    """Connect to Lightpanda via raw CDP WebSocket."""

    # Get WebSocket URL from CDP endpoint
    import httpx
    resp = httpx.get("http://127.0.0.1:9222/json/version")
    ws_url = resp.json()["webSocketDebuggerUrl"]

    async with websockets.connect(ws_url) as ws:
        msg_id = 0

        async def send(method: str, params: dict = {}) -> dict:
            nonlocal msg_id
            msg_id += 1
            await ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == msg_id:
                    return resp

        # Navigate
        await send("Page.navigate", {"url": url})
        await asyncio.sleep(2)  # Wait for load

        # Get DOM
        result = await send("Runtime.evaluate", {
            "expression": "document.body.innerText",
            "returnByValue": True,
        })

        return result["result"]["result"]["value"]
```

## Docker Compose for Production

```yaml
version: "3.8"
services:
  lightpanda:
    image: nichochar/lightpanda:latest
    ports:
      - "9222:9222"
    deploy:
      resources:
        limits:
          memory: 256M    # Lightpanda is very memory-efficient
          cpus: "0.5"
    restart: unless-stopped

  scraper:
    build: ./scraper
    depends_on:
      - lightpanda
    environment:
      - CDP_URL=ws://lightpanda:9222
      - OPENAI_API_KEY=${OPENAI_API_KEY}
```

## Performance Tips

1. **Reuse browser connections** — Don't connect/disconnect per page. Open new pages on the same connection
2. **Skip waiting for network idle** — Use `domcontentloaded` instead of `networkidle`. Lightpanda is DOM-focused
3. **Concurrent pages** — Lightpanda handles 50+ concurrent pages easily. Use asyncio semaphores to control concurrency
4. **Minimal JavaScript** — Lightpanda's JS engine is a subset. Keep `evaluate()` calls simple — DOM queries, no complex frameworks
5. **Connection pooling** — For high-throughput, run multiple Lightpanda instances behind a load balancer

## Limitations

- **No screenshots** — Lightpanda doesn't render visually. Use Playwright with Chromium for screenshot needs
- **Limited JavaScript** — Complex SPAs with heavy JS may not fully work. Best for server-rendered or simple pages
- **No WebGL/Canvas** — No support for graphical content
- **CDP subset** — Not all CDP commands are implemented yet. Stick to Page, Runtime, DOM, and Network domains

## When to Use What

| Use Case | Recommended Tool |
|----------|-----------------|
| Data extraction / scraping | **Lightpanda** ✅ |
| AI agent web browsing | **Lightpanda** ✅ |
| Visual testing / screenshots | Playwright + Chromium |
| SPA interaction | Playwright + Chromium |
| Resource-constrained environments | **Lightpanda** ✅ |
| E2E testing with visual verification | Playwright + Chromium |

## Dependencies

```bash
pip install playwright websockets httpx openai   # Python
npm install puppeteer-core playwright            # Node.js
```
