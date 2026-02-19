---
name: cheerio
description: >-
  Parse and extract data from HTML with Cheerio. Use when a user asks to scrape
  static web pages, parse HTML files, extract data from HTML, build a web
  scraper for server-rendered pages, extract text or links from HTML documents,
  parse RSS/XML feeds, transform HTML content, or process HTML emails. Covers
  jQuery-style selectors, DOM traversal, text extraction, attribute parsing,
  and integration with HTTP clients for web scraping pipelines.
license: Apache-2.0
compatibility: 'Node.js 14+ (any platform)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: scraping
  tags:
    - cheerio
    - html
    - parsing
    - scraping
    - dom
    - extract
---

# Cheerio

## Overview

Cheerio is a fast, lightweight HTML/XML parser for Node.js that implements a jQuery-like API. Unlike Puppeteer, it does not run a browser — it parses raw HTML strings, making it 100x faster and ideal for scraping server-rendered pages, parsing HTML files, and transforming HTML content. Pair it with `fetch` or `axios` for web scraping, or use it standalone for HTML processing.

## Instructions

### Step 1: Installation

```bash
npm install cheerio
```

### Step 2: Parse HTML and Extract Data

```javascript
// parse_html.js — Load HTML and extract structured data with CSS selectors
import * as cheerio from 'cheerio'

const html = `
<html>
  <body>
    <h1>Products</h1>
    <div class="product" data-id="1">
      <h2>Widget Pro</h2>
      <span class="price">$29.99</span>
      <a href="/products/widget-pro">Details</a>
    </div>
    <div class="product" data-id="2">
      <h2>Gadget Max</h2>
      <span class="price">$49.99</span>
      <a href="/products/gadget-max">Details</a>
    </div>
  </body>
</html>`

const $ = cheerio.load(html)

// Extract all products
const products = []
$('.product').each((i, el) => {
  products.push({
    id: $(el).attr('data-id'),
    title: $(el).find('h2').text().trim(),
    price: $(el).find('.price').text().trim(),
    link: $(el).find('a').attr('href'),
  })
})

console.log(products)
// [{ id: '1', title: 'Widget Pro', price: '$29.99', link: '/products/widget-pro' }, ...]
```

### Step 3: Web Scraping with Fetch

```javascript
// scrape_site.js — Fetch a page and extract data
import * as cheerio from 'cheerio'

async function scrape(url) {
  const response = await fetch(url)
  const html = await response.text()
  const $ = cheerio.load(html)

  // Extract all links
  const links = []
  $('a[href]').each((i, el) => {
    links.push({
      text: $(el).text().trim(),
      href: $(el).attr('href'),
    })
  })

  // Extract meta tags
  const meta = {
    title: $('title').text(),
    description: $('meta[name="description"]').attr('content'),
    ogImage: $('meta[property="og:image"]').attr('content'),
  }

  return { links, meta }
}
```

### Step 4: Advanced Selectors and Traversal

```javascript
// selectors.js — Complex CSS selectors and DOM traversal
const $ = cheerio.load(html)

// Attribute selectors
$('a[href^="https"]')           // links starting with https
$('img[src$=".png"]')           // PNG images
$('div[class*="product"]')      // divs with "product" in class

// Traversal
$('.product').first()            // first product
$('.product').last()             // last product
$('.product').eq(2)              // third product (0-indexed)
$('.price').parent()             // parent of each .price element
$('.product').children('h2')     // direct h2 children
$('.product').find('.price')     // descendants matching .price
$('.product').next()             // next sibling
$('.product').prev()             // previous sibling

// Filtering
$('.product').filter((i, el) => {
  const price = parseFloat($(el).find('.price').text().replace('$', ''))
  return price < 50
})

// Text and HTML
$('.product').first().text()     // all text content, flattened
$('.product').first().html()     // inner HTML
```

### Step 5: Table Extraction

```javascript
// extract_table.js — Parse HTML tables into structured data
function extractTable($, tableSelector) {
  /**
   * Convert an HTML table to an array of objects using headers as keys.
   * Args:
   *   $: Cheerio instance
   *   tableSelector: CSS selector for the table element
   */
  const headers = []
  $(`${tableSelector} thead th`).each((i, el) => {
    headers.push($(el).text().trim())
  })

  const rows = []
  $(`${tableSelector} tbody tr`).each((i, tr) => {
    const row = {}
    $(tr).find('td').each((j, td) => {
      row[headers[j]] = $(td).text().trim()
    })
    rows.push(row)
  })
  return rows
}

// Usage
const tableData = extractTable($, '#pricing-table')
// [{ Plan: 'Free', Price: '$0', Users: '1' }, { Plan: 'Pro', Price: '$29', Users: '10' }]
```

### Step 6: HTML Transformation

```javascript
// transform.js — Modify HTML content
const $ = cheerio.load(html)

// Add class
$('.product').addClass('featured')

// Remove elements
$('.ad-banner').remove()

// Replace content
$('h1').text('Updated Title')

// Wrap elements
$('.product').wrap('<section class="product-section"></section>')

// Add attributes
$('a').attr('target', '_blank')
$('img').attr('loading', 'lazy')

// Get modified HTML
const modifiedHtml = $.html()
```

## Examples

### Example 1: Build a price monitoring scraper
**User prompt:** "Scrape product prices from 5 competitor websites daily and save to a CSV. The sites are server-rendered (no JavaScript needed)."

The agent will:
1. Use `fetch` + cheerio for each site (no browser overhead).
2. Write site-specific selectors for product name, price, and availability.
3. Parse prices into numbers, normalize currency.
4. Append results to a CSV with timestamps.
5. Set up as a cron job for daily execution.

### Example 2: Extract and clean article content from HTML
**User prompt:** "I have 1,000 saved HTML pages from a blog. Extract just the article title, author, date, and body text from each, ignoring navigation, ads, and footers."

The agent will:
1. Read each HTML file, load with cheerio.
2. Extract content using article-specific selectors (`article`, `.post-content`, etc.).
3. Strip HTML tags from body, normalize whitespace.
4. Output structured JSON with title, author, date, and clean text.

## Guidelines

- Use cheerio for server-rendered pages (where the HTML contains the data you need). For SPAs or JavaScript-rendered content, use Puppeteer instead.
- Cheerio does not execute JavaScript, fetch external resources, or render CSS — it only parses the HTML string you give it.
- Always call `.trim()` on extracted text — HTML often contains whitespace, newlines, and indentation that clutters results.
- Use `.attr('href')` and `.attr('src')` to get link/image URLs. Remember these may be relative — resolve them against the base URL.
- For large-scale scraping, cheerio is 100x faster than Puppeteer and uses negligible memory. It can process thousands of pages per second.
- Combine cheerio with `fetch` or `axios` for scraping, and add delays between requests to avoid overwhelming target servers.
