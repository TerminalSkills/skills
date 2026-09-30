---
name: trafilatura
description: >-
  Downloads web pages and extracts the main article text and metadata (title,
  author, date) without menus, ads, footers or other boilerplate, as plain
  text, Markdown, JSON, CSV or XML. Use when a user asks to extract article
  text from a URL, get clean text from HTML, turn a web page into Markdown for
  an LLM, build a text corpus from a site, list URLs from a sitemap or RSS
  feed, scrape blog posts with their publication dates, or mentions
  Trafilatura.
license: Apache-2.0
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["text-extraction", "web-scraping", "boilerplate-removal", "corpus-building", "html-to-markdown"]
  repository: https://github.com/adbar/trafilatura
---
# Trafilatura — Clean text and metadata from web pages

## Overview

Trafilatura is a Python package and command-line tool that turns raw HTML into the content a reader came for: the article body, optional comments, and metadata. It also discovers URLs through sitemaps, feeds and a focused crawler, and downloads politely with a delay per host. It works on raw HTML and does not run JavaScript.

## Instructions

### Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install trafilatura
trafilatura --version
```

`pip install "trafilatura[all]"` adds optional speed-ups and features: language detection (`py3langid`), faster downloads (`pycurl`), faster encoding and date detection, Brotli and SOCKS proxy support.

### Extract one page from the command line

```bash
# Main text of a page
trafilatura -u "https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/"

# Markdown with a metadata header
trafilatura -u "https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/" --markdown --with-metadata

# JSON without the comment section, from HTML already on disk
cat saved-article.html | trafilatura --json --no-comments
```

| Flag | Effect |
|---|---|
| `--output-format` | One of `txt` (default), `markdown`, `json`, `csv`, `html`, `xml`, `xmltei`; shorthands `--markdown`, `--json`, `--csv`, `--html`, `--xml`, `--xmltei` |
| `--with-metadata` | Add title, author, date, site name, categories and tags |
| `--only-with-metadata` | Skip documents that lack title, URL or date |
| `--formatting`, `--links`, `--images` | Keep bold and italics, link targets, image sources |
| `--no-comments`, `--no-tables` | Leave out comment sections or tables |
| `--precision`, `--recall` | Less noise at the cost of text, or more text at the cost of noise |
| `-f`, `--fast` | Skip the fallback extractors |
| `--target-language` | Keep only documents in one language (ISO 639-1 code; needs `trafilatura[all]`) |
| `--deduplicate` | Drop duplicate documents and sections |

### Process many URLs

```bash
# One URL per line in the input file, one output file per page
trafilatura -i urls.txt -o corpus --json --with-metadata --backup-dir raw-html

# HTML files already on disk
trafilatura --input-dir html-dump -o corpus-txt
```

Output files are named after a hash of the content, such as `corpus/XsakAgmx.json`. JSON, CSV and XML get their own extension; text, Markdown and HTML output is written as `.txt`. `--backup-dir` keeps the downloaded HTML so extraction can be repeated offline. Requests to the same host are spaced by `SLEEP_TIME` (5 seconds by default), so `--parallel 4` speeds up runs over several hosts, not over one.

### Discover URLs

```bash
trafilatura --feed "https://github.blog/" --list > feed-urls.txt
trafilatura --sitemap "https://www.sitemaps.org/" --list > sitemap-urls.txt

# Keep only one section, then extract it
grep "/engineering/" feed-urls.txt > urls.txt
trafilatura -i urls.txt -o corpus --json --with-metadata
```

`--feed` finds RSS, Atom and JSON feeds and `--sitemap` reads `robots.txt` and XML sitemaps; `--list` prints the URLs without downloading the pages. `--crawl` follows a fixed number of internal links from a start page and `--explore` combines sitemap and crawl; both fetch pages with the per-host delay, so they are slow. `--url-filter` selects which seed URLs from `-i` are processed; it does not filter discovered links, so filter the list with `grep` as above.

### Python API

```python
from trafilatura import extract, fetch_url

url = "https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/"
html = fetch_url(url)                      # str, or None when the download fails
if html is None:
    raise SystemExit(f"download failed: {url}")

text = extract(html, url=url)              # plain text, or None when nothing is found
markdown = extract(
    html,
    url=url,
    output_format="markdown",
    with_metadata=True,
    include_links=True,
    include_comments=False,
)
print(markdown[:200])
```

`extract()` options: `output_format` (`"txt"`, `"markdown"`, `"json"`, `"csv"`, `"html"`, `"xml"`, `"xmltei"`), `with_metadata`, `include_comments` (default `True`), `include_tables` (default `True`), `include_links`, `include_images`, `include_formatting`, `favor_precision`, `favor_recall`, `fast`, `deduplicate`, `target_language`, `prune_xpath`. Pass `url=` so relative links and the source URL are resolved.

For structured access, `bare_extraction()` returns a `Document`:

```python
from trafilatura import bare_extraction, fetch_url

html = fetch_url("https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/")
doc = bare_extraction(html, with_metadata=True)
print(doc.title, doc.author, doc.date, doc.sitename)
print(len(doc.text))
record = doc.as_dict()
```

Other entry points: `extract_metadata(html)` for metadata only, `html2txt(html)` for all visible text with no boilerplate removal, and `trafilatura.sitemaps.sitemap_search(url)`, `trafilatura.feeds.find_feed_urls(url)` and `trafilatura.spider.focused_crawler(url, max_seen_urls=10)` for discovery.

### Polite batch downloads in Python

```python
from trafilatura import extract
from trafilatura.downloads import add_to_compressed_dict, buffered_downloads, load_download_buffer

urls = [
    "https://quotes.toscrape.com/page/1/",
    "https://quotes.toscrape.com/page/2/",
]
store = add_to_compressed_dict(urls)
while store.done is False:
    batch, store = load_download_buffer(store, sleep_time=5)
    for url, html in buffered_downloads(batch, 4):
        text = extract(html, url=url) if html else None
        print(url, len(text or ""))
```

`load_download_buffer` hands out URLs so that each host is contacted at most once per `sleep_time` seconds; `buffered_downloads` fetches them on four threads.

### Settings

Copy the packaged `settings.cfg`, edit it, and pass it with `--config-file` or `use_config()`. The file must keep every key.

```python
from trafilatura import extract
from trafilatura.settings import Extractor, use_config

config = use_config("trafilatura.cfg")     # edited copy, e.g. SLEEP_TIME = 8.0
options = Extractor(config=config, output_format="markdown", with_metadata=True, links=True)

with open("saved-article.html", encoding="utf-8") as fh:
    print(extract(fh.read(), options=options)[:200])
```

Keys worth changing: `DOWNLOAD_TIMEOUT` (30), `SLEEP_TIME` (5.0), `USER_AGENTS` (one per line), `MAX_REDIRECTS` (2), `MIN_EXTRACTED_SIZE` (250), `MAX_FILE_SIZE` (20000000).

## Examples

### Example 1: Article to Markdown with metadata

**Request:** "Get this blog post as clean Markdown with the author and date: https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/"

```bash
trafilatura -u "https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/" --markdown --with-metadata > erin-spiceland.md
head -n 12 erin-spiceland.md
```

**Result:**

```text
---
title: "Leader spotlight: Erin Spiceland"
author: Jessica Rudder
url: https://github.blog/developer-skills/career-growth/leader-spotlight-erin-spiceland/
hostname: github.blog
description: We’re spending Women’s History Month with women leaders who are making history every day in the tech community.
sitename: The GitHub Blog
date: "2019-03-29"
categories: ['Career growth', 'Developer skills']
---
# Leader spotlight: Erin Spiceland
```

### Example 2: A list of URLs into a JSON corpus

**Request:** "Extract these pages to JSON with metadata and keep the raw HTML so I can re-run it later."

```bash
printf '%s\n' \
  "https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/" \
  "https://quotes.toscrape.com/" > urls.txt
trafilatura -i urls.txt -o corpus --json --with-metadata --backup-dir raw-html
ls corpus raw-html
```

**Result:** one JSON file per page and a compressed copy of each download. The names are content hashes.

```text
corpus:
S9PjszQ4.json
XsakAgmx.json

raw-html:
S9PjszQ4.html.gz
XsakAgmx.html.gz
```

Each JSON file has the keys `title`, `author`, `hostname`, `date`, `fingerprint`, `id`, `license`, `comments`, `raw_text`, `text`, `language`, `image`, `pagetype`, `filedate`, `source`, `source-hostname`, `excerpt`, `categories` and `tags`.

### Example 3: Extraction inside a Python pipeline

**Request:** "In my ingestion script, give me title, date and text for a URL, and skip pages where extraction fails."

```python
import json

from trafilatura import extract, fetch_url

url = "https://github.blog/2019-03-29-leader-spotlight-erin-spiceland/"
html = fetch_url(url)
raw = extract(html, url=url, output_format="json", with_metadata=True) if html else None
if raw is None:
    print(f"skipped {url}")
else:
    doc = json.loads(raw)
    print(doc["title"], doc["date"], len(doc["text"]))
```

**Result:**

```text
Leader spotlight: Erin Spiceland 2019-03-29 5325
```

## Guidelines

- **Check for `None`.** `fetch_url()` returns `None` on any download failure (404, timeout, blocked) and `extract()` returns `None` when it finds no usable content. Neither raises.
- **No JavaScript.** Pages that build their content in the browser yield little or nothing. Render them first with a browser tool and pass the resulting HTML to `extract()`.
- **Built for articles.** Blog posts, news and documentation extract well. Product grids, search results, forums with unusual markup and dashboards do not; use a selector-based scraper for those.
- **Tune before replacing.** Missing text: try `favor_recall=True`. Leftover navigation or related-links blocks: try `favor_precision=True` or `prune_xpath`. Compare against `html2txt()` to see what was dropped.
- **Metadata is best effort.** Author and date come from page markup and heuristics, and either may be missing or wrong. Use `--only-with-metadata` when a corpus must have them.
- **File names are hashes**, so keep the `source` field from JSON output to map files back to URLs. Markdown output saved with `-o` has a `.txt` extension.
- **Stay polite.** Keep the default 5-second `SLEEP_TIME` or raise it, identify the crawler through `USER_AGENTS`, check `robots.txt` and the site's terms, and do not republish extracted text without the right to do so.
- **Untrusted input:** `fetch_url()` downloads whatever URL it is given. In a service, validate URLs and block private and loopback addresses before fetching.
- **Version pins:** 2.x needs Python 3.10 or newer; the last release for Python 3.8 and 3.9 is 2.0.0. Releases before 1.8.0 are GPL-licensed.
- **Long-running jobs:** call `trafilatura.meta.reset_caches()` periodically if memory grows.
- **When NOT to use it:** for structured fields on a specific page layout (prices, tables of listings), for pages behind a login, or for PDFs and office files. It extracts the main text of HTML pages and nothing else.
