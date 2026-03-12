---
name: crawl4ai
category: AI & Machine Learning
tags: [web-scraping, crawling, llm, markdown, extraction, ai, python]
version: 1.0.0
author: terminal-skills
---

# Crawl4AI — LLM-Friendly Web Crawler

You are an expert in Crawl4AI, the open-source web crawler built for AI applications. You help developers extract clean, structured data from websites for LLM training, RAG pipelines, and content analysis — with automatic markdown conversion, JavaScript rendering, CSS-based extraction, LLM-powered structured extraction, and session management for multi-page crawling.

## Core Capabilities

### Basic Crawling

```python
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

async with AsyncWebCrawler() as crawler:
    result = await crawler.arun(
        url="https://docs.example.com/getting-started",
        config=CrawlerRunConfig(
            word_count_threshold=10,       # Skip blocks with <10 words
            cache_mode=CacheMode.ENABLED,
        ),
    )

    print(result.markdown)                 # Clean markdown (LLM-ready)
    print(result.cleaned_html)             # Cleaned HTML
    print(result.media["images"])          # Extracted images
    print(result.links["internal"])        # Internal links
    print(result.links["external"])        # External links
    print(result.metadata)                 # Title, description, keywords
```

### LLM-Powered Structured Extraction

```python
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.extraction_strategy import LLMExtractionStrategy
from pydantic import BaseModel

class Product(BaseModel):
    name: str
    price: float
    description: str
    rating: float | None
    features: list[str]

extraction = LLMExtractionStrategy(
    provider="openai/gpt-4o-mini",
    api_token=os.environ["OPENAI_API_KEY"],
    schema=Product.model_json_schema(),
    instruction="Extract all products from this page",
)

async with AsyncWebCrawler() as crawler:
    result = await crawler.arun(
        url="https://shop.example.com/keyboards",
        config=CrawlerRunConfig(extraction_strategy=extraction),
    )

    products = [Product(**p) for p in json.loads(result.extracted_content)]
    for p in products:
        print(f"{p.name}: ${p.price} — {p.rating}★")
```

### CSS-Based Extraction (No LLM)

```python
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

schema = {
    "name": "Product listings",
    "baseSelector": ".product-card",       # Repeating element
    "fields": [
        {"name": "title", "selector": "h3.product-title", "type": "text"},
        {"name": "price", "selector": ".price", "type": "text"},
        {"name": "url", "selector": "a", "type": "attribute", "attribute": "href"},
        {"name": "image", "selector": "img", "type": "attribute", "attribute": "src"},
    ],
}

extraction = JsonCssExtractionStrategy(schema)

async with AsyncWebCrawler() as crawler:
    result = await crawler.arun(
        url="https://shop.example.com/all",
        config=CrawlerRunConfig(
            extraction_strategy=extraction,
            js_code="window.scrollTo(0, document.body.scrollHeight);",  # Scroll to load more
            wait_for=".product-card:nth-child(20)",                     # Wait for 20 items
        ),
    )
    products = json.loads(result.extracted_content)
```

### Multi-Page Crawling

```python
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

async with AsyncWebCrawler() as crawler:
    # Session-based: maintains cookies, auth state
    session_id = "docs-crawl"

    # Login first
    await crawler.arun(
        url="https://docs.example.com/login",
        config=CrawlerRunConfig(
            session_id=session_id,
            js_code="""
                document.querySelector('#email').value = 'user@example.com';
                document.querySelector('#password').value = 'pass';
                document.querySelector('form').submit();
            """,
            wait_for="#dashboard",
        ),
    )

    # Crawl authenticated pages
    urls = ["https://docs.example.com/api", "https://docs.example.com/guides"]
    for url in urls:
        result = await crawler.arun(
            url=url,
            config=CrawlerRunConfig(session_id=session_id),
        )
        # Save markdown for RAG indexing
        save_to_knowledge_base(url, result.markdown)
```

## Installation

```bash
pip install crawl4ai
crawl4ai-setup                             # Install Playwright browsers
```

## Best Practices

1. **Markdown output** — Use `result.markdown` for LLM/RAG input; clean, structured, no HTML noise
2. **CSS extraction** — Use `JsonCssExtractionStrategy` for structured pages; no LLM cost, fast, deterministic
3. **LLM extraction** — Use `LLMExtractionStrategy` for unstructured pages; Pydantic schema ensures valid output
4. **JavaScript rendering** — Crawl4AI uses Playwright; handles SPAs, infinite scroll, dynamic content
5. **Sessions** — Use `session_id` for multi-page crawls; maintains cookies, auth state across requests
6. **Caching** — Enable `CacheMode.ENABLED` for development; avoid re-crawling the same pages
7. **Wait conditions** — Use `wait_for` CSS selectors to ensure content is loaded before extraction
8. **Rate limiting** — Add delays between requests; respect robots.txt; be a good citizen
