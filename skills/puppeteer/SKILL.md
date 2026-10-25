---
name: puppeteer
description: >-
  Automate browsers and scrape dynamic websites with Puppeteer. Use when a user
  asks to scrape JavaScript-rendered pages, automate browser interactions, take
  screenshots of web pages, generate PDFs from URLs, test web UIs, fill out
  forms programmatically, crawl SPAs, extract data from dynamic sites, automate
  login flows, or build web scrapers that need a real browser. Covers headless
  Chrome, page navigation, DOM interaction, network interception, screenshots,
  PDF generation.
license: Apache-2.0
compatibility: 'Node.js 22.12+ for Puppeteer 25 (Linux, macOS, Windows)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "puppeteer, browser, scraping, automation, chrome"
  repository: https://github.com/puppeteer/puppeteer
---

# Puppeteer

## Overview

Puppeteer is a Node.js library that controls headless Chrome/Chromium. Unlike HTTP-based scrapers (cheerio, axios), Puppeteer renders JavaScript, executes AJAX calls, and interacts with the page like a real user. Use it for scraping SPAs, automating form submissions, generating screenshots/PDFs, and testing web interfaces. This skill covers page navigation, DOM extraction, form filling, network interception, and integration with data processing pipelines.

## Instructions

### Step 1: Installation

```bash
npm install puppeteer           # downloads Chrome for Testing + chrome-headless-shell (~hundreds of MB)
npm install puppeteer-core      # no bundled browser (pass executablePath to a system Chrome)
```

Puppeteer 25 needs Node.js 22.12 or newer and is ESM-friendly (`import`); put `"type": "module"` in `package.json` or use `.mjs` files. `headless` is `true` (new headless, the default) or `'shell'` (old chrome-headless-shell); the old value `'new'` is gone from the typings, so use `true` or omit it. The browser lands in `~/.cache/puppeteer` (override with `PUPPETEER_CACHE_DIR`).

### Step 2: Basic Page Scraping

```javascript
// scrape_page.js — Extract data from a JavaScript-rendered page
import puppeteer from 'puppeteer'

async function scrapePage(url) {
  const browser = await puppeteer.launch({
    headless: true,            // default; 'shell' selects the old headless mode
    args: ['--no-sandbox'],    // only in containers/CI you control, see Guidelines
  })
  const page = await browser.newPage()

  // Set viewport and user agent for consistent rendering
  await page.setViewport({ width: 1920, height: 1080 })
  await page.setUserAgent({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' })

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

  // Extract data from the rendered DOM
  const data = await page.evaluate(() => {
    const items = []
    document.querySelectorAll('.product-card').forEach(card => {
      items.push({
        title: card.querySelector('h2')?.textContent?.trim(),
        price: card.querySelector('.price')?.textContent?.trim(),
        image: card.querySelector('img')?.src,
        link: card.querySelector('a')?.href,
      })
    })
    return items
  })

  await browser.close()
  return data
}

const products = await scrapePage('https://shop.northwind-demo.test/products')
console.log(JSON.stringify(products, null, 2))
```

### Step 3: Form Filling and Login

```javascript
// login_and_scrape.js — Log into a site and scrape authenticated content
import puppeteer from 'puppeteer'
import { writeFile } from 'node:fs/promises'

async function loginAndScrape(email, password) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  await page.goto('https://shop.northwind-demo.test/login')

  // Fill login form
  await page.type('#email', email, { delay: 50 })     // delay simulates typing
  await page.type('#password', password, { delay: 50 })
  // Start waiting before the click so the navigation is not missed
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]'),
  ])

  // Now scrape authenticated pages
  await page.goto('https://shop.northwind-demo.test/dashboard')
  const dashboardData = await page.evaluate(() => {
    return {
      username: document.querySelector('.user-name')?.textContent,
      stats: document.querySelector('.stats')?.textContent,
    }
  })

  // Save cookies for reuse (skip login next time)
  // page.cookies() is deprecated since Puppeteer 24; use the browser-level API
  const cookies = await browser.cookies()
  await writeFile('cookies.json', JSON.stringify(cookies))  // contains session secrets: keep it out of git

  await browser.close()
  return dashboardData
}
```

### Step 4: Screenshots and PDFs

```javascript
// capture.js — Generate screenshots and PDFs from web pages
import puppeteer from 'puppeteer'

async function captureScreenshot(url, outputPath) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080 })
  await page.goto(url, { waitUntil: 'networkidle2' })

  // Full page screenshot
  await page.screenshot({ path: outputPath, fullPage: true, type: 'png' })

  // Specific element screenshot
  const element = await page.$('.hero-section')
  if (element) await element.screenshot({ path: 'hero.png' })

  // Generate PDF (great for invoices, reports)
  await page.pdf({
    path: 'page.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
  })

  await browser.close()
}
```

### Step 5: Pagination and Crawling

```javascript
// crawl_paginated.js — Scrape all pages of a paginated listing
import puppeteer from 'puppeteer'

async function crawlAllPages(startUrl) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  const allItems = []
  let currentUrl = startUrl

  while (currentUrl) {
    await page.goto(currentUrl, { waitUntil: 'networkidle2' })

    // Extract items from current page
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.item')).map(el => ({
        title: el.querySelector('.title')?.textContent?.trim(),
        url: el.querySelector('a')?.href,
      }))
    })
    allItems.push(...items)
    console.log(`Page scraped: ${items.length} items (total: ${allItems.length})`)

    // Find next page link
    currentUrl = await page.evaluate(() => {
      const next = document.querySelector('a.next-page')
      return next?.href || null
    })

    // Polite delay between pages
    await new Promise(r => setTimeout(r, 2000))
  }

  await browser.close()
  return allItems
}
```

### Step 6: Network Interception

```javascript
// intercept.js — Block images/ads for faster scraping, capture API responses
import puppeteer from 'puppeteer'

async function scrapeWithInterception(url) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  // Block images, fonts, stylesheets for faster loading
  await page.setRequestInterception(true)
  page.on('request', req => {
    if (['image', 'font', 'stylesheet'].includes(req.resourceType())) {
      req.abort()
    } else {
      req.continue()
    }
  })

  // Capture API responses (often easier than parsing DOM)
  const pending = []
  page.on('response', response => {
    if (response.url().includes('/api/products')) {
      pending.push(response.json().catch(() => null))
    }
  })

  await page.goto(url, { waitUntil: 'networkidle2' })
  // Read the bodies before closing the browser, or late responses are lost
  const apiData = (await Promise.all(pending)).filter(Boolean)
  await browser.close()
  return apiData
}
```

### Step 7: Bot protection

Puppeteer does not bypass bot detection, and the `puppeteer-extra-plugin-stealth` package has had no release since April 2023, so this skill does not cover it. If a site blocks automation, look for an official API or export first, and respect its terms of service and robots.txt.

## Examples

### Example 1: Scrape product prices from a JavaScript-heavy e-commerce site
**User prompt:** "I need to monitor competitor prices on a site that loads products via JavaScript. Extract product names, prices, and availability from all category pages."

The agent will:
1. Launch Puppeteer with a realistic viewport and check the site's terms and robots.txt first.
2. Navigate to each category page, wait for product cards to render.
3. Use `page.evaluate()` to extract structured data from the DOM.
4. Handle pagination by clicking "next page" buttons or scrolling for infinite scroll.
5. Save results to JSON with timestamps for price tracking over time.

### Example 2: Generate PDF reports from a web dashboard
**User prompt:** "Log into our analytics dashboard every Monday morning and generate a PDF report of the weekly stats."

The agent will:
1. Launch Puppeteer, navigate to the login page, fill credentials.
2. Navigate to the weekly report view.
3. Wait for all charts and data to load (`waitForSelector` on chart elements).
4. Generate a PDF with `page.pdf()` using A4 format and print backgrounds enabled.
5. Save with timestamped filename for archival.

## Guidelines

- Use `waitUntil: 'networkidle2'` (2 or fewer network connections for 500ms) instead of `'load'` for SPAs — it waits for AJAX calls to finish.
- Chrome refuses to start with "No usable sandbox" on hosts that block unprivileged user namespaces (Ubuntu 23.10+ AppArmor default, many containers). Fix the host (see Puppeteer's troubleshooting page) or, only for trusted pages inside a throwaway container, pass `--no-sandbox`. Never use it to open untrusted URLs on a normal machine.
- For simple HTML scraping (no JavaScript rendering needed), use cheerio instead — it is much faster and uses no browser resources.
- Add delays between page navigations (`await new Promise(r => setTimeout(r, 2000))`; `page.waitForTimeout` was removed) to avoid overwhelming target servers and triggering rate limits.
- Use `page.setRequestInterception(true)` to block images, fonts, and CSS when you only need text data — speeds up scraping.
- Capture API responses via `page.on('response')` when possible — structured JSON from APIs is more reliable than parsing rendered HTML.
- Prefer `page.waitForSelector()` or `page.locator(...)` over fixed sleeps, and close the browser in a `finally` block so failed runs do not leave Chrome processes behind.
