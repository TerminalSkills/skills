---
name: programmatic-seo
description: >-
  Plans, builds and vets sets of search landing pages generated from a dataset and a template:
  integration, location, directory and glossary pages. Decides whether a page set deserves to
  exist, sets the data each page must carry, checks it against Google's spam policies on scaled
  content, doorway pages and site reputation, gates thin pages before publishing, rolls out in
  batches and reads Search Console to see what was indexed or dropped.
  Use when someone says "programmatic SEO", "generate pages at scale", "a page for every city",
  "integration pages", "template pages", or "our generated pages are not indexed". For auditing an
  existing site use seo-audit; for markup use schema-markup.
license: Apache-2.0
compatibility: >-
  Any site generator or framework that renders pages from data (Next.js, Astro, Hugo, Rails, a CMS).
  The gate script needs Python 3.8+. Monitoring needs a verified Google Search Console property.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["seo", "programmatic-seo", "search-console", "content-strategy", "indexing"]
---

# Programmatic SEO

## Overview

Programmatic SEO publishes many pages from one template and one dataset to answer a family of
searches that share a shape ("payroll software for dentists", "kayak rental in Tacoma"). It works
when every row of the dataset holds enough facts of its own to deserve a page. It fails, sometimes
for the whole site, when the pages differ only in the word that was swapped in.

Be honest with the user from the first message: Google does not promise to index a page it has
crawled, a large generated set often ends up crawled and then left out of the index, and Google's
spam policies treat mass-produced pages with no added value as abuse however they were made. This
skill produces a go or no-go decision, a data specification, a template outline, a gate that
holds thin pages back, and a batch rollout with indexing checks.

## Instructions

### 1. Collect the facts

Read `.claude/product-marketing-context.md` if it exists. Then find out, from the repository and
the user:

1. The query family: the pattern, three real example queries, and who types them.
2. The data: which table, feed or file each page would be built from, how many rows, which fields,
   who owns the data and how it stays current.
3. How pages are rendered and routed today, and where sitemaps are generated.
4. Search Console: whether similar pages already get impressions, and the current split of indexed
   and not-indexed pages.
5. Who ranks for the example queries now and what their pages contain that a new page would not.

### 2. Decide whether the page set should exist

Answer each question with evidence. A "no" on any of the first three stops the project or shrinks it.

| Question | Passes when |
|---|---|
| Is there demand? | Search Console shows impressions for the pattern, or a keyword tool shows volume for at least a sample of rows |
| Does each row have its own substance? | Several facts per page that exist only for that row: measurements, prices, availability, counts, reviews, photos, steps that differ |
| Can the visitor finish the task there? | The page answers the query or lets them act, without a click to "the real page" |
| Would it exist without search traffic? | Customers or support would link to it anyway |
| Is the data yours to publish? | First-party or licensed; public data only when you add analysis nobody else shows |

### 3. Check the plan against Google's spam policies

Paraphrased from the Search Central spam policies page (last revised August 2026). Violations
are found by automated systems and human review; the stated consequence is ranking lower or not
appearing in results at all.

- **Scaled content abuse:** many pages generated mainly to manipulate rankings rather than help
  people, "no matter how it's created". Named examples: generative AI output with no added value,
  pages built from scraped feeds or search results, content stitched together from other pages, and
  pages that read as keywords without sense.
- **Doorway abuse:** pages made to rank for similar queries that lead to a less useful step before
  the real destination. Named examples: pages targeted at regions or cities that funnel to one
  page, and near-identical pages that sit closer to search results than to a browseable hierarchy.
- **Site reputation policy** (widely called site reputation abuse): third-party content placed on
  an established site mainly to use that site's ranking signals, such as pages from a white-label
  supplier that the host neither edits nor integrates. Since 30 August 2026 the effect depends on
  the searcher's location: a manual action outside the European Economic Area; inside it, the
  section may be treated as separate from the main domain and ranked on its own merits.
- **Scraping and thin affiliation:** republished feeds and merchant descriptions without original
  value.
- **Generative AI:** allowed. Google's guidance asks for accuracy, quality and relevance, also in
  titles, descriptions, structured data and alt text, and suggests telling readers how automation
  was used. AI text that fills a template with nothing new is the first example of scaled abuse.

### 4. Specify the dataset

One row is one page. Write the specification before any template work:

```yaml
page_set: trail-guides
pattern: "{trail_name} trail guide"
url: /trails/{region_slug}/{trail_slug}
source: trails, trip_reports, gps_tracks (first-party)
required:            # a row missing any of these gets no page
  - gps_track
  - length_km, ascent_m, surface
  - trip_reports_last_12_months >= 3
  - photos >= 2
optional_blocks:     # rendered only when the data is present
  - seasonal_closures
  - water_sources
  - nearby_trails (computed from coordinates)
refresh: nightly; lastmod changes only when a field above changes
```

Rows that fail `required` are not published. Fewer strong pages beat full coverage.

### 5. Design the template

- Every block is either fixed (same on all pages, kept short) or filled from row data. There is no
  third kind: no spun introduction, no paragraph that only restates the title.
- Put the row's facts first: the table, the numbers, the map, the steps. Prose explains them.
- Title, H1 and meta description are built from fields and must be unique across the set.
- Conditional blocks disappear when their data is missing; they never render "No data available".
- Show where the data comes from and when it was last updated.
- Structured data must describe what is visible on the page. Use schema-markup for the types.
- Links come from data: parent hub, siblings in the same group, nearest neighbours. Every page is
  reachable by browsing from the hub, not only through the sitemap.

### 6. Gate pages before publishing

Render the candidate pages, export the main content of each (no header, navigation or footer) as
one JSON object per line with `url`, `title` and `text`, and run the gate:

```python
"""Usage: python3 page_gate.py pages.jsonl"""
import json, re, sys
from collections import Counter

pages = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]

def shingles(text, n=5):
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}

sets = [shingles(p["text"]) for p in pages]
seen_on = Counter(s for page_set in sets for s in page_set)
template = {s for s, n in seen_on.items() if n >= max(2, 0.2 * len(pages))}
titles = Counter(p["title"].strip().lower() for p in pages)

failed = 0
for page, page_set in zip(pages, sets):
    own = page_set - template
    share = len(own) / max(1, len(page_set))
    problems = []
    if share < 0.5:
        problems.append(f"{share:.0%} of the text is specific to this page (minimum 50%)")
    if len(own) < 60:
        problems.append(f"{len(own)} page-specific phrases (minimum 60)")
    if titles[page["title"].strip().lower()] > 1:
        problems.append("title is used by another page")
    failed += bool(problems)
    print(("HOLD " if problems else "PASS ") + page["url"] + "".join(f"\n     {p}" for p in problems))
print(f"\n{len(pages)} pages, {failed} held back")
sys.exit(1 if failed else 0)
```

Text that recurs on a fifth of the pages counts as template. The two thresholds are this skill's
working defaults, not Google numbers; Google states it has no preferred word count. Held pages get
more data or are dropped. The gate catches sameness, not falsehood: read a sample of passing pages
in full and check their facts against the source rows.

### 7. Set up URLs, canonicals and sitemaps

- Short, lower-case, hyphenated paths built from stable slugs, without parameters or fragments.
  Each page carries a self-referencing `rel="canonical"`.
- A row that stops qualifying returns 404 or 410. An empty page answering 200 is reported as a
  soft 404.
- One sitemap per page set and per batch, so Search Console can be filtered by it. A sitemap holds
  at most 50,000 URLs or 50 MB uncompressed; larger sets use a sitemap index. Google ignores
  `priority` and `changefreq`, and uses `lastmod` only when it is consistently accurate.
- Do not use `noindex` to save crawl budget: Google still fetches the page to see the rule. A page
  blocked in `robots.txt` cannot show its `noindex` at all.
- Google counts crawl budget per hostname and says it matters mainly for sites with a large share
  of URLs in "Discovered - currently not indexed", above roughly 10,000 fast-changing pages or a
  million pages. Below that, an up-to-date sitemap is enough.

### 8. Roll out in batches and read the result

Publish the strongest rows first (50 to 200 pages), submit their sitemap, and wait four to eight
weeks before the next batch. In the Page indexing report, filter by that sitemap and read the reasons:

| Reason shown | What it means | What to do |
|---|---|---|
| Indexed | In the index; says nothing about ranking | Watch impressions per page |
| Crawled - currently not indexed | Fetched, then left out. Google: "no need to resubmit" | When it dominates the batch, the template is the problem: add substance or cut rows |
| Discovered - currently not indexed | Known, not fetched yet | Check server speed and internal links; too many URLs offered at once |
| Duplicate without user-selected canonical / Google chose different canonical | Judged a copy of another page | Merge the rows or make the pages differ in substance |
| Soft 404 | Looks empty | Raise the `required` bar or return a real 404 |

The report lists at most 1,000 example URLs per reason. For exact per-URL status use the URL
Inspection API (`POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`, fields
`coverageState` and `googleCanonical`), limited to 2,000 requests a day and 600 a minute per
property. The Indexing API cannot help: it accepts only job posting and livestream pages.

Expand only when most of a batch is indexed and earns impressions. If it is not, fix the template
or stop; publishing the remaining rows adds weight to the same verdict.

### 9. Deliver the plan

Return, in this order: the decision with its evidence; the dataset specification; the template
outline (fixed and data blocks); the gate result; the URL and sitemap layout; the batch schedule
with the pass condition for each batch; and what will be pruned if a batch fails.

## Examples

### Example 1: trail pages from first-party data

Request: "Kestrel Trails has 1,840 trails in the database. Make a page for each so we rank for
'[trail] trail guide'."

The agent applies the specification from step 4. Only 620 trails have a GPS track, three recent
trip reports and photos. Gate output on the first rendered batch:

```text
PASS https://kestreltrails.app/trails/olympic-peninsula/lena-lake
PASS https://kestreltrails.app/trails/olympic-peninsula/mount-ellinor
HOLD https://kestreltrails.app/trails/olympic-peninsula/unnamed-spur-4
     31% of the text is specific to this page (minimum 50%)
     22 page-specific phrases (minimum 60)

120 pages, 9 held back
```

Plan delivered: publish 111 pages under `/trails/{region}/{trail}` with region hubs, sitemap
`sitemap-trails-batch1.xml`, review at week 6. Pass condition: 70% indexed and impressions on at
least half of the indexed pages. The 1,220 trails without reports stay in the app and out of the
sitemap until they collect three reports.

### Example 2: "a page for every suburb"

Request: "Wrenfield Plumbing has three branches. Generate 240 'plumber in [suburb]' pages for the
metro area."

The agent declines the 240-page plan and says why: pages aimed at separate places that carry the
same text and lead to one booking form are the example Google gives for doorway abuse. It proposes:

| Page type | Count | Row-specific content |
|---|---|---|
| Branch page | 3 | Address, opening hours, crew, service radius map, reviews for that branch |
| Service-area page | 14 | Only suburbs with 25 or more completed jobs: job mix, median response time, price range from invoices, two case notes with photos |
| Other suburbs | 223 | No page; listed as text on the branch page that serves them |

### Example 3: 4,200 pages, 310 indexed

Request: "Formhollow published a template page for every document and industry combination, with
AI-written introductions. Search Console shows 3,480 pages as 'Crawled - currently not indexed'."

Findings: 60 documents multiplied by 70 industries; the downloadable file is identical across
industries for all but 212 combinations; the gate reports 9% page-specific text on the median
page. Recommendation: keep the 60 document pages and the 212 combinations with a distinct file,
redirect each removed combination to its document page, take the removed URLs out of the sitemap,
and state on the remaining pages how the industry versions differ. The agent tells the user that
recovery is not guaranteed and that re-evaluation of the remaining pages can take months.

## Guidelines

- Never promise indexing or rankings. State the pass condition for a batch and what happens when
  it is missed.
- Do not publish all rows at once. A first batch that fails costs little; ten thousand thin URLs
  have to be removed one status code at a time.
- Do not manufacture differences: synonym swaps, machine translation of the same text and filler
  written by a model are among the transformations the scaled content policy names.
- Do not split a page set across several sites to hide its size. The scaled content policy lists
  that as abuse too.
- Hosting pages a partner supplies mainly so they rank on your domain's standing falls under the
  site reputation policy; Google weighs whether you edit, sign and integrate them.
- Location pages need a real presence or real work in the place. No address, staff or jobs there
  means no page.
- Comparison and "alternative" pages are covered by competitor-alternatives; claims about other
  companies must be accurate and dated.
- Keep data fresh or remove the page. A stale price or closed venue is worse than a missing page.
- When not to use this skill: fewer than a few dozen pages (write them by hand), no first-party or
  licensed data, or a query family where the results are dominated by the entities themselves.
