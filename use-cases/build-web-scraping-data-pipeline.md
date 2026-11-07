---
title: Build a Web Scraping Data Pipeline with Automated ETL
slug: build-web-scraping-data-pipeline
description: Scrape websites and APIs, clean and transform the data, and load it into Postgres on a schedule — a complete ETL pipeline for price tracking, news aggregation, or market research.
skills:
  - scrapling
  - supabase
  - web-scraper
category: data-ai
tags:
  - etl
  - scraping
  - data-pipeline
  - postgres
  - automation
  - browser-automation
---

## The Problem

Nadia runs a price comparison startup. She needs product data from 12 competitor e-commerce sites — product names, prices, availability, ratings, images. Each site has a different structure, some render with JavaScript, and several block datacenter IPs. She tried building scrapers manually: Puppeteer for one site, Cheerio for another, a custom fetch wrapper for the third. Within a week she had 12 fragile scripts, each with its own error handling, its own data format, and its own failure mode.

When a scraper breaks (and they break constantly — sites change their HTML), the pipeline silently stops collecting data. Nadia only notices when a customer asks why prices haven't updated in three days. She needs a structured pipeline where extraction, transformation, and loading are separate concerns — so when a scraper breaks, it's obvious which one, and fixing it doesn't require touching the rest of the pipeline.

## The Solution

Use scrapling for the extract stage: one Python API for plain HTTP pages and for pages rendered by JavaScript. Follow web-scraper's rules for the whole run: a timeout on every request, `robots.txt` respected, delays between pages, and an error instead of silently empty data when a selector stops matching. Use supabase for the Postgres database: a migration, a database trigger that records price changes, and Realtime to push them to a dashboard.

## Step-by-Step Walkthrough

### Step 1: Design the pipeline

Three stages joined by files, so each can fail, rerun and be tested alone: `extract.py` (scrapling) writes `data/raw/<source>.jsonl`, `transform.py` validates, normalizes and dedupes into `data/clean.jsonl`, and `load.ts` upserts into Supabase.

Set up the Python side (3.10+). `scrapling install` downloads the browsers for JavaScript sources; static sources work without it.

```console
$ python3 -m venv .venv && source .venv/bin/activate
$ pip install "scrapling[fetchers]"
$ scrapling install
```

Each site is one config entry (add more fields, such as rating or image, the same way). The demo entry points at books.toscrape.com, a public practice site for scrapers; replace it with your own sources.

```python
# sources.py — one entry per site
SOURCES = [
    {
        "name": "books-demo",               # a public practice site for scrapers
        "type": "static",                   # "static" = plain HTTP, "js" = rendered in Chromium
        "url": "https://books.toscrape.com/catalogue/page-1.html",
        "container": "article.product_pod", # one product card
        "fields": {"name": "h3 a::attr(title)", "price": "p.price_color::text",
                   "url": "h3 a::attr(href)", "availability": "p.availability::text"},
        "next": "li.next a::attr(href)",    # pagination link, absent on the last page
        "max_pages": 3,
        "delay": 2.0,                       # seconds between pages
    },
]
```

### Step 2: Extract

`Fetcher` makes a plain HTTP request with browser TLS impersonation and is the fastest option; `StealthyFetcher` renders the page in Chromium for sites whose data only appears after JavaScript runs. Start every site with `"static"` and switch to `"js"` only when the data is missing from the raw HTML. The extractor checks `robots.txt` and raises when the card selector matches nothing, so a redesign shows up as an error and not as an empty table.

```python
"""extract.py — stage 1: fetch pages and write raw records, one JSONL file per source."""
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
from scrapling.fetchers import Fetcher, StealthyFetcher
RAW_DIR = Path("data/raw")
def allowed_by_robots(url: str) -> bool:
    parts = urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    page = Fetcher.get(robots_url, timeout=30)
    if page.status != 200:  # 4xx: no robots.txt, nothing disallowed; 5xx: stay out for now
        return 400 <= page.status < 500
    parser = RobotFileParser()
    parser.parse(page.body.decode("utf-8", "replace").splitlines())
    return parser.can_fetch("*", url)

def fetch(url: str, kind: str):
    if kind == "js":  # rendered in Chromium; timeout is in milliseconds
        page = StealthyFetcher.fetch(url, headless=True, network_idle=True,
                                     timeout=45000, disable_resources=True)
    else:  # plain HTTP; timeout is in seconds
        page = Fetcher.get(url, impersonate="chrome", timeout=30)
    if page.status != 200:
        raise RuntimeError(f"HTTP {page.status} for {url}")
    return page

def extract_source(src: dict) -> int:
    if not allowed_by_robots(src["url"]):
        raise RuntimeError("robots.txt disallows this URL")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    count, url = 0, src["url"]
    with (RAW_DIR / f"{src['name']}.jsonl").open("w", encoding="utf-8") as f:
        for _ in range(src["max_pages"]):
            page = fetch(url, src["type"])
            cards = page.css(src["container"])
            if not cards:  # the layout changed: fail loudly instead of writing nothing
                raise RuntimeError(f"no '{src['container']}' elements at {url}")
            for card in cards:
                record = {}
                for field, sel in src["fields"].items():
                    parts = [v.strip() for v in card.css(sel).getall() if v.strip()]
                    record[field] = " ".join(parts) or None
                record.update(source=src["name"], source_url=url,
                              scraped_at=datetime.now(timezone.utc).isoformat())
                if record.get("url"):
                    record["url"] = page.urljoin(record["url"])
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                count += 1
            nxt = page.css(src["next"]).get() if src.get("next") else None
            if not nxt:
                break
            url = page.urljoin(nxt)
            time.sleep(src["delay"])
    return count
```

Respect each site's terms. If a site blocks your datacenter IP, the browser fetchers accept a `proxy=` argument; use one only where the terms allow scraping.

### Step 3: Validate and transform

Raw prices arrive as `$1,299.99`, `From £49.90` or `€1.299,99`. The transform stage converts them to integer cents, rejects records with no name, URL or valid price, and keeps one row per product URL (a duplicate inside one batch would make the upsert fail).

```python
"""transform.py — stage 2: validate, normalize and deduplicate raw records."""
import json
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
CURRENCIES = {"$": "USD", "€": "EUR", "£": "GBP"}

def parse_price(raw: str):
    m = re.search(r"\d[\d.,]*", raw or "")
    if not m:
        return None
    number = m.group(0).rstrip(".,")
    if re.search(r",\d{2}$", number):  # European "1.299,99" or "49,90"
        number = number.replace(".", "").replace(",", ".")
    else:                              # "1,299.99"
        number = number.replace(",", "")
    try:
        cents = int((Decimal(number) * 100).to_integral_value())
    except InvalidOperation:
        return None
    currency = next((code for sym, code in CURRENCIES.items() if sym in raw), "USD")
    return (cents, currency) if cents > 0 else None
def transform_file(raw_path: Path):
    clean, rejects = {}, []
    for line in raw_path.read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        priced = parse_price(rec.get("price") or "")
        if not rec.get("name") or not rec.get("url") or priced is None:
            rejects.append({"reason": "missing name/url or bad price", "record": rec})
            continue
        cents, currency = priced
        clean[rec["url"]] = {
            "source": rec["source"],
            "product_url": rec["url"],
            "name": rec["name"].strip()[:500],
            "price_cents": cents,
            "currency": currency,
            "in_stock": "out of stock" not in (rec.get("availability") or "").lower(),
            "scraped_at": rec["scraped_at"],
        }
    return list(clean.values()), rejects
```

### Step 4: Create the schema in Supabase

Run `npx supabase init`, `npx supabase start` and `npx supabase migration new products_and_price_history`, then put this in the new file under `supabase/migrations/`. The trigger logs a price change inside the same statement that makes it, so there is no read-then-write race between pipeline runs.

```sql
create table public.products (
  product_url text primary key,
  source text not null,
  name text not null,
  price_cents integer not null check (price_cents > 0),
  currency text not null,
  in_stock boolean not null default true,
  scraped_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.price_history (
  id bigint generated always as identity primary key,
  product_url text not null,
  source text not null,
  old_price_cents integer not null,
  new_price_cents integer not null,
  changed_at timestamptz not null default now()
);

create function public.log_price_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.price_history (product_url, source, old_price_cents, new_price_cents)
  values (new.product_url, new.source, old.price_cents, new.price_cents);
  return new;
end $$;

create trigger products_price_change after update on public.products
for each row when (old.price_cents is distinct from new.price_cents)
execute function public.log_price_change();

alter table public.products enable row level security;
alter table public.price_history enable row level security;
create policy "read" on public.products for select to authenticated using (true);
create policy "read" on public.price_history for select to authenticated using (true);
alter publication supabase_realtime add table public.price_history;
```

Test it with `npx supabase db reset`, then `npx supabase db push --remote --dry-run` and `npx supabase db push --remote` for the linked project (the CLI asks first; add `--yes` in CI).

### Step 5: Load

The loader runs on a server and uses the **secret** key (`sb_secret_...`, bypasses RLS) from the environment, never from a file in the repo. The older `service_role` key still works but is being deprecated. Set `"type": "module"` in `package.json`, then `npm install @supabase/supabase-js` and `npm install -D tsx`.

```typescript
// load.ts — stage 3: upsert data/clean.jsonl into Supabase
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const rows = readFileSync("data/clean.jsonl", "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let failed = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("products").upsert(batch, { onConflict: "product_url" });
  if (error) {
    failed++;
    console.error(`batch ${i / 500} failed: ${error.message}`);
  }
}
console.log(`${rows.length} rows, ${failed} failed batches`);
process.exit(failed ? 1 : 0);
```

### Step 6: Schedule, monitor and watch changes

`pipeline.py` runs every source, writes `data/clean.jsonl`, prints a per-source summary and exits non-zero if any source failed or more than 20% of its records were rejected. The exit code is what makes a stall visible to cron, CI or any monitor:

```python
"""pipeline.py — run extract + transform for every source; exit 1 if any source failed."""
import json
import sys
from pathlib import Path
from extract import RAW_DIR, extract_source
from sources import SOURCES
from transform import transform_file
CLEAN = Path("data/clean.jsonl")
MAX_REJECT_RATE = 0.2  # more rejects than this means the selectors drifted
summary, clean_rows, failed = {}, [], False
for src in SOURCES:
    try:
        extracted = extract_source(src)
        clean, rejects = transform_file(RAW_DIR / f"{src['name']}.jsonl")
        if extracted and len(rejects) / extracted > MAX_REJECT_RATE:
            raise RuntimeError(f"{len(rejects)} of {extracted} records rejected; check the selectors")
        clean_rows += clean
        summary[src["name"]] = {"status": "ok", "extracted": extracted,
                                "clean": len(clean), "rejected": len(rejects)}
    except Exception as exc:  # one broken source must not stop the others
        failed = True
        summary[src["name"]] = {"status": "error", "error": str(exc)}

CLEAN.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in clean_rows), encoding="utf-8")
print(json.dumps(summary))
sys.exit(1 if failed else 0)
```

Run it every six hours. The loader runs even when one source failed, so the healthy sources still load (the failed one contributes no rows, and the non-zero exit is what the monitor sees). Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the cron environment:

```cron
0 */6 * * * cd /srv/price-pipeline && .venv/bin/python pipeline.py; npx tsx load.ts >> run.log 2>&1
```

Dashboards can watch `price_history` with the publishable key (`sb_publishable_...`) and a signed-in user, because the policies above allow only `authenticated` reads.

## The Outcome

Nadia's pipeline runs every 6 hours over her sources. Each source is independent: when competitor-a redesigns its product page and breaks the selectors, only that source reports an error (with the URL and selector that failed) while the others keep loading. The fix is one selector in `sources.py`, not a pipeline rewrite.

Price changes are recorded by the database itself in `price_history`, and Supabase Realtime pushes each one to the dashboard. Mock records through `transform.py` test every price format, and the loader runs against the local Supabase stack before production.

## Related Skills

- [scrapling](/skills/scrapling) — a Python scraper for sites that change layout or block bots: adaptive selectors, stealth fetchers and a spider with pause and resume
- [web-scraper](/skills/web-scraper) — scraping rules for any run: timeouts, robots.txt, delays, and separate extract, transform and load stages
- [supabase](/skills/supabase) — Postgres, migrations, RLS, Realtime and the CLI
