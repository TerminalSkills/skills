---
name: scrapy
description: >-
  Scrapy is the standard Python framework for crawling websites and extracting structured data into items, files or databases. Use it when the user asks to "write a Scrapy spider", "crawl a whole site", "follow pagination and export to JSON or CSV", "scrape with CSS selectors", "throttle or obey robots.txt", or "clean scraped items in a pipeline". Covers project scaffolding, spiders, items, pipelines, feed exports, polite-crawl settings and debugging with scrapy shell.
license: Apache-2.0
compatibility: "Python 3.10+, outbound HTTPS"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "scrapy, web-scraping, crawler, python, data-extraction"
  repository: https://github.com/scrapy/scrapy
---
# Scrapy — crawl sites and extract structured data in Python

## Overview

Scrapy is an asynchronous crawling framework. You write a spider (a class that yields requests and items), Scrapy schedules the requests, respects delays and robots.txt, and passes each item through pipelines to feed exports (JSON, JSON Lines, CSV, XML). It is the right tool for multi-page crawls with link following, retries, throttling and clean separation of fetching, parsing and post-processing. It does not execute JavaScript on its own; for script-rendered pages use a browser-based skill such as playwright, crawlee or crawl4ai instead.

The commands below were run with Scrapy 2.19 against books.toscrape.com, a site built for scraping practice.

## Instructions

### Installation

Install into a virtual environment, never the system Python:

```bash
python3 -m venv .venv
.venv/bin/pip install scrapy
.venv/bin/scrapy version
```

### Scaffold a project

```bash
scrapy startproject bookshop
cd bookshop
```

This creates `scrapy.cfg` and a `bookshop/` package with `items.py`, `middlewares.py`, `pipelines.py`, `settings.py` and `spiders/`. The generated `settings.py` already sets `ROBOTSTXT_OBEY = True`, `DOWNLOAD_DELAY = 1` and `CONCURRENT_REQUESTS_PER_DOMAIN = 1`. Keep them unless the site owner agrees otherwise.

`scrapy genspider books books.toscrape.com` writes a spider skeleton in `spiders/`. Run commands that need the project (`crawl`, `list`) from the directory containing `scrapy.cfg`.

### Explore selectors with scrapy shell

Test selectors before writing the spider. `-c` runs one expression and exits, which suits scripts and agents:

```bash
scrapy shell "https://books.toscrape.com/" -c 'response.css("article.product_pod h3 a::attr(title)").getall()[:3]'
```

Interactively, `response`, `fetch(url)` and `view(response)` are available. Use `.get()` for the first match (or `None`) and `.getall()` for a list. XPath works the same way via `response.xpath(...)`.

### Items

Declare the fields in `bookshop/items.py`:

```python
import scrapy


class BookItem(scrapy.Item):
    title = scrapy.Field()
    price_gbp = scrapy.Field()
    in_stock = scrapy.Field()
    rating = scrapy.Field()
    url = scrapy.Field()
```

Plain dicts also work as items; use `scrapy.Item` when you want typo protection on field names.

### A spider that follows pagination

`bookshop/spiders/books.py`:

```python
import scrapy

from bookshop.items import BookItem

RATINGS = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}


class BooksSpider(scrapy.Spider):
    name = "books"
    allowed_domains = ["books.toscrape.com"]
    start_urls = ["https://books.toscrape.com/catalogue/category/books/mystery_3/index.html"]

    def parse(self, response):
        for card in response.css("article.product_pod"):
            item = BookItem()
            item["title"] = card.css("h3 a::attr(title)").get()
            item["price_gbp"] = card.css("p.price_color::text").get()
            item["in_stock"] = "In stock" in "".join(card.css("p.availability::text").getall())
            item["rating"] = RATINGS.get(card.css("p.star-rating::attr(class)").get("").split()[-1])
            item["url"] = response.urljoin(card.css("h3 a::attr(href)").get())
            yield item
        yield from response.follow_all(css="li.next a", callback=self.parse)
```

`start_urls` is enough for fixed entry points. When requests need custom headers, POST bodies or computed URLs, define `async def start(self)` (Scrapy 2.13+) that yields `scrapy.Request` objects instead. To fetch a detail page per item, `yield response.follow(href, callback=self.parse_detail)` and pass data along with `cb_kwargs={"title": title}`.

### Clean data in a pipeline

`bookshop/pipelines.py`:

```python
from scrapy.exceptions import DropItem


class PriceCleanPipeline:
    def process_item(self, item):
        raw = item.get("price_gbp")
        if not raw:
            raise DropItem(f"no price on {item.get('url')}")
        item["price_gbp"] = float(raw.replace("£", "").replace("Â", ""))
        return item
```

Enable it in `settings.py`; the number orders pipelines (lower runs first):

```python
ITEM_PIPELINES = {"bookshop.pipelines.PriceCleanPipeline": 300}
```

The signature is `process_item(self, item)`; older code taking a `spider` argument is deprecated. Pipelines are also where database inserts and deduplication belong.

### Run and export

```bash
scrapy list
scrapy crawl books -O books.json
scrapy crawl books -O books.csv
```

`-O` overwrites the output file; `-o` appends, which breaks `.json` files (use `.jsonl` when appending). The format comes from the extension. For several outputs or per-feed options, set `FEEDS` in `settings.py`:

```python
FEEDS = {
    "output/books.jsonl": {"format": "jsonlines", "overwrite": True},
    "output/books.csv": {"format": "csv", "overwrite": True},
}
```

A self-contained single-file spider runs without a project: `scrapy runspider myspider.py -O out.json`.

### Polite crawling settings

Put these in `settings.py` (or pass one-off with `-s NAME=value`):

```python
ROBOTSTXT_OBEY = True
USER_AGENT = "bookshop-demo (+mailto:data-team@bookshop.invalid)"
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
DOWNLOAD_DELAY = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1
RETRY_TIMES = 2
```

For a trial run that stops early: `scrapy crawl books -O sample.json -s CLOSESPIDER_PAGECOUNT=2` (the close reason in the stats is `closespider_pagecount`). `scrapy settings --get ROBOTSTXT_OBEY` prints the effective value. Per-spider overrides go in a `custom_settings = {...}` class attribute.

## Examples

### 1. Export every mystery book with price and rating

**Request:** "Crawl the Mystery category on books.toscrape.com and give me a CSV of title, price, stock and rating."

```bash
python3 -m venv .venv && .venv/bin/pip install scrapy
.venv/bin/scrapy startproject bookshop && cd bookshop
# add items.py, spiders/books.py and pipelines.py from the sections above,
# then enable ITEM_PIPELINES in bookshop/settings.py
../.venv/bin/scrapy crawl books -O mystery.csv
```

**Result:** the log ends with `item_scraped_count: 32` and `finish_reason: finished`. `mystery.csv` starts with:

```text
title,price_gbp,in_stock,rating,url
Sharp Objects,47.82,True,4,https://books.toscrape.com/catalogue/sharp-objects_997/index.html
"In a Dark, Dark Wood",19.63,True,1,https://books.toscrape.com/catalogue/in-a-dark-dark-wood_963/index.html
```

With the default delay of one second the crawl takes under a minute.

### 2. Debug a selector that returns nothing

**Request:** "My spider yields zero items. Find out why."

```bash
scrapy shell "https://books.toscrape.com/" -c 'len(response.css("div.product"))'
scrapy shell "https://books.toscrape.com/" -c 'len(response.css("article.product_pod"))'
```

**Result:** the first prints `0` (wrong class name), the second prints `20`. Fix the selector in the spider and rerun. If a selector works in the browser but not in the shell, the page is built by JavaScript: check `scrapy fetch --nolog URL | head` to see the raw HTML Scrapy receives.

## Guidelines

- Check the site's terms and robots.txt first. Keep `ROBOTSTXT_OBEY = True`, a descriptive `USER_AGENT` with a contact address, and a delay or AutoThrottle. Do not rotate proxies or disguise the crawler to get past a block; ask the site owner for access or an API instead.
- Test on a practice site (quotes.toscrape.com, books.toscrape.com) or with `CLOSESPIDER_PAGECOUNT` before a full crawl.
- Never keep credentials in `settings.py`; read them with `os.environ`.
- Callbacks must not block (no `requests.get`, no `time.sleep`); use Scrapy requests instead.
- Duplicate URLs are filtered by default; set `dont_filter=True` on a request only when you mean to refetch.
- Scrapy does not run JavaScript. Check the raw response first; if the data is only rendered client-side, look for the JSON endpoint the page calls, or switch to a browser-based tool.
- Do not use Scrapy for a single page (requests plus an HTML parser is simpler) or for sites that actively forbid automated access.
- Output files with `-O` overwrite silently; write to a fresh path when a previous result must be kept.
