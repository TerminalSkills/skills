---
name: schema-markup
description: >-
  Adds, repairs and verifies schema.org structured data (JSON-LD) on a website, and says honestly
  which Google rich results the markup can still earn. Use when a user asks to "add schema markup",
  "add structured data", "write JSON-LD for this page", "fix structured data errors in Search
  Console", "why are my star ratings / FAQ rich results gone", or wants Product, Article,
  Organization, LocalBusiness, Breadcrumb, Event, Video or SoftwareApplication markup. Covers
  choosing types per page, required properties, wiring into Next.js, static sites and CMSs, and
  checking the result from the command line.
license: Apache-2.0
compatibility: "Any site whose HTML or templates can be edited. Checker script needs Python 3.8+ (standard library only)."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["structured-data", "json-ld", "schema-org", "seo", "rich-results"]
---

# Schema Markup

## Overview

Structured data is a machine-readable description of what a page is about: a `script` element of type `application/ld+json` holding schema.org types and properties. Search engines read it to understand entities (who published this, what is sold, at what price) and Google uses a subset of it to draw rich results such as price and rating lines, breadcrumbs, event listings and video previews.

This skill produces three things: a decision about which types belong on each page template, the JSON-LD itself wired into the project's code, and a verification report. It is deliberately strict about what the markup can earn, because Google retired a long list of rich results between 2023 and 2026 and much advice online still promises them.

## Instructions

### 1. Read the page before writing anything

Collect these facts from the project, and ask the user only for what the code cannot tell you:

- The stack and where the document head is rendered (Next.js `app/` layouts, an Astro or Eleventy layout, a WordPress theme or SEO plugin, a Shopify theme).
- One live URL or local build output per page template: home, article, product, pricing, location, event.
- What is already there. Save the checker below as `jsonld_check.py` and run it against each URL or built HTML file.
- Whether the facts the markup will state are visible on the page: price, rating and count, author, dates, address, opening hours. Markup may only repeat what a visitor can see.

```python
#!/usr/bin/env python3
"""List the JSON-LD nodes in a URL or HTML file and flag missing Google-required properties."""
import json, re, sys, urllib.request

REQUIRED = {  # Google Search Central, checked October 2026; "a|b" means either one
    "Product": ["name", "offers|review|aggregateRating"],
    "Offer": ["price|priceSpecification"],
    "AggregateRating": ["ratingValue", "ratingCount|reviewCount"],
    "Review": ["author", "reviewRating"],
    "SoftwareApplication": ["name", "offers", "aggregateRating|review"],
    "BreadcrumbList": ["itemListElement"],
    "LocalBusiness": ["name", "address"],
    "Event": ["name", "startDate", "location"],
    "VideoObject": ["name", "thumbnailUrl", "uploadDate"],
    "JobPosting": ["title", "description", "datePosted", "hiringOrganization", "jobLocation|applicantLocationRequirements"],
    "WebSite": ["name", "url"],
    "ProfilePage": ["mainEntity"],
}
REQUIRED["WebApplication"] = REQUIRED["MobileApplication"] = REQUIRED["SoftwareApplication"]
RETIRED = {"FAQPage", "HowTo", "SpecialAnnouncement", "SearchAction"}

def walk(node, path):
    if isinstance(node, list):
        for i, item in enumerate(node):
            walk(item, f"{path}[{i}]")
    elif isinstance(node, dict):
        kinds = node.get("@type", [])
        for kind in [kinds] if isinstance(kinds, str) else kinds:
            missing = [p for p in REQUIRED.get(kind, []) if not any(alt in node for alt in p.split("|"))]
            note = " (no Google rich result any more)" if kind in RETIRED else ""
            print(f"{path} {kind}: {'MISSING ' + ', '.join(missing) if missing else 'ok'}{note}")
        for key, value in node.items():
            walk(value, f"{path}.{key}")

src = sys.argv[1]
if src.startswith("http"):
    req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0 (compatible; markup-check)"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
else:
    html = open(src, encoding="utf-8").read()
blocks = re.findall(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", html, re.S | re.I)
for n, raw in enumerate(blocks):
    try:
        walk(json.loads(raw), f"block{n}")
    except ValueError as err:
        print(f"block{n}: UNPARSABLE {err}")
print(f"{len(blocks)} JSON-LD block(s) in {src}")
```

The script reads the HTML the server sends. If it reports zero blocks on a page that shows markup in the browser, the JSON-LD is injected by client-side JavaScript or a tag manager: Google can still read it after rendering, but move it into server output where possible, and always for Product markup, where Google warns that script-generated markup makes Shopping crawls slower and less reliable. Other subtypes such as `Restaurant` or `NewsArticle` are not in the table; check them against the row of their parent type.

### 2. Pick types by page, and know what each one earns

| Page | Type | Google feature (October 2026) | Required by Google |
|---|---|---|---|
| Home | `WebSite` | Site name shown in results | `name`, `url`; home page only |
| Home or About | `Organization` | Logo, knowledge panel details | none; add `name`, `url`, `logo` (112x112 px or larger), `sameAs` |
| Article, blog post | `Article`, `BlogPosting`, `NewsArticle` | Better title, image and date in results | none; add `headline`, `image`, `datePublished`, `dateModified`, `author` with `name` and `url` |
| Any page with a trail | `BreadcrumbList` | Breadcrumb line, desktop results only | two or more `ListItem` entries with `position`, `name`, `item` |
| Product, not sold on this page | `Product` (product snippet) | Rating, price, availability line | `name` plus one of `offers`, `review`, `aggregateRating` |
| Product sold on this page | `Product` (merchant listing) | Shopping surfaces, price and shipping details | `name`, `image`, `offers` as an `Offer` with `price` above zero and `priceCurrency` |
| App or SaaS product page | `SoftwareApplication`, `WebApplication`, `MobileApplication` | Rating and price line | `name`, `offers.price` (0 if free), and `aggregateRating` or `review` |
| Physical location | `LocalBusiness` or a subtype | Knowledge panel details | `name`, `address` |
| Public, in-person event | `Event` | Event listing | `name`, `startDate`, `location` with `address` |
| Page with a video | `VideoObject` | Video result, key moments | `name`, `thumbnailUrl`, `uploadDate` |
| Job advert | `JobPosting` | Job search experience | `title`, `description`, `datePosted`, `hiringOrganization`, `jobLocation` |
| Author or member profile | `ProfilePage` | Author and creator understanding | `mainEntity` as a `Person` or `Organization` with `name` |
| Forum thread, Q&A thread | `DiscussionForumPosting`, `QAPage` | Forum and Q&A displays | see Google's page for each |

Recipe, Course list, Movie, Dataset (Dataset Search only), Vacation rental, Math solver, Speakable and paywalled-content markup are still documented; read Google's page for the type before using one.

Retired, so never promise a visual result for these:

| Markup | Status |
|---|---|
| `HowTo` | Rich result removed September 2023 |
| Sitelinks search box (`WebSite` with `potentialAction` `SearchAction`) | Removed November 2024 |
| Course info, Estimated salary, Learning video, Special announcement, Vehicle listing | Phased out from June 2025, documentation removed September 2025 |
| Practice problem | Removed January 2026 |
| `FAQPage` | Stopped appearing on 7 May 2026, documentation removed June 2026 |

Leaving retired markup in place does no harm and other consumers may still read it, so do not spend effort deleting it; do stop reporting it as a win. Correct markup makes a page eligible for a display and guarantees nothing: Google decides per query whether to show it. Appearing in AI Overviews or AI Mode needs no special schema either.

### 3. Write the JSON-LD

- One `script` block per page containing an `@graph` array, with `"@context": "https://schema.org"` once at the top.
- Give long-lived entities a stable `@id` (a URL with a fragment such as `#organization`) and refer to them from other nodes with `{"@id": "..."}` instead of repeating them.
- Absolute URLs everywhere. Dates in ISO 8601 with a timezone offset. Prices as plain decimals with a dot, no currency symbol; the currency goes in `priceCurrency` as an ISO 4217 code. Availability as a schema.org URL such as `https://schema.org/InStock`.
- Use the most specific type that is true (`Restaurant` rather than `LocalBusiness`). Use an array for `@type` only when two types genuinely apply.
- Fill values from the same data source that renders the visible page, never from a hand-maintained copy, so the two cannot drift apart.
- Ratings: `aggregateRating` only for ratings collected from real users and shown on that page. A business marking up reviews of itself under `Organization` or `LocalBusiness` gets no stars; that display is for sites reviewing other businesses.

### 4. Wire it into the stack

In a Next.js App Router project, render the block from a server component and escape `<` so that user-supplied strings cannot close the script element:

```tsx
// app/components/JsonLd.tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
```

Static generators: build the object in the layout's front matter or data file and print it through the engine's JSON filter (`| json` in Shopify and Eleventy Liquid, `| jsonify` in Jekyll, `| dump | safe` in Nunjucks, `JSON.stringify` with `set:html` in Astro). WordPress and Shopify: check what the SEO plugin or theme already emits before adding anything, since two competing `Product` or `Organization` nodes is the most common fault on those platforms.

### 5. Verify

1. Build or deploy to a preview, then run `python3 jsonld_check.py` on each template's URL: zero `UNPARSABLE`, zero `MISSING`.
2. Compare every stated value with the rendered page: name, price, currency, rating, count, dates.
3. Paste the URL or code into the Rich Results Test (`https://search.google.com/test/rich-results`) for Google eligibility and into the Schema Markup Validator (`https://validator.schema.org/`) for vocabulary errors. Both are browser tools; ask the user to run them if you have no browser.
4. After release, the user watches the matching report under Enhancements or Shopping in Search Console, plus "Unparsable structured data". Recrawling takes days.

### 6. Report

Finish with a table of `template | types added | Google feature it is eligible for | required properties present | checked with`, then the list of anything left for the user (values missing from the page, Search Console follow-up).

## Examples

### Example 1: Product page for a small shop

**Request:** "Add structured data to our Tidewater mug page on mossbankpottery.com. It is $38, in stock, 4.8 stars from 61 reviews shown on the page."

The shop sells the mug on that page, so this is a merchant listing: `image` and an `Offer` with `price` and `priceCurrency` are mandatory. The rating is visible and comes from buyers, so it may be included.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": "https://mossbankpottery.com/products/tidewater-mug#product",
      "name": "Tidewater Mug",
      "description": "Hand-thrown 12 oz stoneware mug with a sea-green glaze.",
      "image": ["https://mossbankpottery.com/img/tidewater-mug-1x1.jpg", "https://mossbankpottery.com/img/tidewater-mug-4x3.jpg"],
      "sku": "MB-MUG-TW-12",
      "brand": { "@type": "Brand", "name": "Mossbank Pottery" },
      "offers": {
        "@type": "Offer",
        "url": "https://mossbankpottery.com/products/tidewater-mug",
        "price": "38.00",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition"
      },
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": 4.8, "reviewCount": 61 }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Shop", "item": "https://mossbankpottery.com/shop" },
        { "@type": "ListItem", "position": 2, "name": "Mugs", "item": "https://mossbankpottery.com/shop/mugs" },
        { "@type": "ListItem", "position": 3, "name": "Tidewater Mug" }
      ]
    }
  ]
}
```

Checker output after the change:

```text
block0.@graph[0] Product: ok
block0.@graph[0].brand Brand: ok
block0.@graph[0].offers Offer: ok
block0.@graph[0].aggregateRating AggregateRating: ok
block0.@graph[1] BreadcrumbList: ok
block0.@graph[1].itemListElement[0] ListItem: ok
block0.@graph[1].itemListElement[1] ListItem: ok
block0.@graph[1].itemListElement[2] ListItem: ok
1 JSON-LD block(s) in dist/products/tidewater-mug/index.html
```

Reported to the user: eligible for the product rating, price and availability line and for merchant listing surfaces; shipping and return details are not shown yet because the store has no `shippingDetails` or `hasMerchantReturnPolicy`, which can be added once the policy page exists.

### Example 2: Auditing markup on a SaaS site

**Request:** "Search Console shows no FAQ results any more for routewren.io and our stars never appeared. Fix our structured data." The site is a Next.js app.

Findings from running the checker on the home and pricing pages:

| Finding | Evidence | Action |
|---|---|---|
| `FAQPage` on `/pricing` no longer produces a rich result | Retired 7 May 2026 | Keep the visible questions; stop tracking the feature |
| `Organization` carries `aggregateRating` built from testimonials | Self-published reviews of an organization are not eligible for stars | Remove the rating from `Organization` |
| `WebApplication` has no rating | `MISSING aggregateRating\|review` | Add the in-app rating (4.6 from 212 users) that the page displays |
| Two `Organization` nodes, one from the layout and one from the page | Checker lists both | Keep one, referenced by `@id` |

Replacement block rendered from `app/layout.tsx` through the `JsonLd` component:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://routewren.io/#organization",
      "name": "Routewren",
      "url": "https://routewren.io/",
      "logo": "https://routewren.io/logo-512.png",
      "sameAs": ["https://www.linkedin.com/company/routewren", "https://github.com/routewren"]
    },
    {
      "@type": "WebSite",
      "@id": "https://routewren.io/#website",
      "name": "Routewren",
      "url": "https://routewren.io/",
      "publisher": { "@id": "https://routewren.io/#organization" }
    },
    {
      "@type": "WebApplication",
      "name": "Routewren",
      "url": "https://routewren.io/",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": 4.6, "ratingCount": 212 }
    }
  ]
}
```

The report states plainly that the FAQ display will not return, that the app rating line is now possible but not guaranteed, and that the site name and logo are covered by the first two nodes.

## Guidelines

- Check Google's structured data gallery and the Search Central documentation changelog before promising any visual result; the supported list shrank repeatedly between 2023 and 2026 and will change again. The tables above are dated for that reason.
- schema.org validity and Google eligibility are separate questions. A type can be perfectly valid vocabulary and earn nothing in Google; say which of the two you verified.
- Never mark up content that is absent from the page, written for search engines only, or untrue: invented ratings, reviews copied from other sites, a price that differs from the visible one. Google treats this as spam and can remove all rich results for the site by manual action.
- Do not add `aggregateRating` to every page from one sitewide score, and do not attach a product's rating to a category or list page.
- Breadcrumb markup changes only desktop results, and `WebSite` name markup belongs on the home page alone; repeating either elsewhere is noise, not harm.
- Events must be open to the public and held at a physical place; online-only events are not eligible for the event listing.
- One block with `@graph` is easier to maintain than several, but Google reads several blocks too; do not rewrite working markup only to merge it.
- The checker's table covers common types only and required properties only. For anything else, and for recommended properties, read the type's page at `https://developers.google.com/search/docs/appearance/structured-data/search-gallery`.
- Not the right tool for crawling, indexing or ranking problems: a page that is blocked, noindexed or not indexed gains nothing from markup. Fix that first with an SEO audit.
