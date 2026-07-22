---
title: Build a Web Scraping Data Pipeline with Automated ETL
slug: build-web-scraping-data-pipeline
description: Scrape websites and APIs, clean and transform the data, and load it into Postgres on a schedule — a complete ETL pipeline for price tracking, news aggregation, or market research.
skills:
  - data-pipeline
  - supabase
  - playwright-testing
category: data-ai
tags:
  - etl
  - scraping
  - data-pipeline
  - postgres
  - automation
  - playwright
---

## The Problem

Nadia runs a price comparison startup. She needs product data from 12 competitor e-commerce sites — product names, prices, availability, ratings, images. Each site has a different structure, some render with JavaScript, and several block datacenter IPs. She tried building scrapers manually: Puppeteer for one site, Cheerio for another, a custom fetch wrapper for the third. Within a week she had 12 fragile scripts, each with its own error handling, its own data format, and its own failure mode.

When a scraper breaks (and they break constantly — sites change their HTML), the pipeline silently stops collecting data. Nadia only notices when a customer asks why prices haven't updated in three days. She needs a structured pipeline where extraction, validation, transformation, and loading are separate concerns — so when a scraper breaks, it's obvious which one, and fixing it doesn't require touching the rest of the pipeline.

## The Solution

Use data-pipeline for the ETL architecture — separate extract, transform, and load stages with validation between each. Use playwright-testing for JavaScript-rendered sites and supabase for the Postgres database with real-time price change notifications.

## Step-by-Step Walkthrough

### Step 1: Design the Pipeline Architecture

Every scraping pipeline needs the same five stages. Separating them means each stage can fail independently, retry independently, and be tested independently.

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌────────┐
│ Extract  │───▶│ Validate │───▶│ Transform │───▶│ Dedupe   │───▶│  Load  │
│ (scrape) │    │ (schema) │    │ (clean)   │    │ (hash)   │    │ (DB)   │
└──────────┘    └──────────┘    └───────────┘    └──────────┘    └────────┘
     │                │               │               │              │
     ▼                ▼               ▼               ▼              ▼
  raw.json      errors.log     transformed/      deduped/       load_report
```

```typescript
// pipeline.config.ts — Configuration for the scraping pipeline
/**
 * Defines data sources, transformation rules, and load targets.
 * Each source is independent — one breaking doesn't affect others.
 */

export interface SourceConfig {
  name: string;
  type: "playwright" | "fetch" | "api";    // Extraction method
  url: string;
  selectors?: {                             // For HTML scraping
    container: string;                      // Product card selector
    fields: Record<string, string>;         // field → CSS selector
  };
  apiConfig?: {                             // For API sources
    headers: Record<string, string>;
    pagination: { param: string; maxPages: number };
  };
  rateLimit: number;                        // ms between requests
  schedule: string;                         // Cron expression
}

export const sources: SourceConfig[] = [
  {
    name: "competitor-a",
    type: "playwright",                     // JS-rendered site
    url: "https://competitor-a.com/products",
    selectors: {
      container: "[data-testid='product-card']",
      fields: {
        name: "h3.product-title",
        price: "span.price",
        rating: "div.stars",
        image: "img.product-image@src",     // @attr extracts attribute
        url: "a.product-link@href",
        availability: "span.stock-status",
      },
    },
    rateLimit: 3000,                        // 3s between pages (respectful)
    schedule: "0 */6 * * *",                // Every 6 hours
  },
  {
    name: "competitor-b",
    type: "fetch",                          // Static HTML, no JS needed
    url: "https://competitor-b.com/api/products",
    apiConfig: {
      headers: { "Accept": "application/json" },
      pagination: { param: "page", maxPages: 50 },
    },
    rateLimit: 1000,
    schedule: "0 */6 * * *",
  },
];
```

### Step 2: Build the Extraction Layer

Two extractors: Playwright for JavaScript-rendered sites, plain fetch for static HTML and APIs. Both output the same format.

```typescript
// extractors/playwright-extractor.ts — Extract from JS-rendered sites
/**
 * Uses Playwright to render JavaScript-heavy pages and extract
 * product data using CSS selectors. Handles pagination,
 * infinite scroll, and dynamic content loading.
 */
import { chromium, type Page } from "playwright";
import { SourceConfig } from "../pipeline.config.js";

export interface RawProduct {
  source: string;
  name: string | null;
  price: string | null;
  rating: string | null;
  image: string | null;
  url: string | null;
  availability: string | null;
  _scraped_at: string;
  _source_url: string;
}

export async function extractWithPlaywright(config: SourceConfig): Promise<RawProduct[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const allProducts: RawProduct[] = [];
  let pageNum = 1;

  try {
    await page.goto(config.url, { waitUntil: "networkidle" });

    while (true) {
      // Wait for product cards to render
      await page.waitForSelector(config.selectors!.container, { timeout: 10000 });

      // Extract all products on current page
      const products = await page.$$eval(
        config.selectors!.container,
        (elements, fields) => {
          return elements.map((el) => {
            const result: Record<string, string | null> = {};
            for (const [field, selector] of Object.entries(fields as Record<string, string>)) {
              // Handle @attr syntax for extracting attributes
              const [sel, attr] = selector.split("@");
              const target = el.querySelector(sel);
              if (attr) {
                result[field] = target?.getAttribute(attr) || null;
              } else {
                result[field] = target?.textContent?.trim() || null;
              }
            }
            return result;
          });
        },
        config.selectors!.fields
      );

      const timestamped: RawProduct[] = products.map((p) => ({
        source: config.name,
        ...p,
        _scraped_at: new Date().toISOString(),
        _source_url: page.url(),
      } as RawProduct));

      allProducts.push(...timestamped);
      console.log(`  Page ${pageNum}: ${products.length} products (total: ${allProducts.length})`);

      // Try to go to next page
      const nextButton = await page.$("a[aria-label='Next page'], button.next-page");
      if (!nextButton || pageNum >= 20) break;  // Safety limit

      await nextButton.click();
      await page.waitForLoadState("networkidle");
      await new Promise((r) => setTimeout(r, config.rateLimit));
      pageNum++;
    }
  } finally {
    await browser.close();
  }

  return allProducts;
}
```

### Step 3: Validate and Transform

Raw scraped data is messy — prices come as "$1,299.99" or "From $999", ratings as "4.5 out of 5 stars" or "★★★★☆". The transform layer normalizes everything to a consistent format.

```typescript
// transform.ts — Clean and normalize scraped product data
/**
 * Takes raw scraped products and outputs clean, validated records
 * ready for database insertion. Handles price parsing, rating
 * normalization, URL resolution, and data quality checks.
 */
import { RawProduct } from "./extractors/playwright-extractor.js";

export interface CleanProduct {
  source: string;
  name: string;
  price_cents: number;              // Price in cents (integer, no floats)
  currency: string;
  rating: number | null;            // 0-5 scale
  rating_count: number | null;
  image_url: string | null;
  product_url: string;
  in_stock: boolean;
  scraped_at: string;
  content_hash: string;             // For deduplication
}

export function transform(raw: RawProduct[]): CleanProduct[] {
  const clean: CleanProduct[] = [];
  const errors: Array<{ product: RawProduct; error: string }> = [];

  for (const product of raw) {
    try {
      // Skip products missing required fields
      if (!product.name || !product.price) {
        errors.push({ product, error: "Missing name or price" });
        continue;
      }

      const priceCents = parsePrice(product.price);
      if (priceCents === null || priceCents <= 0) {
        errors.push({ product, error: `Invalid price: ${product.price}` });
        continue;
      }

      const cleaned: CleanProduct = {
        source: product.source,
        name: product.name.trim().slice(0, 500), // Truncate extreme lengths
        price_cents: priceCents,
        currency: detectCurrency(product.price),
        rating: parseRating(product.rating),
        rating_count: null,
        image_url: product.image ? resolveUrl(product.image, product._source_url) : null,
        product_url: product.url ? resolveUrl(product.url, product._source_url) : product._source_url,
        in_stock: parseAvailability(product.availability),
        scraped_at: product._scraped_at,
        content_hash: "", // Computed below
      };

      // Content hash for deduplication — based on source + URL + price
      cleaned.content_hash = computeHash(
        `${cleaned.source}|${cleaned.product_url}|${cleaned.price_cents}`
      );

      clean.push(cleaned);
    } catch (error: any) {
      errors.push({ product, error: error.message });
    }
  }

  if (errors.length > 0) {
    console.log(`  ⚠️ ${errors.length} products failed validation`);
  }

  return clean;
}

function parsePrice(raw: string): number | null {
  // Handle: "$1,299.99", "From $999", "€49.90", "1299", "Price: $50"
  const match = raw.match(/[\d,.]+/);
  if (!match) return null;

  const cleaned = match[0].replace(/,/g, "");
  const dollars = parseFloat(cleaned);
  if (isNaN(dollars)) return null;

  return Math.round(dollars * 100);  // Convert to cents
}

function detectCurrency(raw: string): string {
  if (raw.includes("€")) return "EUR";
  if (raw.includes("£")) return "GBP";
  if (raw.includes("¥")) return "JPY";
  return "USD";  // Default
}

function parseRating(raw: string | null): number | null {
  if (!raw) return null;
  // Handle: "4.5 out of 5", "4.5/5", "★★★★☆", "4.5"
  const match = raw.match(/([\d.]+)\s*(?:out of|\/)\s*5/i) || raw.match(/([\d.]+)/);
  if (!match) {
    // Count star characters
    const stars = (raw.match(/★/g) || []).length;
    return stars > 0 ? stars : null;
  }
  const rating = parseFloat(match[1]);
  return rating >= 0 && rating <= 5 ? rating : null;
}

function parseAvailability(raw: string | null): boolean {
  if (!raw) return true;  // Assume in stock if not specified
  const lower = raw.toLowerCase();
  return !lower.includes("out of stock") && !lower.includes("unavailable") && !lower.includes("sold out");
}

function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function computeHash(input: string): string {
  const { createHash } = require("crypto");
  return createHash("md5").update(input).digest("hex");
}
```

### Step 4: Load into Supabase with Price Change Detection

```typescript
// loader.ts — Load products into Supabase with price change tracking
/**
 * Batch upserts products into Supabase Postgres. Detects price
 * changes and inserts history records. Uses RLS-compatible
 * service role key for server-side operations.
 */
import { createClient } from "@supabase/supabase-js";
import { CleanProduct } from "./transform.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!  // Service role for server-side writes
);

interface LoadResult {
  inserted: number;
  updated: number;
  priceChanges: number;
  errors: number;
}

export async function loadProducts(products: CleanProduct[]): Promise<LoadResult> {
  let inserted = 0, updated = 0, priceChanges = 0, errors = 0;

  for (const batch of chunk(products, 100)) {
    // Check for existing products to detect price changes
    const urls = batch.map((p) => p.product_url);
    const { data: existing } = await supabase
      .from("products")
      .select("product_url, price_cents")
      .in("product_url", urls);

    const existingMap = new Map(
      (existing || []).map((e) => [e.product_url, e.price_cents])
    );

    // Detect price changes
    const changes = batch.filter((p) => {
      const oldPrice = existingMap.get(p.product_url);
      return oldPrice !== undefined && oldPrice !== p.price_cents;
    });

    if (changes.length > 0) {
      // Insert price history records
      const historyRecords = changes.map((p) => ({
        product_url: p.product_url,
        old_price_cents: existingMap.get(p.product_url),
        new_price_cents: p.price_cents,
        source: p.source,
        changed_at: new Date().toISOString(),
      }));

      await supabase.from("price_history").insert(historyRecords);
      priceChanges += changes.length;
      console.log(`  💰 ${changes.length} price changes detected`);
    }

    // Upsert products
    const { error } = await supabase
      .from("products")
      .upsert(
        batch.map((p) => ({
          ...p,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "product_url" }
      );

    if (error) {
      errors++;
      console.log(`  ❌ Batch error: ${error.message}`);
    } else {
      const newCount = batch.filter((p) => !existingMap.has(p.product_url)).length;
      inserted += newCount;
      updated += batch.length - newCount;
    }
  }

  return { inserted, updated, priceChanges, errors };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

### Step 5: Schedule and Monitor

```typescript
// run-pipeline.ts — Orchestrate the full ETL pipeline
/**
 * Main entry point — runs the complete pipeline for all sources.
 * Designed to be called by cron or a scheduler.
 */
import { sources } from "./pipeline.config.js";
import { extractWithPlaywright } from "./extractors/playwright-extractor.js";
import { transform } from "./transform.js";
import { loadProducts } from "./loader.js";

async function runPipeline() {
  console.log(`🚀 Pipeline started: ${new Date().toISOString()}`);
  const results: Record<string, any> = {};

  for (const source of sources) {
    console.log(`\n📡 Processing: ${source.name}`);
    const start = Date.now();

    try {
      // Extract
      const raw = source.type === "playwright"
        ? await extractWithPlaywright(source)
        : []; // Add other extractors as needed

      console.log(`  📥 Extracted: ${raw.length} raw products`);

      // Transform
      const clean = transform(raw);
      console.log(`  🔄 Transformed: ${clean.length} clean products`);

      // Load
      const loadResult = await loadProducts(clean);
      console.log(`  💾 Loaded: +${loadResult.inserted} new, ${loadResult.updated} updated, ${loadResult.priceChanges} price changes`);

      results[source.name] = {
        status: "success",
        extracted: raw.length,
        loaded: clean.length,
        priceChanges: loadResult.priceChanges,
        duration: ((Date.now() - start) / 1000).toFixed(1) + "s",
      };
    } catch (error: any) {
      console.log(`  ❌ Failed: ${error.message}`);
      results[source.name] = {
        status: "error",
        error: error.message,
        duration: ((Date.now() - start) / 1000).toFixed(1) + "s",
      };
    }
  }

  console.log("\n📊 Pipeline Summary:");
  console.table(results);
}

runPipeline().catch(console.error);
```

## The Outcome

Nadia's pipeline runs every 6 hours across 12 competitor sites. Each source is independent — when competitor-a redesigns their product page (breaking the CSS selectors), only that extractor fails while the other 11 continue working. The fix is a single selector update, not a pipeline rewrite.

Price changes are tracked automatically. When a competitor drops their price on a popular product, the price_history table records it and Supabase real-time pushes a notification to the dashboard. Nadia's customers see updated pricing within hours, not days.

The separation of extract/validate/transform/load means each stage is testable. Mock data goes through the transformer to verify price parsing handles every currency format. The loader is tested against a staging database. When something breaks, the error logs show exactly which stage, which source, and which product failed.
