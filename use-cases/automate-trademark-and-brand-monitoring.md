---
title: "Automate Trademark and Brand Monitoring with AI"
slug: automate-trademark-and-brand-monitoring
description: "Use AI to scan the web for trademark infringements, brand impersonation, and unauthorized use of company assets."
skills: [web-research, web-scraper, report-generator]
category: research
tags: [trademark, brand-protection, monitoring, legal, automation]
---

# Automate Trademark and Brand Monitoring with AI

## The Problem

A growing startup has a recognizable brand name and logo but no budget for a brand protection agency. The founder occasionally googles the company name and finds knockoff products on marketplaces, copycat domains, and social media accounts using their logo without permission. Each discovery is accidental — she stumbled on the fake Amazon listing while shopping for something else, three months after it went live.

By the time an infringement is noticed, it's been live for months. Customers have already been confused — the support team has fielded tickets from people who bought the fake product and expected real support. Filing takedowns requires documenting each case with screenshots, URLs, and timestamps — tedious work that nobody owns, so it sits on a todo list until someone finds time. Meanwhile, every week the infringing listing stays up is another week of confused customers, diluted brand trust, and revenue going to someone selling a product that doesn't exist. The longer an infringement runs, the harder it is to take down — platforms treat long-established listings differently from new ones.

## The Solution

Using the **web-research** skill (Brave Search API) to systematically search for brand mentions and lookalike sites, the **web-scraper** skill (Playwright and requests) to capture dated evidence for each potential infringement, and the **report-generator** skill to compile findings into structured reports ready for a lawyer or a platform's complaint form, the process goes from accidental discovery to systematic weekly monitoring.

## Step-by-Step Walkthrough

### Step 1: Define the Brand Assets to Monitor

```text
Our brand name is "Lightbeam" and our domain is lightbeam.io. Monitor for: (1) domains containing "lightbeam" or common typosquats (lightbeam.co, lightbearn.com, etc.), (2) marketplace listings on Amazon, Shopify stores, and Gumroad using our name or logo, (3) social media accounts on Twitter, LinkedIn, and Instagram using "lightbeam" in the handle, (4) any GitHub repos using "lightbeam" in a way that implies official affiliation.
```

### Step 2: Scan for Potential Infringements

Search APIs cover the open web; they do not see inside Instagram, Amazon's catalogue or WHOIS history. The agent uses `web-research` queries such as `"lightbeam" site:gumroad.com`, `"lightbeam" site:github.com sdk official` and `"lightbeam" "official"` for public pages, and checks candidate domains one by one. Candidate typosquats come from a short generated list (omissions, swapped letters, other TLDs, `get`/`try` prefixes) that the agent resolves with DNS. For logged-in platforms, a human opens the saved search (Amazon search, Instagram search) once a week and pastes suspicious URLs into the agent. The findings come from four channels — domains, marketplaces, social media, and code repositories — and each is classified by severity so the founder knows what to act on first versus what to monitor:

**Domain squatting (3 findings):**
- **lightbeam.co** — registered, parked page with ads. Captures traffic from people who type `.co` instead of `.io`. The ad network is monetizing the brand's organic traffic.
- **lightbearn.com** — typosquat (swapped letter), redirects to a competitor's website. This one is actively malicious — someone is paying for a domain specifically to steal traffic.
- **getlightbeam.io** — registered, shows a "coming soon" page. Could be legitimate or preemptive squatting. Worth monitoring.

**Marketplace listings (2 findings):**
- **Amazon ASIN B0CX4R2T7K** — "Lightbeam Pro Dashboard" — uses the actual Lightbeam logo, not a Lightbeam product. The listing has 47 reviews and customers are buying it expecting official quality. Seller: "TechGoods LLC."
- **Gumroad: "Lightbeam Templates"** — sells templates branded with the Lightbeam name and visual style. Unclear if the seller has any affiliation.

**Social media (3 findings):**
- **@lightbeam_official (Instagram)** — impersonation account, uses the official logo, posts content that looks like official announcements. 2,400 followers who think it's real. This is the most dangerous finding — followers may share personal information or click malicious links thinking they're interacting with the real brand.
- **@lightbeamhq (Twitter)** — inactive, registered 2 months ago. Username squatting — probably waiting to sell the handle.
- **/company/lightbeam (LinkedIn)** — verified, this is the real company page. No issues.

**Code repositories (2 findings):**
- **github.com/lightbeam-io** — the official org. No issues.
- **github.com/randomuser/lightbeam-sdk** — unofficial repo claiming to be the "official SDK." Developers could integrate this thinking it's endorsed, potentially introducing security vulnerabilities or incompatible behavior into their applications.

### Step 3: Capture Evidence for Each Case

Takedown requests live or die on evidence. Platforms ask for URLs, screenshots, the date, and proof of ownership. Infringers delete pages once they sense a takedown, so the agent captures every finding first, before anyone is notified. Use only public pages: do not log in with a fake account to reach private content, and respect each site's terms.

```text
For each finding, run capture_evidence.py: screenshot, saved HTML, a manifest with timestamps and SHA-256 hashes. Add --rdap for domains. Store everything under brand-monitoring/evidence/.
```

The script uses the `web-scraper` skill's tools: Playwright for the rendered page, and `requests` for domain registration data from RDAP (the JSON replacement for WHOIS; registrant details are usually redacted, but registrar, creation date and abuse contact are not).

```bash
pip install requests playwright && playwright install chromium
```

```python
# capture_evidence.py - one timestamped evidence folder per finding
import hashlib, json, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from playwright.sync_api import sync_playwright


def capture(url: str, rdap: bool = False, root: str = "brand-monitoring/evidence") -> Path:
    now = datetime.now(timezone.utc)
    host = urlparse(url).hostname or "unknown"
    out = Path(root) / now.strftime("%Y-%m-%d") / host
    out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:                      # rendered page + screenshot
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle", timeout=45_000)
        page.screenshot(path=out / "screenshot.png", full_page=True)
        (out / "page.html").write_text(page.content(), encoding="utf-8")
        browser.close()

    if rdap:  # only for a suspect domain, not for a listing on someone else's marketplace
        # Registration data: RDAP is the JSON successor to WHOIS
        resp = requests.get(f"https://rdap.org/domain/{host}", timeout=30)
        (out / "rdap.json").write_text(resp.text, encoding="utf-8")

    manifest = {"url": url, "captured_at": now.isoformat(),
                "sha256": {f.name: hashlib.sha256(f.read_bytes()).hexdigest()
                           for f in sorted(out.iterdir()) if f.name != "manifest.json"}}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    flag = "--rdap" in sys.argv
    for u in [a for a in sys.argv[1:] if a != "--rdap"]:
        print(capture(u, rdap=flag))
```

```console
$ python capture_evidence.py --rdap https://lightbeam.co
brand-monitoring/evidence/2026-11-02/lightbeam.co
```

Every finding gets an evidence package like these (the Amazon and Instagram ones add what a person saw while logged in, saved by hand):

**lightbeam.co/**
- `screenshot.png` — parked page with ad network, clearly monetizing the brand name
- `manifest.json` — capture time and SHA-256 of each file
- `rdap.json` — registered 2024-09-15, registrant redacted behind a privacy service
- `page.html` — full HTML snapshot including ad network scripts

**Amazon ASIN B0CX4R2T7K/**
- `screenshot.png` — product listing clearly showing the Lightbeam logo
- `listing.html` — full listing content including price, description, and seller information
- `seller-info.txt` — seller name: "TechGoods LLC", seller since 2023, 342 total products

**@lightbeam_official (Instagram)/**
- `screenshot.png` — profile page showing the logo, follower count, and recent posts
- `posts.html` — archived copies of recent posts impersonating the brand

Each evidence folder is dated and self-contained, with hashes that show the files were not edited afterwards. No more scrambling to recreate evidence after the infringer takes the page down, and no more "we know they did it but we can't prove it" conversations.

### Step 4: Generate Takedown-Ready Reports

```text
Compile all findings into a brand monitoring report with the report-generator skill. For each confirmed infringement, draft the complaint text for the right channel with the specific URLs, evidence file paths, and a description of the infringement. Separate findings by priority.
```

The right channel depends on the right being claimed. A DMCA notice is a *copyright* tool: it fits the copied logo artwork and copied template files, not the brand name itself. The name is a *trademark* matter and goes through each platform's trademark or impersonation form. The agent drafts text; a person reviews it and submits it, because a false claim carries legal risk. None of this is legal advice, and a trademark attorney should review before anything is sent.

**Priority 1 — Impersonation (2 cases)**

1. **Instagram @lightbeam_official** — Active impersonation with 2,400 followers who believe it's the real account. Evidence archived. Recommended action: Instagram's impersonation report from the Help Center. Draft attached with account URLs, evidence paths, and screenshots showing the misuse of the official logo.

2. **Amazon listing B0CX4R2T7K** — Fake product using the real logo, actively selling to confused customers. Evidence archived. Amazon's Brand Registry is built around a registered (or pending) trademark, so Lightbeam files a trademark application first; until then the draft goes to Amazon's public infringement report form as a copyright complaint about the logo artwork (Brand Registry's Report a Violation tool is only for enrolled brands). The draft includes the ASIN, seller information, and a side-by-side of the real logo and the listing.

**Priority 2 — Domain squatting (3 cases)**

Domain disputes go through the UDRP (or the TLD's own policy), where the complainant must show a mark it has rights in, no legitimate interest by the registrant, and registration and use in bad faith. `lightbearn.com` redirecting to a competitor fits; a parked `lightbeam.co` and a "coming soon" `getlightbeam.io` are weaker, so those two are monitored or approached through the registrar's abuse contact before paying a filing fee. The agent pre-fills each draft with the registrar from `rdap.json`, the evidence paths and the three elements.

**Priority 3 — Unauthorized use (2 cases)**

The Gumroad seller and the unofficial GitHub SDK, each with a polite cease-and-desist email draft. These might resolve with one message — many people don't realize they're infringing and will comply when asked directly. GitHub's trademark policy covers accounts and usernames, not repositories as such, and its report form asks for a trademark registration number, so for a repository that falsely claims to be official the first message goes to the owner, then a GitHub support report.

Each report includes a status tracking section:

| Finding | Platform | Severity | Status | Action Taken | Date |
|---|---|---|---|---|---|
| @lightbeam_official | Instagram | P1 | **New** | Report pending | 2026-11-02 |
| Amazon B0CX4R2T7K | Amazon | P1 | **New** | Complaint pending | 2026-11-02 |
| lightbeam.co | Domain | P2 | **New** | Registrar contact pending | 2026-11-02 |
| lightbearn.com | Domain | P2 | **New** | UDRP pending | 2026-11-02 |
| getlightbeam.io | Domain | P2 | **Monitoring** | — | 2026-11-02 |
| Lightbeam Templates | Gumroad | P3 | **New** | C&D pending | 2026-11-02 |
| lightbeam-sdk | GitHub | P3 | **New** | C&D pending | 2026-11-02 |

### Step 5: Set Up Recurring Scans

```text
Run this scan weekly from cron (for example `0 8 * * MON`). Compare each week's results against the previous scan and only surface new findings. Track the status of previously reported cases (submitted, acknowledged, resolved).
```

Each run saves its findings as `findings-<date>.json` and diffs them against the previous run, so only new URLs surface in the report. Previously reported cases keep a status in the tracking table: submitted, acknowledged by the platform, resolved (listing removed, domain transferred, account suspended). A submitted case with no reply after the founder's chosen waiting period is flagged for a follow-up. When a page from an earlier finding stops loading, the agent records that it is gone, with the date, and keeps the evidence folder.

The founder reviews the new findings once a week instead of stumbling on infringements months after they go live. Over time the table shows which platforms recur and how long each takes to respond *for this company*, which is more useful than any general benchmark.

## Real-World Example

Marta is the co-founder of a 15-person startup. She discovered by accident that someone was selling fake "Lightbeam Pro" licenses on Amazon — a product that doesn't exist — and an Instagram account with 2,400 followers was impersonating their brand, occasionally posting links to phishing pages. Both had been live for months. The support team had already handled a dozen confused customers who bought the fake product.

She asked the agent to run a full brand scan. Within the hour she had seven findings with archived evidence and drafted complaints. She reviewed them, submitted the Amazon and Instagram reports the same day, and filed a trademark application so that Brand Registry would be available next time. Both the listing and the account came down after review.

The weekly scan now catches new infringements within days instead of months. Two weeks after setup, it flagged a new Shopify store selling "Lightbeam Enterprise" subscriptions. Marta has a clean evidence trail for every case, and the monitoring runs on a schedule she checks over Monday morning coffee.

## Related Skills

- [web-research](/skills/web-research) — searches the open web for the brand name, lookalike sites and unofficial repos (Step 2)
- [web-scraper](/skills/web-scraper) — Playwright and requests capture of each public page for the evidence folder (Step 3)
- [report-generator](/skills/report-generator) — turns the findings and status table into the weekly report (Steps 4 and 5)
