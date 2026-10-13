---
name: web-scraper
description: >-
  Extract structured data from web pages and load it into databases. Use when
  a user asks to scrape a website, build a data pipeline, extract data from a
  webpage, pull prices from a site, collect links, gather product listings,
  download page content, parse HTML, set up ETL, or automate data collection.
  Handles static HTML, JavaScript-rendered pages, anti-bot proxies (Bright Data),
  data transformation, deduplication, and database loading.
license: Apache-2.0
compatibility: "Requires Python 3 with requests and beautifulsoup4 installed. For JS-rendered pages, requires playwright."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: ["scraping", "data-extraction", "beautifulsoup", "etl", "bright-data"]
---

# Web Scraper

## Overview

Extract structured data from web pages by parsing HTML, selecting elements with CSS selectors, and outputting clean data in JSON, CSV, or other formats. Handles both static HTML and JavaScript-rendered pages.

## Instructions

When a user asks you to scrape or extract data from a web page, follow these steps:

### Step 1: Assess the target

Determine:
- **URL**: What page to scrape
- **Data needed**: What specific elements to extract (prices, titles, links, tables)
- **Rendering**: Is the page static HTML or does it require JavaScript?
- **Scale**: Single page or multiple pages with pagination?

### Step 2: Fetch the page

**For static HTML:**

```python
import requests
from bs4 import BeautifulSoup

def fetch_page(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)"
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    # Pass bytes, not response.text: when the Content-Type header has no
    # charset, requests guesses one and symbols such as £ turn into mojibake.
    return BeautifulSoup(response.content, "html.parser")
```

**For JavaScript-rendered pages** (`pip install playwright`, then `playwright install` once to download the browsers):

```python
from playwright.sync_api import sync_playwright

def fetch_js_page(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")
        content = page.content()
        browser.close()
    return BeautifulSoup(content, "html.parser")
```

### Step 3: Extract data with CSS selectors

Identify the right selectors by inspecting the page structure:

```python
def extract_items(soup, selectors):
    items = []
    containers = soup.select(selectors["container"])

    for container in containers:
        item = {}
        for field, selector in selectors["fields"].items():
            el = container.select_one(selector)
            if el:
                if el.name == "img":
                    item[field] = el.get("src", "")
                elif el.name == "a":
                    item[field] = {"text": el.get_text(strip=True), "href": el.get("href", "")}
                else:
                    item[field] = el.get_text(strip=True)
            else:
                item[field] = None
        items.append(item)

    return items
```

**Usage example:**

```python
selectors = {
    "container": "div.product-card",
    "fields": {"name": "h2.product-title", "price": "span.price", "rating": "span.rating-value", "link": "a.product-link"},
}
items = extract_items(soup, selectors)
```

### Step 4: Handle pagination

```python
def scrape_all_pages(base_url, selectors, max_pages=10):
    all_items = []
    for page_num in range(1, max_pages + 1):
        url = f"{base_url}?page={page_num}"
        soup = fetch_page(url)
        items = extract_items(soup, selectors)
        if not items:
            break
        all_items.extend(items)
    return all_items
```

### Step 5: Output structured data

```python
import json
import csv

def save_json(data, filename):
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)

def save_csv(data, filename):
    if not data:
        return
    with open(filename, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
```

## Examples

### Example 1: Extract product listings

**User request:** "Scrape all product names and prices from this catalog page"

**Script outline:**
```python
soup = fetch_page("https://books.toscrape.com/")  # public practice site for scrapers

products = []
for card in soup.select("article.product_pod"):
    link = card.select_one("h3 a")
    price = card.select_one("p.price_color")
    products.append({
        "name": link.get("title", "N/A") if link else "N/A",
        "price": price.get_text(strip=True) if price else "N/A",
    })

save_csv(products, "products.csv")
print(f"Extracted {len(products)} products")
```

**Output:**
```
Extracted 20 products

| name                 | price   |
|----------------------|---------|
| A Light in the Attic | £51.77  |
| Tipping the Velvet   | £53.74  |
```

### Example 2: Extract a data table from a page

**User request:** "Pull the statistics table from this Wikipedia article"

**Script outline:**
```python
soup = fetch_page("https://en.wikipedia.org/wiki/List_of_countries_by_population_(United_Nations)")

table = soup.select_one("table.wikitable")
headers = [th.get_text(strip=True) for th in table.select("tr:first-child th")]
rows = []
for tr in table.select("tr")[1:]:
    cells = [td.get_text(strip=True) for td in tr.select("td")]
    if len(cells) == len(headers):
        rows.append(dict(zip(headers, cells)))

save_json(rows, "table_data.json")
print(f"Extracted {len(rows)} rows with columns: {headers}")
```

**Output:**
```
Extracted 238 rows with 6 columns (first: 'Country or territory', 'Population(1 July 2022)', ...)
Saved to table_data.json
```

### Step 6: Transform and deduplicate

Clean raw scraped data before loading — normalize prices, deduplicate by content hash, validate required fields.

```python
import hashlib
from datetime import datetime, timezone

def transform_products(raw_items):
    """Clean and deduplicate scraped product data."""
    seen_hashes = set()
    clean = []

    for item in raw_items:
        if not item.get("name") or not item.get("price"):
            continue

        # Normalize price: "$1,299.99" → 129999 (cents)
        price_str = item["price"].replace(",", "").replace("$", "").strip()
        try:
            price_cents = int(float(price_str) * 100)
        except ValueError:
            continue

        content_hash = hashlib.md5(
            f"{item['name']}|{item.get('link', '')}".encode()
        ).hexdigest()

        if content_hash in seen_hashes:
            continue
        seen_hashes.add(content_hash)

        clean.append({
            "name": item["name"][:500],
            "price_cents": price_cents,
            "url": (item.get("link") or {}).get("href", ""),  # link is None when missing
            "rating": item.get("rating"),
            "content_hash": content_hash,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })

    return clean
```

### Step 7: Load into a database

Batch upsert into Postgres/Supabase for persistent storage with automatic price change tracking.

```python
from supabase import create_client

def load_to_supabase(products, supabase_url, supabase_key):
    """Batch upsert products into Supabase with conflict handling."""
    client = create_client(supabase_url, supabase_key)

    for i in range(0, len(products), 100):
        batch = products[i:i+100]
        client.table("products").upsert(
            batch,
            on_conflict="content_hash"  # column needs a UNIQUE constraint; matching rows are updated
        ).execute()
```

### Step 8: Handle anti-bot protection with Bright Data

For sites that block datacenter IPs, route the request through a Bright Data zone proxy. The zone's Overview tab gives the customer ID, zone name and password; the host and port are on its Proxy Examples page.

```python
import os
import requests
from bs4 import BeautifulSoup

def fetch_with_proxy(url):
    # Username format from the Bright Data docs: brd-customer-<id>-zone-<zone>
    user = f"brd-customer-{os.environ['BRIGHT_DATA_CUSTOMER_ID']}-zone-{os.environ['BRIGHT_DATA_ZONE']}"
    host = os.environ["BRIGHT_DATA_PROXY_HOST"]  # e.g. brd.superproxy.io:33335, copied from the zone page
    proxy_url = f"http://{user}:{os.environ['BRIGHT_DATA_ZONE_PASSWORD']}@{host}"
    response = requests.get(
        url,
        proxies={"http": proxy_url, "https": proxy_url},
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
        timeout=30,
    )
    response.raise_for_status()
    return BeautifulSoup(response.content, "html.parser")
```

## Guidelines

- Always set a User-Agent header and a timeout (30 seconds) on every HTTP request.
- Respect `robots.txt`. Check it before scraping and honor disallow rules.
- Add delays between requests when scraping multiple pages (`time.sleep(1)`). Do not hammer servers.
- If a selector returns no results, the page structure may have changed. Report this to the user rather than returning empty data silently.
- For pages behind login walls, inform the user that authentication is required and ask for guidance.
- When scraping tables, always validate that row cell counts match header counts before zipping.
- Use Bright Data proxies only for sites that block datacenter IPs, and check their pricing before a large run.
- Separate extract, transform, and load stages so each can fail and retry independently.
