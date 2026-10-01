---
name: competitor-alternatives
description: >-
  Plans, researches and writes comparison pages: "[rival] alternatives",
  "[product] vs [rival]", "[rival A] vs [rival B]" and switching guides. Builds
  each page from a ledger of sourced, dated facts and ends with an honest
  verdict on who should choose which product. Use when someone asks for an
  "alternative page", a "vs page", a "competitor comparison", "comparison
  landing pages", "why us instead of them", or wants existing comparison pages
  checked for outdated prices and claims that cannot be backed up.
license: Apache-2.0
compatibility: "Any site that publishes Markdown or HTML pages. Python 3.8+ (standard library only) for the claims checker. Web access to read each rival's public pricing, documentation and changelog."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["comparison-pages", "competitors", "seo", "positioning"]
---

# Competitor & Alternative Pages

## Overview

Someone who searches "Brindle Support alternatives" or "Fernhill Desk vs Brindle Support" is close to buying and is checking facts. A comparison page earns that reader, and the ranking that comes with them, only when its facts survive the check. This skill treats the page as the last step: first a ledger of claims, each with a source and a date; then a verdict that admits where the rival is the better choice; then the page, generated from the ledger so it can be re-verified every quarter.

Comparative advertising that names a rival is encouraged by the US Federal Trade Commission and permitted under EU law when it is truthful, compares like with like on verifiable features, and does not denigrate. The procedure below keeps the page on the right side of that line; it is not legal advice.

## Instructions

### 1. Decide which pages are worth writing

Collect evidence of demand before choosing rivals:

- Search Console queries containing `vs`, `alternative`, `compared`, `instead of`, `switch from`.
- The "lost to" and "also evaluating" fields in the CRM, and rivals named in sales calls.
- Rivals that customers came from, according to onboarding answers.

Then match each query pattern to one page. Check the live results for the singular and plural forms; when they return the same pages, one page serves both.

| The searcher types | Where they are | Page to write |
|---|---|---|
| `[rival] alternatives` / `[rival] alternative` | Unhappy with the rival or priced out; building a shortlist | A list of 4–7 real options, yours among them |
| `[product] vs [rival]` | Down to two | Head-to-head, your product against one rival |
| `[rival A] vs [rival B]` | Has not heard of you | A fair comparison of the two, with a marked section about your product |
| `switch from [rival]`, `migrate from [rival]` | Decided, worried about effort | A switching guide: what moves, what does not, how long it takes |

Skip a page when the two products do not serve the same need, when nothing about the rival can be verified from public sources or first-hand use, or when there is neither search demand nor a sales team asking for it.

### 2. Build the claims ledger

Every statement about any product, including your own, becomes a row in `comparison/claims.csv` before it appears on a page.

```csv
id,product,attribute,value,source_url,checked_on,evidence
c01,Brindle Support,price per agent per month (annual),29 USD,https://brindlesupport.io/pricing,2026-09-28,vendor page
c03,Brindle Support,Shopify order lookup inside a ticket,paid add-on (12 USD per agent),https://brindlesupport.io/pricing,2026-06-11,vendor page
c05,Fernhill Desk,Shopify order lookup inside a ticket,included,https://fernhilldesk.com/docs/shopify,2026-09-28,own test
```

Sources, in order of strength:

1. **The rival's own pages**: pricing, documentation, changelog, status page, terms. Save a screenshot or an archived copy next to the ledger; pricing pages change without notice.
2. **First-hand use**: a trial account under your real company name. Read the trial terms first; some forbid benchmarking or competitive use, and then this source is closed.
3. **Customers who switched**, quoted with permission and their real name and company.
4. **Public reviews**, for recurring themes only. Summarise and link; do not copy review text or republish someone else's star ratings as your own data.

What does not go in the ledger: rumours, a rival's unannounced plans, anything from a leaked or confidential document, and guesses about their internals.

Save this as `check_claims.py`. It fails when a row has no source or was last checked more than 90 days ago:

```python
"""Flags comparison claims that are unsourced or older than the allowed age."""
import csv, sys
from datetime import date

MAX_AGE_DAYS = 90
path = sys.argv[1] if len(sys.argv) > 1 else "comparison/claims.csv"
today = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today()
problems = 0
for row in csv.DictReader(open(path, newline="", encoding="utf-8")):
    age = (today - date.fromisoformat(row["checked_on"])).days
    if not row["source_url"].startswith("https://"):
        print(f'{row["id"]}  NO SOURCE  {row["product"]}: {row["attribute"]}')
        problems += 1
    elif age > MAX_AGE_DAYS:
        print(f'{row["id"]}  STALE {age}d  {row["product"]}: {row["attribute"]} -> recheck {row["source_url"]}')
        problems += 1
print(f"{problems} claim(s) need attention" if problems else "all claims sourced and fresh")
sys.exit(1 if problems else 0)
```

### 3. Reach the verdict before writing

From the ledger, write three short lists and show them to the user for confirmation:

- **Choose the rival if…** At least two real reasons: a channel, an integration, a compliance certificate, a scale your product does not reach.
- **Choose us if…** Reasons a buyer can verify, tied to ledger rows.
- **No real difference on…** Features both products have. These stay out of the headline claims.

If the first list is empty, the research is not finished. A page that finds no reason to pick the rival reads as an advertisement and is treated as one.

### 4. Write the page

Order for a head-to-head page:

1. **Verdict** in the first screen: two or three sentences saying who each product suits.
2. **Summary table** of five to eight attributes that decide the purchase, each traceable to a ledger row, with the date checked under the table.
3. **Where the rival is stronger**, stated plainly.
4. **Where your product is stronger**, each point with evidence: a screenshot, a measurement with its method, a named customer.
5. **Cost for a typical buyer**, worked out with the arithmetic shown (seats × price × months, plus required add-ons), not a bare list price.
6. **Switching**: what imports cleanly, what must be rebuilt, realistic time, who helps.
7. **Questions buyers ask**, as plain headings with short answers.
8. **Sources and disclosure**: links to the rival's pages used, the date checked, and a sentence saying who publishes the page.

Variations: an alternatives list opens with the selection criteria and how the list was chosen, gives every option the same fields (suits, does not suit, price as of a date), and places your product where it honestly ranks for the reader named in the title. A rival-vs-rival page compares the two on their merits and keeps your product in one clearly labelled section. A switching guide is a how-to: steps, export formats, field mapping, time needed.

Page metadata: a title of about 60 characters that names both products and the reader; a meta description of up to about 160 characters that states the verdict; one H1; the rival's name in plain text only.

### 5. Check before publishing

- `python3 check_claims.py` exits 0.
- Every number, price and feature statement on the page maps to a ledger row. Search the draft for digits and for "only", "best", "fastest", "cheapest", "unlike"; each hit needs a row or gets deleted.
- Like is compared with like: same billing period, same plan tier, same number of seats, same currency.
- The page says who publishes it. A company-run comparison must not be presented as an independent review.
- No rival logos, screenshots of their marketing pages, or copied text. Their product name appears as a word, as often as needed to identify them and no more prominently than yours.
- Structured data: no review or rating markup built from scores on other websites or from an editor's own rating of the products. Google's review-snippet rules require ratings to come directly from users of the site, exclude ratings aggregated from elsewhere, and give no stars to an organisation that marks up reviews of itself. Google also stopped showing FAQ rich results on 7 May 2026, so `FAQPage` markup adds nothing there.
- The visible "checked on" date changes only when the ledger was actually re-verified.

### 6. Keep it true

Run the checker monthly and before every edit. Recheck a rival's rows immediately when their changelog or pricing page changes. When a rival fixes the weakness your page leads with, rewrite the verdict; do not leave a claim standing because it used to be true.

## Examples

### Example 1: Head-to-head page for a help desk

Prompt: "We make Fernhill Desk, a help desk for Shopify stores, $24 per agent. Write a 'Fernhill Desk vs Brindle Support' page. They are bigger and have phone support; we include Shopify order lookup, which they charge extra for."

The agent fills the ledger from both pricing pages and a Brindle trial, runs the checker, and gets:

```text
$ python3 check_claims.py comparison/claims.csv 2026-10-01
c03  STALE 112d  Brindle Support: Shopify order lookup inside a ticket -> recheck https://brindlesupport.io/pricing
c06  NO SOURCE  Brindle Support: median first-reply time in our trial
2 claim(s) need attention
```

It reopens the pricing page to confirm row c03 and updates the date, drops c06 because nothing was measured, and reruns until the script prints `all claims sourced and fresh`. The page it delivers starts like this:

```markdown
---
title: "Fernhill Desk vs Brindle Support for Shopify stores"
description: "Brindle Support adds phone and WhatsApp. Fernhill Desk includes Shopify order lookup and costs $1,632 less a year for 8 agents. Checked 1 Oct 2026."
---
# Fernhill Desk vs Brindle Support

**Short answer.** Pick Brindle Support if your customers call you: it has a built-in phone
channel and WhatsApp, and Fernhill Desk has neither. Pick Fernhill Desk if you sell on Shopify
and answer by email and chat: order lookup inside the ticket is included, and the total is lower.

| | Fernhill Desk | Brindle Support |
|---|---|---|
| Price per agent, annual billing | $24 | $29 |
| Shopify order lookup in the ticket | Included | Add-on, $12 per agent |
| Channels | Email, chat | Email, chat, WhatsApp, phone |
| Cost for 8 agents, 12 months, with order lookup | $2,304 | $3,936 |

Prices checked on 1 October 2026 against each vendor's pricing page. Fernhill Desk is our product.

## Where Brindle Support is the better choice
## Where Fernhill Desk is the better choice
## What 8 agents pay over a year
8 × $24 × 12 = $2,304.  Brindle: 8 × ($29 + $12) × 12 = $3,936.  Difference: $1,632.
## Moving from Brindle Support: what imports and what does not
## Questions buyers ask
## Sources
```

### Example 2: An alternatives list where the product is not for everyone

Prompt: "People search 'Larchpost alternatives'. We are Postwren, a newsletter tool for writers who charge for subscriptions. Write the page."

The agent checks Search Console (`larchpost alternatives` 1,900 impressions in three months, `larchpost alternative` 260, both showing the same results) and decides on a single page. It proposes the selection rule to the user first: tools a solo writer can run without a developer, with paid subscriptions built in, priced publicly. Then the outline:

```text
Title  7 Larchpost alternatives for paid newsletters, compared
H1     Larchpost alternatives for writers who charge for their newsletter
       Why writers leave Larchpost (three reasons, each from the ledger)
       How this list was chosen (the selection rule, and that Postwren publishes the page)
       Summary table: fee on paid subscriptions, free-list limit, custom domain, import from Larchpost
       The alternatives, one section each: suits / does not suit / price as of 1 Oct 2026
         Postwren appears third: best for paid subscriptions, weak for ad-funded newsletters
       Stay with Larchpost if… (two honest cases)
       Moving your list and paying subscribers
       Sources, checked on 1 Oct 2026
```

Each rival section is built from that tool's own pricing and documentation pages; where a tool's fee could not be confirmed, the table says "not published" instead of an estimate.

### Example 3: Quarterly recheck

Prompt: "Recheck our vs pages, they are from spring."

The agent runs `python3 check_claims.py`, gets 14 stale rows across three rivals, opens each `source_url`, and finds that one rival moved order lookup into its base plan. It updates the row, removes that advantage from the verdict and the table, recomputes the yearly cost, changes the "checked on" date on the pages whose rows were re-verified, and lists the edits for review. Pages whose facts did not change keep their old publication date and get the new "checked on" date only.

## Guidelines

- The basis of every comparison must be identifiable: which plan, which billing period, how many seats, on what date. A comparison that hides its basis is the kind regulators call deceptive.
- Compare features that are material, relevant, verifiable and representative. Cherry-picking the one benchmark you win, or comparing your top plan with their free one, breaks that rule even when each number is correct.
- No adjectives about the rival that a ledger row cannot carry ("clunky", "outdated", "bloated"). Describe the difference; let the reader judge.
- Do not invent customer quotes, switcher counts or review scores, and do not write reviews of your own product. In the US, fake reviews and company-run sites posing as independent have been unlawful under the FTC's consumer review rule since 21 October 2024.
- Use the rival's name to identify them, never in a way that suggests they run or endorse the page. The title and first screen should make the publisher obvious.
- Avoid mass-producing a vs page for every rival from one template with swapped names. Pages without first-hand facts add nothing and risk Google's scaled-content policy.
- When the honest verdict is that the rival suits most buyers better, say which narrower group your product suits, or do not publish.
- Have a lawyer review pages before publication in regulated sectors (health, finance), in markets with strict comparative-advertising rules, or when a rival has complained before.
