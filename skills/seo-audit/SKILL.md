---
name: seo-audit
description: >-
  Runs a technical SEO audit of a live website and its codebase from the terminal and reports
  findings with evidence, ranked by how much each one keeps pages out of search results. Use when
  a user asks for an "SEO audit", "technical SEO check", "why did our traffic drop after the
  migration", "why isn't Google indexing these pages", "check robots.txt, sitemap and canonicals",
  or "check our Core Web Vitals". Covers crawlability, indexing signals, canonical URLs, sitemaps,
  JavaScript rendering, structured data presence and Core Web Vitals, with the command for each
  check and how to read its result.
license: Apache-2.0
compatibility: "bash with curl and jq, Python 3.8+ (standard library only). Optional: Chrome or Chromium for rendering checks, Node.js 22.19+ for Lighthouse 13, a CrUX API key for field data."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["seo", "technical-seo", "crawling", "indexing", "core-web-vitals"]
---

# SEO Audit

## Overview

A page reaches search results only if a crawler can fetch it, it answers with HTTP 200, it carries content in a form the crawler reads, and no signal tells the engine to leave it out or prefer another URL. Most traffic losses come from one of those four breaking, usually after a redesign, a framework change or a configuration slip, and each one can be tested from a terminal.

This skill audits in that order: site-wide access, then a sample of pages, then rendering, speed and the source code that produced the fault. The output is a findings table in which every row has the command that showed the problem, so the user can rerun it after the fix. Rules quoted here follow Google Search Central as of October 2026; Bing and other engines read the same signals.

## Instructions

### 1. Scope

Find out or ask: the canonical host (`www` or bare domain), what prompted the audit (a drop with a date, pages missing from the index, a pre-launch check), which page types earn the traffic, whether the repository is available, and whether the user can export data from Search Console. Do not sign in to anything: ask for the "Page indexing" export and the Performance report for the affected dates.

Work in a scratch directory and keep every output file; they are the evidence.

### 2. Site-wide access

```bash
SITE=https://larkfieldcycles.com
for u in http://larkfieldcycles.com/ https://larkfieldcycles.com/ http://www.larkfieldcycles.com/ https://www.larkfieldcycles.com/; do
  curl -sS -o /dev/null -L --max-time 20 -w '%{http_code} hops=%{num_redirects} %{url_effective}\n' "$u"
done
curl -sS -o robots.txt -w 'robots %{http_code} %{content_type} %{size_download} bytes\n' "$SITE/robots.txt"
curl -sS --compressed -o sitemap.xml -w 'sitemap %{http_code} %{content_type}\n' "$SITE/sitemap.xml"
grep -o '<loc>[^<]*' sitemap.xml | sed 's/<loc>//' > urls.txt && wc -l < urls.txt
grep -o '<lastmod>[^<]*' sitemap.xml | cut -c10-19 | sort | uniq -c | sort -rn | head -3
```

How to read it:

| Result | Conclusion |
|---|---|
| The four host variants do not all end on one URL with 200, or one fails TLS | Duplicate or unreachable host. One hop to the canonical host is the target |
| `robots.txt` returns 5xx | Google stops crawling the site for up to 12 hours, then falls back to the last copy it fetched. Treat as an outage |
| `robots.txt` returns 404 or another 4xx (except 429) | Read as "no restrictions". Fine unless something was meant to be blocked |
| `robots.txt` is HTML or larger than 500 KiB | Rules are ignored or cut off. A catch-all route is probably serving the app shell |
| `Disallow` covers a path that should rank | Blocked from crawling. The longest matching rule wins and `Allow` wins a tie; paths are case-sensitive |
| A blocked path also carries `noindex` | The `noindex` is never seen, because the page is not fetched. Pick one: unblock and noindex, or block |
| Sitemap is missing from `robots.txt`, or the file is a sitemap index | Read the `Sitemap:` lines; for an index, fetch each child and concatenate the `loc` values |
| More than 50,000 URLs or 50 MB uncompressed in one file | Over the limit; split it |
| Every `lastmod` is the same date | Google only trusts `lastmod` when it matches real changes; `priority` and `changefreq` are ignored either way |

### 3. Page signals on a sample

Save this as `seo_page_check.py`. It fetches the HTML the server sends, without running scripts.

```python
#!/usr/bin/env python3
"""Read URLs on stdin, print one JSON line of indexability signals per URL."""
import json, re, sys, urllib.error, urllib.request
from html.parser import HTMLParser

class Signals(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.grab, self.buf = {"h1": 0, "hreflang": 0, "jsonld": []}, None, ""
    def handle_starttag(self, tag, attrs):
        a = {k: v or "" for k, v in attrs}
        name, rel = a.get("name", "").lower(), a.get("rel", "").lower()
        if tag == "title" and "title" not in self.out: self.grab, self.buf = "title", ""
        elif tag == "script" and a.get("type") == "application/ld+json": self.grab, self.buf = "jsonld", ""
        elif tag == "h1": self.out["h1"] += 1
        elif tag == "meta" and name in ("robots", "googlebot", "description"): self.out[name] = a.get("content", "")
        elif tag == "link" and rel == "canonical": self.out["canonical"] = a.get("href", "")
        elif tag == "link" and a.get("hreflang"): self.out["hreflang"] += 1
    def handle_data(self, data):
        if self.grab: self.buf += data
    def handle_endtag(self, tag):
        if self.grab == "title" and tag == "title": self.out["title"] = " ".join(self.buf.split())
        elif self.grab == "jsonld" and tag == "script":
            try:
                doc = json.loads(self.buf)
                nodes = doc.get("@graph", [doc]) if isinstance(doc, dict) else doc
                self.out["jsonld"] += [str(n.get("@type")) for n in nodes if isinstance(n, dict)]
            except ValueError:
                self.out["jsonld"].append("UNPARSABLE")
        else: return
        self.grab = None

for url in filter(None, map(str.strip, sys.stdin)):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; site-audit)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            status, final, x_robots, raw = res.status, res.url, res.headers.get("X-Robots-Tag"), res.read()
    except urllib.error.HTTPError as err:
        print(json.dumps({"url": url, "status": err.code})); continue
    except OSError as err:
        print(json.dumps({"url": url, "status": 0, "error": str(err)})); continue
    html = raw.decode("utf-8", "replace")
    page = Signals(); page.feed(html)
    words = len(re.sub(r"(?is)<(script|style)\b.*?</\1>|<[^>]+>", " ", html).split())
    print(json.dumps({"url": url, "status": status, "final": final, "x_robots": x_robots,
                      "kb": len(raw) // 1024, "words": words, **page.out}, ensure_ascii=False))
```

Sample every template rather than every URL: the home page, a few of each page type, and a random slice of the sitemap. Add one invented path to test the error page.

```bash
{ head -5 urls.txt; shuf -n 40 urls.txt; echo "$SITE/audit-missing-page-check"; } | python3 seo_page_check.py > pages.jsonl
# URLs whose status, redirect, robots rule or canonical needs a look
jq -r 'select(.status != 200 or .final != .url or ((.robots // "") + (.x_robots // "") | test("noindex"; "i")) or (.canonical // "") != .url)
  | [.status, .url, .final // "-", .robots // "-", .canonical // "-"] | @tsv' pages.jsonl
jq -r '.title // empty' pages.jsonl | sort | uniq -d          # titles shared by several pages
jq -r 'select(.status == 200) | [.url, .h1, .words, .kb, (.jsonld | join(","))] | @tsv' pages.jsonl
```

| Signal | Conclusion |
|---|---|
| A sitemap URL is not 200, or `final` differs from `url` | The sitemap advertises dead or redirecting URLs; list only final, canonical ones |
| The invented path returns 200 | Soft 404: every mistyped or deleted URL looks like a real page. Return a real 404 status |
| `noindex` in `robots`, `googlebot` or `x_robots` | The page is excluded on purpose or by accident; the most restrictive rule found wins |
| `canonical` missing | Acceptable, but add a self-referencing absolute canonical on indexable pages |
| `canonical` names another URL | You are asking for that other URL to be indexed instead. Check it is 200, indexable and truly the same content |
| `canonical` differs only by host, protocol or trailing slash | Conflicting signals; align links, redirects, sitemap and canonical on one form |
| `words` far below what the browser shows | Content arrives through JavaScript; go to step 4 |
| `kb` above 2000 | Googlebot reads the first 2 MB of an HTML file and of each script or stylesheet; content past that is not indexed |
| `h1` is 0, title empty or duplicated, description missing | Search engines pick their own title and snippet. There is no character limit to enforce; aim for a distinct, descriptive title per page |
| `hreflang` above 0 | Each language version must list itself and every other version, with absolute URLs, and the listed pages must link back |
| `jsonld` empty or `UNPARSABLE` | Hand over to structured data work; it affects appearance, not indexing |

For a migration, also take the old URLs with traffic (from the user's export or an old sitemap) and test each: `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$old"`. Every old URL should answer 301 or 308 straight to its closest equivalent. A 404, a 302, a chain of several hops, or a blanket redirect to the home page all lose the old page's standing.

### 4. Rendering

```bash
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
"$chrome" --headless --user-data-dir="$PWD/chrome-profile" --virtual-time-budget=8000 --dump-dom "$SITE/pricing" > rendered.html
curl -sS "$SITE/pricing" > raw.html
for f in raw.html rendered.html; do echo "$f words=$(wc -w < "$f") links=$(grep -o '<a [^>]*href=' "$f" | wc -l)"; done
```

If text, links, the canonical or the robots meta exist only in `rendered.html`, indexing depends on Google's render queue: it works, but later and less reliably, and other crawlers that do not run scripts see an empty page. Recommend server rendering or prerendering for pages that must rank. Two rules are strict: a `noindex` in the raw HTML may stop the page being rendered at all, so removing it with script does not work; and a canonical changed by script conflicts with the one in the raw HTML. Navigation must be real `a` elements with `href`; click handlers on other elements are not followed.

### 5. Core Web Vitals

Good means, at the 75th percentile of real visits: LCP within 2.5 s, INP at or under 200 ms, CLS at or under 0.1. Field data decides; lab runs explain.

```bash
# Field data: 28 days of real Chrome users. Needs a free API key in CRUX_API_KEY.
curl -sS -X POST "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=$CRUX_API_KEY" \
  -H 'Content-Type: application/json' -d "{\"origin\": \"$SITE\", \"formFactor\": \"PHONE\"}" \
  | jq '.record.metrics | {lcp: .largest_contentful_paint.percentiles.p75, inp: .interaction_to_next_paint.percentiles.p75, cls: .cumulative_layout_shift.percentiles.p75}'
# Lab data: one simulated mobile load, no key needed
npx --yes lighthouse@13 "$SITE/" --only-categories=performance,seo --output=json --output-path=lh.json --quiet --chrome-flags="--headless=new"
jq '{perf: .categories.performance.score, seo: .categories.seo.score, lcp_ms: .audits["largest-contentful-paint"].numericValue,
     cls: .audits["cumulative-layout-shift"].numericValue, tbt_ms: .audits["total-blocking-time"].numericValue}' lh.json
```

A 404 "data not found" from CrUX means too few visits for a record: say so and report lab numbers as indicative only. Lighthouse cannot measure INP; total blocking time is its nearest proxy. Speed is rarely the cause of a sudden drop; treat it as a tiebreaker.

### 6. Trace each fault to the code

```bash
grep -rnE 'noindex|X-Robots-Tag|canonical|Disallow' --exclude-dir={node_modules,.next,dist,build,.git} . | head -40
```

| Stack | Where the signals are produced |
|---|---|
| Next.js App Router | `app/robots.ts`, `app/sitemap.ts`, `metadata` or `generateMetadata` (`alternates.canonical`, `robots`), `redirects()` and `headers()` in `next.config`, `middleware.ts` |
| Astro, Eleventy, Hugo | `site` or base URL in the config, the sitemap integration, the head partial of the base layout, `public/robots.txt` |
| Hosting layer | `vercel.json`, `netlify.toml`, `_redirects`, `_headers`, nginx or Caddy config; staging rules and environment checks often leak into production here |
| WordPress | Settings, Reading, "Discourage search engines"; then the SEO plugin's canonical and noindex settings |

### 7. Report

Lead with a three-line summary, then one table: `severity | finding | evidence (command and output) | affected URLs | fix (file and change)`. Severity: **Blocker** means pages cannot be crawled or indexed; **Major** means the wrong URL is indexed or signals are split; **Minor** affects only how a result looks; **Info** is context. Close with what could not be checked and what the user should confirm in Search Console (URL Inspection on two fixed URLs, then the Page indexing report after a few weeks).

## Examples

### Example 1: Traffic drop after a replatform

**Request:** "Organic clicks on larkfieldcycles.com fell about 40% since we moved from WooCommerce to a Next.js storefront on 8 September. Find out why." The user supplies the 200 top landing pages from before the move.

```text
$ while read old; do curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$old"; done < old-top200.txt | cut -d' ' -f1 | sort | uniq -c
     17 200
     52 308
    131 404
$ jq -r 'select((.canonical // "") != .url) | .canonical' pages.jsonl | cut -d/ -f3 | sort | uniq -c
     41 www.larkfieldcycles.com
```

| Severity | Finding | Evidence | Fix |
|---|---|---|---|
| Blocker | 131 of 200 former landing pages return 404; `/product/...` moved to `/bikes/...` with no mapping | First command above | Add one-hop permanent redirects in `next.config.js` `redirects()` from each old path to its new equivalent; keep them at least a year |
| Major | All 52 redirects point to the home page | `redirect_url` is `/` for each | Redirect to the matching product or category instead |
| Major | Canonicals name `www.` while the site resolves to the bare domain | Second command; `metadataBase` in `app/layout.tsx` | Set `metadataBase` to the bare domain so canonical, sitemap and redirects agree |
| Minor | 38 product pages share one title | `uniq -d` on titles | Build the title from the product name in `generateMetadata` |

### Example 2: Pages that never get indexed

**Request:** "Search Console says most of kestrelbooks.io/guides is 'Excluded by noindex tag', but there is no noindex anywhere in our HTML. What is wrong?" The site is a Vite single-page app on Vercel.

```text
$ for f in raw.html rendered.html; do echo "$f words=$(wc -w < "$f") links=$(grep -o '<a [^>]*href=' "$f" | wc -l)"; done
raw.html words=61 links=0
rendered.html words=1340 links=47
$ printf '%s\n' https://kestrelbooks.io/guides/vat-returns https://kestrelbooks.io/audit-missing-page-check | python3 seo_page_check.py | jq -c '[.status, .x_robots, .words, .canonical]'
[200,"noindex",38,null]
[200,"noindex",38,null]
```

| Severity | Finding | Evidence | Fix |
|---|---|---|---|
| Blocker | Every response carries `X-Robots-Tag: noindex` | `x_robots` above; a `headers` rule in `vercel.json` written for preview deployments has no host condition | Limit the rule to preview hosts or delete it |
| Blocker | Guides carry 38 words of text and no links before scripts run | `words` and the raw/rendered comparison above | Prerender `/guides/*` at build time so the article text is in the HTML |
| Major | Unknown paths answer 200 with the app shell | Second URL above | Serve a 404 status for unmatched routes |
| Info | No canonical on any page | `canonical` is null | Add a self-referencing canonical once pages are prerendered |

The report notes that the status label in Search Console will only change after Google recrawls, and asks the user to run URL Inspection on two guides after deploying.

## Guidelines

- Order matters: a page that is blocked, noindexed, erroring or empty before rendering gains nothing from better titles or faster loading. Report those first and say so.
- Evidence or it is not a finding. Never report an issue you did not observe in a command output or in the user's export, and never estimate traffic impact as a number.
- A sample proves a template is broken, not that every page is fine. State the sample size, and widen it when the sitemap mixes many page types.
- Be polite to the server: one request at a time, a few hundred URLs at most, no login-protected or disallowed areas. A full-site crawl needs a dedicated crawler and the owner's consent.
- The fetches here use a generic user agent. Sites that serve bots differently, or block them at a firewall, need the URL Inspection tool to see what Googlebot really received.
- `robots.txt` controls crawling, not indexing: a disallowed URL can still be listed without a snippet if others link to it. Use `noindex` on a crawlable page to keep it out.
- Do not report retired or mythical checks: there is no ranking penalty for title length, `priority` and `changefreq` do nothing, the `site:` operator is not a count of indexed pages, and appearing in AI Overviews needs no special file or markup beyond being indexed and eligible for a snippet.
- Out of scope: keyword research, content strategy, backlink analysis and writing structured data. Say so and hand over rather than improvising them.
