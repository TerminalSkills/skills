---
title: Build a Resilient Web Scraper with Scrapling
slug: build-a-resilient-web-scraper-with-scrapling
description: Crawl a 1,000-item catalogue every week, store price history and get a loud failure when the site changes, for small teams that track prices.
skills:
  - scrapling
  - sqlite
  - cron
category: automation
tags:
  - scrapling
  - web-scraping
  - price-monitoring
  - crawler
  - python
---

## The Problem

Marta Lindqvist sets prices at Pagewright Books, a three-person online bookshop. Every Monday she compares her prices with a catalogue of about 1,000 titles. Her scraper is a 60-line script built on `requests` and BeautifulSoup, and it fails in the worst way: quietly. In July the catalogue renamed one CSS class. The script kept running, wrote 1,000 rows with empty prices, and Marta repriced 140 titles from a spreadsheet that was three weeks stale before she noticed.

She needs a crawler that walks all 50 listing pages politely, keeps a history so price changes are visible, and stops with an error the moment the page structure shifts. The walkthrough runs against `books.toscrape.com`, a public practice catalogue with the same shape (50 pages, 20 books each), so every command can be reproduced. For a real catalogue, change the start URL and the selectors.

## The Solution

Use **scrapling** for the crawl and the selector check, **sqlite** for the price history, and **cron** for the weekly run.

```bash
npx terminal-skills install scrapling sqlite cron
```

## Step-by-Step Walkthrough

### 1. Install Scrapling and look at one page

```text
Set up Scrapling in this folder and show me what one listing page looks like to a scraper.
```

```bash
python -m venv .venv
source .venv/bin/activate
pip install "scrapling[shell]"
scrapling extract get "https://books.toscrape.com/" sample.md --css-selector "article.product_pod"
```

The Markdown dump shows title, price and stock text inside each `article.product_pod`. The data is in the raw HTML, so plain HTTP is enough and no browser has to be installed.

### 2. Crawl the whole catalogue

```text
Write a spider that collects title, URL, price and stock status for every book. Be gentle with the site and fail loudly if it collects too little.
```

`catalogue_spider.py`:

```python
import sys
from datetime import date

from scrapling.spiders import Response, Spider


class CatalogueSpider(Spider):
    name = "catalogue"
    start_urls = ["https://books.toscrape.com/catalogue/page-1.html"]
    allowed_domains = {"books.toscrape.com"}
    concurrent_requests = 4
    download_delay = 0.5
    robots_txt_obey = True
    log_file = "spider.log"
    logging_level = 20  # INFO

    async def parse(self, response: Response):
        for book in response.css("article.product_pod"):
            link = book.css("h3 a")[0]
            yield {
                "title": link.attrib["title"],
                "url": response.urljoin(link.attrib["href"]),
                "price_gbp": float(book.css(".price_color::text").re_first(r"[\d.]+")),
                "in_stock": "In stock" in book.css(".availability")[0].get_all_text(strip=True),
                "seen_on": date.today().isoformat(),
            }
        next_page = response.css("li.next a::attr(href)").get()
        if next_page:
            yield response.follow(next_page)


if __name__ == "__main__":
    result = CatalogueSpider(crawldir="crawl-state").start()
    if len(result.items) < 900:
        sys.exit(f"only {len(result.items)} books scraped; see spider.log")
    result.items.to_jsonl("catalogue.jsonl")
    print(f"{len(result.items)} books from {result.stats.requests_count} pages")
```

Running `python catalogue_spider.py` prints `1000 books from 50 pages` after about 40 seconds. The item-count check matters: Scrapling logs an exception inside `parse()` and carries on, so a broken selector ends as a "completed" crawl with zero items. With the check, that case exits with status 1. `crawldir` lets an interrupted run resume where it stopped.

### 3. Keep a price history

```text
Store each run in SQLite and tell me which prices changed since the last run.
```

`load_prices.py`:

```python
import json
import sqlite3
from contextlib import closing

with closing(sqlite3.connect("prices.db")) as conn:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS price_history (
               url TEXT NOT NULL, title TEXT NOT NULL, price_gbp REAL NOT NULL,
               in_stock INTEGER NOT NULL, seen_on TEXT NOT NULL,
               PRIMARY KEY (url, seen_on))"""
    )
    with open("catalogue.jsonl", encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    conn.executemany(
        "INSERT OR REPLACE INTO price_history VALUES (:url, :title, :price_gbp, :in_stock, :seen_on)",
        rows,
    )
    conn.commit()
    changed = conn.execute(
        """SELECT cur.title, prev.price_gbp, cur.price_gbp
           FROM price_history cur JOIN price_history prev ON prev.url = cur.url
           WHERE cur.seen_on = (SELECT max(seen_on) FROM price_history)
             AND prev.seen_on = (SELECT max(seen_on) FROM price_history WHERE seen_on < cur.seen_on)
             AND prev.price_gbp <> cur.price_gbp
           ORDER BY abs(cur.price_gbp - prev.price_gbp) DESC"""
    ).fetchall()
    print(f"loaded {len(rows)} rows, {len(changed)} price changes")
    for title, old, new in changed[:10]:
        print(f"{title}: £{old:.2f} -> £{new:.2f}")
```

The first `python load_prices.py` prints `loaded 1000 rows, 0 price changes`. From the second week on it lists the titles that moved, one per line, such as `A Light in the Attic: £47.82 -> £51.77`.

### 4. Add a selector canary

```text
Before each crawl, check that the product card selector still works. If the site was redesigned, tell me where the cards went.
```

`selector_canary.py` stores a fingerprint of the product card on every healthy run. When the selector stops matching, Scrapling's adaptive lookup searches for the most similar element and the script reports its new location:

```python
import sys

from scrapling.fetchers import Fetcher

Fetcher.configure(
    adaptive=True,
    storage_args={"storage_file": "selectors.db", "url": "https://books.toscrape.com/"},
)
page = Fetcher.get("https://books.toscrape.com/catalogue/page-1.html")
cards = page.css("article.product_pod", auto_save=True)
if not cards:
    moved = page.css("article.product_pod", adaptive=True)
    where = moved[0].generate_css_selector if moved else "not found"
    sys.exit(f"product card selector broke; closest match now: {where}")
print(f"selector ok: {len(cards)} cards")
```

On a healthy page it prints `selector ok: 20 cards`.

### 5. Schedule the weekly run

```text
Run all of this every Monday at 06:00 on the office server and keep a log.
```

The agent adds one line with `crontab -e`. The three scripts are chained with `&&`, so a failed canary or a short crawl stops the chain before anything is loaded, and the parentheses send the output of all three to the log:

```bash
0 6 * * 1 cd /srv/pagewright/price-watch && (.venv/bin/python selector_canary.py && .venv/bin/python catalogue_spider.py && .venv/bin/python load_prices.py) >> price-watch.log 2>&1
```

## Real-World Example

Marta replaced her old script with these three files in one morning. The Monday job now finishes in under a minute: 50 requests, 1,000 rows appended to `prices.db`, and a change list of 30 to 60 titles that she reviews instead of the full catalogue. Her weekly pricing session went from about two hours to 25 minutes.

Six weeks in, the catalogue changed its listing markup. The canary exited with `product card selector broke` and the selector of the closest matching element, nothing was loaded into the database, and the log made the cause obvious. Marta updated one selector in `catalogue_spider.py`, ran the job by hand, and had current prices before her pricing session. The July failure mode, 1,000 silent empty rows, cannot happen with the item-count check in place.

## Related Skills

- [scrapling](/skills/scrapling) — fetches the catalogue, follows pagination politely, and relocates the product card selector after a redesign
- [sqlite](/skills/sqlite) — keeps one row per book per run and answers "what changed since last week"
- [cron](/skills/cron) — runs canary, crawl and load every Monday and appends output to a log
