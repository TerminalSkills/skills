---
name: crawlee
description: >-
  Build reliable web scrapers and crawlers with Crawlee — Apify's open-source
  framework for structured web scraping. Use when someone asks to "scrape a
  website", "build a crawler", "Crawlee", "web scraping at scale", "scrape
  JavaScript-rendered pages", "crawl with Playwright/Puppeteer", or "extract
  data from websites reliably". Covers HTTP crawling, browser crawling,
  request queues, proxy rotation, and data export.
license: Apache-2.0
compatibility: "Node.js 16+ (20+ recommended). Optional: Playwright or Puppeteer for JS-rendered pages."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/apify/crawlee
  category: data-ai
  tags: ["scraping", "crawling", "crawlee", "apify", "playwright"]
---

# Crawlee

## Overview

Crawlee is a web scraping and crawling library that handles the hard parts — request queuing, retries, proxy rotation, browser fingerprinting, and rate limiting. Use Cheerio for fast HTML-only scraping or Playwright/Puppeteer for JavaScript-rendered pages. Built-in storage for datasets, request queues, and key-value stores. Scales from single pages to millions of URLs.

## When to Use

- Scraping data from websites (product prices, job listings, articles)
- Crawling entire sites for content or link analysis
- JavaScript-rendered pages (SPAs, React/Vue sites)
- Scraping at scale with proxy rotation and anti-blocking
- Structured data extraction with automatic retries

## Instructions

### Setup

```bash
npx crawlee create my-crawler        # official template, or add to an existing project:
npm install crawlee                  # CheerioCrawler / HttpCrawler only
npm install crawlee playwright       # browser crawling (Playwright or Puppeteer are separate installs)
npx playwright install chromium
```

Use ES modules (`"type": "module"` in package.json) so top-level `await crawler.run(...)` works. Checked against crawlee 3.18.

### HTTP Crawling with Routing (Fast, No Browser)

Give start requests a `label` and route them to handlers with a router; `enqueueLinks` stays on the same hostname by default and deduplicates URLs.

```typescript
// scraper.ts
import { CheerioCrawler, Dataset, createCheerioRouter } from "crawlee";

const router = createCheerioRouter();

router.addHandler("LISTING", async ({ enqueueLinks }) => {
  await enqueueLinks({ selector: "article.product_pod h3 a", label: "DETAIL" });
  await enqueueLinks({ selector: "li.next a", label: "LISTING" }); // pagination
});

router.addHandler("DETAIL", async ({ request, $, pushData }) => {
  await pushData({
    url: request.loadedUrl,
    title: $("h1").text().trim(),
    price: $(".price_color").first().text().trim(),
    scrapedAt: new Date().toISOString(),
  });
});

const crawler = new CheerioCrawler({
  requestHandler: router,
  maxConcurrency: 10,
  maxRequestRetries: 3,
  maxRequestsPerMinute: 300,       // politeness cap
  maxRequestsPerCrawl: 500,        // safety limit while developing
  respectRobotsTxtFile: true,      // skip URLs disallowed by robots.txt
  failedRequestHandler({ request, log }) {
    log.error(`Failed: ${request.url} after ${request.retryCount} retries`);
  },
});

await crawler.run([{ url: "https://books.toscrape.com/", label: "LISTING" }]);

const dataset = await Dataset.open();
await dataset.exportToCSV("books");   // saved in the key-value store as books.csv
```

Run it with `npx tsx scraper.ts`. Results land in `./storage/datasets/default/*.json` and the CSV in `./storage/key_value_stores/default/books.csv`. Set `CRAWLEE_STORAGE_DIR` to move the folder.

### Browser Crawling (JavaScript-Rendered Pages)

```typescript
// browser-scraper.ts
import { PlaywrightCrawler } from "crawlee";

const crawler = new PlaywrightCrawler({
  maxConcurrency: 5,           // browsers are heavy
  headless: true,              // set false to watch while developing

  async requestHandler({ page, request, pushData, infiniteScroll, log }) {
    await page.waitForSelector(".product-card");   // wait for the rendered content
    await infiniteScroll({ timeoutSecs: 20 });     // built-in helper for lazy lists

    const items = await page.$$eval(".product-card", (cards) =>
      cards.map((card) => ({
        name: card.querySelector("h3")?.textContent?.trim(),
        price: card.querySelector(".price")?.textContent?.trim(),
      }))
    );
    log.info(`${items.length} products on ${request.url}`);
    await pushData(items.map((item) => ({ ...item, sourceUrl: request.url })));
  },
});

await crawler.run(["https://shop.acme-outdoors.com/products"]);
```

Crawlee's browser crawlers apply browser fingerprints by default, so extra launch flags to hide automation are rarely needed. Prefer `waitForSelector` or `locator` waits over fixed `waitForTimeout` sleeps.

### Proxy Rotation

```typescript
import { CheerioCrawler, ProxyConfiguration } from "crawlee";

const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: [
    `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@proxy-eu.acme-proxies.net:8080`,
    `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@proxy-us.acme-proxies.net:8080`,
  ],
});

const crawler = new CheerioCrawler({
  proxyConfiguration,
  useSessionPool: true,   // ties cookies and proxies to sessions; blocked sessions are retired
  async requestHandler({ request, proxyInfo, log }) {
    log.info(`${request.url} via ${proxyInfo?.hostname}`);
  },
});
```

## Examples

### Example 1: Scrape product data from an e-commerce site

**User prompt:** "Scrape all product names, prices, and ratings from books.toscrape.com and export to CSV."

The agent installs crawlee, builds a CheerioCrawler with a LISTING/DETAIL router following the "next" links, runs it, and exports `books.csv` from the default key-value store. The run log ends with `Finished! Total N requests: N succeeded, 0 failed`.

### Example 2: Monitor competitor prices

**User prompt:** "Build a daily scraper that checks competitor prices and alerts when they change."

The agent builds a PlaywrightCrawler for the JS-rendered shop, saves prices into a named dataset (so the default purge does not erase history), compares each run with the previous one, and prints or sends the price changes.

## Guidelines

- **Cheerio for static HTML** - much faster and lighter than a browser; use Playwright only when content needs JavaScript.
- **Routers and labels** - one handler per page type keeps listing and detail logic apart.
- **`pushData` for output** - writes to the default dataset; export with `exportToCSV` / `exportToJSON` or read with `getData()`.
- **Default storage is purged at the start of each run** - copy results out, or use a named storage (`Dataset.open("books")`) to keep data across runs. Do not rely on it for incremental "compare with last run" without a named dataset.
- **Be polite** - keep `respectRobotsTxtFile: true`, set `maxRequestsPerMinute`, and check the site's terms before scraping.
- **Limit while developing** - `maxRequestsPerCrawl` stops a runaway crawl.
- **Handle failures** - `failedRequestHandler` runs after retries are exhausted; check `request.retryCount`.
- **Proxy credentials from the environment** - never hardcode them in source.
