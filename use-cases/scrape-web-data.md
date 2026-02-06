---
title: "Scrape Web Data with AI"
slug: scrape-web-data
description: "Extract structured data from websites without APIs using AI-generated scrapers."
skills: [web-scraper]
category: data-ai
tags: [scraping, web-data, beautifulsoup, csv]
---

# Scrape Web Data with AI

## The Problem

You need data from a website that does not offer an API. Product listings, job postings, research data, or public records are trapped in HTML pages. Manually copying this data is impractical when there are hundreds or thousands of entries. Writing a scraper from scratch requires understanding the site's HTML structure, handling pagination, and dealing with inconsistent formatting.

## The Solution

Use the **web-scraper** skill to have your AI agent write and run a targeted scraper that extracts exactly the data you need and outputs it as clean JSON or CSV.

Install the skill:

```bash
npx terminal-skills install web-scraper
```

## Step-by-Step Walkthrough

### 1. Describe what you need

```
Extract all job listings from example-jobs.com/listings including job title,
company name, location, salary, and the link to each posting. There are about
20 pages of results.
```

### 2. The agent inspects the page structure

It fetches the first page, examines the HTML, and identifies the CSS selectors for each data field. If the page requires JavaScript to render, it switches to a browser-based approach.

### 3. A scraper is built and executed

The agent writes a Python script using BeautifulSoup (or Playwright for JS-heavy sites), handles pagination by following next-page links, and adds polite delays between requests.

### 4. Data is extracted and saved

```
Page 1: 25 listings extracted
Page 2: 25 listings extracted
...
Page 20: 18 listings extracted

Total: 493 job listings saved to job_listings.csv

Preview:
| Title              | Company      | Location     | Salary       |
|--------------------|-------------|--------------|--------------|
| Backend Engineer   | Acme Corp   | San Francisco| $150-180k    |
| Product Designer   | StartupXYZ  | Remote       | $120-150k    |
```

### 5. Clean and use the data

Once in CSV or JSON, you can filter, sort, analyze, or import the data into a spreadsheet or database.

## Real-World Example

A market researcher needs to compare pricing across 5 competitor websites. Each site has 200-500 products. Using the web-scraper skill:

1. For each competitor site, they ask the agent to extract product names, prices, and categories
2. The agent handles each site's different HTML structure, adjusting selectors per site
3. All data is saved to separate CSV files, then merged into a single comparison spreadsheet
4. The researcher asks the data-visualizer skill to create a price comparison chart
5. What would have taken days of manual work is done in minutes

## Related Skills

- [excel-processor](../skills/excel-processor/) -- Clean and transform the scraped data
- [data-visualizer](../skills/data-visualizer/) -- Visualize trends in the extracted data
- [pdf-analyzer](../skills/pdf-analyzer/) -- Extract data from PDF documents instead of web pages
