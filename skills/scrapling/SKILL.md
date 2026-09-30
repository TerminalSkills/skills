---
name: scrapling
description: >-
  Fetches web pages and extracts structured data from them with Python, from a
  single HTTP request to a full crawl, including pages rendered by JavaScript
  and selectors that keep working after a site redesign. Use when a user asks
  to scrape a website, build a crawler or spider, extract product or listing
  data, follow pagination, scrape a JavaScript-rendered page, save a page as
  Markdown, or mentions Scrapling, "scrape this URL", or "my scraper keeps
  breaking".
license: Apache-2.0
compatibility: "Python 3.10+; browser-based fetchers need the Chromium build that `scrapling install` downloads"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["web-scraping", "crawler", "python", "browser-automation", "data-extraction"]
  repository: https://github.com/D4Vinci/Scrapling
---
# Scrapling — Adaptive web scraping and crawling

## Overview

Scrapling is a Python scraping framework with three layers: fetchers that download pages (plain HTTP or a real browser), a fast parser with CSS, XPath and text search, and a spider engine for concurrent crawls with pause and resume. Its parser can store the fingerprint of an element and find it again after the page structure changes.

## Instructions

### Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install "scrapling[fetchers]"
scrapling install
```

`pip install scrapling` alone installs only the parser; importing `scrapling.fetchers` or `scrapling.spiders` then raises `ModuleNotFoundError`. `scrapling install` downloads the browsers and their system dependencies; add `--force` to reinstall.

| Extra | Adds |
|---|---|
| `fetchers` | HTTP and browser fetchers, spiders |
| `shell` | `scrapling extract` commands and the interactive shell |
| `ai` | MCP server (`scrapling mcp`) |
| `all` | Everything above |

A Docker image with all extras and browsers is published as `pyd4vinci/scrapling` and `ghcr.io/d4vinci/scrapling:latest`.

### Choose a fetcher

| Class | Engine | Use for |
|---|---|---|
| `Fetcher` | HTTP with browser TLS impersonation | Static HTML and JSON APIs; fastest |
| `DynamicFetcher` | Chromium through Playwright | Content rendered by JavaScript |
| `StealthyFetcher` | Patched Chromium with fingerprint spoofing | Sites that block automated browsers |

Start with `Fetcher`. Move to a browser only when the data is missing from the raw HTML. Each class has a session variant (`FetcherSession`, `DynamicSession`, `StealthySession`) that keeps cookies and, for browsers, keeps the browser open between requests.

### HTTP requests

```python
from scrapling.fetchers import Fetcher, FetcherSession

page = Fetcher.get("https://quotes.toscrape.com/", impersonate="chrome", timeout=30)
print(page.status)                                   # 200
print(page.css(".quote .author::text").getall()[:3])

with FetcherSession(impersonate="chrome", retries=3) as session:
    first = session.get("https://quotes.toscrape.com/page/1/")
    second = session.get("https://quotes.toscrape.com/page/2/")
```

`Fetcher` also has `post`, `put` and `delete`. `timeout` is in seconds here and in milliseconds for the browser fetchers.

### Select and navigate

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://quotes.toscrape.com/")

quotes = page.css(".quote")                          # list of elements
quotes = page.xpath('//div[@class="quote"]')
quotes = page.find_all("div", class_="quote")
author = page.find_by_text("Albert Einstein", first_match=True)

first = quotes[0]
text = first.css(".text::text").get()                # first match or None
tags = first.css(".tag::text").getall()              # every match
href = page.css(".next a::attr(href)").get()         # "/page/2/"
absolute = page.urljoin(href)                        # full URL
opening = first.css(".text::text").re_first(r"“(\w+ \w+)")   # "The world"
similar = first.find_similar()                       # the other nine quote blocks
selector = first.generate_css_selector               # property, not a method
markdown = page.markdown()                           # whole page as Markdown
```

`css()` and `xpath()` always return a list. Index it (`[0]`) or use `.first` before calling element methods such as `get_all_text()`. To parse HTML that is already on disk, use `Selector` from `scrapling.parser`.

### JavaScript-rendered pages

```python
from scrapling.fetchers import DynamicFetcher, DynamicSession


def open_second_page(browser_page):
    browser_page.click("li.next a")                  # Playwright page API
    browser_page.wait_for_selector(".quote")


page = DynamicFetcher.fetch(
    "https://quotes.toscrape.com/js/",
    headless=True,
    network_idle=True,
    wait_selector=".quote",
    timeout=45000,
    page_action=open_second_page,
)
print(page.url, len(page.css(".quote")))

with DynamicSession(headless=True, network_idle=True) as session:
    for number in (1, 2, 3):
        listing = session.fetch(f"https://quotes.toscrape.com/js/page/{number}/")
        print(number, len(listing.css(".quote")))
```

Useful options: `disable_resources=True` (skip fonts, images, stylesheets), `block_ads=True`, `proxy=`, `real_chrome=True` (use the installed Chrome), `cdp_url=` (attach to a running browser), `wait=` (extra milliseconds after load).

`StealthyFetcher.fetch()` takes the same arguments plus `solve_cloudflare=True`, `hide_canvas=True` and `block_webrtc=True`. After a challenge is solved, pass `wait_selector` so the call returns the real content and not the interstitial.

### Crawl with a spider

```python
from scrapling.spiders import Response, Spider


class QuotesSpider(Spider):
    name = "quotes"
    start_urls = ["https://quotes.toscrape.com/"]
    allowed_domains = {"quotes.toscrape.com"}
    concurrent_requests = 4
    download_delay = 0.5
    robots_txt_obey = True

    async def parse(self, response: Response):
        for quote in response.css(".quote"):
            yield {
                "text": quote.css(".text::text").get(),
                "author": quote.css(".author::text").get(),
                "tags": quote.css(".tag::text").getall(),
            }
        next_page = response.css(".next a::attr(href)").get()
        if next_page:
            yield response.follow(next_page)


result = QuotesSpider(crawldir="crawl-state").start()
print(len(result.items), result.completed, result.stats.requests_count)
result.items.to_jsonl("quotes.jsonl")
```

- `start()` returns a `CrawlResult` with `items`, `stats`, `completed` and `paused`. Items export with `to_json`, `to_jsonl`, `to_csv` and `to_xml`.
- With `crawldir`, Ctrl+C stops gracefully and the next run with the same directory resumes. The checkpoint is removed when the crawl completes.
- Other class attributes: `concurrent_requests_per_domain`, `max_blocked_retries`, `autothrottle_enabled`, `development_mode` (replay cached responses while editing `parse()`), `log_file`.
- Hooks: `on_start`, `on_close`, `on_error`, `on_scraped_item`. Override `configure_sessions(self, manager)` to mix HTTP and browser sessions and route requests with `Request(url, sid="stealth")`.
- For streaming, use `async for item in spider.stream()`.
- Ready-made templates: `CrawlSpider`, `SitemapSpider`, `XMLFeedSpider`, `CSVFeedSpider`, `ShopifySpider`, `SiteToMarkdownSpider`.

### Selectors that survive redesigns

```python
from scrapling.fetchers import Fetcher

Fetcher.configure(
    adaptive=True,
    storage_args={"storage_file": "selectors.db", "url": "https://books.toscrape.com/"},
)
page = Fetcher.get("https://books.toscrape.com/")

cards = page.css("article.product_pod", auto_save=True)   # first run: remember the element
cards = page.css("article.product_pod", adaptive=True)    # later runs: relocate it if the selector fails
```

Matching is by similarity with a default threshold of 40 percent (`percentage=40`). Only the first matched element is stored.

### Command line and MCP

```bash
pip install "scrapling[shell]"
scrapling extract get "https://quotes.toscrape.com/" quotes.md --css-selector ".quote"
scrapling extract fetch "https://quotes.toscrape.com/js/" quotes.txt --network-idle --wait-selector ".quote"
scrapling extract stealthy-fetch "https://quotes.toscrape.com/js/" quotes.html --solve-cloudflare
scrapling mcp
```

The output extension picks the format: `.md` Markdown, `.txt` text, `.html` raw HTML. `--ai-targeted` keeps only the main content and strips hidden elements. `scrapling mcp` runs the MCP server over STDIO; `--http --host 127.0.0.1 --port 8000` switches to HTTP.

## Examples

### Example 1: Scrape one listing page

**Request:** "Get the title and price of every book on the first page of books.toscrape.com."

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://books.toscrape.com/")
for book in page.css("article.product_pod")[:3]:
    link = book.css("h3 a")[0]
    price = float(book.css(".price_color::text").re_first(r"[\d.]+"))
    print(link.attrib["title"], price, page.urljoin(link.attrib["href"]))
```

**Result:**

```text
A Light in the Attic 51.77 https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html
Tipping the Velvet 53.74 https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html
Soumission 50.1 https://books.toscrape.com/catalogue/soumission_998/index.html
```

### Example 2: Crawl every page into a file

**Request:** "Crawl all the quotes on quotes.toscrape.com, follow the pagination, and save them as JSON lines."

Save the `QuotesSpider` class from the spider section as `quotes_spider.py` and run it:

```bash
python quotes_spider.py
head -n 1 quotes.jsonl
```

**Result:** ten pages are fetched and 100 items are written.

```text
100 True 10
{"text":"“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”","author":"Albert Einstein","tags":["change","deep-thoughts","thinking","world"]}
```

### Example 3: A page that needs JavaScript

**Request:** "The quotes on quotes.toscrape.com/js/ do not show up in my scraper."

```python
from scrapling.fetchers import DynamicFetcher, Fetcher

print(len(Fetcher.get("https://quotes.toscrape.com/js/").css(".quote")))
page = DynamicFetcher.fetch("https://quotes.toscrape.com/js/", network_idle=True, wait_selector=".quote")
print(len(page.css(".quote")))
```

**Result:** the raw HTML holds no quotes; the rendered page holds ten.

```text
0
10
```

## Guidelines

- **Errors in `parse()` do not stop the crawl.** They are logged as `Spider error processing` and the run still ends with `completed=True`. Assert on `len(result.items)` and read the log; an empty result usually means a broken selector.
- **`get()` returns `None` when nothing matches**, and `css()` returns an empty list. Guard before converting: `float(None)` inside `parse()` loses the whole page.
- **Be polite by default.** `robots_txt_obey` is `False` and `download_delay` is `0` unless set. Turn the first on, set a delay, keep `concurrent_requests` low, and restrict `allowed_domains`.
- **Permission and law:** the stealth features defeat bot protection. Use them only on sites you own or are authorised to test, respect the site's terms of service, and do not collect personal data without a legal basis. The project itself ships with a research-and-education disclaimer.
- **Adaptive storage location:** without `storage_args`, fingerprints are saved inside the installed package directory and are lost when the environment is rebuilt. Point `storage_file` at a path in the project.
- **Adaptive limits:** a heavy redesign can score below the 40 percent threshold and return nothing. Lowering `percentage` trades missed matches for wrong ones; verify the output.
- **Browsers are expensive.** A browser fetch takes seconds and hundreds of megabytes. Prefer `Fetcher`, reuse one session for many pages, and set `disable_resources=True`.
- **Proxies and secrets:** pass `proxy="http://user:password@host:port"` from an environment variable, never from source code. `ProxyRotator` from `scrapling.fetchers` rotates a list through `proxy_rotator=`.
- **MCP server:** over HTTP, keep it on `127.0.0.1` and set `SCRAPLING_MCP_AUTH_TOKEN`; it can fetch any URL on the caller's behalf.
- **Pin the version.** The API still moves between 0.4.x releases; for example `find_by_text()` in 0.4.15 has no `tag` argument although older examples show one.
- **When NOT to use it:** when the site offers an official API or data export, when only article text is needed (a content extractor such as Trafilatura is simpler), or for sites that forbid automated access.
