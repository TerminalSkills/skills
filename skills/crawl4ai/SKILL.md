---
name: crawl4ai
description: >-
  Crawl4AI is an open-source Python web crawler that turns web pages into clean
  markdown and structured data for LLMs. Use it when asked to scrape a site for
  a RAG pipeline, convert pages to markdown, render JavaScript pages, extract
  JSON with CSS selectors or an LLM, or crawl many pages or a whole site with
  sessions and deep crawling.
license: Apache-2.0
compatibility: Python 3.10+, Playwright browsers (installed by crawl4ai-setup)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/unclecode/crawl4ai
  tags:
    - web-scraping
    - crawling
    - markdown
    - rag
    - python
---

# Crawl4AI — LLM-Friendly Web Crawler

## Overview

Crawl4AI (checked against 0.9.5, October 2026) drives a Playwright browser, so it renders JavaScript, and returns markdown, cleaned HTML, links, media and metadata. Extraction can be CSS/XPath based (no LLM, deterministic) or LLM based (any LiteLLM provider string). All examples are async.

## Instructions

### Installation

```bash
pip install crawl4ai
crawl4ai-setup        # installs the Playwright browser; run `crawl4ai-doctor` to check
```

`crawl4ai-setup` may need root to install system libraries on Linux; if it cannot, run `playwright install-deps` yourself. A quick CLI check: `crwl crawl https://docs.python.org/3/ -o markdown`.

### Basic Crawling

```python
import asyncio
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

async def main():
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url="https://docs.python.org/3/tutorial/index.html",
            config=CrawlerRunConfig(
                word_count_threshold=10,       # skip blocks with fewer than 10 words
                cache_mode=CacheMode.BYPASS,   # always fetch fresh; ENABLED reuses the local cache
            ),
        )
        if not result.success:
            raise RuntimeError(result.error_message)

        print(result.markdown)                 # str-like MarkdownGenerationResult
        print(result.markdown.raw_markdown)    # full markdown
        print(result.cleaned_html)
        print(result.media["images"])
        print(result.links["internal"], result.links["external"])
        print(result.metadata)                 # title, description, ...

asyncio.run(main())
```

`arun` does not raise on HTTP or navigation failures: check `result.success`.

### Fit markdown (drop boilerplate)

```python
from crawl4ai import CrawlerRunConfig, DefaultMarkdownGenerator, PruningContentFilter

config = CrawlerRunConfig(
    markdown_generator=DefaultMarkdownGenerator(
        content_filter=PruningContentFilter(threshold=0.48, threshold_type="fixed"),
    ),
)
# after arun: result.markdown.fit_markdown holds the filtered text
```

### LLM-Powered Structured Extraction

```python
import asyncio, json, os
from pydantic import BaseModel
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, LLMConfig, LLMExtractionStrategy

class Product(BaseModel):
    name: str
    price: float
    rating: float | None
    features: list[str]

extraction = LLMExtractionStrategy(
    llm_config=LLMConfig(provider="openai/gpt-4o-mini", api_token=os.environ["OPENAI_API_KEY"]),
    schema=Product.model_json_schema(),
    extraction_type="schema",
    instruction="Extract every product on the page.",
)

async def main():
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url="https://www.keychron.com/collections/all-keyboards",
            config=CrawlerRunConfig(extraction_strategy=extraction),
        )
        for p in json.loads(result.extracted_content):
            print(p["name"], p["price"])

asyncio.run(main())
```

The old `provider=` / `api_token=` arguments directly on the strategy still exist but `LLMConfig` is the current form. Use `provider="ollama/llama3.3"` for a local model (no token).

### CSS-Based Extraction (No LLM)

```python
import asyncio, json
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, JsonCssExtractionStrategy

schema = {
    "name": "Product listings",
    "baseSelector": ".product-card",       # repeating element
    "fields": [
        {"name": "title", "selector": "h3.product-title", "type": "text"},
        {"name": "price", "selector": ".price", "type": "text"},
        {"name": "url", "selector": "a", "type": "attribute", "attribute": "href"},
    ],
}

async def main():
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url="https://shop.example-store.dev/all",
            config=CrawlerRunConfig(
                extraction_strategy=JsonCssExtractionStrategy(schema),
                js_code="window.scrollTo(0, document.body.scrollHeight);",
                wait_for="css:.product-card:nth-child(20)",
            ),
        )
        print(json.loads(result.extracted_content))

asyncio.run(main())
```

Verified offline: `JsonCssExtractionStrategy(schema).extract(url, html)` returns `[{'title': 'Keychron K2', 'url': '/k2'}]` for a matching card. `JsonCssExtractionStrategy.generate_schema(html, query=...)` can have an LLM draft the schema once; then reuse it with no LLM cost. `wait_for` takes `css:<selector>` or `js:<expression>`.

### Many pages, sessions and deep crawls

```python
import asyncio, json, os
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, BFSDeepCrawlStrategy

async def main():
    async with AsyncWebCrawler() as crawler:
        # Several known URLs in parallel
        results = await crawler.arun_many(
            urls=["https://docs.python.org/3/library/asyncio.html",
                  "https://docs.python.org/3/library/json.html"],
            config=CrawlerRunConfig(),
        )

        # Follow links breadth-first from a start page
        deep = CrawlerRunConfig(
            deep_crawl_strategy=BFSDeepCrawlStrategy(max_depth=2, include_external=False, max_pages=50),
        )
        pages = await crawler.arun(url="https://docs.python.org/3/tutorial/", config=deep)
        for page in pages:                      # a list when a deep crawl strategy is set
            print(page.url, len(page.markdown.raw_markdown))

        # Session: keeps cookies and page state across calls
        login = CrawlerRunConfig(
            session_id="portal",
            js_code=f"""
                document.querySelector('#email').value = {json.dumps(os.environ["PORTAL_USER"])};
                document.querySelector('#password').value = {json.dumps(os.environ["PORTAL_PASSWORD"])};
                document.querySelector('form').submit();
            """,
            wait_for="css:#dashboard",
        )
        await crawler.arun(url="https://portal.northwind-tools.dev/login", config=login)
        report = await crawler.arun(
            url="https://portal.northwind-tools.dev/reports",
            config=CrawlerRunConfig(session_id="portal"),
        )

asyncio.run(main())
```

## Examples

### Example 1 — "Turn the Python tutorial into markdown files for my RAG index"

Run the deep-crawl block above with `max_depth=2`, then write each page's `markdown.raw_markdown` to a file named after the URL path (`fit_markdown` is only filled when the config sets a `markdown_generator` with a content filter, as in the fit-markdown section). Result: a few dozen `.md` files with navigation and footers stripped, ready for chunking.

### Example 2 — "Get prices from a store without paying for an LLM"

Open the page in a browser, find the repeating card selector, write the `JsonCssExtractionStrategy` schema, run it with `wait_for` so lazy items render, and `json.loads(result.extracted_content)` to get a list of `{title, price, url}` dicts. Once a layout changes, regenerate the schema with `generate_schema`.

## Guidelines

- Use `result.markdown` (or `fit_markdown`) as LLM/RAG input; always check `result.success`.
- Prefer CSS extraction for structured pages; use LLM extraction only for messy ones, and expect token costs per chunk.
- Keep API keys and logins in environment variables, never in code or `js_code` literals.
- `CacheMode.ENABLED` is useful while developing; use `BYPASS` for fresh data.
- Respect the site: set `check_robots_txt=True` in `CrawlerRunConfig`, limit `max_pages`, and use delays or `semaphore_count` when crawling many pages.
- Crawl only pages you are allowed to; a login session is for your own account.
- Not suited to sites that block automation behind strict anti-bot walls; use their official API instead.
