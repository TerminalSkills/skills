---
name: markdown-new
category: web-scraping
version: 1.0.0
description: Convert any public URL into clean, LLM-ready Markdown using the markdown.new service. Use for content extraction, RAG ingestion, article summarization, research, archiving, and token-efficient web reading.
author: terminal-skills
tags: [markdown, web-scraping, content-extraction, url-to-markdown, rag, research]
---

# markdown-new

Convert public web pages into clean Markdown via [markdown.new](https://markdown.new) — a free hosted service that strips navigation, ads, and boilerplate, returning only the readable content.

## When to Use

- Extracting article text for summarization or analysis
- Building RAG pipelines that ingest web content
- Archiving pages in a readable format
- Reducing token usage compared to raw HTML or full browser snapshots
- Research workflows where you need clean text from multiple URLs

## API

### Prefix Mode (simplest)

Prepend `https://markdown.new/` to any URL:

```bash
# Basic conversion
curl -s 'https://markdown.new/https://example.com/article'

# With options
curl -s 'https://markdown.new/https://example.com?method=browser&retain_images=true'
```

### POST Mode (recommended for automation)

```bash
curl -s -X POST https://markdown.new/ \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/article",
    "method": "auto",
    "retain_images": false
  }'
```

### Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `method` | `auto`, `ai`, `browser` | `auto` | Conversion pipeline |
| `retain_images` | `true`, `false` | `false` | Keep image links in output |

### Method Selection

- **`auto`** — fastest; lets the service pick the best pipeline. Use first.
- **`ai`** — forces Workers AI HTML-to-Markdown conversion. Good for well-structured HTML.
- **`browser`** — headless browser rendering. Use for JavaScript-heavy SPAs and pages where `auto` misses content.

**Strategy:** Always try `auto` first. Fall back to `browser` only when output is incomplete or empty.

### Response Headers

The service returns useful metadata in response headers:

- `x-markdown-tokens` — estimated token count of the output
- `x-rate-limit-remaining` — requests remaining in current window

## Usage Patterns

### Single Page Extraction

```python
"""fetch_article.py — Extract a single article as Markdown."""
import requests

def fetch_markdown(url: str, method: str = "auto") -> str:
    """Convert a URL to clean Markdown.

    Args:
        url: Public HTTP/HTTPS URL to convert.
        method: Conversion method — "auto", "ai", or "browser".

    Returns:
        Markdown string of the page content.
    """
    resp = requests.post(
        "https://markdown.new/",
        json={"url": url, "method": method, "retain_images": False},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text

# Extract an article
content = fetch_markdown("https://example.com/blog/post-title")
print(f"Extracted {len(content)} chars")
```

### Batch Extraction with Rate Limiting

```python
"""batch_extract.py — Extract multiple URLs with rate limiting."""
import time
import requests

def batch_extract(urls: list[str], delay: float = 0.5) -> dict[str, str]:
    """Extract Markdown from multiple URLs with rate limiting.

    Args:
        urls: List of public URLs to convert.
        delay: Seconds to wait between requests to respect rate limits.

    Returns:
        Dict mapping URL to extracted Markdown content.
    """
    results = {}
    for url in urls:
        try:
            resp = requests.post(
                "https://markdown.new/",
                json={"url": url, "method": "auto"},
                timeout=30,
            )
            if resp.status_code == 429:  # Rate limited
                print(f"Rate limited, waiting 60s...")
                time.sleep(60)
                resp = requests.post(
                    "https://markdown.new/",
                    json={"url": url, "method": "auto"},
                    timeout=30,
                )
            resp.raise_for_status()
            results[url] = resp.text
        except Exception as e:
            print(f"Failed {url}: {e}")
            results[url] = ""
        time.sleep(delay)  # Respect rate limits
    return results
```

### Shell One-Liner

```bash
# Quick article extraction — pipe to file or another tool
curl -s 'https://markdown.new/https://example.com/article' > article.md

# Extract and count tokens (rough estimate: words / 0.75)
curl -s 'https://markdown.new/https://example.com/article' | wc -w
```

### Node.js

```javascript
// fetch-markdown.js — URL to Markdown in Node.js
async function fetchMarkdown(url, method = 'auto') {
  const resp = await fetch('https://markdown.new/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, retain_images: false }),
  });

  if (resp.status === 429) {
    throw new Error('Rate limited — wait and retry');
  }

  if (!resp.ok) {
    throw new Error(`Conversion failed: ${resp.status}`);
  }

  return resp.text();
}
```

## Limits and Best Practices

- **Rate limit:** ~500 requests/day per IP. Monitor `x-rate-limit-remaining` header.
- **429 responses** mean you've hit the limit — back off and retry after a delay.
- **Public URLs only** — the service cannot access authenticated or private pages.
- **Respect robots.txt** and copyright when extracting content.
- **Verify critical extractions** — output is not guaranteed complete for every page.
- **Use `auto` first**, fall back to `browser` for JS-heavy pages.
- **Disable `retain_images`** when you only need text — reduces output size.

## Combining with Other Tools

- Pair with **whisper** for multimedia research (audio transcription + article extraction)
- Feed output into **langchain** or **langgraph** for RAG pipelines
- Use with **elasticsearch** to build a searchable content index
- Combine with **sox** / **yt-dlp** for multi-format content ingestion
