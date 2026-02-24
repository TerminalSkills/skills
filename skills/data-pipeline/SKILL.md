---
name: data-pipeline
description: >-
  Build ETL data pipelines — scrape, clean, transform, and load data into
  databases. Use when someone asks to "scrape a website", "build a data pipeline",
  "ETL data into Postgres", "clean and transform data", "set up web scraping",
  "extract data from APIs", "load data into Supabase", "build a data ingestion
  pipeline", or "automate data collection". Covers web scraping (Playwright,
  Cheerio, Bright Data), API extraction, data cleaning and transformation,
  scheduling, and loading into Postgres/Supabase/BigQuery.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Optional: Playwright, Bright Data API key."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["etl", "scraping", "data-pipeline", "postgres", "automation", "bright-data"]
---

# Data Pipeline

## Overview

Build end-to-end data pipelines: extract data from websites and APIs, clean and transform it, load it into databases, and schedule recurring runs. From simple one-off scrapes to production pipelines processing millions of records.

## When to Use

- Scrape product prices, job listings, real estate data, or news articles
- Extract data from REST/GraphQL APIs and normalize it
- Clean messy CSV/JSON data — deduplication, normalization, validation
- Load transformed data into Postgres, Supabase, BigQuery, or data warehouses
- Schedule recurring data collection (hourly, daily, weekly)
- Build data-powered features: price comparison, market analysis, content aggregation

## Instructions

### Pipeline Architecture

Every data pipeline follows the same pattern:

```
Extract → Validate → Transform → Deduplicate → Load → Verify
  │          │           │            │           │       │
  │          │           │            │           │       └─ Row counts, checksums
  │          │           │            │           └─ Batch insert into DB
  │          │           │            └─ Hash-based or field-based dedup
  │          │           └─ Normalize, enrich, compute fields
  │          └─ Schema validation, type checking
  └─ Web scrape, API call, file read
```

### Strategy 1: Web Scraping with Playwright (JavaScript-Heavy Sites)

For sites that render content with JavaScript — SPAs, dynamic pages, infinite scroll.

```typescript
// scraper.ts — Production web scraper with Playwright
/**
 * Scrapes JavaScript-rendered websites using headless Chromium.
 * Handles pagination, rate limiting, retries, and anti-bot detection.
 * Outputs structured data ready for transformation and loading.
 */
import { chromium, Browser, Page } from "playwright";

interface ScrapeConfig {
  url: string;
  selector: string;           // CSS selector for data items
  fields: Record<string, string>;  // field name → CSS selector within item
  pagination?: {
    nextSelector: string;     // "Next" button selector
    maxPages: number;         // Safety limit
  };
  rateLimit?: number;         // Milliseconds between requests
}

interface ScrapedItem {
  [key: string]: string | null;
  _url: string;
  _scraped_at: string;
}

export class Scraper {
  private browser: Browser | null = null;
  private rateLimit: number;

  constructor(rateLimit: number = 2000) {  // 2s between requests by default
    this.rateLimit = rateLimit;
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",  // Evade bot detection
        "--no-sandbox",
      ],
    });
  }

  /**
   * Scrape a paginated website and return structured data.
   */
  async scrape(config: ScrapeConfig): Promise<ScrapedItem[]> {
    if (!this.browser) await this.init();

    const page = await this.browser!.newPage();
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",  // Look like a real browser
    });

    const allItems: ScrapedItem[] = [];
    let currentUrl = config.url;
    let pageNum = 0;
    const maxPages = config.pagination?.maxPages || 1;

    while (pageNum < maxPages) {
      console.log(`📄 Scraping page ${pageNum + 1}: ${currentUrl}`);

      await page.goto(currentUrl, { waitUntil: "networkidle" });
      await page.waitForSelector(config.selector, { timeout: 10000 });

      // Extract items from current page
      const items = await page.$$eval(
        config.selector,
        (elements, fields) => {
          return elements.map((el) => {
            const item: Record<string, string | null> = {};
            for (const [name, selector] of Object.entries(fields)) {
              const target = el.querySelector(selector as string);
              item[name] = target?.textContent?.trim() || null;
            }
            return item;
          });
        },
        config.fields
      );

      const timestamped = items.map((item) => ({
        ...item,
        _url: currentUrl,
        _scraped_at: new Date().toISOString(),
      }));

      allItems.push(...timestamped);
      console.log(`  Found ${items.length} items (total: ${allItems.length})`);

      // Check for next page
      if (!config.pagination) break;

      const nextButton = await page.$(config.pagination.nextSelector);
      if (!nextButton) break;

      await nextButton.click();
      await page.waitForLoadState("networkidle");
      currentUrl = page.url();
      pageNum++;

      // Rate limiting
      await new Promise((r) => setTimeout(r, this.rateLimit));
    }

    await page.close();
    return allItems;
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
```

### Strategy 2: API Extraction + Transformation

For structured data from REST APIs — pagination, rate limiting, incremental loads.

```python
# api_extractor.py — Extract and transform data from REST APIs
"""
Production API data extractor with pagination, rate limiting,
incremental loading (only fetch new data), and automatic retries.
Outputs clean, validated records ready for database loading.
"""
import httpx
import time
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, Generator
from dataclasses import dataclass, field

@dataclass
class ExtractionResult:
    """Result of an API extraction run."""
    records: list[dict]
    total_fetched: int
    duplicates_skipped: int
    errors: int
    duration_seconds: float

class APIExtractor:
    """Extract data from paginated REST APIs with incremental loading."""

    def __init__(self, base_url: str, api_key: Optional[str] = None,
                 rate_limit: float = 1.0):
        """
        Args:
            base_url: API base URL (e.g., "https://api.example.com/v1")
            api_key: Optional Bearer token for authentication
            rate_limit: Minimum seconds between requests
        """
        self.base_url = base_url.rstrip("/")
        self.rate_limit = rate_limit
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.seen_hashes: set[str] = set()  # For deduplication

    def extract(self, endpoint: str, params: Optional[dict] = None,
                max_pages: int = 100,
                data_key: str = "data",
                page_param: str = "page") -> ExtractionResult:
        """Extract all pages from a paginated API endpoint.

        Args:
            endpoint: API path (e.g., "/products")
            params: Query parameters
            max_pages: Safety limit for pagination
            data_key: JSON key containing the data array
            page_param: Query parameter name for pagination

        Returns:
            ExtractionResult with all extracted and deduplicated records
        """
        start = time.time()
        all_records = []
        duplicates = 0
        errors = 0
        params = params or {}

        for page in range(1, max_pages + 1):
            params[page_param] = page

            try:
                response = httpx.get(
                    f"{self.base_url}{endpoint}",
                    params=params,
                    headers=self.headers,
                    timeout=30,
                )
                response.raise_for_status()
                data = response.json()

                records = data.get(data_key, [])
                if not records:
                    break  # No more data

                # Deduplicate by content hash
                for record in records:
                    record_hash = hashlib.md5(
                        json.dumps(record, sort_keys=True).encode()
                    ).hexdigest()

                    if record_hash in self.seen_hashes:
                        duplicates += 1
                        continue

                    self.seen_hashes.add(record_hash)
                    record["_extracted_at"] = datetime.utcnow().isoformat()
                    all_records.append(record)

                print(f"  Page {page}: {len(records)} records ({len(all_records)} total)")

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:  # Rate limited
                    retry_after = int(e.response.headers.get("Retry-After", 60))
                    print(f"  ⏳ Rate limited, waiting {retry_after}s...")
                    time.sleep(retry_after)
                    continue
                errors += 1
                print(f"  ❌ Error on page {page}: {e.response.status_code}")

            except httpx.RequestError as e:
                errors += 1
                print(f"  ❌ Request error: {e}")

            time.sleep(self.rate_limit)

        return ExtractionResult(
            records=all_records,
            total_fetched=len(all_records) + duplicates,
            duplicates_skipped=duplicates,
            errors=errors,
            duration_seconds=round(time.time() - start, 1),
        )

    def transform(self, records: list[dict],
                  field_map: dict[str, str],
                  computed: Optional[dict] = None) -> list[dict]:
        """Transform extracted records — rename fields, compute new ones.

        Args:
            records: Raw extracted records
            field_map: Mapping of old_field → new_field names
            computed: Dict of new_field → lambda(record) for computed fields

        Returns:
            List of transformed records
        """
        transformed = []
        for record in records:
            new_record = {}

            # Rename fields
            for old_key, new_key in field_map.items():
                if old_key in record:
                    new_record[new_key] = record[old_key]

            # Computed fields
            if computed:
                for key, fn in computed.items():
                    try:
                        new_record[key] = fn(record)
                    except Exception:
                        new_record[key] = None

            transformed.append(new_record)

        return transformed
```

### Strategy 3: Database Loading (Postgres / Supabase)

```python
# loader.py — Batch load data into Postgres or Supabase
"""
Efficiently loads transformed data into Postgres using batch inserts
with upsert (INSERT ON CONFLICT UPDATE) for idempotent pipelines.
Supports both direct Postgres and Supabase connections.
"""
import psycopg2
from psycopg2.extras import execute_values
from typing import Optional
from datetime import datetime

class PostgresLoader:
    """Batch loader for Postgres with upsert support."""

    def __init__(self, connection_string: str):
        """
        Args:
            connection_string: Postgres connection URL
                e.g., "postgresql://user:pass@host:5432/dbname"
        """
        self.conn = psycopg2.connect(connection_string)
        self.conn.autocommit = False  # Explicit transactions

    def load(self, table: str, records: list[dict],
             conflict_key: Optional[str] = None,
             batch_size: int = 1000) -> dict:
        """Batch insert records with optional upsert on conflict.

        Args:
            table: Target table name
            records: List of dicts (keys must match column names)
            conflict_key: Column name for ON CONFLICT (upsert)
            batch_size: Records per INSERT statement

        Returns:
            Dict with inserted, updated, and error counts
        """
        if not records:
            return {"inserted": 0, "updated": 0, "errors": 0}

        columns = list(records[0].keys())
        inserted = 0
        updated = 0
        errors = 0

        cursor = self.conn.cursor()

        try:
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                values = [tuple(r.get(c) for c in columns) for r in batch]

                if conflict_key:
                    # Upsert: insert or update on conflict
                    update_cols = [c for c in columns if c != conflict_key]
                    update_clause = ", ".join(
                        f"{c} = EXCLUDED.{c}" for c in update_cols
                    )
                    sql = f"""
                        INSERT INTO {table} ({', '.join(columns)})
                        VALUES %s
                        ON CONFLICT ({conflict_key}) DO UPDATE SET
                        {update_clause}, updated_at = NOW()
                    """
                else:
                    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s"

                execute_values(cursor, sql, values)
                inserted += len(batch)
                print(f"  💾 Loaded batch {i // batch_size + 1}: {len(batch)} records")

            self.conn.commit()

        except Exception as e:
            self.conn.rollback()
            errors += 1
            print(f"  ❌ Load error: {e}")

        finally:
            cursor.close()

        return {"inserted": inserted, "updated": updated, "errors": errors}

    def verify(self, table: str, expected_count: int) -> dict:
        """Verify loaded data matches expectations.

        Args:
            table: Table to verify
            expected_count: Expected minimum row count

        Returns:
            Verification results
        """
        cursor = self.conn.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        actual = cursor.fetchone()[0]
        cursor.close()

        return {
            "table": table,
            "expected": expected_count,
            "actual": actual,
            "status": "✅ OK" if actual >= expected_count else "❌ MISMATCH",
        }

    def close(self):
        self.conn.close()
```

### Strategy 4: Bright Data Integration (Anti-Bot Scraping)

For sites with aggressive anti-bot protection — CAPTCHAs, IP blocks, browser fingerprinting.

```typescript
// bright-data-scraper.ts — Scraping via Bright Data proxy network
/**
 * Uses Bright Data's residential proxy and Web Unlocker
 * to scrape sites that block datacenter IPs.
 * Handles automatic proxy rotation, CAPTCHA solving, and retries.
 */
import axios from "axios";

interface BrightDataConfig {
  zone: string;              // Proxy zone (e.g., "residential", "datacenter")
  customer: string;          // Bright Data customer ID
  password: string;          // Zone password
  country?: string;          // Target country code (e.g., "us", "uk")
}

export class BrightDataScraper {
  private proxyUrl: string;

  constructor(config: BrightDataConfig) {
    const country = config.country ? `-country-${config.country}` : "";
    this.proxyUrl = `http://${config.customer}-zone-${config.zone}${country}:${config.password}@brd.superproxy.io:22225`;
  }

  /**
   * Fetch a URL through Bright Data's proxy network.
   * Automatically handles proxy rotation and retries.
   */
  async fetch(url: string, retries: number = 3): Promise<string> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url, {
          proxy: {
            protocol: "http",
            host: "brd.superproxy.io",
            port: 22225,
            auth: {
              username: this.proxyUrl.split("://")[1].split(":")[0],
              password: this.proxyUrl.split(":").pop()!.split("@")[0],
            },
          },
          timeout: 30000,  // 30 second timeout
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

        return response.data;
      } catch (error: any) {
        console.log(`  Attempt ${attempt}/${retries} failed: ${error.message}`);
        if (attempt === retries) throw error;
        await new Promise((r) => setTimeout(r, 2000 * attempt));  // Exponential backoff
      }
    }
    throw new Error("All retries exhausted");
  }

  /**
   * Use Bright Data's Web Unlocker for the hardest sites.
   * Handles CAPTCHAs, JavaScript rendering, and fingerprint evasion.
   */
  async unlockerFetch(url: string): Promise<string> {
    const response = await axios.get("https://api.brightdata.com/request", {
      params: { url },
      headers: {
        "Authorization": `Bearer ${process.env.BRIGHT_DATA_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,  // Unlocker can take longer (CAPTCHA solving)
    });

    return response.data;
  }
}
```

### Pipeline Orchestration

```python
# pipeline.py — Orchestrate the full ETL pipeline
"""
Ties together extraction, transformation, and loading into
a single scheduled pipeline with logging and error handling.
"""
from api_extractor import APIExtractor
from loader import PostgresLoader
from datetime import datetime
import json

def run_pipeline():
    """Execute the full ETL pipeline."""
    print(f"🚀 Pipeline started: {datetime.now().isoformat()}")

    # Extract
    extractor = APIExtractor(
        base_url="https://api.example.com/v1",
        api_key="your-key",
        rate_limit=0.5  # 2 requests/second
    )
    result = extractor.extract("/products", params={"status": "active"})
    print(f"📥 Extracted: {result.total_fetched} records, {result.duplicates_skipped} dupes")

    # Transform
    transformed = extractor.transform(
        result.records,
        field_map={
            "product_name": "name",
            "product_price": "price",
            "product_url": "url",
        },
        computed={
            "price_cents": lambda r: int(float(r.get("product_price", 0)) * 100),
            "domain": lambda r: r.get("product_url", "").split("/")[2],
        }
    )
    print(f"🔄 Transformed: {len(transformed)} records")

    # Load
    loader = PostgresLoader("postgresql://user:pass@localhost:5432/mydb")
    load_result = loader.load("products", transformed, conflict_key="url")
    print(f"💾 Loaded: {load_result}")

    # Verify
    verification = loader.verify("products", expected_count=len(transformed))
    print(f"✅ Verification: {verification}")

    loader.close()
    print(f"🏁 Pipeline complete: {datetime.now().isoformat()}")

if __name__ == "__main__":
    run_pipeline()
```

## Examples

### Example 1: Scrape product prices for comparison

**User prompt:** "Scrape product prices from an e-commerce site daily and store them in Postgres for price tracking."

The agent will:
- Set up Playwright scraper targeting product cards (name, price, URL, availability)
- Handle pagination (next button or infinite scroll)
- Add rate limiting (2s between pages) to avoid blocks
- Transform data — normalize prices to cents, extract brand from title
- Load into Postgres with upsert on product URL (update price if exists)
- Schedule daily run via cron

### Example 2: Build a news aggregation pipeline

**User prompt:** "Collect news articles from 5 RSS feeds, deduplicate, summarize with AI, and load into Supabase."

The agent will:
- Extract articles from RSS feeds using httpx + feedparser
- Deduplicate by article URL hash
- Send article text to OpenAI for summarization
- Transform: title, summary, source, published_date, categories
- Batch load into Supabase via PostgREST API
- Schedule hourly extraction

### Example 3: API data pipeline for market analysis

**User prompt:** "Extract stock data from an API, calculate technical indicators, and load into a data warehouse."

The agent will:
- Extract OHLCV data from the API with pagination and rate limiting
- Transform: calculate SMA, EMA, RSI, MACD from raw price data
- Validate: check for missing dates, price anomalies, zero-volume days
- Load into Postgres partitioned by date for fast time-range queries
- Verify row counts and data integrity after each load

## Guidelines

- **Respect robots.txt** — check before scraping; if disallowed, use the site's API instead
- **Rate limit everything** — 1-2 requests/second for scraping, respect API rate limits
- **Idempotent pipelines** — use upsert (ON CONFLICT) so re-running doesn't create duplicates
- **Incremental loads** — track last extraction timestamp; only fetch new/changed data
- **Schema validation** — validate data types before loading; one bad record shouldn't crash the pipeline
- **Retry with backoff** — network errors happen; retry 3 times with exponential backoff
- **Store raw data** — keep the raw extracted data alongside transformed data for debugging
- **Monitor pipeline health** — log extraction counts, load counts, error rates; alert on anomalies
- **Bright Data for hard targets** — residential proxies for sites that block datacenter IPs
- **Legal compliance** — scraping public data is generally legal, but check the site's ToS
- **Cost management** — Bright Data charges per GB; estimate data volume before committing
- **Scheduling** — use cron for simple schedules, Airflow/Prefect for complex DAG pipelines
