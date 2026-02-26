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
compatibility: "Node.js 18+. Optional: Playwright or Puppeteer for JS-rendered pages."
metadata:
  author: terminal-skills
  version: "1.0.0"
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
npm install crawlee playwright
npx playwright install chromium  # Only for browser crawling
```

### HTTP Crawling (Fast, No Browser)

```typescript
// scraper.ts — Fast scraping with Cheerio (no browser needed)
import { CheerioCrawler, Dataset } from "crawlee";

const crawler = new CheerioCrawler({
  maxConcurrency: 10,          // Parallel requests
  maxRequestRetries: 3,        // Retry failed requests
  requestHandlerTimeoutSecs: 30,

  async requestHandler({ request, $, enqueueLinks, pushData }) {
    // $ is Cheerio — jQuery-like selector API
    const title = $("h1").text().trim();
    const price = $("[data-testid='price']").text().trim();
    const description = $("meta[name='description']").attr("content");

    // Save structured data
    await pushData({
      url: request.url,
      title,
      price,
      description,
      scrapedAt: new Date().toISOString(),
    });

    // Follow pagination links
    await enqueueLinks({
      selector: "a.next-page",
      label: "LISTING",
    });
  },

  // Handle different page types
  async failedRequestHandler({ request }) {
    console.error(`Failed: ${request.url} after ${request.retryCount} retries`);
  },
});

// Start crawling
await crawler.run(["https://example-shop.com/products"]);

// Export data
const dataset = await Dataset.open();
await dataset.exportToCSV("products");
```

### Browser Crawling (JavaScript-Rendered Pages)

```typescript
// browser-scraper.ts — Scrape JS-rendered pages with Playwright
import { PlaywrightCrawler } from "crawlee";

const crawler = new PlaywrightCrawler({
  maxConcurrency: 5,           // Fewer concurrent — browsers are heavy
  headless: true,
  launchContext: {
    launchOptions: {
      args: ["--disable-blink-features=AutomationControlled"],
    },
  },

  async requestHandler({ page, request, pushData, enqueueLinks }) {
    // Wait for dynamic content to load
    await page.waitForSelector("[data-loaded='true']", { timeout: 10000 });

    // Extract data using Playwright selectors
    const items = await page.$$eval(".product-card", (cards) =>
      cards.map((card) => ({
        name: card.querySelector("h3")?.textContent?.trim(),
        price: card.querySelector(".price")?.textContent?.trim(),
        rating: card.querySelector(".stars")?.getAttribute("data-rating"),
      }))
    );

    for (const item of items) {
      await pushData({ ...item, sourceUrl: request.url });
    }

    // Scroll to load more (infinite scroll)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // Click "Load More" if exists
    const loadMore = page.locator("button:has-text('Load More')");
    if (await loadMore.isVisible()) {
      await loadMore.click();
      await page.waitForLoadState("networkidle");
    }
  },
});

await crawler.run(["https://spa-example.com/products"]);
```

### Proxy Rotation

```typescript
// proxy-scraper.ts — Rotate proxies to avoid blocking
import { CheerioCrawler, ProxyConfiguration } from "crawlee";

const proxyConfig = new ProxyConfiguration({
  proxyUrls: [
    "http://user:pass@proxy1.example.com:8080",
    "http://user:pass@proxy2.example.com:8080",
    "http://user:pass@proxy3.example.com:8080",
  ],
});

const crawler = new CheerioCrawler({
  proxyConfiguration: proxyConfig,
  // Crawlee automatically rotates and retires failing proxies
  async requestHandler({ request, $, pushData, proxyInfo }) {
    console.log(`Using proxy: ${proxyInfo?.url}`);
    // ... scraping logic
  },
});
```

## Examples

### Example 1: Scrape product data from an e-commerce site

**User prompt:** "Scrape all product names, prices, and ratings from example-shop.com and export to CSV."

The agent will create a CheerioCrawler with pagination handling, structured data extraction, and CSV export.

### Example 2: Monitor competitor prices

**User prompt:** "Build a daily scraper that checks competitor prices and alerts when they change."

The agent will create a PlaywrightCrawler for JS-rendered pages, store prices in a dataset, compare with previous runs, and send alerts on changes.

## Guidelines

- **Cheerio for static HTML** — 10x faster than browser crawling
- **Playwright for SPAs** — use only when JavaScript rendering is required
- **`enqueueLinks` for crawling** — automatically follows and deduplicates links
- **`pushData` for structured output** — builds a dataset that exports to CSV/JSON
- **Proxy rotation for scale** — Crawlee retires failing proxies automatically
- **Respect robots.txt** — check `robotsTxtUrl` in crawler config
- **Rate limit** — `maxRequestsPerMinute` to avoid overwhelming targets
- **Request labels** — use labels to route different page types to different handlers
- **Error handling** — `failedRequestHandler` catches and logs failed URLs
- **Storage persists** — datasets and queues survive restarts by default
