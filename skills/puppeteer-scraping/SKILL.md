---
name: puppeteer-scraping
description: >-
  Scrape dynamic websites with Puppeteer. Use when a user asks to scrape
  JavaScript-rendered pages, extract data from SPAs, take screenshots of
  websites, automate form submissions, or crawl pages that require a browser.
license: Apache-2.0
compatibility: 'Node.js 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: scraping
  tags:
    - puppeteer
    - scraping
    - browser
    - automation
    - headless
---

# Puppeteer Scraping

## Overview

Puppeteer controls headless Chrome for scraping JavaScript-rendered pages that static HTTP requests can't handle. It waits for dynamic content, handles authentication, and can interact with SPAs.

## Instructions

### Step 1: Basic Scraping

```typescript
// scraper.ts — Scrape a JavaScript-rendered page
import puppeteer from 'puppeteer'

async function scrapeProducts(url: string) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  // Set viewport and user agent
  await page.setViewport({ width: 1280, height: 720 })
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

  await page.goto(url, { waitUntil: 'networkidle0' })

  // Wait for dynamic content to render
  await page.waitForSelector('.product-card')

  // Extract data from the page
  const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.product-card')).map(card => ({
      name: card.querySelector('h2')?.textContent?.trim(),
      price: card.querySelector('.price')?.textContent?.trim(),
      url: card.querySelector('a')?.href,
      image: card.querySelector('img')?.src,
    }))
  })

  await browser.close()
  return products
}
```

### Step 2: Handle Pagination

```typescript
async function scrapeAllPages(baseUrl: string) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  let allItems = []
  let currentPage = 1

  while (true) {
    await page.goto(`${baseUrl}?page=${currentPage}`, { waitUntil: 'networkidle0' })

    const items = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.item')).map(el => ({
        title: el.querySelector('h3')?.textContent?.trim(),
        link: el.querySelector('a')?.href,
      }))
    )

    if (items.length === 0) break    // no more pages
    allItems.push(...items)
    currentPage++

    // Be respectful — add delay between requests
    await new Promise(r => setTimeout(r, 2000))
  }

  await browser.close()
  return allItems
}
```

### Step 3: Screenshots and PDFs

```typescript
// Take screenshot
await page.screenshot({ path: 'screenshot.png', fullPage: true })

// Generate PDF
await page.pdf({
  path: 'page.pdf',
  format: 'A4',
  printBackground: true,
  margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
})
```

## Guidelines

- Use `waitUntil: 'networkidle0'` for pages that load data after initial render.
- Add delays between requests (2-5 seconds) — don't overwhelm servers.
- For static HTML pages, use Cheerio instead — much faster and lighter.
- Puppeteer uses ~200MB RAM per browser instance. Pool browsers for large scraping jobs.
- Respect robots.txt and terms of service. Use scraping responsibly.
