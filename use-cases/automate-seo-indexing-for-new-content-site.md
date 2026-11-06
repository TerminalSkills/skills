---
title: "Automate SEO Indexing and Content Publishing for a New Website"
slug: automate-seo-indexing-for-new-content-site
description: "Get a new site's pages into Google faster by auditing crawlability, publishing a clean sitemap, notifying Bing and Yandex with IndexNow, and tracking real indexing status."
skills:
  - google-indexing
  - web-scraper
  - markdown-new
category: automation
tags:
  - seo
  - indexing
  - content-publishing
  - google
---

# Automate SEO Indexing and Content Publishing for a New Website

## The Problem

A startup just launched a documentation site with 200 pages. After two weeks, Google has only indexed 34 of them. The remaining 166 pages are invisible to search traffic. Submitting URLs through Search Console one at a time is tedious, and the team has no way to verify which pages are indexed and which are stuck in a crawl queue. Many of these pages are not blocked by a missing submission at all: they carry a stray `noindex`, share duplicate titles, or have almost no content.

## The Solution

Google documents its Indexing API only for pages with `JobPosting` structured data or `BroadcastEvent` livestream markup. A docs site is not eligible, so bulk API submission is not the lever. What works for ordinary pages:

1. **web-scraper** audits the live site for what keeps pages out of the index.
2. **markdown-new** turns pages into clean Markdown so thin or badly structured content is easy to spot and fix.
3. A complete XML sitemap, submitted in Search Console, is Google's supported route for a whole site.
4. **IndexNow** notifies Bing, Yandex and the other participating engines on every change (Google is not among them).
5. **google-indexing** is used for the pages that qualify (job or livestream pages, if the site has any), and its status check shows what Google last received.

## Step-by-Step Walkthrough

### 1. Audit the site for crawlability issues

> Use web-scraper to crawl https://docs.example.com, starting from its sitemap, at no more than 2 requests per second and honouring robots.txt. For each page extract: title tag, meta description, canonical URL, meta robots, X-Robots-Tag header, internal links, HTTP status and word count. Flag pages with noindex, a canonical pointing elsewhere, duplicate titles, missing descriptions, broken internal links, or fewer than 150 words. Write the result to reports/crawl_audit.csv.

Typical causes of "Crawled, currently not indexed" and "Discovered, currently not indexed" are exactly these findings, plus pages with no internal links pointing at them.

### 2. Fix thin or malformed pages

> Use markdown-new to convert the 30 flagged pages to Markdown and list, for each, the heading outline (one H1, then H2/H3), the word count and the internal links. For pages with a broken outline or thin content, rewrite them in /content/docs/ with front matter (title, description of about 150 characters, date), a single H1, links to related pages, and a short FAQ drawn from real support questions.

`markdown-new` reads public pages through the hosted markdown.new service, so use it only on pages that are already live and public. It does not generate content; the rewriting is the agent's job.

### 3. Publish a sitemap and submit it

Generate `sitemap.xml` from the real list of canonical, indexable URLs (a single file holds at most 50,000 URLs or 50 MB uncompressed), reference it from `robots.txt`, and submit it in Search Console under Sitemaps:

```text
User-agent: *
Allow: /

Sitemap: https://docs.example.com/sitemap.xml
```

Keep `<lastmod>` truthful: Google uses it only when it has proven accurate. For one or two important pages, use the URL Inspection tool's "Request indexing"; Google limits these requests with a quota, so it is not a bulk tool.

### 4. Notify IndexNow engines

IndexNow requires a key (8 to 128 characters: letters, digits, dashes) hosted as a UTF-8 file at `https://docs.example.com/<key>.txt` containing the key. Then submit up to 10,000 URLs per POST:

```console
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.indexnow.org/indexnow \
    -H 'Content-Type: application/json; charset=utf-8' \
    -d '{"host":"docs.example.com","key":"'"$INDEXNOW_KEY"'","urlList":["https://docs.example.com/getting-started","https://docs.example.com/api/webhooks"]}'
200
```

200 or 202 means the engine received the URLs (202: key validation pending); 422 means a URL does not belong to the host or the key does not match. Each engine still decides for itself whether to index. IndexNow reaches Bing, Yandex and other participants, not Google.

### 5. Use the Indexing API only where it is allowed

If the site also publishes job postings or livestream pages with the matching structured data, submit those with google-indexing:

> Use google-indexing to submit the URLs in reports/job_pages.txt with URL_UPDATED, one request per URL. Stop at 200 publish requests per day, and log each URL and response status to reports/indexing_log.csv.

The skill's setup requires the Indexing API enabled in a Google Cloud project and the service account added as an owner of the verified Search Console property. Its metadata check reports when Google last received a notification for a URL, not whether it is indexed. Do not use it for documentation or blog pages.

### 6. Monitor real indexing status

The `cache:` search operator no longer works, so do not rely on it. Check status with the Search Console Page indexing report, or the URL Inspection API (2,000 queries per day and 600 per minute per property), and compare the Performance report week to week. Re-submit nothing blindly: for each URL still not indexed after a few weeks, return to the crawl audit and fix the cause.

## Real-World Example

A developer tools team launched a docs site and saw about a sixth of its pages indexed after two weeks. The crawl audit showed that 23 pages carried a `noindex` tag copied over from a staging configuration, and 41 had identical title tags. They fixed both, rewrote the thinnest pages, published a sitemap with accurate `lastmod` dates and added IndexNow pings to their deploy pipeline. Over the following weeks the Page indexing report showed the indexed count climbing; the pages that stayed out were the ones the audit had already flagged as near-duplicates. (The numbers in this example are the team's own and illustrative.)

## Tips

- Run the crawl audit before submitting anything. A sitemap that lists noindexed or redirecting URLs sends mixed signals.
- Google gives no guarantee or time frame; crawling can take a few days to a few weeks after a sitemap or request.
- Keep titles unique and descriptions specific; Google may rewrite them in results regardless of length.
- Never commit the service account JSON key or the IndexNow key file's source of truth; read them from environment variables.

## Related Skills

- **google-indexing**: submits eligible job or livestream pages and checks the last notification Google received.
- **web-scraper**: crawls the live site to find noindex, duplicate-title and thin-page problems.
- **markdown-new**: converts live pages to Markdown to review outlines and word counts.
