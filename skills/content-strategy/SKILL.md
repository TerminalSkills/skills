---
name: content-strategy
description: >-
  Builds a content strategy a small team can execute: audience needs backed by
  counted evidence, an audit of what is already published, a topic map with one
  page per search intent, a scored backlog, a 90-day calendar sized to real
  capacity, and the numbers that will show whether it worked. Use when someone
  asks "what should we write about", "plan our blog", "content strategy",
  "content plan for next quarter", "topic clusters", "content audit", "our blog
  traffic is falling", or wants a pile of content ideas turned into a
  prioritised plan.
license: Apache-2.0
compatibility: "Works from documents the team already has: support tickets, sales-call notes, survey answers. Python 3.8+ (standard library only) for the audit script, which reads a Google Search Console Search Analytics API response; Search Console access is needed only for sites that already have content."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["content-strategy", "editorial-calendar", "content-audit", "seo", "topic-clusters"]
---

# Content Strategy

## Overview

A content strategy is a set of decisions: who the content is for, which of their needs it will meet, what will not be covered, what gets published first, and how the team will know it worked. The deliverable is one file, `docs/content-strategy.md`, short enough that the people writing the content will read it. Its sections follow the steps below: outcome and audience, needs with their evidence, a decision for each existing URL, the topic map, the scored backlog, the calendar, the measurement plan, and what will not be covered.

Two things separate a usable plan from a list of ideas. Every topic traces back to counted evidence that real people need it. And the calendar fits the hours the team actually has. This skill enforces both.

## Instructions

### 1. Gather the inputs

Ask for what is missing; read the rest from the project (content folder, sitemap, analytics notes, any positioning document).

- **The business outcome** content is meant to move, as one number: trial signups, demo requests, orders, qualified leads. "Traffic" and "awareness" are not outcomes.
- **The buyer and the user**, when they differ, and what they are doing instead of using the product today.
- **Capacity**: who writes, who reviews for accuracy, hours per week, and which formats are realistic (articles, templates, video, data).
- **Raw material nobody else has**: usage data, customer stories, staff expertise, internal tools, photographs, test results.
- **Existing content**: how many URLs, and whether Search Console is connected.

Count what is already published before planning anything new:

```bash
curl -s https://northquaybooks.com/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | grep '/blog/' | wc -l
```

### 2. Turn evidence into needs

Read the sources below and tally how many separate people raise each problem. A topic backed by nineteen customers outranks one that only a keyword tool suggests.

| Source | What to extract |
|---|---|
| Support tickets, live-chat logs | Questions asked before and after purchase, in the customer's wording |
| Sales-call notes, lost-deal reasons | Objections, rivals named, what nearly stopped the purchase |
| Onboarding and cancellation surveys | The job the customer hired the product for; why they left |
| Site search log | What visitors expected to find and did not |
| Search Console queries | Questions the site already appears for |
| Forums and communities the audience uses | Recurring questions, with the thread saved as evidence |

Write each need in the three-part form used in government content design, with its count:

```text
As a clinic manager who books appointments by phone
I need to cut the number of clients who do not turn up
so that vets are not paid to wait for empty slots.
Evidence: 9 of 12 sales calls, 10 of 85 survey answers (19 mentions)
```

Stop at five to eight needs. A need without evidence is recorded as an assumption and scored accordingly in step 5.

### 3. Audit what already exists

Skip this step for a site with no content. Otherwise request three months of Search Console data grouped by page and query. The Search Analytics API returns up to 25,000 rows per request (when a response is full, repeat the request with `startRow` set to 25000 and append the rows):

```json
{
  "startDate": "2026-07-01",
  "endDate": "2026-09-30",
  "dimensions": ["page", "query"],
  "rowLimit": 25000
}
```

Send that body to `POST https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fnorthquaybooks.com%2F/searchAnalytics/query` (the property URL, URL-encoded) with the project's authorised client, or ask the site owner to run it from the API explorer on Google's reference page for this method, and save the response as `gsc.json`. Then run `gsc_audit.py`:

```python
"""Reads a Search Console searchAnalytics.query response grouped by page and query;
lists near-miss queries, queries split across pages, and pages nobody clicks."""
import json, sys
from collections import defaultdict

rows = json.load(open(sys.argv[1]))["rows"]
by_query, by_page = defaultdict(list), defaultdict(lambda: [0, 0])
for r in rows:
    page, query = r["keys"]
    impressions, clicks = int(r["impressions"]), int(r["clicks"])  # the API types both counts as double
    by_query[query].append((page, impressions, clicks, r["position"]))
    by_page[page][0] += impressions
    by_page[page][1] += clicks

print("NEAR MISS: position 8-20 with 200+ impressions -> improve the page for this query")
for query, hits in sorted(by_query.items(), key=lambda kv: -sum(h[1] for h in kv[1])):
    page, impressions, clicks, position = max(hits, key=lambda h: h[1])
    if 8 <= position <= 20 and impressions >= 200:
        print(f"  pos {position:4.1f}  {impressions:5d} impr  {clicks:3d} clicks  {query!r}  {page}")

print("SPLIT QUERY: two pages each take 25%+ of one query's impressions -> merge or differentiate")
for query, hits in by_query.items():
    total = sum(h[1] for h in hits)
    big = [(h[0], h[1] / total) for h in hits if total >= 200 and h[1] / total >= 0.25]
    if len(big) > 1:
        print(f"  {query!r}: " + "  ".join(f"{p} ({share:.0%})" for p, share in sorted(big, key=lambda b: -b[1])))

print("NO CLICKS: pages shown in search but never clicked -> rewrite, merge or remove")
for page, (impressions, clicks) in sorted(by_page.items(), key=lambda kv: -kv[1][0]):
    if clicks == 0 and impressions >= 100:
        print(f"  {impressions:5d} impr  {page}")
```

Give every existing URL one decision and write it in the strategy file:

| Decision | When | Action |
|---|---|---|
| Keep | Meets a listed need, accurate, earns clicks or conversions | Leave it; add internal links from new pages |
| Refresh | Near-miss query, outdated facts, thin where rivals are thorough | Rewrite the weak sections with first-hand material; change the date only if the content changed |
| Merge | Two pages answer the same query | Fold the weaker into the stronger and 301-redirect the old URL |
| Remove | Meets no need, no clicks, no links, no business role | Delete, and redirect only if a close equivalent exists |

Refreshes and merges usually pay back sooner than new pages, so they go first in the calendar.

### 4. Draw the topic map

For each need, list the questions a person asks on the way from noticing the problem to choosing a solution, and label the intent of each: **learn** (how, why, what is), **compare** (best, vs, alternatives, reviews, pricing), **do** (template, calculator, checklist, setup guide). Then:

- One page per intent. Two pages aimed at the same query compete with each other (the split-query report shows where this already happens).
- One hub page per need that answers the main question and links to every supporting page; every supporting page links back.
- For each planned page, write down what it will contain that the current top results do not: your data, a worked example, a tested procedure, photographs, a named expert. If the answer is "nothing", cut the page.

### 5. Score and cut

Score every candidate, sort, and draw a line where capacity ends.

| Factor | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Demand evidence | None | One weak signal | Two independent sources | Raised repeatedly in sales or support |
| Business fit | Unrelated to the product | Adjacent | The product helps | The product is the natural next step |
| Right to win | Nothing original to add | Informed summary | First-hand experience | Data or expertise rivals cannot copy |

`score = (demand + fit + right to win) ÷ effort`, where effort is 1 (a day), 2 (two to three days) or 3 (a week or more). Anything scoring 0 on business fit or on right to win is dropped whatever its total.

### 6. Build the calendar from capacity

1. Hours available = hours per week × 13 weeks.
2. Reserve 30% for distribution, updates and review rounds.
3. Convert effort to hours (a team default: 1 = 8 h, 2 = 16 h, 3 = 32 h) and take pieces from the top of the backlog until the hours run out.
4. Order: refreshes and merges, then compare and do pages for the strongest need, then the hub.

Each calendar row carries: publish week, title, need, intent, primary query, the original material it must include, owner, reviewer, and the metric it will be judged on.

### 7. Decide how it will be measured

- **Per page**: Search Console clicks and average position for its primary query, read 8–12 weeks after publication. Google says changes can take from hours to several months to show, so do not judge earlier.
- **Per need**: the business outcome from step 1, by landing page, in the analytics tool (in GA4, key events by landing page).
- **AI answers**: Google states that AI Overviews and AI Mode need no special markup or files beyond normal search eligibility, and reports their traffic inside the Search Console "Web" totals. Visits from chat assistants appear in GA4 under the "AI Assistant" default channel.
- **Review dates**: a monthly check of the calendar, and a re-plan every quarter with the audit rerun.

## Examples

### Example 1: First plan for a product with no content

Prompt: "Pinehollow is scheduling software for veterinary clinics. We have no blog. One marketer has 10 hours a week, and a vet on staff can review. I have 40 support tickets, notes from 12 sales calls and 85 onboarding survey answers. What should we publish?"

The agent tallies the documents into four needs (no-shows: 19 mentions; moving from a paper diary: 14; booking for several vets with different appointment lengths: 11; reminder costs and consent: 7), then scores candidates:

```markdown
| # | Page | Need | Intent | Demand | Fit | Win | Effort | Score |
|---|------|------|--------|--------|-----|-----|--------|-------|
| 1 | Appointment reminder templates for vet clinics (SMS and email) | No-shows | do | 2 | 3 | 2 | 1 | 7.0 |
| 2 | How vet clinics cut no-shows: what 310 clinics' booking data shows | No-shows | learn | 3 | 3 | 3 | 2 | 4.5 |
| 3 | Moving from a paper diary to scheduling software: a checklist | Switching | do | 3 | 3 | 2 | 2 | 4.0 |
| 4 | Pinehollow vs the clinic's current system: an honest comparison | Switching | compare | 2 | 3 | 2 | 2 | 3.5 |
| 5 | What is a veterinary practice management system? | none | learn | 1 | 1 | 0 | 2 | dropped (win = 0) |
```

Capacity: 10 h × 13 weeks = 130 h; 30% reserved = 39 h; 91 h for production. Pages 1–4 need 8 + 16 + 16 + 16 = 56 h, and two more template sets (vaccination recalls, post-surgery check-ups) add 16 h, for 72 h in total. That leaves 19 h unallocated, kept as slack instead of adding a seventh piece.

```markdown
| Week | Page | Must include | Owner / reviewer | Judged on |
|------|------|--------------|------------------|-----------|
| 2 | Reminder templates (SMS and email) | 6 templates clinics already send, consent note | Dana / Dr. Okafor | template downloads; trials started from the page |
| 5 | How vet clinics cut no-shows | anonymised no-show rates by reminder timing | Dana / Dr. Okafor | clicks for "reduce no-shows vet clinic" at week 16 |
| 8 | Paper diary to software checklist | the 14-step list onboarding uses | Dana / support lead | demo requests from the page |
| 10 | Comparison page | ledger of checked facts, who should not switch | Dana / founder | demo requests from the page |
| 11, 12 | Recall and post-surgery templates | real examples, links to the hub | Dana / Dr. Okafor | downloads |
```

Not covered this quarter, stated in the file: general pet-care advice for owners (wrong audience) and news about the veterinary industry (no right to win).

### Example 2: A blog whose traffic is sliding

Prompt: "Northquay Books does bookkeeping for freelancers. We have 140 blog posts and clicks are down a third since spring. Do we need more posts?"

The agent pulls three months of page-and-query data and runs the audit:

```text
$ python3 gsc_audit.py gsc.json
NEAR MISS: position 8-20 with 200+ impressions -> improve the page for this query
  pos  9.8   1290 impr   31 clicks  'invoice template freelancer'  https://northquaybooks.com/blog/invoice-template
  pos 11.3   1840 impr   12 clicks  'quarterly tax estimate freelancer'  https://northquaybooks.com/blog/estimated-taxes
  pos 17.5    610 impr    4 clicks  'mileage log app'  https://northquaybooks.com/blog/mileage-log
SPLIT QUERY: two pages each take 25%+ of one query's impressions -> merge or differentiate
  'invoice template freelancer': https://northquaybooks.com/blog/invoice-template (61%)  https://northquaybooks.com/blog/free-invoice-templates (39%)
NO CLICKS: pages shown in search but never clicked -> rewrite, merge or remove
   3900 impr  https://northquaybooks.com/blog/what-is-a-1099
    140 impr  https://northquaybooks.com/blog/2021-year-in-review
```

Its answer is no. The first six weeks go to existing pages: merge the two invoice-template posts into one and redirect the weaker URL; rewrite the estimated-taxes post around a worked calculation from a real (anonymised) client; rebuild the 1099 explainer, which is shown 3,900 times and never clicked, or fold it into a hub on freelancer tax forms; remove the year-in-review post. New pages start in week 7 and only for needs with evidence from client onboarding calls.

## Guidelines

- Do not plan volume. Google's guidance is explicit that there is no preferred word count and that publishing or deleting pages to look "fresh" does not help; many pages generated mainly to rank fall under its scaled-content-abuse policy, however they were produced.
- Generative tools are fine for research and structure. A page still needs something first-hand that the tool could not have known; plan that material into the calendar row.
- Keyword volume is one signal among several and the easiest to overvalue. A query with 50 searches a month from people ready to buy can outperform one with 5,000 from students.
- One owner per page and one reviewer who can vouch for accuracy. Unreviewed content about money, health or legal matters does damage.
- Say what will not be covered. Without exclusions, every new idea looks reasonable and the plan dissolves.
- Position and clicks in Search Console are averages over places, devices and days; compare the same page over equal periods, not one day against another.
- Do not promise results by a date. Commit to the publishing schedule and the review dates; outcomes depend on rivals and on search systems the team does not control.
- This skill plans; it does not write the articles, fix technical SEO problems or run paid distribution.
