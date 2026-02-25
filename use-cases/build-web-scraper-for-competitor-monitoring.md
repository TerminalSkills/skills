---
title: Build a Web Scraper for Competitor Price Monitoring
slug: build-web-scraper-for-competitor-monitoring
description: >-
  A small e-commerce business needs to track competitor prices across 5 websites
  daily. They build a scraping pipeline that uses Cheerio for static pages and
  Puppeteer for JavaScript-rendered sites, stores results in a database, and
  sends Slack alerts when competitors change prices by more than 10%.
skills:
  - cheerio
  - puppeteer
  - postgresql
category: automation
tags:
  - scraping
  - monitoring
  - prices
  - automation
  - cheerio
  - puppeteer
---

# Build a Web Scraper for Competitor Price Monitoring

Ravi runs a small online electronics store. He manually checks 5 competitor websites every morning, scanning for price changes on 50 products he also sells. It takes 45 minutes and he still misses things. He wants to automate it — scrape competitor prices daily, store the history, and get alerts when a competitor drops their price by more than 10%.

Some competitor sites are server-rendered HTML (fast to scrape with Cheerio), while others are React SPAs that need a real browser. The pipeline needs to handle both.

## Step 1: Define the Scraping Targets

First, Ravi maps out each competitor site: what selectors to use, and whether it needs a browser.

```javascript
// config/competitors.js — Scraping targets with site-specific selectors
// Each site gets a scraping strategy: 'static' (Cheerio) or 'dynamic' (Puppeteer)

export const competitors = [
  {
    name: 'TechDirect',
    baseUrl: 'https://techdirect.example.com',
    strategy: 'static',           // server-rendered HTML, Cheerio works
    productUrlPattern: '/products/{sku}',
    selectors: {
      price: '.product-price .current',
      originalPrice: '.product-price .original',    // strikethrough price
      inStock: '.stock-status',
      title: 'h1.product-title',
    },
    priceParser: (text) => parseFloat(text.replace(/[^0-9.]/g, '')),
  },
  {
    name: 'GadgetWorld',
    baseUrl: 'https://gadgetworld.example.com',
    strategy: 'dynamic',          // React SPA, needs Puppeteer
    productUrlPattern: '/item/{sku}',
    selectors: {
      price: '[data-testid="price-value"]',
      inStock: '[data-testid="availability"]',
      title: '[data-testid="product-name"]',
    },
    waitForSelector: '[data-testid="price-value"]',    // wait for this to appear
    priceParser: (text) => parseFloat(text.replace(/[^0-9.]/g, '')),
  },
  // ... more competitors
]

export const trackedProducts = [
  { sku: 'IPHONE15PRO', name: 'iPhone 15 Pro 256GB', ourPrice: 999 },
  { sku: 'GALAXYS24', name: 'Galaxy S24 Ultra', ourPrice: 1199 },
  { sku: 'MACBOOKM3', name: 'MacBook Pro M3 14"', ourPrice: 1999 },
  // ... 50 products
]
```

## Step 2: Build the Static Scraper (Cheerio)

For server-rendered sites, Cheerio is the right tool — no browser overhead, fast, and lightweight.

```javascript
// scrapers/static-scraper.js — Scrape server-rendered pages with fetch + Cheerio
// Handles rate limiting, retries, and user-agent rotation

import * as cheerio from 'cheerio'

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

export async function scrapeStatic(url, selectors, priceParser, retries = 3) {
  /**
   * Scrape a static HTML page using fetch + Cheerio.
   * Retries on failure with exponential backoff.
   *
   * Args:
   *   url: Full URL to scrape
   *   selectors: Object with CSS selectors for price, title, inStock
   *   priceParser: Function to extract number from price text
   *   retries: Number of retry attempts
   */
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const html = await response.text()
      const $ = cheerio.load(html)

      const priceText = $(selectors.price).first().text().trim()
      const price = priceParser(priceText)

      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price parsed: "${priceText}" → ${price}`)
      }

      return {
        price,
        originalPrice: selectors.originalPrice
          ? priceParser($(selectors.originalPrice).first().text().trim()) || null
          : null,
        inStock: $(selectors.inStock).text().toLowerCase().includes('in stock'),
        title: $(selectors.title).first().text().trim(),
        scrapedAt: new Date().toISOString(),
      }
    } catch (err) {
      if (attempt === retries - 1) throw err
      // Exponential backoff: 2s, 4s, 8s
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)))
    }
  }
}
```

## Step 3: Build the Dynamic Scraper (Puppeteer)

For JavaScript-rendered sites, Puppeteer launches a real browser. The stealth plugin helps avoid bot detection.

```javascript
// scrapers/dynamic-scraper.js — Scrape SPAs with Puppeteer
// Uses puppeteer-extra-plugin-stealth to bypass bot detection

import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

let browser = null

export async function initBrowser() {
  /** Launch a shared browser instance for all dynamic scraping. */
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    })
  }
  return browser
}

export async function scrapeDynamic(url, selectors, priceParser, waitForSelector) {
  /**
   * Scrape a JavaScript-rendered page using Puppeteer.
   *
   * Args:
   *   url: Full URL to scrape
   *   selectors: Object with CSS selectors for price, title, inStock
   *   priceParser: Function to extract number from price text
   *   waitForSelector: CSS selector to wait for before extracting data
   */
  const b = await initBrowser()
  const page = await b.newPage()

  try {
    // Block images and fonts for faster loading
    await page.setRequestInterception(true)
    page.on('request', req => {
      if (['image', 'font', 'stylesheet'].includes(req.resourceType())) {
        req.abort()
      } else {
        req.continue()
      }
    })

    await page.setViewport({ width: 1920, height: 1080 })
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 })
    }

    const data = await page.evaluate((sels) => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || ''
      return {
        priceText: getText(sels.price),
        inStockText: getText(sels.inStock),
        titleText: getText(sels.title),
      }
    }, selectors)

    const price = priceParser(data.priceText)
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price: "${data.priceText}" → ${price}`)
    }

    return {
      price,
      inStock: data.inStockText.toLowerCase().includes('in stock'),
      title: data.titleText,
      scrapedAt: new Date().toISOString(),
    }
  } finally {
    await page.close()    // close page, keep browser for reuse
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
  }
}
```

## Step 4: Orchestrate the Pipeline

The main script iterates through all competitors and products, choosing the right scraper for each site.

```javascript
// scripts/scrape-all.js — Main orchestrator: scrape all competitors, store results, alert
import { competitors, trackedProducts } from '../config/competitors.js'
import { scrapeStatic } from '../scrapers/static-scraper.js'
import { scrapeDynamic, initBrowser, closeBrowser } from '../scrapers/dynamic-scraper.js'
import { savePriceRecord, getLastPrice } from '../lib/database.js'
import { sendAlert } from '../lib/alerts.js'

async function scrapeAll() {
  console.log(`Starting price scrape: ${competitors.length} sites × ${trackedProducts.length} products`)

  const results = []
  const errors = []

  for (const competitor of competitors) {
    for (const product of trackedProducts) {
      const url = `${competitor.baseUrl}${competitor.productUrlPattern.replace('{sku}', product.sku)}`

      try {
        let data
        if (competitor.strategy === 'static') {
          data = await scrapeStatic(url, competitor.selectors, competitor.priceParser)
        } else {
          data = await scrapeDynamic(url, competitor.selectors, competitor.priceParser, competitor.waitForSelector)
        }

        data.competitor = competitor.name
        data.sku = product.sku
        data.productName = product.name
        data.ourPrice = product.ourPrice

        // Save to database
        await savePriceRecord(data)

        // Check for significant price changes
        const lastPrice = await getLastPrice(competitor.name, product.sku)
        if (lastPrice && lastPrice.price !== data.price) {
          const changePercent = ((data.price - lastPrice.price) / lastPrice.price * 100).toFixed(1)
          data.changePercent = changePercent

          if (Math.abs(changePercent) >= 10) {
            await sendAlert({
              product: product.name,
              competitor: competitor.name,
              oldPrice: lastPrice.price,
              newPrice: data.price,
              changePercent,
              ourPrice: product.ourPrice,
            })
          }
        }

        results.push(data)

        // Polite delay between requests to same site
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000))
      } catch (err) {
        errors.push({ competitor: competitor.name, sku: product.sku, error: err.message })
        console.error(`Failed: ${competitor.name}/${product.sku}: ${err.message}`)
      }
    }
  }

  await closeBrowser()

  console.log(`Done: ${results.length} prices scraped, ${errors.length} errors`)
  return { results, errors }
}

scrapeAll()
```

The 2-5 second random delay between requests is intentional — it mimics human browsing patterns and avoids triggering rate limits. Scraping 50 products across 5 sites takes about 10-15 minutes, which is fine for a daily job.

## Step 5: Store Price History

```javascript
// lib/database.js — PostgreSQL storage for price history
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export async function savePriceRecord(data) {
  await pool.query(`
    INSERT INTO price_history (competitor, sku, product_name, price, original_price, in_stock, scraped_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [data.competitor, data.sku, data.productName, data.price, data.originalPrice, data.inStock, data.scrapedAt])
}

export async function getLastPrice(competitor, sku) {
  const result = await pool.query(`
    SELECT price, scraped_at FROM price_history
    WHERE competitor = $1 AND sku = $2
    ORDER BY scraped_at DESC LIMIT 1 OFFSET 1
  `, [competitor, sku])
  return result.rows[0] || null
}
```

After a month of daily scraping, Ravi has a complete price history for every competitor product. He can see trends, spot patterns (like competitors running sales on weekends), and automatically adjust his own prices to stay competitive. The 45-minute daily manual check is now a 15-minute automated cron job that runs while he sleeps.
