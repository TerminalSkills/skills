---
title: "Build a Web Scraper with AI Data Extraction"
description: "Scrape any website with Playwright for JS rendering, clean content automatically, and use Claude to extract structured data matching your schema — no brittle CSS selectors."
skills: [playwright, anthropic-sdk, firecrawl]
difficulty: intermediate
time_estimate: "4 hours"
tags: [web-scraping, playwright, ai, claude, data-extraction, firecrawl, json, csv, automation]
---

# Build a Web Scraper with AI Data Extraction

**Persona:** You're a data analyst at an e-commerce company. You need to track competitor pricing from 50 websites every week. Each site has a different structure — CSS selectors break constantly. You want to describe what you need and have AI figure out the rest.

---

## What You'll Build

- **Playwright fetcher** for JS-rendered pages
- **Content cleaner** that strips nav/footer/ads
- **AI extractor** using Claude with a typed schema
- **Pagination handler** with rate limiting
- **Export** to JSON, CSV, or webhook

---

## Step 1: Fetch with Playwright

```ts
// lib/fetcher.ts
import { chromium, type Browser } from 'playwright';

let browser: Browser | null = null;

async function getBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true });
  return browser;
}

export async function fetchPage(url: string): Promise<string> {
  const b = await getBrowser();
  const page = await b.newPage();

  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)',
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for main content to render
    await page.waitForSelector('main, article, [role="main"], body', { timeout: 5000 }).catch(() => {});
    return await page.content();
  } finally {
    await page.close();
  }
}
```

Install: `npm install playwright && npx playwright install chromium`

---

## Step 2: Clean HTML Content

Remove noise — keep only the meaningful text:

```ts
// lib/cleaner.ts
import * as cheerio from 'cheerio';

export function cleanHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove noise elements
  $('nav, header, footer, aside, script, style, iframe, [role="navigation"], [role="banner"], [role="complementary"], .ad, .advertisement, .cookie-banner, #comments').remove();

  // Get main content area if available
  const main = $('main, article, [role="main"], .content, #content, .post-body').first();
  const target = main.length ? main : $('body');

  // Extract clean text with structure
  const lines: string[] = [];
  target.find('h1, h2, h3, h4, p, li, td, th, [class*="price"], [class*="title"], [class*="name"]').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.length > 10) lines.push(text);
  });

  return lines.join('\n');
}
```

Install: `npm install cheerio`

---

## Step 3: AI Extraction with Schema

Define your schema and let Claude extract matching data:

```ts
// lib/extractor.ts
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic();

// Define what you want to extract
const ProductSchema = z.object({
  name: z.string(),
  price: z.number().nullable(),
  currency: z.string().default('USD'),
  sku: z.string().nullable(),
  availability: z.enum(['in_stock', 'out_of_stock', 'unknown']),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().nullable(),
});

type Product = z.infer<typeof ProductSchema>;

export async function extractProducts(content: string, url: string): Promise<Product[]> {
  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Extract product information from this webpage content. Return a JSON array of products.

Schema for each product:
- name: product name (string)
- price: numeric price without currency symbol (number or null)
- currency: currency code like USD, EUR (string, default USD)
- sku: product SKU or ID if visible (string or null)
- availability: "in_stock", "out_of_stock", or "unknown"
- rating: star rating 0-5 (number or null)
- reviewCount: number of reviews (number or null)

URL: ${url}
Content:
${content.slice(0, 4000)}

Return ONLY valid JSON array, no explanation.`,
    }],
  });

  const text = (message.content[0] as any).text;
  const raw = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
  return raw.map((item: any) => ProductSchema.parse(item));
}
```

---

## Step 4: Pagination + Rate Limiting

```ts
// lib/crawler.ts
import { fetchPage } from './fetcher';
import { cleanHtml } from './cleaner';
import { extractProducts } from './extractor';
import pLimit from 'p-limit';

const limit = pLimit(2); // max 2 concurrent requests

export async function scrapeWithPagination(
  baseUrl: string,
  maxPages = 5
): Promise<any[]> {
  const results: any[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${baseUrl}?page=${page}`;
    console.log(`Scraping page ${page}...`);

    const html = await fetchPage(url);
    const content = cleanHtml(html);
    const items = await extractProducts(content, url);

    if (items.length === 0) {
      console.log('No more items found, stopping pagination');
      break;
    }

    results.push(...items);

    // Polite delay: 2-4 seconds between requests
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }

  return results;
}

// Scrape multiple sites concurrently with rate limit
export async function scrapeMany(urls: string[]) {
  const tasks = urls.map(url =>
    limit(async () => {
      const html = await fetchPage(url);
      const content = cleanHtml(html);
      return { url, items: await extractProducts(content, url) };
    })
  );
  return Promise.all(tasks);
}
```

Install: `npm install p-limit`

---

## Step 5: Using Firecrawl for Faster Extraction

For sites that are harder to scrape, use Firecrawl as a drop-in alternative:

```ts
// lib/firecrawl-fetch.ts
import FirecrawlApp from '@mendable/firecrawl-js';

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

export async function fetchWithFirecrawl(url: string) {
  const result = await app.scrapeUrl(url, {
    formats: ['markdown'],
    onlyMainContent: true,
  });
  return result.markdown ?? '';
}

// Crawl a whole site
export async function crawlSite(url: string, maxPages = 10) {
  const result = await app.crawlUrl(url, {
    limit: maxPages,
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  });
  return result.data?.map(p => p.markdown).filter(Boolean) ?? [];
}
```

---

## Step 6: Export to JSON / CSV / Webhook

```ts
// scripts/export.ts
import { createObjectCsvWriter } from 'csv-writer';
import { writeFileSync } from 'fs';

export async function exportToCSV(data: any[], path: string) {
  if (!data.length) return;
  const writer = createObjectCsvWriter({
    path,
    header: Object.keys(data[0]).map(k => ({ id: k, title: k.toUpperCase() })),
  });
  await writer.writeRecords(data);
  console.log(`Exported ${data.length} rows to ${path}`);
}

export function exportToJSON(data: any[], path: string) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export async function sendToWebhook(data: any[], webhookUrl: string) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, timestamp: new Date().toISOString() }),
  });
}
```

---

## Key Outcomes

- Scrapes any JS-rendered site without brittle CSS selectors
- AI adapts to layout changes automatically
- 50 competitor sites scraped in ~15 minutes
- Clean JSON/CSV output ready for analysis
- Respects rate limits — won't get your IP banned
