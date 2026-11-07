---
title: "Automate Competitive Analysis Reports with AI"
slug: automate-competitive-analysis-reports
description: "Generate structured competitive analysis reports by scraping competitor data and synthesizing insights automatically."
skills: [web-scraper, competitor-alternatives, report-generator]
category: research
tags: [competitive-analysis, market-research, reporting, strategy]
---

# Automate Competitive Analysis Reports with AI

## The Problem

A product manager at a 30-person B2B SaaS company presents a competitive landscape update every quarter. She manually visits 8 competitor websites, reads their changelogs, checks pricing pages, skims review sites, and pieces together a slide deck. Each cycle takes most of two working days of copy-pasting and formatting, and some of the data is stale by the time it is done. Leadership keeps asking for monthly updates; there is not enough time.

The worst part is the missed signals. Between quarterly reports a competitor cut its enterprise tier price by 30% and she did not find out until a sales rep lost a deal two weeks later. Another shipped a real-time dashboard that customers started asking about in demos. The story between the snapshots is where competitive threats actually materialize.

## The Solution

Use **web-scraper** to save dated snapshots of competitors' public pages and detect changes, **competitor-alternatives** to turn what you find into a ledger of sourced, dated claims and an honest verdict, and **report-generator** to produce the shareable report. The agent does the collection, diffing and drafting; a person reads the sources behind every number that matters and approves the verdict.

All competitor names, prices and numbers below are invented for illustration.

## Step-by-Step Walkthrough

### Step 1: Define the Competitor Landscape

```text
I need a competitive analysis report. Our competitors are: Acme Analytics, DataPulse, MetricFlow, and ChartBase. For each, I need: pricing tiers, features shipped in the last 90 days, the positioning statement from their homepage, and recurring themes in public reviews. Build a claims ledger first, then a markdown report.
```

For each competitor the agent lists the sources it is allowed and able to use: homepage, pricing page, changelog or release notes, documentation, status page. It checks each site's `robots.txt` and terms before fetching anything. Review sites such as G2 forbid automated collection in their [terms of use, section 8 "Prohibited Access and Data Use"](https://legal.g2.com/terms-of-use) (no scrapers, headless browsers or data-mining tools without written consent, and no reuse to train or test AI systems), so reviews are not scraped: a person reads the most recent public reviews, and only recurring themes go into the report, summarized with a link to the profile. Their star ratings are not republished as your data.

### Step 2: Snapshot the Public Pages

The agent saves the text of each page with a date and a content hash, so the next run can tell which pages changed. This script checks `robots.txt`, identifies itself, and needs `pip install requests beautifulsoup4`:

```python
# snapshot.py
import hashlib, json, sys
from datetime import date
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlsplit

import requests
from bs4 import BeautifulSoup

UA = "competitive-report-bot/1.0 (+mailto:product@example.com)"  # say who you are
OUT = Path("snapshots")

def allowed(url: str) -> bool:
    parts = urlsplit(url)
    rp = robotparser.RobotFileParser(f"{parts.scheme}://{parts.netloc}/robots.txt")
    rp.read()
    return rp.can_fetch(UA, url)

def page_text(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.content, "html.parser")   # bytes, not r.text: avoids mojibake
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    return " ".join(soup.get_text(" ", strip=True).split())

def main(pages: dict[str, str]) -> None:
    OUT.mkdir(exist_ok=True)
    state_file = OUT / "latest.json"
    previous = json.loads(state_file.read_text()) if state_file.exists() else {}
    current = {}
    for name, url in pages.items():
        if not allowed(url):
            print(f"SKIP {name}: robots.txt disallows {url}")
            continue
        text = page_text(url)
        digest = hashlib.sha256(text.encode()).hexdigest()
        current[name] = {"url": url, "sha256": digest, "date": date.today().isoformat()}
        (OUT / f"{name}-{date.today()}.txt").write_text(text, encoding="utf-8")
        old = previous.get(name, {}).get("sha256")
        print(f"{'NEW' if old is None else 'CHANGED' if old != digest else 'same'}  {name}")
    state_file.write_text(json.dumps({**previous, **current}, indent=2))

if __name__ == "__main__":
    main(json.loads(Path(sys.argv[1]).read_text()))
```

`pages.json` maps a label to a URL, for example `{"datapulse-pricing": "https://datapulse.example/pricing", "datapulse-changelog": "https://datapulse.example/changelog"}`. Run `python3 snapshot.py pages.json`; the first run prints `NEW` for every page, later runs print `same` or `CHANGED`. A page that renders its prices with JavaScript returns no prices to `requests`; the web-scraper skill covers rendering it with Playwright. Pricing pages change without notice, so the saved text is also your evidence of what the page said on that date.

The agent then reads each snapshot and extracts what the report needs, such as tiers with prices, changelog entries with dates, and the homepage positioning line, each tied to the snapshot it came from.

### Step 3: Build the Claims Ledger

Every statement about any product, including yours, becomes a row in `comparison/claims.csv` before it reaches the report. This is the method the competitor-alternatives skill uses for comparison pages:

```csv
id,product,attribute,value,source_url,checked_on,evidence
c01,DataPulse,Starter price per seat per month (annual),19 USD,https://datapulse.example/pricing,2026-11-07,snapshot datapulse-pricing-2026-11-07.txt
c02,DataPulse,changelog entries in last 90 days,12 (all new data connectors),https://datapulse.example/changelog,2026-11-07,snapshot datapulse-changelog-2026-11-07.txt
c03,MetricFlow,AI features announced in last 90 days,anomaly detection and forecasting,https://metricflow.example/blog,2026-11-05,vendor page
```

The competitor-alternatives skill includes the code for a `check_claims.py` script (save it next to the ledger) that exits non-zero when a row has no `https://` source or was last checked more than 90 days ago; run it before every report. Not in the ledger: rumours, a rival's unannounced plans, anything from a leaked document, guesses about their internals.

Sample reading of the ledger for the four invented competitors:

| Competitor | Pricing tiers | Changelog (90 days) | Pattern |
|---|---|---|---|
| Acme Analytics | 3 | 7 updates | Enterprise features (SSO, audit log, custom roles): moving upmarket |
| DataPulse | 4 | 12 updates | All new data connectors: building a connectivity moat |
| MetricFlow | 2 | 4 updates | All AI-related: betting on AI as the differentiator |
| ChartBase | 3 | 9 updates | Mostly fixes and small UI changes: maintenance rather than growth |

Changelog volume is a signal, not a verdict. A competitor with few entries may ship large features, and one with many may be shipping trivia, so the agent reads the entries before drawing a conclusion.

### Step 4: Compare Like with Like

Prices are normalized to per-seat monthly cost on the same billing period (annual or monthly, not mixed), the same tier and the same currency, with the arithmetic shown:

| Tier | Your price | Acme | DataPulse | MetricFlow | ChartBase |
|---|---|---|---|---|---|
| Starter | $29/seat | $25 | $19 | $35 | $22 |
| Pro | $59/seat | $49 | $49 | $79 | $45 |
| Enterprise | Custom | $99 | $89 | Custom | $79 |

Here DataPulse's Starter is $10 below yours (about 34%). The table alone does not say whether to raise, lower or hold your prices; combined with the feature comparison and the review themes it shows where you have pricing power and where you do not.

The verdict, as the competitor-alternatives skill prescribes, has three lists that a person confirms before the report goes out:

- **Choose a rival if...** at least two real reasons per rival (an integration, a certification, a scale you do not reach). If a list is empty, the research is not finished.
- **Choose us if...** reasons a buyer can verify, each tied to a ledger row.
- **No real difference on...** features everyone has; these stay out of the headline.

Review themes, read by a person from public profiles and summarized in your own words, add the qualitative side: for example "users of Acme mention slow onboarding" or "DataPulse users ask for more reporting customization". These are leads for sales messaging, to be confirmed in customer calls.

### Step 5: Generate the Report

```text
Write competitive-analysis-q4-2026.md from comparison/claims.csv and the snapshots. Sections: executive summary (what changed and three actions), one profile per competitor, feature matrix, pricing, review themes, recommendations. Every number cites a ledger id.
```

The report-generator skill covers status-style markdown reports and data reports as HTML or PDF (pandas and matplotlib charts, Jinja2 template, WeasyPrint for PDF). The executive summary comes first, since it is the only part many readers will open. The agent states the "checked on" date under every table and does not change it unless the row was actually re-verified.

### Step 6: Run It Monthly and Report Only the Changes

```text
Re-run snapshot.py, then compare each CHANGED page with its previous snapshot and list what moved: prices, tiers, new features, positioning text. Update the ledger rows that changed, re-run check_claims.py, and draft a one-page diff for the monthly update.
```

Because snapshots are saved per date, the agent diffs the old and new text of only the pages the script flagged `CHANGED`. A typical diff reads: "DataPulse Starter: $19 to $15 per seat (c01). Acme Pro tier now lists anomaly detection (c07)." Schedule the run with cron or a CI schedule on a machine you control; the report is a draft until a person has read the sources behind each change.

Pricing and positioning changes are the ones to watch first: a competitor that moves its homepage from "affordable analytics" to "enterprise-grade analytics" is signalling where it is heading. Careers pages and hiring trends can hint at roadmap, but treat them as a hypothesis to check, not a fact.

### Step 7: Turn It into a Deck

```text
Convert the executive summary and the verdict lists into a 10-slide outline for the leadership meeting: positioning map, where we lead, where we lag, pricing, threats, recommended actions.
```

Each slide gets one takeaway tied to a ledger row, for example "DataPulse's Starter is $10 below ours: compete on price or differentiate on features?" The outline is pasted into your slide tool of choice.

## Real-World Example

Lena is a product lead at a 25-person analytics startup. Each quarter she spends two days on a competitive deck for the board: visit the websites, screenshot pricing pages, read changelogs, skim reviews, copy everything into slides. By the time she presents, some data is weeks old.

She asks the agent to track four direct competitors. The first run builds the ledger and snapshots and drafts the report; she spends her time reading the pricing and changelog sources behind the numbers instead of collecting them. It surfaces a pricing change she had missed: one competitor cut its enterprise tier last month, which fits two deals the sales team had been puzzling over. Sales adjusts its pitch to the features the cheaper product lacks.

With the monthly run, every pricing change and feature launch shows up as a short diff within weeks instead of at the next quarterly review. After a few months the ledger history shows each competitor's direction, and the leadership team starts making pricing and roadmap decisions from sourced data. Lena's preparation falls to reviewing the diff and writing the strategic commentary.

## Related Skills

- **web-scraper**: Step 2, fetching and parsing competitors' public pages (Playwright for JavaScript-rendered ones)
- **competitor-alternatives**: Steps 3-4, the claims ledger, `check_claims.py` and the honest verdict
- **report-generator**: Steps 5-6, assembling the markdown or PDF report and the monthly diff
